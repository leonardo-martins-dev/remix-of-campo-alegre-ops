-- ============================================================
-- Onda 1 — NOP-299 / NOP-300 / NOP-301
--   • Conferir pedido (romaneio → real + caixas por fator saída)
--   • Status encadeado: Importado → Conferido → Em carga → Saída → Entregue
--   • Cards ricos: número ordem, rota da loja, totais
-- ============================================================

-- ------------------------------------------------------------
-- 1. Status: adiciona 'conferida' entre importada e separada
--    (separada = "Em carga" na UI)
-- ------------------------------------------------------------
ALTER TABLE public.cargas DROP CONSTRAINT IF EXISTS ck_cargas_status_ordem;
ALTER TABLE public.cargas
  ADD CONSTRAINT ck_cargas_status_ordem CHECK (status_ordem IN (
    'importada',
    'conferida',
    'separada',
    'em_transito',
    'entregue',
    'entregue_parcial',
    'recusada'
  ));

ALTER TABLE public.cargas
  ADD COLUMN IF NOT EXISTS romaneio_conferido_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS romaneio_conferido_em TIMESTAMPTZ;

COMMENT ON COLUMN public.cargas.romaneio_conferido_por IS
  'NOP-299/300: quem clicou em Conferir pedido no painel';
COMMENT ON COLUMN public.cargas.romaneio_conferido_em IS
  'NOP-299/300: quando o romaneio foi conferido no painel';

-- ------------------------------------------------------------
-- 2. RPC: Conferir pedido — preenche real = romaneio + caixas por fator
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conferir_pedido_carga(p_carga_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga RECORD;
  v_item RECORD;
  v_fator RECORD;
  v_caixas jsonb;
  v_sigla TEXT;
  v_qtd INT;
  v_resumo jsonb := '{}'::jsonb;
  v_itens INT := 0;
  v_sem_fator INT := 0;
  v_real jsonb := '{}'::jsonb;
BEGIN
  IF p_carga_id IS NULL THEN
    RAISE EXCEPTION 'Informe a carga';
  END IF;

  SELECT id, status_ordem, codigo
  INTO v_carga
  FROM public.cargas
  WHERE id = p_carga_id
  FOR UPDATE;

  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'Carga não encontrada';
  END IF;

  IF v_carga.status_ordem IN ('em_transito', 'entregue', 'entregue_parcial', 'recusada') THEN
    RAISE EXCEPTION 'Ordem já saiu do packing (status: %)', v_carga.status_ordem;
  END IF;

  FOR v_item IN
    SELECT ri.id, ri.produto_id, ri.quantidade_romaneio
    FROM public.romaneio_itens ri
    WHERE ri.carga_id = p_carga_id
  LOOP
    v_itens := v_itens + 1;
    v_caixas := '{}'::jsonb;

    IF v_item.produto_id IS NOT NULL AND COALESCE(v_item.quantidade_romaneio, 0) > 0 THEN
      -- Um tipo por produto: fator de saída (conversoes_produto_caixa), 1º por ordem do tipo
      SELECT c.fator, t.sigla
      INTO v_fator
      FROM public.conversoes_produto_caixa c
      JOIN public.tipos_caixa t ON t.id = c.tipo_caixa_id
      WHERE c.produto_id = v_item.produto_id
        AND c.ativo IS TRUE
        AND t.ativo IS TRUE
        AND c.fator > 0
      ORDER BY t.ordem NULLS LAST, t.sigla
      LIMIT 1;

      IF FOUND AND v_fator.fator > 0 THEN
        v_sigla := v_fator.sigla;
        v_qtd := CEIL(v_item.quantidade_romaneio::numeric / v_fator.fator)::int;
        v_caixas := jsonb_build_object(v_sigla, v_qtd);
        v_resumo := v_resumo || jsonb_build_object(
          v_sigla,
          COALESCE((v_resumo->>v_sigla)::int, 0) + v_qtd
        );
      ELSE
        v_sem_fator := v_sem_fator + 1;
      END IF;
    ELSIF v_item.produto_id IS NULL OR COALESCE(v_item.quantidade_romaneio, 0) <= 0 THEN
      NULL;
    END IF;

    UPDATE public.romaneio_itens
    SET quantidade_real = COALESCE(quantidade_romaneio, 0),
        caixas = v_caixas,
        caixas_g = COALESCE((v_caixas->>'G')::int, 0),
        caixas_i = COALESCE((v_caixas->>'I')::int, 0),
        caixas_p = COALESCE((v_caixas->>'P')::int, 0),
        status = 'ok',
        updated_at = now()
    WHERE id = v_item.id;
  END LOOP;

  v_real := v_resumo;

  INSERT INTO public.carga_caixas_resumo AS r (
    carga_id,
    sugerido_g, sugerido_i, sugerido_p,
    real_g, real_i, real_p,
    sugerido, real, updated_at
  ) VALUES (
    p_carga_id,
    COALESCE((v_resumo->>'G')::int, 0),
    COALESCE((v_resumo->>'I')::int, 0),
    COALESCE((v_resumo->>'P')::int, 0),
    COALESCE((v_real->>'G')::int, 0),
    COALESCE((v_real->>'I')::int, 0),
    COALESCE((v_real->>'P')::int, 0),
    v_resumo,
    v_real,
    now()
  )
  ON CONFLICT (carga_id) DO UPDATE SET
    sugerido_g = EXCLUDED.sugerido_g,
    sugerido_i = EXCLUDED.sugerido_i,
    sugerido_p = EXCLUDED.sugerido_p,
    real_g = EXCLUDED.real_g,
    real_i = EXCLUDED.real_i,
    real_p = EXCLUDED.real_p,
    sugerido = EXCLUDED.sugerido,
    real = EXCLUDED.real,
    updated_at = now();

  UPDATE public.cargas
  SET status_ordem = CASE
        WHEN status_ordem IN ('importada', 'conferida') THEN 'conferida'
        ELSE status_ordem
      END,
      romaneio_conferido_por = auth.uid(),
      romaneio_conferido_em = now(),
      progresso = GREATEST(COALESCE(progresso, 0), 50),
      updated_at = now()
  WHERE id = p_carga_id;

  RETURN jsonb_build_object(
    'carga_id', p_carga_id,
    'itens', v_itens,
    'sem_fator', v_sem_fator,
    'sugerido', v_resumo,
    'status_ordem', 'conferida'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.conferir_pedido_carga(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conferir_pedido_carga(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3. Ao finalizar no painel: promove a Em carga (separada) e,
--    se ainda não houver caixas_ordem, gera a partir do resumo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalizar_carga_expedicao(p_carga_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga RECORD;
  v_resumo RECORD;
  v_existentes INT;
  v_total INT := 0;
  v_numero INT := 0;
  v_ordem TEXT;
  v_sigla TEXT;
  v_qtd INT;
  v_tipo_id UUID;
  v_key TEXT;
  v_real jsonb;
BEGIN
  SELECT id, codigo, numero_ordem, status_ordem, cliente_id
  INTO v_carga
  FROM public.cargas
  WHERE id = p_carga_id
  FOR UPDATE;

  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'Carga não encontrada';
  END IF;

  IF v_carga.status_ordem IN ('em_transito', 'entregue', 'entregue_parcial', 'recusada') THEN
    RAISE EXCEPTION 'Ordem já saiu do packing (status: %)', v_carga.status_ordem;
  END IF;

  SELECT COUNT(*) INTO v_existentes FROM public.caixas_ordem WHERE carga_id = p_carga_id;

  IF v_existentes = 0 THEN
    SELECT sugerido, real, real_g, real_i, real_p
    INTO v_resumo
    FROM public.carga_caixas_resumo
    WHERE carga_id = p_carga_id;

    v_real := COALESCE(v_resumo.real, '{}'::jsonb);
    IF v_real = '{}'::jsonb THEN
      v_real := jsonb_strip_nulls(jsonb_build_object(
        'G', NULLIF(v_resumo.real_g, 0),
        'I', NULLIF(v_resumo.real_i, 0),
        'P', NULLIF(v_resumo.real_p, 0)
      ));
    END IF;

    -- Conta total de caixas a gerar
    FOR v_key IN SELECT jsonb_object_keys(COALESCE(v_real, '{}'::jsonb)) LOOP
      v_total := v_total + COALESCE((v_real->>v_key)::int, 0);
    END LOOP;

    IF v_total = 0 THEN
      -- Fallback: 1 caixa genérica para não travar a saída
      v_total := 1;
      v_real := '{"G":1}'::jsonb;
    END IF;

    v_ordem := COALESCE(v_carga.numero_ordem, regexp_replace(v_carga.codigo, '^PV-', ''), v_carga.codigo);

    FOR v_key IN SELECT jsonb_object_keys(v_real) LOOP
      v_sigla := v_key;
      v_qtd := COALESCE((v_real->>v_key)::int, 0);
      IF v_qtd <= 0 THEN CONTINUE; END IF;

      SELECT id INTO v_tipo_id FROM public.tipos_caixa WHERE sigla = v_sigla AND ativo IS TRUE LIMIT 1;

      FOR i IN 1..v_qtd LOOP
        v_numero := v_numero + 1;
        INSERT INTO public.caixas_ordem (
          carga_id, numero, total_caixas, codigo_etiqueta,
          tipo_caixa_id, tipo_caixa_sigla, status, separado_por, separado_em
        ) VALUES (
          p_carga_id, v_numero, v_total,
          v_ordem || ' · ' || v_numero || '/' || v_total,
          v_tipo_id, v_sigla, 'separada', auth.uid(), now()
        );
      END LOOP;
    END LOOP;
  ELSE
    SELECT COUNT(*) INTO v_total FROM public.caixas_ordem WHERE carga_id = p_carga_id;
  END IF;

  UPDATE public.cargas
  SET status = 'concluida'::public.status_carga,
      status_ordem = 'separada',
      status_separacao = COALESCE(status_separacao, 'separado'),
      separado_por = COALESCE(separado_por, auth.uid()),
      separado_em = COALESCE(separado_em, now()),
      hora_fim = now(),
      progresso = 100,
      updated_at = now()
  WHERE id = p_carga_id;

  IF NOT EXISTS (SELECT 1 FROM public.registros_ciclo WHERE carga_id = p_carga_id) THEN
    INSERT INTO public.registros_ciclo (carga_id, hora_inicio_carga, hora_saida_caminhao, data_registro)
    VALUES (p_carga_id, now(), now(), public.today_brt());
  END IF;

  RETURN jsonb_build_object(
    'carga_id', p_carga_id,
    'status_ordem', 'separada',
    'total_caixas', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_carga_expedicao(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_carga_expedicao(UUID) TO authenticated;

-- Separação aceita também 'conferida'
CREATE OR REPLACE FUNCTION public.confirmar_separacao_ordem(
  p_carga_id UUID,
  p_caixas JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga RECORD;
  v_caixa JSONB;
  v_item JSONB;
  v_caixa_id UUID;
  v_total INT;
  v_numero INT;
  v_etiqueta TEXT;
  v_ordem TEXT;
BEGIN
  SELECT c.id, c.codigo, c.numero_ordem, c.status_ordem
  INTO v_carga
  FROM public.cargas c
  WHERE c.id = p_carga_id
  FOR UPDATE;

  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada';
  END IF;

  IF v_carga.status_ordem NOT IN ('importada', 'conferida', 'separada') THEN
    RAISE EXCEPTION 'Ordem já saiu do packing (status: %)', v_carga.status_ordem;
  END IF;

  v_ordem := COALESCE(v_carga.numero_ordem, regexp_replace(v_carga.codigo, '^PV-', ''));
  v_total := jsonb_array_length(COALESCE(p_caixas, '[]'::jsonb));

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma caixa';
  END IF;

  DELETE FROM public.caixas_ordem WHERE carga_id = p_carga_id;

  FOR v_caixa IN SELECT * FROM jsonb_array_elements(p_caixas) LOOP
    v_numero := COALESCE(NULLIF(v_caixa->>'numero', '')::int, 0);
    IF v_numero <= 0 THEN
      RAISE EXCEPTION 'Caixa sem número';
    END IF;
    v_etiqueta := v_ordem || ' · ' || v_numero || '/' || v_total;

    INSERT INTO public.caixas_ordem (
      carga_id, numero, total_caixas, codigo_etiqueta,
      tipo_caixa_id, tipo_caixa_sigla, status, separado_por, separado_em
    ) VALUES (
      p_carga_id, v_numero, v_total, v_etiqueta,
      NULLIF(v_caixa->>'tipo_caixa_id', '')::uuid,
      NULLIF(v_caixa->>'tipo_caixa_sigla', ''),
      'separada', auth.uid(), now()
    )
    RETURNING id INTO v_caixa_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_caixa->'itens', '[]'::jsonb)) LOOP
      IF COALESCE(NULLIF(v_item->>'quantidade', '')::numeric, 0) > 0 THEN
        INSERT INTO public.itens_caixa_ordem (
          caixa_id, romaneio_item_id, produto_id, quantidade, status
        ) VALUES (
          v_caixa_id,
          NULLIF(v_item->>'romaneio_item_id', '')::uuid,
          NULLIF(v_item->>'produto_id', '')::uuid,
          (v_item->>'quantidade')::numeric,
          'separada'
        );
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.cargas
  SET status_ordem = 'separada',
      status_separacao = 'separado',
      separado_por = auth.uid(),
      separado_em = now(),
      numero_ordem = COALESCE(numero_ordem, v_ordem),
      updated_at = now()
  WHERE id = p_carga_id;

  RETURN jsonb_build_object('carga_id', p_carga_id, 'total_caixas', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_separacao_ordem(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_separacao_ordem(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 4. View enriquecida das cargas do dia (cards NOP-301)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_cargas_dia;
CREATE VIEW public.v_cargas_dia
WITH (security_invoker = true) AS
SELECT
  cg.id,
  cg.codigo,
  COALESCE(cg.numero_ordem, regexp_replace(cg.codigo, '^PV-', '')) AS numero_ordem,
  cg.status,
  cg.status_ordem,
  cg.progresso,
  cg.hora_inicio,
  cg.hora_fim,
  cg.data_carga,
  cg.cliente_id,
  COALESCE(cl.nome, 'Sem loja vinculada') AS cliente_nome,
  cg.rota_id AS carga_rota_id,
  COALESCE(r_carga.nome, r_loja.nome) AS rota_nome,
  COALESCE(cg.rota_id, cl.rota_id) AS rota_id_efetiva,
  cg.motorista_id,
  m.nome AS motorista_nome,
  cam.placa AS caminhao_placa,
  (SELECT COUNT(*)::int FROM public.romaneio_itens ri WHERE ri.carga_id = cg.id) AS total_linhas,
  (SELECT COALESCE(SUM(ri.quantidade_romaneio), 0) FROM public.romaneio_itens ri WHERE ri.carga_id = cg.id) AS total_itens,
  (
    SELECT COALESCE(
      SUM(COALESCE((ri.caixas->>'G')::int, ri.caixas_g, 0)
        + COALESCE((ri.caixas->>'I')::int, ri.caixas_i, 0)
        + COALESCE((ri.caixas->>'P')::int, ri.caixas_p, 0)),
      0
    )::int
    FROM public.romaneio_itens ri
    WHERE ri.carga_id = cg.id
  ) AS total_caixas_itens,
  (
    SELECT COALESCE(r.real_g, 0) + COALESCE(r.real_i, 0) + COALESCE(r.real_p, 0)
    FROM public.carga_caixas_resumo r
    WHERE r.carga_id = cg.id
  ) AS total_caixas_resumo,
  (SELECT COUNT(*)::int FROM public.caixas_ordem co WHERE co.carga_id = cg.id) AS caixas_ordem_count,
  cg.romaneio_conferido_em,
  cg.separado_em,
  cg.conferido_em,
  cg.entregue_em
FROM public.cargas cg
LEFT JOIN public.clientes cl ON cl.id = cg.cliente_id
LEFT JOIN public.rotas r_carga ON r_carga.id = cg.rota_id
LEFT JOIN public.rotas r_loja ON r_loja.id = cl.rota_id
LEFT JOIN public.motoristas m ON m.id = cg.motorista_id
LEFT JOIN public.caminhoes cam ON cam.id = cg.caminhao_id;

GRANT SELECT ON public.v_cargas_dia TO authenticated;

-- ------------------------------------------------------------
-- 5. Atualiza v_ordem_expedicao com romaneio_conferido_*
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_ordem_expedicao;
CREATE VIEW public.v_ordem_expedicao
WITH (security_invoker = true) AS
SELECT
  cg.id AS carga_id,
  cg.codigo,
  COALESCE(cg.numero_ordem, regexp_replace(cg.codigo, '^PV-', '')) AS numero_ordem,
  cg.data_carga,
  cg.status_ordem,
  cg.status_separacao,
  cg.cliente_id,
  COALESCE(cl.nome, 'Sem loja vinculada') AS cliente_nome,
  COALESCE(cg.cliente_cnpj, cl.cnpj) AS cliente_cnpj,
  cg.rota_id,
  cg.motorista_id,
  m.nome AS motorista_nome,
  cg.qtde_itens_wise,
  cg.qtde_caixas_wise,
  cg.separado_por,
  ps.nome AS separado_por_nome,
  cg.separado_em,
  cg.conferido_por,
  pc.nome AS conferido_por_nome,
  cg.conferido_em,
  cg.entregue_por,
  pe.nome AS entregue_por_nome,
  cg.entregue_em,
  cg.romaneio_conferido_por,
  pr.nome AS romaneio_conferido_por_nome,
  cg.romaneio_conferido_em,
  cg.recebedor_nome,
  cg.canhoto_foto_url,
  cg.confirmacao_manual_admin,
  cg.justificativa_admin,
  (SELECT COUNT(*) FROM public.romaneio_itens ri WHERE ri.carga_id = cg.id)::int AS total_linhas,
  (SELECT COALESCE(SUM(ri.quantidade_romaneio), 0) FROM public.romaneio_itens ri WHERE ri.carga_id = cg.id) AS total_itens,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id)::int AS caixas_separadas,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id AND co.status = 'em_transito')::int AS caixas_em_transito,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id AND co.status = 'entregue')::int AS caixas_entregues,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id AND co.status IN ('recusada', 'nao_localizada'))::int AS caixas_recusadas
FROM public.cargas cg
LEFT JOIN public.clientes cl ON cl.id = cg.cliente_id
LEFT JOIN public.motoristas m ON m.id = cg.motorista_id
LEFT JOIN public.profiles ps ON ps.id = cg.separado_por
LEFT JOIN public.profiles pc ON pc.id = cg.conferido_por
LEFT JOIN public.profiles pe ON pe.id = cg.entregue_por
LEFT JOIN public.profiles pr ON pr.id = cg.romaneio_conferido_por;

GRANT SELECT ON public.v_ordem_expedicao TO authenticated;

-- ------------------------------------------------------------
-- 6. Divergências: inclui LEFT JOIN (loja órfã) + etapa romaneio
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_divergencias_expedicao;
CREATE VIEW public.v_divergencias_expedicao
WITH (security_invoker = true) AS
SELECT
  cg.id AS carga_id,
  COALESCE(cg.numero_ordem, regexp_replace(cg.codigo, '^PV-', '')) AS numero_ordem,
  cg.data_carga,
  cg.cliente_id,
  COALESCE(cl.nome, 'Sem loja vinculada') AS cliente_nome,
  cg.motorista_id,
  m.nome AS motorista_nome,
  cg.status_ordem,
  cg.romaneio_conferido_em,
  pr.nome AS romaneio_conferido_por_nome,
  COALESCE(cg.qtde_caixas_wise, 0) AS caixas_wise,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id)::int AS caixas_separadas,
  COALESCE((
    SELECT COALESCE(r.real_g, 0) + COALESCE(r.real_i, 0) + COALESCE(r.real_p, 0)
    FROM public.carga_caixas_resumo r WHERE r.carga_id = cg.id
  ), 0) AS caixas_romaneio_real,
  COALESCE(s.total_caixas, 0) AS caixas_saida,
  COALESCE(e.total_caixas_entregues, 0) AS caixas_entregues,
  COALESCE(e.total_caixas_recusadas, 0) AS caixas_recusadas,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id)::int
    - COALESCE(cg.qtde_caixas_wise, (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id))
    AS divergencia_wise_separacao,
  COALESCE(s.total_caixas, 0)
    - (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id)::int
    AS divergencia_separacao_saida,
  COALESCE(e.total_caixas_entregues, 0) - COALESCE(s.total_caixas, 0) AS divergencia_saida_entrega,
  e.status AS status_entrega,
  e.entregue_em,
  cg.separado_em,
  cg.conferido_em AS saida_conferida_em,
  pc.nome AS saida_conferida_por_nome
FROM public.cargas cg
LEFT JOIN public.clientes cl ON cl.id = cg.cliente_id
LEFT JOIN public.motoristas m ON m.id = cg.motorista_id
LEFT JOIN public.profiles pr ON pr.id = cg.romaneio_conferido_por
LEFT JOIN public.profiles pc ON pc.id = cg.conferido_por
LEFT JOIN public.saidas_expedicao s ON s.carga_id = cg.id AND s.status <> 'cancelada'
LEFT JOIN public.entregas_expedicao e ON e.saida_id = s.id
WHERE cg.status_ordem <> 'importada';

GRANT SELECT ON public.v_divergencias_expedicao TO authenticated;
