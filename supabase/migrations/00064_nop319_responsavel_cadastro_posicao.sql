-- ============================================================
-- NOP-319 (gap responsável): campo no cadastro da posição.
--
-- Decisão Leo: responsável da pendência vem do cadastro da
-- posição (fornecedor e galpão), NÃO de quem contou.
-- Sem seed — vazio continua "sem responsável" na UI.
-- ============================================================

ALTER TABLE public.posicoes_caixa
  ADD COLUMN IF NOT EXISTS responsavel TEXT;

COMMENT ON COLUMN public.posicoes_caixa.responsavel IS
  'NOP-319: responsável pelo inventário semanal desta posição (cadastro). Null/vazio = sem responsável.';

CREATE OR REPLACE VIEW public.v_posicoes_contagem_pendente
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
ultima AS (
  SELECT DISTINCT ON (c.posicao_id)
    c.posicao_id,
    c.data AS ultima_contagem_data,
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
  NULLIF(BTRIM(p.responsavel), '') AS responsavel,
  (u.posicao_id IS NULL) AS nunca_contado
FROM public.posicoes_caixa p
CROSS JOIN semana s
LEFT JOIN ultima u ON u.posicao_id = p.id
LEFT JOIN public.clientes cl ON p.tipo = 'cliente' AND cl.id = p.ref_id
LEFT JOIN public.fornecedores f ON p.tipo = 'fornecedor' AND f.id = p.ref_id
WHERE (
    (p.tipo = 'galpao')
    OR (p.tipo = 'cliente' AND cl.ativo = TRUE)
    OR (p.tipo = 'fornecedor' AND f.ativo = TRUE)
  )
  AND (
    u.ultima_contagem_data IS NULL
    OR u.ultima_contagem_data < s.inicio_semana
  )
ORDER BY
  COALESCE(u.dias_desde_contagem, 999) DESC,
  CASE p.tipo WHEN 'galpao' THEN 1 WHEN 'fornecedor' THEN 2 WHEN 'cliente' THEN 3 END;

GRANT SELECT ON public.v_posicoes_contagem_pendente TO authenticated;

COMMENT ON VIEW public.v_posicoes_contagem_pendente IS
  'NOP-319: posições sem contagem na semana (BRT) ou nunca contadas. responsavel = cadastro da posição; prazo = sexta.';

NOTIFY pgrst, 'reload schema';
