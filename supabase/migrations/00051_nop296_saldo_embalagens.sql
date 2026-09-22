-- ============================================================
-- NOP-296 — Saldo de embalagens (Packing)
--
-- Saldo declarativo por tipo = última contagem fechada + ajustes
-- lançados depois dela. Sem posição loja/fornecedor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. View: saldo atual por tipo
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_saldo_embalagem
WITH (security_invoker = true) AS
WITH ultima AS (
  SELECT DISTINCT ON (i.tipo_embalagem_id)
    i.tipo_embalagem_id,
    i.quantidade AS ultima_quantidade,
    c.id AS ultima_contagem_id,
    c.data AS ultima_data,
    c.created_at AS ultima_created_at,
    pr.nome AS ultima_responsavel
  FROM public.contagem_embalagem_itens i
  JOIN public.contagens_embalagem c ON c.id = i.contagem_id
  LEFT JOIN public.profiles pr ON pr.id = c.contado_por
  ORDER BY i.tipo_embalagem_id, c.data DESC, c.created_at DESC
),
ajustes_pos AS (
  SELECT
    a.tipo_embalagem_id,
    COALESCE(SUM(a.quantidade), 0) AS ajustes
  FROM public.ajustes_embalagem a
  JOIN ultima u ON u.tipo_embalagem_id = a.tipo_embalagem_id
  WHERE a.registrado_em > u.ultima_created_at
  GROUP BY a.tipo_embalagem_id
),
ajustes_sem_contagem AS (
  SELECT
    a.tipo_embalagem_id,
    COALESCE(SUM(a.quantidade), 0) AS ajustes
  FROM public.ajustes_embalagem a
  WHERE NOT EXISTS (
    SELECT 1 FROM ultima u WHERE u.tipo_embalagem_id = a.tipo_embalagem_id
  )
  GROUP BY a.tipo_embalagem_id
)
SELECT
  te.id               AS tipo_embalagem_id,
  te.nome,
  te.unidade_contagem,
  te.qty_por_pacote,
  u.ultima_contagem_id,
  u.ultima_quantidade,
  u.ultima_data,
  u.ultima_responsavel,
  CASE
    WHEN u.ultima_contagem_id IS NULL THEN COALESCE(ascnt.ajustes, 0)
    ELSE COALESCE(ap.ajustes, 0)
  END AS ajustes_pos_contagem,
  CASE
    WHEN u.ultima_contagem_id IS NULL THEN COALESCE(ascnt.ajustes, 0)
    ELSE COALESCE(u.ultima_quantidade, 0) + COALESCE(ap.ajustes, 0)
  END AS saldo
FROM public.tipos_embalagem te
LEFT JOIN ultima u ON u.tipo_embalagem_id = te.id
LEFT JOIN ajustes_pos ap ON ap.tipo_embalagem_id = te.id
LEFT JOIN ajustes_sem_contagem ascnt ON ascnt.tipo_embalagem_id = te.id
WHERE te.ativo = TRUE
ORDER BY te.nome;

GRANT SELECT ON public.v_saldo_embalagem TO authenticated;

COMMENT ON VIEW public.v_saldo_embalagem IS
  'NOP-296: saldo Packing por tipo = última contagem + ajustes posteriores (ou só ajustes se nunca contado).';

-- ------------------------------------------------------------
-- 2. Página no menu (ao lado de Saldo de caixas / Inventário embalagens)
-- ------------------------------------------------------------
INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo) VALUES
  ('embalagens/saldo', 'Saldo de embalagens', 'Caixas', 'Package', 31, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

-- Quem já acessa inventário de embalagens ou saldo de caixas também vê o saldo.
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT DISTINCT upp.user_id, p_new.id, TRUE
FROM public.user_page_permissions upp
JOIN public.pages p_old ON p_old.id = upp.page_id
JOIN public.pages p_new ON p_new.slug = 'embalagens/saldo'
WHERE upp.can_access = TRUE
  AND p_old.slug IN ('embalagens/inventario', 'caixas/saldo', 'caixas/inventario')
ON CONFLICT (user_id, page_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
