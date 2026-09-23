-- NOP-362: dependências entre permissões + RPC de gravação segura.
-- NÃO concede permissão a ninguém (sem INSERT em user_page_permissions).

-- Alinha grupos das páginas à ordem do menu (só metadado de UI).
UPDATE public.pages SET grupo = 'Recebimento' WHERE slug IN (
  'receber', 'recebimento', 'recebimento/conferir', 'recebimento/faltas',
  'recebimento/vales', 'recebimento/liberacoes', 'recebimento/saida-roca'
);
UPDATE public.pages SET grupo = 'Expedição' WHERE slug IN (
  'expedir', 'expedicao', 'expedicao/saida', 'expedicao/entrega',
  'expedicao/minha-rota', 'expedicao/rotas', 'expedicao/tv', 'expedicao/rastreio'
);
UPDATE public.pages SET grupo = 'Caixas' WHERE slug = 'caixas' OR slug LIKE 'caixas/%';
UPDATE public.pages SET grupo = 'Embalagens' WHERE slug = 'embalagens' OR slug LIKE 'embalagens/%';
UPDATE public.pages SET grupo = 'Cadastros' WHERE slug IN (
  'gestao', 'fornecedores', 'quebra', 'quebra/lancar'
) OR (slug LIKE 'gestao/%' AND slug NOT IN ('gestao/usuarios', 'gestao/regras'));
UPDATE public.pages SET grupo = 'Gestão' WHERE slug IN (
  'gestao/usuarios', 'gestao/regras', 'indicadores', 'relatorios/custos', 'dashboard'
);

-- Mapa slug → dependências diretas (espelha src/lib/permission-deps.ts).
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
    "caixas/galpao": ["caixas"],
    "caixas/retorno": ["caixas", "caixas/movimentacao"],
    "caixas/fornecedor": ["caixas", "caixas/movimentacao"],
    "caixas/motorista": ["caixas", "caixas/movimentacao"],
    "embalagens/saldo": ["embalagens"],
    "embalagens/inventario": ["embalagens", "embalagens/saldo"],
    "quebra/lancar": ["quebra"],
    "gestao/regras": ["gestao"],
    "gestao/usuarios": ["gestao"],
    "relatorios/custos": ["indicadores"]
  }'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.permission_required_deps(p_slug text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_map jsonb := public.permission_deps_map();
  v_seen text[] := ARRAY[]::text[];
  v_queue text[] := ARRAY[p_slug];
  v_cur text;
  v_dep text;
  v_deps jsonb;
BEGIN
  WHILE array_length(v_queue, 1) IS NOT NULL LOOP
    v_cur := v_queue[1];
    v_queue := v_queue[2:];
    v_deps := v_map -> v_cur;
    IF v_deps IS NULL THEN
      CONTINUE;
    END IF;
    FOR v_dep IN SELECT jsonb_array_elements_text(v_deps)
    LOOP
      IF NOT (v_dep = ANY (v_seen)) AND v_dep IS DISTINCT FROM p_slug THEN
        v_seen := v_seen || v_dep;
        v_queue := v_queue || v_dep;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_seen;
END;
$$;

CREATE OR REPLACE FUNCTION public.permission_set_is_complete(p_slugs text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_dep text;
BEGIN
  IF p_slugs IS NULL THEN
    RETURN TRUE;
  END IF;
  FOREACH v_slug IN ARRAY p_slugs LOOP
    FOREACH v_dep IN ARRAY public.permission_required_deps(v_slug) LOOP
      IF NOT (v_dep = ANY (p_slugs)) THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END LOOP;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_admins_with_usuarios()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.profiles pf
  WHERE pf.role = 'admin'
    AND pf.ativo = TRUE
    AND (
      -- Admin via role já acessa Usuários; conta todos os admins ativos
      TRUE
    );
$$;

/**
 * Substitui o conjunto de permissões ativas do usuário.
 * Recusa conjunto incompleto e remoção de Usuários do último admin.
 * NÃO amplia acesso em silêncio além do array pedido (já deve vir completo do client).
 */
CREATE OR REPLACE FUNCTION public.set_user_page_permissions(
  p_user_id uuid,
  p_enabled_slugs text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_slugs text[] := COALESCE(p_enabled_slugs, ARRAY[]::text[]);
  v_had_usuarios boolean;
  v_will_have boolean;
  v_admin_count integer;
  v_target_role text;
  v_page record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT (role = 'admin') INTO v_is_admin FROM public.profiles WHERE id = v_caller;
  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION 'Apenas administradores gerenciam permissões';
  END IF;

  -- Normaliza: remove duplicatas / nulls
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(v_slugs) AS x WHERE x IS NOT NULL AND btrim(x) <> '')
  INTO v_slugs;

  IF NOT public.permission_set_is_complete(v_slugs) THEN
    RAISE EXCEPTION 'Conjunto de permissões incompleto: faltam dependências obrigatórias';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_page_permissions upp
    JOIN public.pages p ON p.id = upp.page_id
    WHERE upp.user_id = p_user_id
      AND upp.can_access = TRUE
      AND p.slug = 'gestao/usuarios'
  ) OR v_target_role = 'admin'
  INTO v_had_usuarios;

  v_will_have := 'gestao/usuarios' = ANY (v_slugs) OR v_target_role = 'admin';

  -- Trava: último admin não perde Usuários (nem por cascata / set sem a slug)
  IF v_target_role = 'admin' AND v_had_usuarios AND NOT ('gestao/usuarios' = ANY (v_slugs)) THEN
    SELECT public.count_admins_with_usuarios() INTO v_admin_count;
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Não é possível remover a permissão Usuários do último administrador';
    END IF;
  END IF;

  -- Desliga tudo que não está no conjunto
  UPDATE public.user_page_permissions upp
  SET can_access = FALSE
  FROM public.pages p
  WHERE upp.page_id = p.id
    AND upp.user_id = p_user_id
    AND upp.can_access = TRUE
    AND NOT (p.slug = ANY (v_slugs));

  -- Liga o conjunto pedido
  FOR v_page IN
    SELECT id, slug FROM public.pages WHERE slug = ANY (v_slugs) AND ativo = TRUE
  LOOP
    INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
    VALUES (p_user_id, v_page.id, TRUE)
    ON CONFLICT (user_id, page_id) DO UPDATE SET can_access = TRUE;
  END LOOP;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'enabled', to_jsonb(v_slugs)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_page_permissions(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_page_permissions(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_deps_map() TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_required_deps(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_set_is_complete(text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
