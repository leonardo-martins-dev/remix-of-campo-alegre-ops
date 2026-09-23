-- NOP-321: hubs de operação + Meu turno; TV/rastreio fora do menu (rotas permanecem).

-- Hub pages
INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo) VALUES
  ('receber',    'Receber',    'Operação', 'PackageCheck', 10, TRUE),
  ('expedir',    'Expedir',    'Operação', 'Truck',        11, TRUE),
  ('caixas',     'Caixas',     'Operação', 'Box',          12, TRUE),
  ('embalagens', 'Embalagens', 'Operação', 'Package',      13, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

-- Home
UPDATE public.pages
SET nome = 'Meu turno', grupo = 'Navegação', icone = 'LayoutDashboard', ordem = 1, ativo = TRUE
WHERE slug = 'dashboard';

-- TV e rastreio: ativos para deep link, grupo fora do menu principal
UPDATE public.pages
SET grupo = 'Dispositivo', ordem = 900
WHERE slug IN ('expedicao/tv', 'expedicao/rastreio');

-- Reagrupar gestão
UPDATE public.pages SET grupo = 'Gestão', ordem = 60 WHERE slug = 'gestao';
UPDATE public.pages SET grupo = 'Gestão', ordem = 61 WHERE slug = 'gestao/usuarios';
UPDATE public.pages SET grupo = 'Gestão', ordem = 62 WHERE slug = 'gestao/regras';
UPDATE public.pages SET grupo = 'Gestão', ordem = 50 WHERE slug = 'indicadores';

-- Permissões dos hubs: quem acessa qualquer filho ganha o hub
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT DISTINCT upp.user_id, p_hub.id, TRUE
FROM public.user_page_permissions upp
JOIN public.pages p_child ON p_child.id = upp.page_id
JOIN public.pages p_hub ON p_hub.slug = 'receber'
WHERE upp.can_access = TRUE
  AND p_child.slug IN ('recebimento', 'recebimento/conferir', 'recebimento/faltas', 'recebimento/vales', 'recebimento/liberacoes', 'recebimento/saida-roca')
ON CONFLICT (user_id, page_id) DO NOTHING;

INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT DISTINCT upp.user_id, p_hub.id, TRUE
FROM public.user_page_permissions upp
JOIN public.pages p_child ON p_child.id = upp.page_id
JOIN public.pages p_hub ON p_hub.slug = 'expedir'
WHERE upp.can_access = TRUE
  AND p_child.slug IN ('expedicao', 'expedicao/saida', 'expedicao/entrega', 'expedicao/rotas')
ON CONFLICT (user_id, page_id) DO NOTHING;

INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT DISTINCT upp.user_id, p_hub.id, TRUE
FROM public.user_page_permissions upp
JOIN public.pages p_child ON p_child.id = upp.page_id
JOIN public.pages p_hub ON p_hub.slug = 'caixas'
WHERE upp.can_access = TRUE
  AND p_child.slug IN ('caixas/saldo', 'caixas/movimentacao', 'caixas/inventario', 'caixas/economia', 'caixas/retorno', 'caixas/motorista', 'caixas/fornecedor')
ON CONFLICT (user_id, page_id) DO NOTHING;

INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT DISTINCT upp.user_id, p_hub.id, TRUE
FROM public.user_page_permissions upp
JOIN public.pages p_child ON p_child.id = upp.page_id
JOIN public.pages p_hub ON p_hub.slug = 'embalagens'
WHERE upp.can_access = TRUE
  AND p_child.slug IN ('embalagens/saldo', 'embalagens/inventario')
ON CONFLICT (user_id, page_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
