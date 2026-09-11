-- PH-B24 / B25 / B26 / B27 / B28 / R10 / R11 / R12 (importação 10/09)
-- Não aplicar 00015.

-- ------------------------------------------------------------
-- Schema: lote, hash, rastro, item sem produto
-- ------------------------------------------------------------
ALTER TABLE public.importacoes_pedido
  ADD COLUMN IF NOT EXISTS arquivo_hash TEXT,
  ADD COLUMN IF NOT EXISTS erro_mensagem TEXT,
  ADD COLUMN IF NOT EXISTS desfeita_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS desfeita_em TIMESTAMPTZ;

ALTER TABLE public.pedidos_recebimento
  ADD COLUMN IF NOT EXISTS ultima_importacao_id UUID REFERENCES public.importacoes_pedido(id) ON DELETE SET NULL;

ALTER TABLE public.itens_pedido
  ALTER COLUMN produto_id DROP NOT NULL;

ALTER TABLE public.itens_pedido
  ADD COLUMN IF NOT EXISTS nome_externo TEXT,
  ADD COLUMN IF NOT EXISTS codigo_externo TEXT;

-- Dedup wise_pedido_id: extras sem uso ganham sufixo para o índice único caber
WITH ranked AS (
  SELECT id, wise_pedido_id,
    ROW_NUMBER() OVER (
      PARTITION BY wise_pedido_id
      ORDER BY CASE WHEN status IN ('conferido','recebido','encerrado','aguardando_liberacao') THEN 0 ELSE 1 END,
               created_at NULLS LAST
    ) AS rn
  FROM public.pedidos_recebimento
  WHERE wise_pedido_id IS NOT NULL
)
UPDATE public.pedidos_recebimento p
SET wise_pedido_id = p.wise_pedido_id || '-dup-' || left(p.id::text, 8)
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_wise_id
  ON public.pedidos_recebimento (wise_pedido_id)
  WHERE wise_pedido_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_importacoes_hash ON public.importacoes_pedido (arquivo_hash);

-- ------------------------------------------------------------
-- PH-B24 / B27 / B28: importação atômica
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.importar_pedidos_wise(
  p_arquivo TEXT,
  p_formato TEXT,
  p_hash TEXT,
  p_pedidos JSONB,
  p_ignoradas JSONB DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lote UUID;
  v_user UUID := auth.uid();
  v_dias NUMERIC;
  v_emissao DATE := public.today_brt();
  v_ped JSONB;
  v_item JSONB;
  v_pen JSONB;
  v_exist RECORD;
  v_pedido_id UUID;
  v_status public.status_pedido;
  v_locked BOOLEAN;
  v_novos INT := 0;
  v_atualizados INT := 0;
  v_itens INT := 0;
  v_pend INT := 0;
  v_avisos JSONB := COALESCE(p_ignoradas, '[]'::jsonb);
  v_item_id UUID;
  v_fam UUID;
  v_linha INT := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  INSERT INTO public.importacoes_pedido (arquivo, formato, usuario_id, arquivo_hash, status)
  VALUES (p_arquivo, COALESCE(NULLIF(p_formato, ''), 'xlsx'), v_user, NULLIF(p_hash, ''), 'processando')
  RETURNING id INTO v_lote;

  v_dias := COALESCE(public.config_num('dias_entrega_prevista', 1), 1);

  FOR v_ped IN SELECT value FROM jsonb_array_elements(COALESCE(p_pedidos, '[]'::jsonb))
  LOOP
    v_linha := v_linha + 1;
    IF COALESCE(v_ped->>'wise_pedido_id', '') = '' THEN
      RAISE EXCEPTION 'Pedido sem wise_pedido_id na posição %', v_linha;
    END IF;

    SELECT id, status, importacao_id
      INTO v_exist
    FROM public.pedidos_recebimento
    WHERE wise_pedido_id = v_ped->>'wise_pedido_id'
    LIMIT 1;

    IF v_ped->>'fornecedor_id' IS NULL OR v_ped->>'fornecedor_id' = '' THEN
      v_status := 'aguardando_vinculo';
    ELSE
      v_status := 'pendente';
    END IF;

    v_locked := FALSE;
    IF v_exist.id IS NOT NULL THEN
      v_locked := v_exist.status IN ('conferido', 'recebido', 'encerrado', 'aguardando_liberacao');
      v_pedido_id := v_exist.id;
      UPDATE public.pedidos_recebimento SET
        ultima_importacao_id = v_lote,
        data_prevista = CASE
          WHEN v_locked THEN data_prevista
          ELSE COALESCE(NULLIF(v_ped->>'data_prevista', '')::date, data_prevista, v_emissao + v_dias)
        END,
        fornecedor_id = CASE
          WHEN v_locked THEN fornecedor_id
          ELSE COALESCE(NULLIF(v_ped->>'fornecedor_id', '')::uuid, fornecedor_id)
        END,
        status = CASE
          WHEN v_locked THEN status
          WHEN (v_ped->>'fornecedor_id') IS NULL OR (v_ped->>'fornecedor_id') = '' THEN 'aguardando_vinculo'::public.status_pedido
          WHEN status IN ('pendente', 'aguardando_vinculo') THEN v_status
          ELSE status
        END
      WHERE id = v_exist.id;
      v_atualizados := v_atualizados + 1;
      IF v_locked THEN
        v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
          'motivo', format('Pedido %s: já possui entrega conferida — itens conferidos preservados', v_ped->>'wise_pedido_id')
        ));
      END IF;
    ELSE
      INSERT INTO public.pedidos_recebimento (
        codigo, fornecedor_id, origem, wise_pedido_id, data_prevista, data_pedido,
        status, importacao_id, ultima_importacao_id, created_by
      ) VALUES (
        v_ped->>'wise_pedido_id',
        NULLIF(v_ped->>'fornecedor_id', '')::uuid,
        'wisetec',
        v_ped->>'wise_pedido_id',
        COALESCE(NULLIF(v_ped->>'data_prevista', '')::date, v_emissao + v_dias),
        v_emissao,
        v_status,
        v_lote,
        v_lote,
        v_user
      )
      ON CONFLICT (wise_pedido_id) WHERE wise_pedido_id IS NOT NULL
      DO UPDATE SET
        ultima_importacao_id = EXCLUDED.ultima_importacao_id,
        data_prevista = COALESCE(EXCLUDED.data_prevista, public.pedidos_recebimento.data_prevista),
        fornecedor_id = COALESCE(EXCLUDED.fornecedor_id, public.pedidos_recebimento.fornecedor_id)
      RETURNING id INTO v_pedido_id;
      v_novos := v_novos + 1;
    END IF;

    IF v_locked THEN
      CONTINUE;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_ped->'itens', '[]'::jsonb))
    LOOP
      IF NULLIF(v_item->>'familia', '') IS NOT NULL AND NULLIF(v_item->>'produto_id', '') IS NOT NULL THEN
        SELECT id INTO v_fam FROM public.familias_produto WHERE nome ILIKE v_item->>'familia' LIMIT 1;
        IF v_fam IS NULL THEN
          INSERT INTO public.familias_produto (nome) VALUES (v_item->>'familia') RETURNING id INTO v_fam;
        END IF;
        UPDATE public.produtos SET familia_id = v_fam
        WHERE id = (v_item->>'produto_id')::uuid AND familia_id IS NULL;
      END IF;

      v_item_id := NULL;
      IF NULLIF(v_item->>'produto_id', '') IS NOT NULL THEN
        SELECT id INTO v_item_id FROM public.itens_pedido
        WHERE pedido_id = v_pedido_id AND produto_id = (v_item->>'produto_id')::uuid
        LIMIT 1;
      ELSE
        SELECT id INTO v_item_id FROM public.itens_pedido
        WHERE pedido_id = v_pedido_id AND produto_id IS NULL
          AND COALESCE(nome_externo, '') = COALESCE(v_item->>'produto_nome', '')
          AND COALESCE(codigo_externo, '') = COALESCE(v_item->>'codigo_produto', '')
        LIMIT 1;
      END IF;

      IF v_item_id IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM public.itens_conferencia ic
          JOIN public.conferencias c ON c.id = ic.conferencia_id
          WHERE ic.item_pedido_id = v_item_id AND ic.conferido AND c.pedido_id = v_pedido_id
        ) THEN
          CONTINUE;
        END IF;
        UPDATE public.itens_pedido SET
          quantidade_pedida = COALESCE((v_item->>'quantidade')::numeric, quantidade_pedida),
          preco_unitario = CASE WHEN v_item ? 'preco_unitario' THEN NULLIF(v_item->>'preco_unitario', '')::numeric ELSE preco_unitario END,
          unidade = COALESCE(NULLIF(v_item->>'unidade', ''), unidade),
          nome_externo = COALESCE(NULLIF(v_item->>'produto_nome', ''), nome_externo),
          codigo_externo = COALESCE(NULLIF(v_item->>'codigo_produto', ''), codigo_externo)
        WHERE id = v_item_id;
      ELSE
        INSERT INTO public.itens_pedido (
          pedido_id, produto_id, quantidade_pedida, preco_unitario, unidade, nome_externo, codigo_externo
        ) VALUES (
          v_pedido_id,
          NULLIF(v_item->>'produto_id', '')::uuid,
          COALESCE((v_item->>'quantidade')::numeric, 0),
          NULLIF(v_item->>'preco_unitario', '')::numeric,
          NULLIF(v_item->>'unidade', ''),
          NULLIF(v_item->>'produto_nome', ''),
          NULLIF(v_item->>'codigo_produto', '')
        );
      END IF;
      v_itens := v_itens + 1;
    END LOOP;

    FOR v_pen IN SELECT value FROM jsonb_array_elements(COALESCE(v_ped->'pendencias', '[]'::jsonb))
    LOOP
      IF COALESCE(v_pen->>'tipo', '') NOT IN ('fornecedor', 'produto') THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.pendencias_vinculo
        WHERE pedido_id = v_pedido_id AND tipo = (v_pen->>'tipo')::public.tipo_alias
          AND nome_externo = v_pen->>'nome' AND status = 'aberta'
      ) THEN
        UPDATE public.pendencias_vinculo SET
          ocorrencias = ocorrencias + 1,
          importacao_id = v_lote
        WHERE pedido_id = v_pedido_id AND tipo = (v_pen->>'tipo')::public.tipo_alias
          AND nome_externo = v_pen->>'nome' AND status = 'aberta';
      ELSE
        INSERT INTO public.pendencias_vinculo (
          importacao_id, pedido_id, tipo, nome_externo, codigo_externo, ocorrencias, status
        ) VALUES (
          v_lote, v_pedido_id, (v_pen->>'tipo')::public.tipo_alias,
          v_pen->>'nome', NULLIF(v_pen->>'codigo', ''), 1, 'aberta'
        );
        v_pend := v_pend + 1;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.importacoes_pedido SET
    status = 'ok',
    pedidos_novos = v_novos,
    pedidos_atualizados = v_atualizados,
    itens = v_itens,
    pendencias = v_pend,
    linhas_ignoradas = jsonb_array_length(v_avisos),
    ignoradas_motivo = v_avisos
  WHERE id = v_lote;

  RETURN jsonb_build_object(
    'lote_id', v_lote,
    'novos', v_novos,
    'atualizados', v_atualizados,
    'itens', v_itens,
    'pendencias', v_pend,
    'ignoradas', v_avisos,
    'status', 'ok'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Erro na importação (pedido %): %', v_linha, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.importar_pedidos_wise(TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_pedidos_wise(TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- PH-R11: desfazer lote + limpar pendências
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.desfazer_importacao(p_importacao_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_ped RECORD;
  v_removidos INT := 0;
  v_mantidos JSONB := '[]'::jsonb;
  v_motivo TEXT;
  v_pend INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem desfazer importação';
  END IF;

  FOR v_ped IN
    SELECT id, codigo, status, encerrado_em
    FROM public.pedidos_recebimento
    WHERE importacao_id = p_importacao_id
  LOOP
    v_motivo := NULL;
    IF v_ped.encerrado_em IS NOT NULL OR v_ped.status = 'encerrado' THEN
      v_motivo := 'pedido encerrado';
    ELSIF EXISTS (SELECT 1 FROM public.conferencias c WHERE c.pedido_id = v_ped.id) THEN
      v_motivo := 'já possui conferência';
    ELSIF EXISTS (SELECT 1 FROM public.cargas c WHERE c.pedido_origem_id = v_ped.id) THEN
      v_motivo := 'já gerou carga';
    ELSIF EXISTS (
      SELECT 1 FROM public.movimentacoes_caixa m
      WHERE m.documento_tipo IN ('pedido', 'conferencia') AND m.documento_id = v_ped.id
    ) THEN
      v_motivo := 'já tem movimento de caixa';
    END IF;

    IF v_motivo IS NOT NULL THEN
      v_mantidos := v_mantidos || jsonb_build_array(jsonb_build_object('codigo', v_ped.codigo, 'motivo', v_motivo));
    ELSE
      DELETE FROM public.pendencias_vinculo WHERE pedido_id = v_ped.id;
      DELETE FROM public.pedidos_recebimento WHERE id = v_ped.id;
      v_removidos := v_removidos + 1;
    END IF;
  END LOOP;

  DELETE FROM public.pendencias_vinculo
  WHERE importacao_id = p_importacao_id AND status = 'aberta';
  GET DIAGNOSTICS v_pend = ROW_COUNT;

  UPDATE public.importacoes_pedido SET
    status = 'desfeita',
    desfeita_por = v_user,
    desfeita_em = now()
  WHERE id = p_importacao_id;

  RETURN jsonb_build_object(
    'removidos', v_removidos,
    'mantidos', v_mantidos,
    'pendencias_removidas', v_pend
  );
END;
$$;

REVOKE ALL ON FUNCTION public.desfazer_importacao(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.desfazer_importacao(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.limpar_pendencias_importacao(p_importacao_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem limpar pendências';
  END IF;
  UPDATE public.pendencias_vinculo SET
    status = 'dispensada',
    motivo = 'Limpeza em massa do lote',
    resolved_by = auth.uid(),
    resolved_at = now()
  WHERE importacao_id = p_importacao_id AND status = 'aberta';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_pendencias_importacao(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.limpar_pendencias_importacao(UUID) TO authenticated;
