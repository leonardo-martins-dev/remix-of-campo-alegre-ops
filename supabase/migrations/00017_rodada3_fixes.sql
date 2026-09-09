-- ============================================================
-- RODADA 3 — bugs B01–B11 + R07/R09 + base R08 + E02
-- ============================================================

-- PH-B01: remove overloads de 00012 (PGRST203)
DROP FUNCTION IF EXISTS public.gerar_cargas_pos_conferencia(UUID);
DROP FUNCTION IF EXISTS public.liberar_pedido_divergencia(UUID, TEXT);

-- PH-B05 / PH-R08: schema
ALTER TABLE public.pedidos_recebimento
  ALTER COLUMN fornecedor_id DROP NOT NULL;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS cnpj TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_cnpj
  ON public.clientes (cnpj) WHERE cnpj IS NOT NULL AND btrim(cnpj) <> '';

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS codigo TEXT,
  ADD COLUMN IF NOT EXISTS unidades_por_caixa NUMERIC;
CREATE UNIQUE INDEX IF NOT EXISTS uq_produtos_codigo
  ON public.produtos (codigo) WHERE codigo IS NOT NULL AND btrim(codigo) <> '';

ALTER TABLE public.itens_pedido
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id);

UPDATE public.itens_pedido ip
SET cliente_id = m.cliente_id
FROM public.itens_pedido_rateio r
JOIN public.destinatario_cliente_map m ON m.destinatario_id = r.destinatario_id
WHERE ip.cliente_id IS NULL
  AND r.item_pedido_id = ip.id;

DELETE FROM public.pendencias_vinculo a
USING public.pendencias_vinculo b
WHERE a.status = 'aberta'
  AND b.status = 'aberta'
  AND a.pedido_id IS NOT DISTINCT FROM b.pedido_id
  AND a.tipo = b.tipo
  AND a.nome_externo = b.nome_externo
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pendencia_aberta
  ON public.pendencias_vinculo (pedido_id, tipo, nome_externo)
  WHERE status = 'aberta';

-- PH-R09 config
INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('tolerancia_min_un', '1', 'Tolerância mínima em unidades do pedido')
ON CONFLICT (chave) DO NOTHING;

UPDATE public.configuracoes
SET valor = '7'
WHERE chave = 'aging_alerta_dias' AND valor IN ('99', '"99"', '99.0');

-- PH-B10 realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos_recebimento;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cargas_wise_id
  ON public.cargas (wise_carregamento_id)
  WHERE wise_carregamento_id IS NOT NULL AND btrim(wise_carregamento_id) <> '';

-- PH-R07 backfill: falta de saldo em pedido ainda aberto
UPDATE public.itens_conferencia ic
SET
  divergencia = NULL,
  quantidade_divergencia = 0,
  dentro_tolerancia = TRUE,
  valor_divergencia = 0
FROM public.conferencias c
JOIN public.pedidos_recebimento p ON p.id = c.pedido_id
WHERE ic.conferencia_id = c.id
  AND ic.divergencia = 'falta'
  AND COALESCE(ic.tem_problema_qualidade, FALSE) = FALSE
  AND p.status IN ('parcial', 'pendente', 'aguardando_vinculo');

-- Views: fila, saldo fornecedor, cobertura, faltas
DROP VIEW IF EXISTS public.v_faltas_por_fornecedor;
DROP VIEW IF EXISTS public.v_fila_expedicao;
CREATE OR REPLACE VIEW public.v_fila_expedicao
WITH (security_invoker = true) AS
SELECT
  p.id AS pedido_id,
  p.codigo,
  p.status,
  p.data_pedido,
  f.nome AS fornecedor,
  c.id AS conferencia_id,
  c.finalizada_em
FROM public.pedidos_recebimento p
LEFT JOIN public.fornecedores f ON f.id = p.fornecedor_id
LEFT JOIN public.conferencias c ON c.pedido_id = p.id AND c.status = 'finalizada'
WHERE p.status IN (
    'conferido'::public.status_pedido,
    'parcial'::public.status_pedido,
    'recebido'::public.status_pedido
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.cargas cg WHERE cg.pedido_origem_id = p.id
  );

CREATE OR REPLACE VIEW public.v_saldo_caixas_fornecedor
WITH (security_invoker = true) AS
SELECT
  f.id AS fornecedor_id,
  f.nome AS fornecedor,
  s.tipo_caixa,
  s.enviadas,
  s.retornadas,
  s.perdidas,
  s.ajustes,
  s.saldo
FROM public.fornecedores f
LEFT JOIN public.v_saldos_caixa s ON s.posicao_tipo = 'fornecedor' AND s.ref_id = f.id
WHERE f.ativo = TRUE
  AND f.nome IS DISTINCT FROM 'Aguardando vínculo';

CREATE OR REPLACE VIEW public.v_cobertura_dia_produto
WITH (security_invoker = true) AS
SELECT
  pr.id AS produto_id,
  pr.nome AS produto,
  pr.codigo,
  COALESCE(r.recebido_hoje, 0) AS recebido_hoje,
  COALESCE(e.a_expedir_hoje, 0) AS a_expedir_hoje,
  COALESCE(r.recebido_hoje, 0) - COALESCE(e.a_expedir_hoje, 0) AS saldo_cobertura
FROM public.produtos pr
LEFT JOIN (
  SELECT ip.produto_id, SUM(ic.quantidade_recebida) AS recebido_hoje
  FROM public.itens_conferencia ic
  JOIN public.conferencias c ON c.id = ic.conferencia_id
  JOIN public.itens_pedido ip ON ip.id = ic.item_pedido_id
  WHERE c.status = 'finalizada'
    AND (c.finalizada_em AT TIME ZONE 'America/Sao_Paulo')::date = public.today_brt()
  GROUP BY ip.produto_id
) r ON r.produto_id = pr.id
LEFT JOIN (
  SELECT ri.produto_id, SUM(ri.quantidade_romaneio) AS a_expedir_hoje
  FROM public.romaneio_itens ri
  JOIN public.cargas ca ON ca.id = ri.carga_id
  WHERE ca.data_carga = public.today_brt()
  GROUP BY ri.produto_id
) e ON e.produto_id = pr.id
WHERE COALESCE(r.recebido_hoje, 0) <> 0 OR COALESCE(e.a_expedir_hoje, 0) <> 0;

CREATE OR REPLACE VIEW public.v_faltas_por_fornecedor
WITH (security_invoker = true) AS
SELECT
  f.id AS fornecedor_id,
  f.nome AS fornecedor,
  p.data_pedido,
  COUNT(*) FILTER (WHERE ic.divergencia = 'falta') AS faltas,
  COUNT(*) FILTER (WHERE ic.divergencia = 'sobra') AS sobras,
  COUNT(*) FILTER (WHERE ic.divergencia = 'qualidade') AS qualidade,
  COALESCE(SUM(ic.valor_divergencia) FILTER (WHERE ic.divergencia IN ('falta', 'qualidade')), 0) AS impacto
FROM public.itens_conferencia ic
JOIN public.conferencias c ON c.id = ic.conferencia_id
JOIN public.itens_pedido ip ON ip.id = ic.item_pedido_id
JOIN public.pedidos_recebimento p ON p.id = ip.pedido_id
JOIN public.fornecedores f ON f.id = p.fornecedor_id
WHERE ic.divergencia IS NOT NULL
  AND p.status IN ('recebido', 'encerrado')
GROUP BY f.id, f.nome, p.data_pedido;

GRANT SELECT ON public.v_fila_expedicao TO authenticated;
GRANT SELECT ON public.v_saldo_caixas_fornecedor TO authenticated;
GRANT SELECT ON public.v_cobertura_dia_produto TO authenticated;
GRANT SELECT ON public.v_faltas_por_fornecedor TO authenticated;

-- Cargas: cliente_id no item, fallback rateio
CREATE OR REPLACE FUNCTION public.gerar_cargas_pos_conferencia(p_pedido_id UUID, p_conferencia_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conf_id UUID := p_conferencia_id;
  v_pedido record;
  v_row record;
  v_cliente_id UUID;
  v_carga_id UUID;
  v_codigo TEXT;
  v_created jsonb := '[]'::jsonb;
  v_romaneio_id UUID;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_recebimento WHERE id = p_pedido_id;
  IF v_pedido.id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_pedido.status NOT IN (
    'conferido'::public.status_pedido,
    'parcial'::public.status_pedido,
    'recebido'::public.status_pedido
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_conf_id IS NULL THEN
    SELECT id INTO v_conf_id
    FROM public.conferencias
    WHERE pedido_id = p_pedido_id AND status = 'finalizada'
    ORDER BY finalizada_em DESC NULLS LAST, created_at DESC
    LIMIT 1;
  END IF;
  IF v_conf_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cargas
    WHERE pedido_origem_id = p_pedido_id
      AND observacoes = 'entrega:' || v_conf_id::text
  ) THEN
    SELECT jsonb_agg(jsonb_build_object('carga_id', id, 'codigo', codigo)) INTO v_created
    FROM public.cargas
    WHERE pedido_origem_id = p_pedido_id AND observacoes = 'entrega:' || v_conf_id::text;
    RETURN COALESCE(v_created, '[]'::jsonb);
  END IF;

  FOR v_row IN
    SELECT
      COALESCE(iped.cliente_id, public.resolve_cliente_destinatario(r.destinatario_id)) AS cliente_id,
      iped.produto_id,
      SUM(
        CASE
          WHEN iped.cliente_id IS NOT NULL THEN ic.quantidade_recebida
          WHEN iped.quantidade_pedida > 0 AND r.quantidade IS NOT NULL
            THEN (ic.quantidade_recebida * r.quantidade / iped.quantidade_pedida)
          ELSE ic.quantidade_recebida
        END
      ) AS qty
    FROM public.itens_conferencia ic
    JOIN public.itens_pedido iped ON iped.id = ic.item_pedido_id
    LEFT JOIN public.itens_pedido_rateio r
      ON r.item_pedido_id = iped.id AND iped.cliente_id IS NULL
    WHERE ic.conferencia_id = v_conf_id AND ic.conferido = TRUE
    GROUP BY 1, iped.produto_id
    HAVING SUM(
      CASE
        WHEN iped.cliente_id IS NOT NULL THEN ic.quantidade_recebida
        WHEN iped.quantidade_pedida > 0 AND r.quantidade IS NOT NULL
          THEN (ic.quantidade_recebida * r.quantidade / iped.quantidade_pedida)
        ELSE ic.quantidade_recebida
      END
    ) > 0
  LOOP
    v_cliente_id := v_row.cliente_id;
    IF v_cliente_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_carga_id
    FROM public.cargas
    WHERE cliente_id = v_cliente_id
      AND data_carga = public.today_brt()
      AND status = 'aguardando'
    LIMIT 1;

    IF v_carga_id IS NULL THEN
      v_codigo := v_pedido.codigo || '-' || substr(v_conf_id::text, 1, 8) || '-' || substr(v_cliente_id::text, 1, 4);
      INSERT INTO public.cargas (codigo, cliente_id, data_carga, status, origem, pedido_origem_id, progresso, observacoes)
      VALUES (v_codigo, v_cliente_id, public.today_brt(), 'aguardando', 'conferencia', p_pedido_id, 0, 'entrega:' || v_conf_id::text)
      RETURNING id INTO v_carga_id;

      INSERT INTO public.carga_caixas_resumo (carga_id) VALUES (v_carga_id)
      ON CONFLICT (carga_id) DO NOTHING;

      v_created := v_created || jsonb_build_array(jsonb_build_object('carga_id', v_carga_id, 'codigo', v_codigo, 'acao', 'criada'));
    ELSE
      v_created := v_created || jsonb_build_array(jsonb_build_object('carga_id', v_carga_id, 'codigo', (SELECT codigo FROM public.cargas WHERE id = v_carga_id), 'acao', 'atualizada'));
    END IF;

    SELECT id INTO v_romaneio_id FROM public.romaneio_itens
    WHERE carga_id = v_carga_id AND produto_id = v_row.produto_id LIMIT 1;

    IF v_romaneio_id IS NOT NULL THEN
      UPDATE public.romaneio_itens
      SET quantidade_romaneio = quantidade_romaneio + round(v_row.qty::numeric, 2)
      WHERE id = v_romaneio_id;
    ELSE
      INSERT INTO public.romaneio_itens (carga_id, produto_id, quantidade_romaneio, quantidade_real, status)
      VALUES (v_carga_id, v_row.produto_id, round(v_row.qty::numeric, 2), 0, 'pendente');
    END IF;
  END LOOP;

  RETURN COALESCE(v_created, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_cargas_pos_conferencia(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_cargas_pos_conferencia(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_conferencia_status(
  p_conferencia_id UUID,
  p_pedido_id UUID,
  p_status TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_above BOOLEAN;
  v_has_qualidade BOOLEAN;
  v_saldo_aberto BOOLEAN;
  v_pedido_status public.status_pedido;
  v_cargas jsonb := '[]'::jsonb;
  v_num INT;
BEGIN
  IF p_status NOT IN ('parcial', 'finalizada') THEN
    RAISE EXCEPTION 'Status de conferência inválido: %', p_status;
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_num
  FROM public.conferencias WHERE pedido_id = p_pedido_id AND id <> p_conferencia_id;

  UPDATE public.conferencias
  SET
    status = p_status::public.status_conferencia,
    numero = COALESCE(numero, v_num),
    finalizada_em = CASE WHEN p_status = 'finalizada' THEN COALESCE(finalizada_em, now()) ELSE finalizada_em END,
    updated_at = now()
  WHERE id = p_conferencia_id;

  IF p_status <> 'finalizada' THEN
    RETURN jsonb_build_object('pedido_status', 'em_andamento', 'cargas', '[]'::jsonb);
  END IF;

  -- R07: só trava sobra/qualidade ou falta real (não saldo pendente)
  SELECT EXISTS(
    SELECT 1 FROM public.itens_conferencia
    WHERE conferencia_id = p_conferencia_id
      AND divergencia IN ('sobra', 'falta')
      AND COALESCE(dentro_tolerancia, FALSE) = FALSE
  ) INTO v_has_above;

  SELECT EXISTS(
    SELECT 1 FROM public.itens_conferencia
    WHERE conferencia_id = p_conferencia_id
      AND (divergencia = 'qualidade' OR tem_problema_qualidade)
  ) INTO v_has_qualidade;

  SELECT EXISTS(
    SELECT 1 FROM public.v_saldo_item_pedido WHERE pedido_id = p_pedido_id AND saldo > 0
  ) INTO v_saldo_aberto;

  IF v_has_above OR v_has_qualidade THEN
    v_pedido_status := 'aguardando_liberacao'::public.status_pedido;
  ELSIF v_saldo_aberto THEN
    v_pedido_status := 'parcial'::public.status_pedido;
  ELSE
    v_pedido_status := 'recebido'::public.status_pedido;
  END IF;

  UPDATE public.pedidos_recebimento
  SET status = v_pedido_status, updated_at = now()
  WHERE id = p_pedido_id;

  IF v_pedido_status IN ('parcial'::public.status_pedido, 'recebido'::public.status_pedido) THEN
    v_cargas := public.gerar_cargas_pos_conferencia(p_pedido_id, p_conferencia_id);
  END IF;

  RETURN jsonb_build_object('pedido_status', v_pedido_status, 'cargas', v_cargas);
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_pedido_divergencia(
  p_pedido_id UUID,
  p_observacao TEXT DEFAULT NULL,
  p_conferencia_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  v_conf UUID := p_conferencia_id;
  v_saldo BOOLEAN;
  v_status public.status_pedido;
  v_cargas jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem liberar pedidos com divergência';
  END IF;

  IF v_conf IS NULL THEN
    SELECT id INTO v_conf FROM public.conferencias
    WHERE pedido_id = p_pedido_id AND status = 'finalizada'
    ORDER BY finalizada_em DESC NULLS LAST LIMIT 1;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.v_saldo_item_pedido WHERE pedido_id = p_pedido_id AND saldo > 0)
  INTO v_saldo;
  v_status := CASE WHEN v_saldo THEN 'parcial'::public.status_pedido ELSE 'recebido'::public.status_pedido END;

  UPDATE public.pedidos_recebimento
  SET
    status = v_status,
    liberado_por = auth.uid(),
    liberado_em = now(),
    observacao_liberacao = COALESCE(p_observacao, observacao_liberacao),
    updated_at = now()
  WHERE id = p_pedido_id
    AND status IN ('aguardando_liberacao'::public.status_pedido, 'divergencia'::public.status_pedido)
  RETURNING * INTO p;

  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está aguardando liberação';
  END IF;

  v_cargas := public.gerar_cargas_pos_conferencia(p_pedido_id, v_conf);
  RETURN jsonb_build_object('pedido', to_jsonb(p), 'cargas', v_cargas);
END;
$$;

REVOKE ALL ON FUNCTION public.liberar_pedido_divergencia(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.liberar_pedido_divergencia(UUID, TEXT, UUID) TO authenticated;

-- PH-B02 + R07: encerra e materializa falta definitiva
DROP FUNCTION IF EXISTS public.encerrar_pedido(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.encerrar_pedido(p_pedido_id UUID, p_motivo TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
  v_conf UUID;
  v_item record;
  v_ic UUID;
  v_pct NUMERIC;
  v_min NUMERIC;
  v_limite NUMERIC;
  v_dentro BOOLEAN;
  v_fallback NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem encerrar pedidos';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'Observação obrigatória para encerrar com falta';
  END IF;

  UPDATE public.pedidos_recebimento
  SET status = 'encerrado'::public.status_pedido,
      encerrado_em = now(),
      encerrado_por = auth.uid(),
      motivo_encerramento = p_motivo,
      updated_at = now()
  WHERE id = p_pedido_id
    AND status IN (
      'parcial'::public.status_pedido,
      'pendente'::public.status_pedido,
      'aguardando_liberacao'::public.status_pedido,
      'divergencia'::public.status_pedido,
      'recebido'::public.status_pedido
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não pode ser encerrado neste status';
  END IF;

  v_pct := public.config_num('tolerancia_pct', 5);
  v_min := public.config_num('tolerancia_min_un', public.config_num('tolerancia_min_cx', 1));
  v_fallback := public.config_num('impacto_falta_por_unidade', 4.5);

  INSERT INTO public.conferencias (pedido_id, status, numero, conferente_id, finalizada_em, observacoes)
  SELECT p_pedido_id, 'finalizada', COALESCE(MAX(numero), 0) + 1, auth.uid(), now(), 'encerramento:' || p_motivo
  FROM public.conferencias WHERE pedido_id = p_pedido_id
  RETURNING id INTO v_conf;

  IF v_conf IS NULL THEN
    INSERT INTO public.conferencias (pedido_id, status, numero, conferente_id, finalizada_em, observacoes)
    VALUES (p_pedido_id, 'finalizada', 1, auth.uid(), now(), 'encerramento:' || p_motivo)
    RETURNING id INTO v_conf;
  END IF;

  FOR v_item IN
    SELECT s.*, ip.preco_unitario
    FROM public.v_saldo_item_pedido s
    JOIN public.itens_pedido ip ON ip.id = s.item_pedido_id
    WHERE s.pedido_id = p_pedido_id AND s.saldo > 0
  LOOP
    v_limite := GREATEST((v_pct / 100.0) * v_item.quantidade_pedida, v_min);
    v_dentro := v_item.saldo <= v_limite;
    INSERT INTO public.itens_conferencia (
      conferencia_id, item_pedido_id, quantidade_recebida, conferido,
      divergencia, quantidade_divergencia, dentro_tolerancia, valor_divergencia,
      estimado, tolerancia_pct_aplicada
    ) VALUES (
      v_conf, v_item.item_pedido_id, 0, TRUE,
      'falta', v_item.saldo, v_dentro,
      v_item.saldo * COALESCE(v_item.preco_unitario, v_fallback),
      v_item.preco_unitario IS NULL, v_pct
    )
    RETURNING id INTO v_ic;
    v_ic := v_ic;
  END LOOP;

  RETURN jsonb_build_object('pedido_id', p_pedido_id, 'status', 'encerrado', 'conferencia_id', v_conf);
END;
$$;

REVOKE ALL ON FUNCTION public.encerrar_pedido(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encerrar_pedido(UUID, TEXT) TO authenticated;
