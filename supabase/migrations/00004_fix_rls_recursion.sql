-- Fix: 500 em profiles/pages por recursão infinita nas policies RLS
-- A policy consultava public.profiles dentro da policy de public.profiles

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid())
      AND role IN (
        'admin'::public.user_role,
        'super_admin'::public.user_role
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Profiles
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin());

-- Pages: pages_admin_all (FOR ALL) disparava subquery em profiles no SELECT
DROP POLICY IF EXISTS pages_admin_all ON public.pages;

CREATE POLICY pages_insert_admin ON public.pages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY pages_update_admin ON public.pages
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY pages_delete_admin ON public.pages
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Permissões por página
DROP POLICY IF EXISTS perms_select ON public.user_page_permissions;
DROP POLICY IF EXISTS perms_admin_all ON public.user_page_permissions;

CREATE POLICY perms_select ON public.user_page_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY perms_insert_admin ON public.user_page_permissions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY perms_update_admin ON public.user_page_permissions
  FOR UPDATE TO authenticated
  USING (public.is_admin());

CREATE POLICY perms_delete_admin ON public.user_page_permissions
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Audit log
DROP POLICY IF EXISTS audit_select_admin ON public.audit_log;

CREATE POLICY audit_select_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- DELETE em tabelas operacionais
DO $$
DECLARE
  tbl TEXT;
  pol TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'destinatarios', 'familias_produto', 'produtos', 'fornecedores',
    'tipos_caixa', 'clientes', 'motoristas', 'caminhoes', 'rotas',
    'pedidos_recebimento', 'itens_pedido', 'itens_pedido_rateio',
    'conferencias', 'itens_conferencia',
    'cargas', 'romaneio_itens', 'carga_caixas_resumo',
    'retornos_caixa', 'movimentacoes_caixa', 'cobrancas_caixa',
    'registros_ciclo', 'configuracoes'
  ])
  LOOP
    pol := tbl || '_delete_admin';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin())',
      pol, tbl
    );
  END LOOP;
END $$;
