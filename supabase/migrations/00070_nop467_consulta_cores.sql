-- NOP-467: página caixas/cores (consulta reversa + folha da parede).
-- Concede a quem já acessa caixas ou recebimento/receber.
-- Atualiza permission_deps_map.

INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo)
VALUES ('caixas/cores', 'Cores da carga', 'Caixas', 'Palette', 36, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

-- Quem já opera caixas
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT DISTINCT upp.user_id, p_new.id, TRUE
FROM public.user_page_permissions upp
JOIN public.pages p_old ON p_old.id = upp.page_id
JOIN public.pages p_new ON p_new.slug = 'caixas/cores'
WHERE upp.can_access = TRUE
  AND (p_old.slug = 'caixas' OR p_old.slug LIKE 'caixas/%')
ON CONFLICT (user_id, page_id) DO NOTHING;

-- Quem já opera recebimento / hub receber
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT DISTINCT upp.user_id, p_new.id, TRUE
FROM public.user_page_permissions upp
JOIN public.pages p_old ON p_old.id = upp.page_id
JOIN public.pages p_new ON p_new.slug = 'caixas/cores'
WHERE upp.can_access = TRUE
  AND (
    p_old.slug = 'receber'
    OR p_old.slug = 'recebimento'
    OR p_old.slug LIKE 'recebimento/%'
  )
ON CONFLICT (user_id, page_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.permission_deps_map()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT '{
    "recebimento": ["receber"],
    "recebimento/conferir": ["receber", "recebimento", "fornecedores"],
    "recebimento/faltas": ["receber", "recebimento"],
    "recebimento/vales": ["receber", "recebimento"],
    "recebimento/liberacoes": ["receber", "recebimento", "recebimento/vales"],
    "recebimento/saida-roca": ["receber"],
    "expedicao": ["expedir"],
    "expedicao/saida": ["expedir", "expedicao"],
    "expedicao/entrega": ["expedir", "expedicao"],
    "expedicao/minha-rota": ["expedir", "expedicao"],
    "expedicao/rotas": ["expedir", "expedicao"],
    "expedicao/tv": ["expedir", "expedicao"],
    "expedicao/rastreio": ["expedir", "expedicao"],
    "caixas/saldo": ["caixas"],
    "caixas/movimentacao": ["caixas", "caixas/saldo"],
    "caixas/inventario": ["caixas", "caixas/saldo"],
    "caixas/economia": ["caixas", "caixas/saldo"],
    "caixas/cores": ["caixas", "receber", "recebimento"],
    "embalagens/saldo": ["embalagens"],
    "embalagens/inventario": ["embalagens", "embalagens/saldo"],
    "quebra/lancar": ["quebra"],
    "gestao/regras": ["gestao"],
    "gestao/usuarios": ["gestao"],
    "relatorios/custos": ["indicadores"]
  }'::jsonb;
$$;

NOTIFY pgrst, 'reload schema';
