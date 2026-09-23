-- Sync Wise não pode empurrar data_prevista para o futuro (ex.: 23 → 24).
-- Aceita data_pedido do payload (DATA_EMISSAO). Em update: LEAST(atual, wise).

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
  v_dias INT;
  v_emissao DATE := public.today_brt();
  v_ped_emissao DATE;
  v_ped_prevista DATE;
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
  IF v_user IS NULL AND coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    SELECT id INTO v_user
    FROM public.profiles
    WHERE role = 'admin'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  INSERT INTO public.importacoes_pedido (arquivo, formato, usuario_id, arquivo_hash, status)
  VALUES (p_arquivo, COALESCE(NULLIF(p_formato, ''), 'xlsx'), v_user, NULLIF(p_hash, ''), 'processando')
  RETURNING id INTO v_lote;

  v_dias := COALESCE(public.config_num('dias_entrega_prevista', 1), 1)::INT;

  FOR v_ped IN SELECT value FROM jsonb_array_elements(COALESCE(p_pedidos, '[]'::jsonb))
  LOOP
    v_linha := v_linha + 1;
    IF COALESCE(v_ped->>'wise_pedido_id', '') = '' THEN
      RAISE EXCEPTION 'Pedido sem wise_pedido_id na posição %', v_linha;
    END IF;

    v_ped_emissao := COALESCE(NULLIF(v_ped->>'data_pedido', '')::date, v_emissao);
    v_ped_prevista := COALESCE(NULLIF(v_ped->>'data_prevista', '')::date, v_ped_emissao + v_dias);

    SELECT id, status, importacao_id, data_prevista
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
        -- Nunca atrasa a prevista já gravada (sync D+1 não esconde o pedido do dia)
        data_prevista = CASE
          WHEN v_locked THEN data_prevista
          WHEN data_prevista IS NOT NULL THEN LEAST(data_prevista, v_ped_prevista)
          ELSE v_ped_prevista
        END,
        data_pedido = CASE
          WHEN v_locked THEN data_pedido
          ELSE COALESCE(data_pedido, v_ped_emissao)
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
        v_ped_prevista,
        v_ped_emissao,
        v_status,
        v_lote,
        v_lote,
        v_user
      )
      ON CONFLICT (wise_pedido_id) WHERE wise_pedido_id IS NOT NULL
      DO UPDATE SET
        ultima_importacao_id = EXCLUDED.ultima_importacao_id,
        data_prevista = CASE
          WHEN public.pedidos_recebimento.data_prevista IS NOT NULL THEN
            LEAST(public.pedidos_recebimento.data_prevista, EXCLUDED.data_prevista)
          ELSE EXCLUDED.data_prevista
        END,
        data_pedido = COALESCE(public.pedidos_recebimento.data_pedido, EXCLUDED.data_pedido),
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

COMMENT ON FUNCTION public.importar_pedidos_wise IS
  'Import Wise pedidos; LEAST em data_prevista no update; data_pedido do payload.';

-- Corrige só o lote emitido hoje (Wise D+1): prevista → dia da emissão
UPDATE public.pedidos_recebimento
SET data_prevista = data_pedido,
    updated_at = now()
WHERE origem = 'wisetec'
  AND data_pedido = public.today_brt()
  AND data_prevista IS NOT NULL
  AND data_prevista > data_pedido
  AND status IN ('pendente', 'parcial', 'em_transito', 'aguardando_vinculo');
