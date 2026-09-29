-- ============================================================
-- NOP-479: v_fornecedores_abaixo_minimo 42501 após NOP-159
--
-- Causa: a view (security_invoker=true) lia tipos_caixa.custo_unitario,
-- coluna REVOKE'd de authenticated em 00062. O chamador tem SELECT na
-- tabela (colunas ops) e GET /tipos_caixa funciona, mas a view falha
-- ao projetar custo_unitario → permission denied for table tipos_caixa.
--
-- Correção (caminho invoker, preferido):
--   - Recria a view com security_invoker = true
--   - JOIN em tipos_caixa só por sigla (coluna concedida)
--   - NÃO projeta custo_unitario / valor_faltando a partir da tabela
--     (NULL; UI admin enriquece via admin_tipos_caixa_* / useTiposCaixa)
--   - GRANT SELECT nominal só a authenticated — sem PUBLIC/anon
-- ============================================================

DROP VIEW IF EXISTS public.v_fornecedores_abaixo_minimo;

CREATE VIEW public.v_fornecedores_abaixo_minimo
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
  -- NOP-159: authenticated não tem SELECT em tipos_caixa.custo_unitario.
  -- Mantém as colunas p/ contrato da API; valores vêm na UI (admin).
  NULL::numeric AS custo_unitario,
  NULL::numeric AS valor_faltando,
  format(
    'Enviar %s caixa(s) tipo %s',
    m.qtd_minima - COALESCE(s.saldo, 0),
    m.tipo_caixa
  ) AS acao
FROM public.minimo_estoque_fornecedor_caixa m
JOIN public.fornecedores f ON f.id = m.fornecedor_id
-- JOIN só valida sigla (coluna operacional concedida a authenticated)
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

COMMENT ON VIEW public.v_fornecedores_abaixo_minimo IS
  'NOP-323/NOP-479: alertas abaixo do mínimo (invoker). custo/valor NULL — NOP-159.';

REVOKE ALL ON TABLE public.v_fornecedores_abaixo_minimo FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.v_fornecedores_abaixo_minimo TO authenticated;

NOTIFY pgrst, 'reload schema';
