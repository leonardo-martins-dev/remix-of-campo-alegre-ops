-- ============================================================
-- NOP-15: Inventário semanal obrigatório nas 3 posições
-- Estoque mínimo por fornecedor × tipo de caixa
-- Painel de posições com divergência esperado × contado
-- ============================================================

-- ------------------------------------------------------------
-- 1. Parâmetros de configuração
-- ------------------------------------------------------------
INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('inventario_frequencia_dias', '7', 'Frequência obrigatória de contagem (dias)'),
  ('inventario_bloquear_operacao', 'false', 'Bloquear operação se posição vencida'),
  ('inventario_alerta_pendente', 'true', 'Alertar ADM quando posição estiver pendente')
ON CONFLICT (chave) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Estoque mínimo por fornecedor × tipo de caixa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.minimo_estoque_fornecedor_caixa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id   UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  tipo_caixa      TEXT NOT NULL,
  qtd_minima      INT NOT NULL DEFAULT 0 CHECK (qtd_minima >= 0),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_minimo_forn_tipo UNIQUE (fornecedor_id, tipo_caixa)
);

CREATE INDEX IF NOT EXISTS idx_minimo_estoque_fornecedor
  ON public.minimo_estoque_fornecedor_caixa (fornecedor_id);

ALTER TABLE public.minimo_estoque_fornecedor_caixa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minimo_estoque_select_auth ON public.minimo_estoque_fornecedor_caixa;
DROP POLICY IF EXISTS minimo_estoque_insert_auth ON public.minimo_estoque_fornecedor_caixa;
DROP POLICY IF EXISTS minimo_estoque_update_auth ON public.minimo_estoque_fornecedor_caixa;
DROP POLICY IF EXISTS minimo_estoque_delete_admin ON public.minimo_estoque_fornecedor_caixa;

CREATE POLICY minimo_estoque_select_auth ON public.minimo_estoque_fornecedor_caixa
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY minimo_estoque_insert_auth ON public.minimo_estoque_fornecedor_caixa
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY minimo_estoque_update_auth ON public.minimo_estoque_fornecedor_caixa
  FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY minimo_estoque_delete_admin ON public.minimo_estoque_fornecedor_caixa
  FOR DELETE USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.handle_minimo_estoque_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_minimo_estoque ON public.minimo_estoque_fornecedor_caixa;
CREATE TRIGGER set_updated_at_minimo_estoque
  BEFORE UPDATE ON public.minimo_estoque_fornecedor_caixa
  FOR EACH ROW EXECUTE FUNCTION public.handle_minimo_estoque_updated_at();

-- ------------------------------------------------------------
-- 3. View: Última contagem por posição
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ultima_contagem_posicao
WITH (security_invoker = true) AS
SELECT DISTINCT ON (c.posicao_id)
  c.posicao_id,
  c.id AS contagem_id,
  c.data AS ultima_contagem_data,
  c.status AS ultima_contagem_status,
  c.origem AS ultima_contagem_origem,
  c.created_at AS ultima_contagem_criada_em,
  c.conciliado_em,
  EXTRACT(DAY FROM (now() - COALESCE(c.conciliado_em, c.created_at)))::INT AS dias_desde_contagem
FROM public.contagens_caixa c
ORDER BY c.posicao_id, c.created_at DESC;

GRANT SELECT ON public.v_ultima_contagem_posicao TO authenticated;

-- ------------------------------------------------------------
-- 4. View: Painel de inventário por posição
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_painel_inventario
WITH (security_invoker = true) AS
WITH saldos AS (
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
),
freq AS (
  SELECT public.config_num('inventario_frequencia_dias', 7)::INT AS dias
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
    WHEN u.dias_desde_contagem IS NULL THEN TRUE
    WHEN u.dias_desde_contagem >= freq.dias THEN TRUE
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
CROSS JOIN freq
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

-- ------------------------------------------------------------
-- 5. View: Posições pendentes de contagem (alertas)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_posicoes_contagem_pendente
WITH (security_invoker = true) AS
WITH freq AS (
  SELECT public.config_num('inventario_frequencia_dias', 7)::INT AS dias
),
ultima AS (
  SELECT * FROM public.v_ultima_contagem_posicao
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
  freq.dias AS frequencia_dias
FROM public.posicoes_caixa p
CROSS JOIN freq
LEFT JOIN ultima u ON u.posicao_id = p.id
LEFT JOIN public.clientes cl ON p.tipo = 'cliente' AND cl.id = p.ref_id
LEFT JOIN public.fornecedores f ON p.tipo = 'fornecedor' AND f.id = p.ref_id
WHERE (
    (p.tipo = 'galpao')
    OR (p.tipo = 'cliente' AND cl.ativo = TRUE)
    OR (p.tipo = 'fornecedor' AND f.ativo = TRUE)
  )
  AND (u.dias_desde_contagem IS NULL OR u.dias_desde_contagem >= freq.dias)
ORDER BY
  COALESCE(u.dias_desde_contagem, 999) DESC,
  CASE p.tipo WHEN 'galpao' THEN 1 WHEN 'fornecedor' THEN 2 WHEN 'cliente' THEN 3 END;

GRANT SELECT ON public.v_posicoes_contagem_pendente TO authenticated;

-- ------------------------------------------------------------
-- 6. View: Total geral de caixas (todas as posições)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_total_geral_caixas
WITH (security_invoker = true) AS
SELECT
  'total' AS posicao_tipo,
  s.tipo_caixa,
  SUM(COALESCE(s.saldo, 0)) AS saldo_total,
  tc.custo_unitario,
  SUM(COALESCE(s.saldo, 0)) * tc.custo_unitario AS valor_total
FROM public.v_saldos_caixa s
JOIN public.tipos_caixa tc ON tc.sigla = s.tipo_caixa
WHERE s.tipo_caixa IS NOT NULL
  AND tc.ativo = TRUE
GROUP BY s.tipo_caixa, tc.custo_unitario, tc.ordem
ORDER BY tc.ordem;

GRANT SELECT ON public.v_total_geral_caixas TO authenticated;

-- ------------------------------------------------------------
-- 7. View: Fornecedores abaixo do mínimo
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_fornecedores_abaixo_minimo
WITH (security_invoker = true) AS
SELECT
  f.id AS fornecedor_id,
  f.nome AS fornecedor_nome,
  m.tipo_caixa,
  m.qtd_minima,
  COALESCE(s.saldo, 0) AS saldo_atual,
  m.qtd_minima - COALESCE(s.saldo, 0) AS faltando,
  tc.custo_unitario,
  (m.qtd_minima - COALESCE(s.saldo, 0)) * tc.custo_unitario AS valor_faltando
FROM public.minimo_estoque_fornecedor_caixa m
JOIN public.fornecedores f ON f.id = m.fornecedor_id
JOIN public.tipos_caixa tc ON tc.sigla = m.tipo_caixa
LEFT JOIN public.posicoes_caixa p ON p.tipo = 'fornecedor' AND p.ref_id = f.id
LEFT JOIN public.v_saldos_caixa s ON s.posicao_id = p.id AND s.tipo_caixa = m.tipo_caixa
WHERE m.ativo = TRUE
  AND f.ativo = TRUE
  AND COALESCE(s.saldo, 0) < m.qtd_minima
ORDER BY (m.qtd_minima - COALESCE(s.saldo, 0)) DESC;

GRANT SELECT ON public.v_fornecedores_abaixo_minimo TO authenticated;

-- ------------------------------------------------------------
-- 8. View: Divergências pendentes (contagens não conciliadas)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_divergencias_pendentes
WITH (security_invoker = true) AS
SELECT
  c.id AS contagem_id,
  c.posicao_id,
  p.tipo AS posicao_tipo,
  CASE
    WHEN p.tipo = 'galpao' THEN 'Galpão'
    WHEN p.tipo = 'cliente' THEN cl.nome
    WHEN p.tipo = 'fornecedor' THEN f.nome
    ELSE p.tipo::text
  END AS posicao_nome,
  c.data,
  c.origem,
  c.created_at,
  ci.tipo_caixa,
  ci.qtd_contada,
  ci.qtd_calculada,
  ci.diferenca,
  tc.custo_unitario,
  ABS(ci.diferenca) * tc.custo_unitario AS valor_divergencia
FROM public.contagens_caixa c
JOIN public.contagem_caixa_itens ci ON ci.contagem_id = c.id
JOIN public.posicoes_caixa p ON p.id = c.posicao_id
JOIN public.tipos_caixa tc ON tc.sigla = ci.tipo_caixa
LEFT JOIN public.clientes cl ON p.tipo = 'cliente' AND cl.id = p.ref_id
LEFT JOIN public.fornecedores f ON p.tipo = 'fornecedor' AND f.id = p.ref_id
WHERE c.status = 'pendente'
  AND ci.diferenca <> 0
ORDER BY c.created_at DESC;

GRANT SELECT ON public.v_divergencias_pendentes TO authenticated;

-- ------------------------------------------------------------
-- 9. Navegação: página de painel de inventário
-- ------------------------------------------------------------
UPDATE public.pages
SET nome = 'Inventário de caixas', icone = 'Warehouse', ordem = 31
WHERE slug = 'caixas/inventario';

NOTIFY pgrst, 'reload schema';
