-- ============================================================
-- NOP-326 — Minha rota do motorista
--   • View das paradas do dia (saídas em trânsito + entregues)
--   • Página expedicao/minha-rota + permissões para motoristas
-- ============================================================

CREATE OR REPLACE VIEW public.v_minha_rota_motorista
WITH (security_invoker = true) AS
SELECT
  s.id AS saida_id,
  s.carga_id,
  s.motorista_id,
  s.cliente_id,
  s.saida_em,
  s.total_caixas,
  s.status AS saida_status,
  c.codigo AS carga_codigo,
  c.numero_ordem,
  c.status_ordem,
  c.data_carga,
  cl.nome AS cliente_nome,
  cl.cnpj AS cliente_cnpj,
  COALESCE(c.rota_id, cl.rota_id) AS rota_id,
  COALESCE(r_carga.nome, r_loja.nome) AS rota_nome,
  COALESCE(r_carga.ordem, r_loja.ordem, 9999) AS rota_ordem,
  mot.nome AS motorista_nome,
  e.id AS entrega_id,
  e.status AS entrega_status,
  e.entregue_em,
  e.total_caixas_entregues,
  e.total_caixas_recusadas,
  e.caixas_vazias_retiradas,
  e.recebedor_nome
FROM public.saidas_expedicao s
JOIN public.cargas c ON c.id = s.carga_id
JOIN public.clientes cl ON cl.id = s.cliente_id
LEFT JOIN public.motoristas mot ON mot.id = s.motorista_id
LEFT JOIN public.rotas r_carga ON r_carga.id = c.rota_id
LEFT JOIN public.rotas r_loja ON r_loja.id = cl.rota_id
LEFT JOIN LATERAL (
  SELECT e2.*
  FROM public.entregas_expedicao e2
  WHERE e2.saida_id = s.id
  ORDER BY e2.entregue_em DESC
  LIMIT 1
) e ON TRUE
WHERE s.status <> 'cancelada'
  AND c.data_carga = public.today_brt();

COMMENT ON VIEW public.v_minha_rota_motorista IS
  'NOP-326: paradas do dia do motorista (saída → entrega) na ordem da rota';

GRANT SELECT ON public.v_minha_rota_motorista TO authenticated;

-- Página
INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo) VALUES
  ('expedicao/minha-rota', 'Minha rota', 'Expedição', 'Route', 7, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

-- Motoristas cadastrados enxergam Minha rota
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT pf.id, pg.id, TRUE
FROM public.profiles pf
CROSS JOIN public.pages pg
WHERE pg.slug = 'expedicao/minha-rota'
  AND pf.motorista_id IS NOT NULL
ON CONFLICT (user_id, page_id) DO NOTHING;

-- Quem já tem saída/entrega ganha Minha rota (hub expedir)
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT DISTINCT upp.user_id, p_nova.id, TRUE
FROM public.user_page_permissions upp
JOIN public.pages p_child ON p_child.id = upp.page_id
JOIN public.pages p_nova ON p_nova.slug = 'expedicao/minha-rota'
WHERE upp.can_access = TRUE
  AND p_child.slug IN ('expedicao/saida', 'expedicao/entrega', 'expedicao')
ON CONFLICT (user_id, page_id) DO NOTHING;

-- Hub expedir inclui Minha rota
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT DISTINCT upp.user_id, p_hub.id, TRUE
FROM public.user_page_permissions upp
JOIN public.pages p_child ON p_child.id = upp.page_id
JOIN public.pages p_hub ON p_hub.slug = 'expedir'
WHERE upp.can_access = TRUE
  AND p_child.slug = 'expedicao/minha-rota'
ON CONFLICT (user_id, page_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
