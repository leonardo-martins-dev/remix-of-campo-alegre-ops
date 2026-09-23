-- ============================================================
-- NOP-319: Inventário de caixas — posição sem contagem na
-- semana (ou nunca contada) aparece como pendente.
--
-- Reverte o filtro de 00040 (INNER JOIN / só atraso real) e
-- alinha o critério ao inventário semanal: vencimento na
-- sexta-feira (BRT). Pendência é apenas visual — não bloqueia
-- movimentos (config inventario_bloquear_operacao permanece false).
-- Contagem de motorista/fornecedor continua sem ajustar saldo
-- até aprovação do admin (regra 09/09).
-- ============================================================

CREATE OR REPLACE VIEW public.v_posicoes_contagem_pendente
WITH (security_invoker = true) AS
WITH hoje AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS dia
),
semana AS (
  SELECT
    dia,
    -- segunda-feira da semana corrente (ISODOW: segunda = 1)
    dia - (EXTRACT(ISODOW FROM dia)::int - 1) AS inicio_semana,
    -- sexta-feira = prazo da contagem
    dia - (EXTRACT(ISODOW FROM dia)::int - 1) + 4 AS vencimento
  FROM hoje
),
ultima AS (
  SELECT DISTINCT ON (c.posicao_id)
    c.posicao_id,
    c.data AS ultima_contagem_data,
    c.contado_por,
    EXTRACT(DAY FROM (now() - COALESCE(c.conciliado_em, c.created_at)))::INT AS dias_desde_contagem
  FROM public.contagens_caixa c
  ORDER BY c.posicao_id, c.created_at DESC
)
SELECT
  p.id AS posicao_id,
  p.tipo AS posicao_tipo,
  p.ref_id,
  CASE
    WHEN p.tipo = 'galpao' THEN 'Galpão'
    WHEN p.tipo = 'cliente' THEN cl.nome
    WHEN p.tipo = 'fornecedor' THEN f.nome
    ELSE p.tipo::text
  END AS posicao_nome,
  u.ultima_contagem_data,
  COALESCE(u.dias_desde_contagem, 999) AS dias_desde_contagem,
  7 AS frequencia_dias,
  s.inicio_semana,
  s.vencimento,
  pr.nome AS responsavel,
  (u.posicao_id IS NULL) AS nunca_contado
FROM public.posicoes_caixa p
CROSS JOIN semana s
LEFT JOIN ultima u ON u.posicao_id = p.id
LEFT JOIN public.profiles pr ON pr.id = u.contado_por
LEFT JOIN public.clientes cl ON p.tipo = 'cliente' AND cl.id = p.ref_id
LEFT JOIN public.fornecedores f ON p.tipo = 'fornecedor' AND f.id = p.ref_id
WHERE (
    (p.tipo = 'galpao')
    OR (p.tipo = 'cliente' AND cl.ativo = TRUE)
    OR (p.tipo = 'fornecedor' AND f.ativo = TRUE)
  )
  -- Pendente: nunca contada OU sem contagem na semana corrente (BRT)
  AND (
    u.ultima_contagem_data IS NULL
    OR u.ultima_contagem_data < s.inicio_semana
  )
ORDER BY
  COALESCE(u.dias_desde_contagem, 999) DESC,
  CASE p.tipo WHEN 'galpao' THEN 1 WHEN 'fornecedor' THEN 2 WHEN 'cliente' THEN 3 END;

GRANT SELECT ON public.v_posicoes_contagem_pendente TO authenticated;

COMMENT ON VIEW public.v_posicoes_contagem_pendente IS
  'NOP-319: posições ativas sem contagem na semana corrente (BRT) ou nunca contadas. Prazo = sexta; só alerta, não bloqueia.';

-- Painel: mesma regra semanal para o flag contagem_pendente
CREATE OR REPLACE VIEW public.v_painel_inventario
WITH (security_invoker = true) AS
WITH hoje AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS dia
),
semana AS (
  SELECT
    dia,
    dia - (EXTRACT(ISODOW FROM dia)::int - 1) AS inicio_semana,
    dia - (EXTRACT(ISODOW FROM dia)::int - 1) + 4 AS vencimento
  FROM hoje
),
saldos AS (
  SELECT
    s.posicao_id,
    s.posicao_tipo,
    s.ref_id,
    s.tipo_caixa,
    COALESCE(s.saldo, 0) AS saldo
  FROM public.v_saldos_caixa s
  WHERE s.tipo_caixa IS NOT NULL
),
ultima AS (
  SELECT * FROM public.v_ultima_contagem_posicao
),
minimos AS (
  SELECT
    fornecedor_id,
    tipo_caixa,
    qtd_minima
  FROM public.minimo_estoque_fornecedor_caixa
  WHERE ativo = TRUE
),
divergencias AS (
  SELECT
    c.posicao_id,
    ci.tipo_caixa,
    ci.diferenca,
    c.status
  FROM public.contagens_caixa c
  JOIN public.contagem_caixa_itens ci ON ci.contagem_id = c.id
  WHERE c.status = 'pendente'
)
SELECT
  p.id AS posicao_id,
  p.tipo AS posicao_tipo,
  p.ref_id,
  CASE
    WHEN p.tipo = 'galpao' THEN 'Galpão'
    WHEN p.tipo = 'cliente' THEN cl.nome
    WHEN p.tipo = 'fornecedor' THEN f.nome
    ELSE p.tipo::text
  END AS posicao_nome,
  COALESCE(tc.sigla, s.tipo_caixa) AS tipo_caixa,
  COALESCE(s.saldo, 0) AS saldo,
  u.ultima_contagem_data,
  u.ultima_contagem_status,
  u.dias_desde_contagem,
  CASE
    WHEN u.ultima_contagem_data IS NULL THEN TRUE
    WHEN u.ultima_contagem_data < sem.inicio_semana THEN TRUE
    ELSE FALSE
  END AS contagem_pendente,
  COALESCE(d.diferenca, 0) AS divergencia_aberta,
  CASE
    WHEN p.tipo = 'fornecedor' AND m.qtd_minima IS NOT NULL AND COALESCE(s.saldo, 0) < m.qtd_minima
    THEN TRUE ELSE FALSE
  END AS abaixo_minimo,
  COALESCE(m.qtd_minima, 0) AS qtd_minima,
  CASE
    WHEN p.tipo = 'fornecedor' AND m.qtd_minima IS NOT NULL AND COALESCE(s.saldo, 0) < m.qtd_minima
    THEN m.qtd_minima - COALESCE(s.saldo, 0) ELSE 0
  END AS faltando
FROM public.posicoes_caixa p
CROSS JOIN semana sem
CROSS JOIN public.tipos_caixa tc
LEFT JOIN saldos s ON s.posicao_id = p.id AND s.tipo_caixa = tc.sigla
LEFT JOIN ultima u ON u.posicao_id = p.id
LEFT JOIN public.clientes cl ON p.tipo = 'cliente' AND cl.id = p.ref_id
LEFT JOIN public.fornecedores f ON p.tipo = 'fornecedor' AND f.id = p.ref_id
LEFT JOIN minimos m ON p.tipo = 'fornecedor' AND m.fornecedor_id = p.ref_id AND m.tipo_caixa = tc.sigla
LEFT JOIN divergencias d ON d.posicao_id = p.id AND d.tipo_caixa = tc.sigla
WHERE tc.ativo = TRUE
  AND (
    (p.tipo = 'galpao')
    OR (p.tipo = 'cliente' AND cl.ativo = TRUE)
    OR (p.tipo = 'fornecedor' AND f.ativo = TRUE)
  )
ORDER BY
  CASE p.tipo WHEN 'galpao' THEN 1 WHEN 'fornecedor' THEN 2 WHEN 'cliente' THEN 3 END,
  COALESCE(cl.nome, f.nome, 'Galpão'),
  tc.ordem;

GRANT SELECT ON public.v_painel_inventario TO authenticated;

NOTIFY pgrst, 'reload schema';
