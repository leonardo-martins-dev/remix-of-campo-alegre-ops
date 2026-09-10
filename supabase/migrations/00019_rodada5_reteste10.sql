-- PH-B20 / B19 / B21 / B22 / B23 / C08 / T03 / T05 (reteste 10/09)
-- Não aplicar 00015.

-- ------------------------------------------------------------
-- PH-B20: encerrar não duplica falta já lançada na conferência
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._encerrar_pedido_interno(p_pedido_id UUID, p_motivo TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
  v_conf UUID;
  v_item record;
  v_pct NUMERIC;
  v_min NUMERIC;
  v_limite NUMERIC;
  v_dentro BOOLEAN;
  v_fallback NUMERIC;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'Observação obrigatória para encerrar com falta';
  END IF;

  UPDATE public.pedidos_recebimento
  SET status = 'encerrado'::public.status_pedido,
      encerrado_em = now(),
      encerrado_por = COALESCE(auth.uid(), encerrado_por),
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
    RETURN jsonb_build_object('pedido_id', p_pedido_id, 'status', 'noop');
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
    WHERE s.pedido_id = p_pedido_id
      AND s.saldo > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.itens_conferencia ic
        JOIN public.conferencias c ON c.id = ic.conferencia_id
        WHERE ic.item_pedido_id = s.item_pedido_id
          AND ic.divergencia = 'falta'
          AND COALESCE(c.observacoes, '') NOT LIKE 'encerramento:%'
      )
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
    );
  END LOOP;

  RETURN jsonb_build_object('pedido_id', p_pedido_id, 'status', 'encerrado', 'conferencia_id', v_conf);
END;
$$;

REVOKE ALL ON FUNCTION public._encerrar_pedido_interno(UUID, TEXT) FROM PUBLIC;

DROP VIEW IF EXISTS public.v_faltas_por_fornecedor;
CREATE VIEW public.v_faltas_por_fornecedor
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    f.id AS fornecedor_id,
    f.nome AS fornecedor,
    p.data_pedido,
    ip.id AS item_pedido_id,
    ic.divergencia,
    ic.valor_divergencia,
    CASE
      WHEN p.status = 'encerrado' AND COALESCE(c.observacoes, '') LIKE 'encerramento:%' THEN 0
      WHEN COALESCE(c.observacoes, '') LIKE 'encerramento:%' THEN 2
      ELSE 1
    END AS pref,
    c.numero,
    c.finalizada_em
  FROM public.itens_conferencia ic
  JOIN public.conferencias c ON c.id = ic.conferencia_id
  JOIN public.itens_pedido ip ON ip.id = ic.item_pedido_id
  JOIN public.pedidos_recebimento p ON p.id = ip.pedido_id
  JOIN public.fornecedores f ON f.id = p.fornecedor_id
  WHERE ic.divergencia IS NOT NULL
    AND p.status IN ('recebido', 'encerrado')
),
picked AS (
  SELECT DISTINCT ON (item_pedido_id)
    fornecedor_id, fornecedor, data_pedido, item_pedido_id, divergencia, valor_divergencia
  FROM ranked
  ORDER BY item_pedido_id, pref, numero DESC NULLS LAST, finalizada_em DESC NULLS LAST
)
SELECT
  fornecedor_id,
  fornecedor,
  data_pedido,
  COUNT(*) FILTER (WHERE divergencia = 'falta') AS faltas,
  COUNT(*) FILTER (WHERE divergencia = 'sobra') AS sobras,
  COUNT(*) FILTER (WHERE divergencia = 'qualidade') AS qualidade,
  COALESCE(SUM(valor_divergencia) FILTER (WHERE divergencia IN ('falta', 'qualidade')), 0) AS impacto
FROM picked
GROUP BY fornecedor_id, fornecedor, data_pedido;

GRANT SELECT ON public.v_faltas_por_fornecedor TO authenticated;

-- ------------------------------------------------------------
-- PH-B23: ledger canônico (natureza + posições)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_movimentacao_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_gal UUID;
  v_pos UUID;
  v_ref UUID;
BEGIN
  NEW.natureza := COALESCE(NEW.natureza, NEW.tipo);
  NEW.tipo := COALESCE(NEW.natureza, NEW.tipo);

  IF NEW.origem_posicao_id IS NULL AND NEW.destino_posicao_id IS NULL THEN
    v_gal := public.ensure_posicao('galpao', NULL);
    IF NEW.cliente_id IS NOT NULL THEN
      v_pos := public.ensure_posicao('cliente', NEW.cliente_id);
      IF NEW.natureza IN ('envio', 'entrega_vazias') THEN
        NEW.origem_posicao_id := v_gal;
        NEW.destino_posicao_id := v_pos;
      ELSIF NEW.natureza IN ('retorno', 'recebimento_cheias') THEN
        NEW.origem_posicao_id := v_pos;
        NEW.destino_posicao_id := v_gal;
      ELSIF NEW.natureza = 'perda' THEN
        NEW.origem_posicao_id := v_pos;
      ELSE
        NEW.destino_posicao_id := v_pos;
      END IF;
    ELSIF NEW.fornecedor_id IS NOT NULL THEN
      v_pos := public.ensure_posicao('fornecedor', NEW.fornecedor_id);
      IF NEW.natureza IN ('envio', 'entrega_vazias') THEN
        NEW.origem_posicao_id := v_gal;
        NEW.destino_posicao_id := v_pos;
      ELSIF NEW.natureza IN ('retorno', 'recebimento_cheias') THEN
        NEW.origem_posicao_id := v_pos;
        NEW.destino_posicao_id := v_gal;
      ELSIF NEW.natureza = 'perda' THEN
        NEW.origem_posicao_id := v_pos;
      ELSE
        NEW.destino_posicao_id := v_pos;
      END IF;
    END IF;
  END IF;

  IF NEW.cliente_id IS NULL THEN
    SELECT p.ref_id INTO v_ref
    FROM public.posicoes_caixa p
    WHERE p.id IN (NEW.origem_posicao_id, NEW.destino_posicao_id)
      AND p.tipo = 'cliente'
    LIMIT 1;
    NEW.cliente_id := v_ref;
  END IF;

  IF NEW.fornecedor_id IS NULL THEN
    SELECT p.ref_id INTO v_ref
    FROM public.posicoes_caixa p
    WHERE p.id IN (NEW.origem_posicao_id, NEW.destino_posicao_id)
      AND p.tipo = 'fornecedor'
    LIMIT 1;
    NEW.fornecedor_id := v_ref;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_movimentacao_caixa ON public.movimentacoes_caixa;
CREATE TRIGGER trg_sync_movimentacao_caixa
  BEFORE INSERT OR UPDATE ON public.movimentacoes_caixa
  FOR EACH ROW EXECUTE FUNCTION public.sync_movimentacao_caixa();

UPDATE public.movimentacoes_caixa
SET natureza = COALESCE(natureza, tipo)
WHERE natureza IS NULL;

UPDATE public.movimentacoes_caixa m
SET origem_posicao_id = COALESCE(m.origem_posicao_id, CASE
      WHEN COALESCE(m.natureza, m.tipo) IN ('envio', 'entrega_vazias') THEN public.ensure_posicao('galpao', NULL)
      WHEN m.cliente_id IS NOT NULL THEN public.ensure_posicao('cliente', m.cliente_id)
      WHEN m.fornecedor_id IS NOT NULL THEN public.ensure_posicao('fornecedor', m.fornecedor_id)
      ELSE m.origem_posicao_id
    END),
    destino_posicao_id = COALESCE(m.destino_posicao_id, CASE
      WHEN COALESCE(m.natureza, m.tipo) IN ('retorno', 'recebimento_cheias') THEN public.ensure_posicao('galpao', NULL)
      WHEN COALESCE(m.natureza, m.tipo) IN ('envio', 'entrega_vazias') AND m.cliente_id IS NOT NULL THEN public.ensure_posicao('cliente', m.cliente_id)
      WHEN COALESCE(m.natureza, m.tipo) IN ('envio', 'entrega_vazias') AND m.fornecedor_id IS NOT NULL THEN public.ensure_posicao('fornecedor', m.fornecedor_id)
      WHEN COALESCE(m.natureza, m.tipo) IN ('ajuste', 'abertura') AND m.cliente_id IS NOT NULL THEN public.ensure_posicao('cliente', m.cliente_id)
      WHEN COALESCE(m.natureza, m.tipo) IN ('ajuste', 'abertura') AND m.fornecedor_id IS NOT NULL THEN public.ensure_posicao('fornecedor', m.fornecedor_id)
      ELSE m.destino_posicao_id
    END)
WHERE m.origem_posicao_id IS NULL AND m.destino_posicao_id IS NULL
  AND (m.cliente_id IS NOT NULL OR m.fornecedor_id IS NOT NULL);

-- ------------------------------------------------------------
-- PH-B19: saldo só com movimento posicionado + conciliar fecha em qtd_contada
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_saldos_caixa
WITH (security_invoker = true) AS
SELECT
  p.id AS posicao_id,
  p.tipo AS posicao_tipo,
  p.ref_id,
  m.tipo_caixa,
  COALESCE(SUM(CASE WHEN m.destino_posicao_id = p.id THEN m.quantidade ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN m.origem_posicao_id = p.id THEN m.quantidade ELSE 0 END), 0) AS saldo,
  COALESCE(SUM(CASE
    WHEN m.destino_posicao_id = p.id AND COALESCE(m.natureza, m.tipo) IN ('envio', 'entrega_vazias')
    THEN m.quantidade ELSE 0 END), 0) AS enviadas,
  COALESCE(SUM(CASE
    WHEN m.origem_posicao_id = p.id AND COALESCE(m.natureza, m.tipo) IN ('retorno', 'recebimento_cheias')
    THEN m.quantidade ELSE 0 END), 0) AS retornadas,
  COALESCE(SUM(CASE WHEN COALESCE(m.natureza, m.tipo) = 'perda' AND m.origem_posicao_id = p.id THEN m.quantidade ELSE 0 END), 0) AS perdidas,
  COALESCE(SUM(CASE WHEN COALESCE(m.natureza, m.tipo) IN ('ajuste', 'abertura') AND m.destino_posicao_id = p.id THEN m.quantidade
                    WHEN COALESCE(m.natureza, m.tipo) IN ('ajuste', 'abertura') AND m.origem_posicao_id = p.id THEN -m.quantidade
                    ELSE 0 END), 0) AS ajustes
FROM public.posicoes_caixa p
LEFT JOIN public.movimentacoes_caixa m
  ON (m.origem_posicao_id = p.id OR m.destino_posicao_id = p.id)
  AND (m.origem_posicao_id IS NOT NULL OR m.destino_posicao_id IS NOT NULL)
GROUP BY p.id, p.tipo, p.ref_id, m.tipo_caixa;

GRANT SELECT ON public.v_saldos_caixa TO authenticated;

CREATE OR REPLACE FUNCTION public.conciliar_inventario(
  p_contagem_id UUID,
  p_motivo_id UUID,
  p_observacao TEXT DEFAULT NULL,
  p_posicao_contraria_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cont record;
  v_motivo record;
  v_item record;
  v_mov UUID;
  v_nat TEXT;
  v_calc INT;
  v_diff INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem conciliar inventário';
  END IF;

  SELECT * INTO v_cont FROM public.contagens_caixa WHERE id = p_contagem_id;
  IF v_cont.id IS NULL THEN
    RAISE EXCEPTION 'Contagem não encontrada';
  END IF;
  IF v_cont.status <> 'pendente' THEN
    RAISE EXCEPTION 'Conciliação já existente não reabre';
  END IF;

  SELECT * INTO v_motivo FROM public.motivos_ajuste_caixa WHERE id = p_motivo_id AND ativo;
  IF v_motivo.id IS NULL THEN
    RAISE EXCEPTION 'Motivo de ajuste inválido';
  END IF;
  IF v_motivo.exige_posicao_contraria AND p_posicao_contraria_id IS NULL THEN
    RAISE EXCEPTION 'Este motivo exige posição contrária';
  END IF;

  FOR v_item IN
    SELECT * FROM public.contagem_caixa_itens WHERE contagem_id = p_contagem_id
  LOOP
    SELECT COALESCE(s.saldo, 0)::INT INTO v_calc
    FROM public.v_saldos_caixa s
    WHERE s.posicao_id = v_cont.posicao_id AND s.tipo_caixa = v_item.tipo_caixa;
    v_calc := COALESCE(v_calc, 0);
    v_diff := v_item.qtd_contada - v_calc;

    UPDATE public.contagem_caixa_itens
    SET qtd_calculada = v_calc, diferenca = v_diff
    WHERE id = v_item.id;

    IF v_diff = 0 THEN
      CONTINUE;
    END IF;

    v_nat := v_motivo.natureza;
    IF v_motivo.exige_posicao_contraria THEN
      INSERT INTO public.movimentacoes_caixa (
        tipo, natureza, tipo_caixa, quantidade,
        origem_posicao_id, destino_posicao_id,
        registrado_por, observacoes, data_movimento,
        documento_tipo, documento_id, confirmacao_status
      ) VALUES (
        v_nat::public.tipo_movimentacao, v_nat::public.tipo_movimentacao, v_item.tipo_caixa, ABS(v_diff),
        CASE WHEN v_diff > 0 THEN p_posicao_contraria_id ELSE v_cont.posicao_id END,
        CASE WHEN v_diff > 0 THEN v_cont.posicao_id ELSE p_posicao_contraria_id END,
        auth.uid(), COALESCE(p_observacao, v_motivo.nome), public.today_brt(),
        'inventario', p_contagem_id, 'nao_aplicavel'
      )
      RETURNING id INTO v_mov;
    ELSIF v_diff > 0 THEN
      INSERT INTO public.movimentacoes_caixa (
        tipo, natureza, tipo_caixa, quantidade,
        destino_posicao_id, registrado_por, observacoes, data_movimento,
        documento_tipo, documento_id, confirmacao_status
      ) VALUES (
        'ajuste', 'ajuste', v_item.tipo_caixa, v_diff,
        v_cont.posicao_id, auth.uid(), COALESCE(p_observacao, v_motivo.nome), public.today_brt(),
        'inventario', p_contagem_id, 'nao_aplicavel'
      )
      RETURNING id INTO v_mov;
    ELSE
      INSERT INTO public.movimentacoes_caixa (
        tipo, natureza, tipo_caixa, quantidade,
        origem_posicao_id, registrado_por, observacoes, data_movimento,
        documento_tipo, documento_id, confirmacao_status
      ) VALUES (
        COALESCE(v_nat, 'ajuste')::public.tipo_movimentacao,
        COALESCE(v_nat, 'ajuste')::public.tipo_movimentacao,
        v_item.tipo_caixa, ABS(v_diff),
        v_cont.posicao_id, auth.uid(), COALESCE(p_observacao, v_motivo.nome), public.today_brt(),
        'inventario', p_contagem_id, 'nao_aplicavel'
      )
      RETURNING id INTO v_mov;
    END IF;

    UPDATE public.contagem_caixa_itens
    SET ajuste_movimento_id = v_mov
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.contagens_caixa
  SET status = 'conciliada',
      motivo_id = p_motivo_id,
      observacao = COALESCE(p_observacao, observacao),
      conciliado_por = auth.uid(),
      conciliado_em = now()
  WHERE id = p_contagem_id;

  RETURN jsonb_build_object('contagem_id', p_contagem_id, 'status', 'conciliada');
END;
$$;

REVOKE ALL ON FUNCTION public.conciliar_inventario(UUID, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conciliar_inventario(UUID, UUID, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.manter_inventario(p_contagem_id UUID, p_observacao TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem resolver inventário';
  END IF;
  UPDATE public.contagens_caixa
  SET status = 'mantida',
      observacao = COALESCE(p_observacao, observacao),
      conciliado_por = auth.uid(),
      conciliado_em = now()
  WHERE id = p_contagem_id
    AND status = 'pendente';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Conciliação já existente não reabre';
  END IF;
  RETURN jsonb_build_object('contagem_id', p_contagem_id, 'status', 'mantida');
END;
$$;

REVOKE ALL ON FUNCTION public.manter_inventario(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manter_inventario(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- PH-B21: fill rate por pedido (filtro de período no app)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_fill_rate_fornecedor;
CREATE VIEW public.v_fill_rate_pedido
WITH (security_invoker = true) AS
SELECT
  f.id AS fornecedor_id,
  f.nome AS fornecedor,
  pr.id AS pedido_id,
  pr.data_pedido,
  pr.status,
  COUNT(ip.id) AS total_itens,
  SUM(CASE WHEN COALESCE(s.recebido_acumulado, 0) >= ip.quantidade_pedida THEN 1 ELSE 0 END) AS itens_completos,
  CASE
    WHEN COUNT(ip.id) = 0 THEN 0
    ELSE ROUND(
      SUM(CASE WHEN COALESCE(s.recebido_acumulado, 0) >= ip.quantidade_pedida THEN 1 ELSE 0 END)::NUMERIC
      / COUNT(ip.id) * 100, 1)
  END AS fill_rate,
  COALESCE(SUM(ip.quantidade_pedida * COALESCE(ip.preco_unitario, 4.5)), 0) AS valor_pedido,
  COALESCE(SUM(LEAST(COALESCE(s.recebido_acumulado, 0), ip.quantidade_pedida) * COALESCE(ip.preco_unitario, 4.5)), 0) AS valor_recebido,
  CASE
    WHEN COALESCE(SUM(ip.quantidade_pedida * COALESCE(ip.preco_unitario, 4.5)), 0) = 0 THEN 0
    ELSE ROUND(
      SUM(LEAST(COALESCE(s.recebido_acumulado, 0), ip.quantidade_pedida) * COALESCE(ip.preco_unitario, 4.5))
      / SUM(ip.quantidade_pedida * COALESCE(ip.preco_unitario, 4.5)) * 100, 1)
  END AS fill_rate_valor
FROM public.fornecedores f
JOIN public.pedidos_recebimento pr ON pr.fornecedor_id = f.id
JOIN public.itens_pedido ip ON ip.pedido_id = pr.id
LEFT JOIN public.v_saldo_item_pedido s ON s.item_pedido_id = ip.id
WHERE f.ativo = TRUE
  AND pr.status NOT IN ('aguardando_vinculo', 'parcial', 'pendente')
GROUP BY f.id, f.nome, pr.id, pr.data_pedido, pr.status;

CREATE VIEW public.v_fill_rate_fornecedor
WITH (security_invoker = true) AS
SELECT
  fornecedor_id,
  fornecedor,
  SUM(total_itens) AS total_itens,
  SUM(itens_completos) AS itens_completos,
  CASE WHEN SUM(total_itens) = 0 THEN 0
       ELSE ROUND(SUM(itens_completos)::NUMERIC / SUM(total_itens) * 100, 1) END AS fill_rate,
  SUM(valor_pedido) AS valor_pedido,
  SUM(valor_recebido) AS valor_recebido,
  CASE WHEN SUM(valor_pedido) = 0 THEN 0
       ELSE ROUND(SUM(valor_recebido) / SUM(valor_pedido) * 100, 1) END AS fill_rate_valor
FROM public.v_fill_rate_pedido
GROUP BY fornecedor_id, fornecedor;

GRANT SELECT ON public.v_fill_rate_pedido TO authenticated;
GRANT SELECT ON public.v_fill_rate_fornecedor TO authenticated;

-- ------------------------------------------------------------
-- PH-T05: motivos extras
-- ------------------------------------------------------------
INSERT INTO public.motivos_ajuste_caixa (nome, sentido, natureza, entra_em_custo, exige_posicao_contraria)
SELECT v.nome, v.sentido, v.natureza, v.entra_em_custo, v.exige
FROM (VALUES
  ('Avaria', 'saida', 'perda', TRUE, FALSE),
  ('Furto', 'saida', 'perda', TRUE, FALSE),
  ('Doação', 'saida', 'ajuste', FALSE, FALSE),
  ('Correção de abertura', 'entrada', 'ajuste', FALSE, FALSE)
) AS v(nome, sentido, natureza, entra_em_custo, exige)
WHERE NOT EXISTS (
  SELECT 1 FROM public.motivos_ajuste_caixa m WHERE m.nome = v.nome
);

-- ------------------------------------------------------------
-- PH-T03: navegação
-- ------------------------------------------------------------
UPDATE public.pages SET ativo = FALSE WHERE slug = 'caixas/galpao';

INSERT INTO public.pages (slug, nome, grupo, icone, ordem) VALUES
  ('dashboard',            'Dashboard',                 'Navegação',   'LayoutDashboard', 1),
  ('recebimento',          'Recebimento',               'Recebimento', 'PackageCheck',    10),
  ('recebimento/conferir', 'Conferir chegada',          'Recebimento', 'PackageCheck',    11),
  ('recebimento/faltas',   'Relatório de faltas',       'Recebimento', 'AlertTriangle',   12),
  ('recebimento/liberacoes','Liberações',               'Recebimento', 'Shield',          13),
  ('expedicao',            'Expedição',                 'Expedição',   'Truck',           20),
  ('expedicao/tv',         'Modo TV',                   'Expedição',   'Tv',              21),
  ('caixas/saldo',         'Saldo de caixas',           'Caixas',      'Box',             30),
  ('caixas/inventario',    'Inventário de caixas',      'Caixas',      'Warehouse',       31),
  ('caixas/retorno',       'Retorno de caixas',         'Caixas',      'RotateCcw',       32),
  ('caixas/fornecedor',    'Caixas no fornecedor',      'Caixas',      'Handshake',       33),
  ('caixas/economia',      'Custo e perda',             'Caixas',      'PiggyBank',       34),
  ('quebra/lancar',        'Lançar quebra',             'Quebra',      'AlertTriangle',   40),
  ('quebra',               'Quebras',                   'Quebra',      'AlertTriangle',   41),
  ('fornecedores',         'Fornecedores',              'Fornecedores','Activity',        50),
  ('gestao',               'Gestão',                    'Gestão',      'Settings',        60),
  ('gestao/usuarios',      'Usuários',                  'Gestão',      'UserPlus',        61)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

NOTIFY pgrst, 'reload schema';
