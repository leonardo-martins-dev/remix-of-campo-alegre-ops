-- ============================================================
-- NOP-323: Estoque mínimo por fornecedor × tipo conforme o giro
-- Alertas só de ativos com movimento, sem teste/duplicados
-- ============================================================

INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  (
    'estoque_minimo_giro_dias',
    '14',
    'Janela (dias) para calcular giro e exigir movimento nos alertas de estoque mínimo'
  )
ON CONFLICT (chave) DO NOTHING;

-- ------------------------------------------------------------
-- Giro recente por fornecedor × tipo de caixa
-- sugestao_minimo = média semanal (CEIL) no período
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_giro_fornecedor_caixa
WITH (security_invoker = true) AS
WITH cfg AS (
  SELECT public.config_num('estoque_minimo_giro_dias', 14)::INT AS dias
),
limite AS (
  SELECT
    dias,
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date - dias) AS data_inicio
  FROM cfg
),
movs AS (
  SELECT
    COALESCE(
      m.fornecedor_id,
      CASE WHEN po.tipo = 'fornecedor' THEN po.ref_id END,
      CASE WHEN pd.tipo = 'fornecedor' THEN pd.ref_id END
    ) AS fornecedor_id,
    m.tipo_caixa::text AS tipo_caixa,
    m.quantidade
  FROM public.movimentacoes_caixa m
  CROSS JOIN limite l
  LEFT JOIN public.posicoes_caixa po ON po.id = m.origem_posicao_id
  LEFT JOIN public.posicoes_caixa pd ON pd.id = m.destino_posicao_id
  WHERE m.data_movimento >= l.data_inicio
    AND (
      m.fornecedor_id IS NOT NULL
      OR po.tipo = 'fornecedor'
      OR pd.tipo = 'fornecedor'
    )
)
SELECT
  movs.fornecedor_id,
  movs.tipo_caixa,
  SUM(movs.quantidade)::INT AS total_movimentado,
  l.dias AS periodo_dias,
  ROUND(SUM(movs.quantidade)::numeric / GREATEST(l.dias, 1), 2) AS media_diaria,
  CEIL(SUM(movs.quantidade)::numeric / GREATEST(l.dias / 7.0, 1))::INT AS sugestao_minimo
FROM movs
CROSS JOIN limite l
WHERE movs.fornecedor_id IS NOT NULL
  AND movs.tipo_caixa IS NOT NULL
  AND btrim(movs.tipo_caixa) <> ''
GROUP BY movs.fornecedor_id, movs.tipo_caixa, l.dias;

GRANT SELECT ON public.v_giro_fornecedor_caixa TO authenticated;

-- ------------------------------------------------------------
-- Alertas: só ativos, não mesclados, sem "teste", com movimento
-- Cada linha traz a ação: enviar N do tipo X
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_fornecedores_abaixo_minimo
WITH (security_invoker = true) AS
WITH com_movimento AS (
  SELECT DISTINCT g.fornecedor_id
  FROM public.v_giro_fornecedor_caixa g
  WHERE g.total_movimentado > 0
)
SELECT
  f.id AS fornecedor_id,
  f.nome AS fornecedor_nome,
  m.tipo_caixa,
  m.qtd_minima,
  COALESCE(s.saldo, 0) AS saldo_atual,
  m.qtd_minima - COALESCE(s.saldo, 0) AS faltando,
  m.qtd_minima - COALESCE(s.saldo, 0) AS enviar_qtd,
  tc.custo_unitario,
  (m.qtd_minima - COALESCE(s.saldo, 0)) * tc.custo_unitario AS valor_faltando,
  format(
    'Enviar %s caixa(s) tipo %s',
    m.qtd_minima - COALESCE(s.saldo, 0),
    m.tipo_caixa
  ) AS acao
FROM public.minimo_estoque_fornecedor_caixa m
JOIN public.fornecedores f ON f.id = m.fornecedor_id
JOIN public.tipos_caixa tc ON tc.sigla = m.tipo_caixa
JOIN com_movimento cm ON cm.fornecedor_id = f.id
LEFT JOIN public.posicoes_caixa p ON p.tipo = 'fornecedor' AND p.ref_id = f.id
LEFT JOIN public.v_saldos_caixa s ON s.posicao_id = p.id AND s.tipo_caixa = m.tipo_caixa
WHERE m.ativo = TRUE
  AND f.ativo = TRUE
  AND f.mesclado_em_id IS NULL
  AND f.nome IS DISTINCT FROM 'Aguardando vínculo'
  AND f.nome !~* 'teste'
  AND COALESCE(s.saldo, 0) < m.qtd_minima
ORDER BY (m.qtd_minima - COALESCE(s.saldo, 0)) DESC;

GRANT SELECT ON public.v_fornecedores_abaixo_minimo TO authenticated;
