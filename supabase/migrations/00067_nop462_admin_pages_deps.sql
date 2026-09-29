-- NOP-462: página gestao/regras (Parâmetros) + mapa de deps sem rotas mortas.
-- NÃO concede permissão a ninguém (sem INSERT em user_page_permissions / role_pages).
-- Observe-first: a linha em pages existe para a UI de permissões; quem já acessa
-- continua pelo caminho atual até alguém conceder/negar explicitamente.

-- 1) gestao/regras é rota real (menu "Parâmetros") — garantir registro em pages.
INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo)
VALUES ('gestao/regras', 'Parâmetros', 'Gestão', 'Settings', 62, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

-- 2) Rotas mortas (só redirect): caixas/galpao → inventario;
--    retorno/fornecedor/motorista → movimentacao. Removidas do mapa.
--    Se ainda existirem linhas inativas em pages, permanecem inativas (sem reativar).

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
    "embalagens/saldo": ["embalagens"],
    "embalagens/inventario": ["embalagens", "embalagens/saldo"],
    "quebra/lancar": ["quebra"],
    "gestao/regras": ["gestao"],
    "gestao/usuarios": ["gestao"],
    "relatorios/custos": ["indicadores"]
  }'::jsonb;
$$;

NOTIFY pgrst, 'reload schema';
