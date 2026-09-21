-- 00043: importar_cargas_wise — espelha importar_pedidos_wise para expedição
-- + suporte a cliente_id nullable / produto_id nullable em romaneio + importacoes_carga

CREATE TABLE IF NOT EXISTS public.importacoes_carga (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo              TEXT NOT NULL,
  formato              TEXT NOT NULL DEFAULT 'wise-sync',
  usuario_id           UUID REFERENCES public.profiles(id),
  arquivo_hash         TEXT,
  cargas_novas         INT NOT NULL DEFAULT 0,
  cargas_atualizadas   INT NOT NULL DEFAULT 0,
  itens                INT NOT NULL DEFAULT 0,
  pendencias           INT NOT NULL DEFAULT 0,
  linhas_ignoradas     INT NOT NULL DEFAULT 0,
  ignoradas_motivo     JSONB NOT NULL DEFAULT '[]'::jsonb,
  status               TEXT NOT NULL DEFAULT 'ok',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes_carga ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS importacoes_carga_select_auth ON public.importacoes_carga;
CREATE POLICY importacoes_carga_select_auth ON public.importacoes_carga
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS importacoes_carga_insert_service ON public.importacoes_carga;
CREATE POLICY importacoes_carga_insert_service ON public.importacoes_carga
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE public.cargas
  ALTER COLUMN cliente_id DROP NOT NULL;

ALTER TABLE public.romaneio_itens
  ALTER COLUMN produto_id DROP NOT NULL;

ALTER TABLE public.romaneio_itens
  ADD COLUMN IF NOT EXISTS nome_externo TEXT,
  ADD COLUMN IF NOT EXISTS codigo_externo TEXT;

ALTER TABLE public.pendencias_vinculo
  ADD COLUMN IF NOT EXISTS carga_id UUID REFERENCES public.cargas(id) ON DELETE SET NULL;

ALTER TABLE public.pendencias_vinculo
  ADD COLUMN IF NOT EXISTS importacao_carga_id UUID REFERENCES public.importacoes_carga(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.importar_cargas_wise(
  p_arquivo TEXT,
  p_formato TEXT,
  p_hash TEXT,
  p_cargas JSONB,
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
  v_carga JSONB;
  v_item JSONB;
  v_pen JSONB;
  v_exist RECORD;
  v_carga_id UUID;
  v_locked BOOLEAN;
  v_novos INT := 0;
  v_atualizados INT := 0;
  v_itens INT := 0;
  v_pend INT := 0;
  v_avisos JSONB := COALESCE(p_ignoradas, '[]'::jsonb);
  v_item_id UUID;
  v_linha INT := 0;
  v_data DATE;
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

  INSERT INTO public.importacoes_carga (arquivo, formato, usuario_id, arquivo_hash, status)
  VALUES (p_arquivo, COALESCE(NULLIF(p_formato, ''), 'wise-sync'), v_user, NULLIF(p_hash, ''), 'processando')
  RETURNING id INTO v_lote;

  FOR v_carga IN SELECT value FROM jsonb_array_elements(COALESCE(p_cargas, '[]'::jsonb))
  LOOP
    v_linha := v_linha + 1;
    IF COALESCE(v_carga->>'wise_carregamento_id', '') = '' THEN
      RAISE EXCEPTION 'Carga sem wise_carregamento_id na posição %', v_linha;
    END IF;

    v_data := COALESCE(
      NULLIF(v_carga->>'data_carga', '')::date,
      public.today_brt()
    );

    SELECT id, status, cliente_id
      INTO v_exist
    FROM public.cargas
    WHERE wise_carregamento_id = v_carga->>'wise_carregamento_id'
    LIMIT 1;

    v_locked := FALSE;
    IF v_exist.id IS NOT NULL THEN
      v_locked := v_exist.status IN ('carregando', 'concluida');
      v_carga_id := v_exist.id;
      IF NOT v_locked THEN
        UPDATE public.cargas SET
          codigo = COALESCE(NULLIF(v_carga->>'codigo', ''), codigo),
          cliente_id = COALESCE(NULLIF(v_carga->>'cliente_id', '')::uuid, cliente_id),
          data_carga = COALESCE(v_data, data_carga),
          origem = 'wisetec',
          updated_at = now()
        WHERE id = v_exist.id;
      ELSE
        v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
          'motivo', format('Carga %s: status %s — preservada', v_carga->>'wise_carregamento_id', v_exist.status)
        ));
      END IF;
      v_atualizados := v_atualizados + 1;
    ELSE
      INSERT INTO public.cargas (
        codigo, cliente_id, data_carga, status, origem, wise_carregamento_id, created_by
      ) VALUES (
        COALESCE(NULLIF(v_carga->>'codigo', ''), v_carga->>'wise_carregamento_id'),
        NULLIF(v_carga->>'cliente_id', '')::uuid,
        v_data,
        'aguardando',
        'wisetec',
        v_carga->>'wise_carregamento_id',
        v_user
      )
      RETURNING id INTO v_carga_id;
      v_novos := v_novos + 1;
    END IF;

    IF v_locked THEN
      CONTINUE;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_carga->'itens', '[]'::jsonb))
    LOOP
      v_item_id := NULL;
      IF NULLIF(v_item->>'produto_id', '') IS NOT NULL THEN
        SELECT id INTO v_item_id FROM public.romaneio_itens
        WHERE carga_id = v_carga_id AND produto_id = (v_item->>'produto_id')::uuid
        LIMIT 1;
      ELSE
        SELECT id INTO v_item_id FROM public.romaneio_itens
        WHERE carga_id = v_carga_id AND produto_id IS NULL
          AND COALESCE(nome_externo, '') = COALESCE(v_item->>'produto_nome', '')
          AND COALESCE(codigo_externo, '') = COALESCE(v_item->>'codigo_produto', '')
        LIMIT 1;
      END IF;

      IF v_item_id IS NOT NULL THEN
        UPDATE public.romaneio_itens SET
          quantidade_romaneio = COALESCE((v_item->>'quantidade')::numeric, quantidade_romaneio),
          nome_externo = COALESCE(NULLIF(v_item->>'produto_nome', ''), nome_externo),
          codigo_externo = COALESCE(NULLIF(v_item->>'codigo_produto', ''), codigo_externo),
          updated_at = now()
        WHERE id = v_item_id;
      ELSE
        INSERT INTO public.romaneio_itens (
          carga_id, produto_id, quantidade_romaneio, quantidade_real, status,
          nome_externo, codigo_externo
        ) VALUES (
          v_carga_id,
          NULLIF(v_item->>'produto_id', '')::uuid,
          COALESCE((v_item->>'quantidade')::numeric, 0),
          0,
          'pendente',
          NULLIF(v_item->>'produto_nome', ''),
          NULLIF(v_item->>'codigo_produto', '')
        );
      END IF;
      v_itens := v_itens + 1;
    END LOOP;

    FOR v_pen IN SELECT value FROM jsonb_array_elements(COALESCE(v_carga->'pendencias', '[]'::jsonb))
    LOOP
      IF COALESCE(v_pen->>'tipo', '') NOT IN ('produto', 'destinatario') THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.pendencias_vinculo
        WHERE carga_id = v_carga_id AND tipo = (v_pen->>'tipo')::public.tipo_alias
          AND nome_externo = v_pen->>'nome' AND status = 'aberta'
      ) THEN
        UPDATE public.pendencias_vinculo SET
          ocorrencias = ocorrencias + 1,
          importacao_carga_id = v_lote
        WHERE carga_id = v_carga_id AND tipo = (v_pen->>'tipo')::public.tipo_alias
          AND nome_externo = v_pen->>'nome' AND status = 'aberta';
      ELSE
        INSERT INTO public.pendencias_vinculo (
          importacao_carga_id, carga_id, tipo, nome_externo, codigo_externo, ocorrencias, status
        ) VALUES (
          v_lote, v_carga_id, (v_pen->>'tipo')::public.tipo_alias,
          v_pen->>'nome', NULLIF(v_pen->>'codigo', ''), 1, 'aberta'
        );
        v_pend := v_pend + 1;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.importacoes_carga SET
    status = 'ok',
    cargas_novas = v_novos,
    cargas_atualizadas = v_atualizados,
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
  RAISE EXCEPTION 'Erro na importação de cargas (linha %): %', v_linha, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.importar_cargas_wise(TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_cargas_wise(TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_cargas_wise(TEXT, TEXT, TEXT, JSONB, JSONB) TO service_role;

-- Sync metadata for UI "atualizado em"
CREATE OR REPLACE VIEW public.v_wise_sync_status
WITH (security_invoker = true)
AS
SELECT
  (SELECT MAX(created_at) FROM public.importacoes_pedido WHERE formato = 'wise-sync') AS ultima_compra,
  (SELECT MAX(created_at) FROM public.importacoes_carga WHERE formato = 'wise-sync') AS ultima_venda,
  LEAST(
    (SELECT MAX(created_at) FROM public.importacoes_pedido WHERE formato = 'wise-sync'),
    (SELECT MAX(created_at) FROM public.importacoes_carga WHERE formato = 'wise-sync')
  ) AS atualizado_em;

GRANT SELECT ON public.v_wise_sync_status TO authenticated;
GRANT SELECT ON public.v_wise_sync_status TO service_role;
