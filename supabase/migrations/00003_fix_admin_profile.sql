-- Garante profile ao login e corrige role do admin seed
-- PRÉ-REQUISITO: 00001_modelo_completo.sql (tabela public.profiles deve existir)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    RAISE EXCEPTION 'Tabela public.profiles não existe. Execute 00001_modelo_completo.sql antes desta migration.';
  END IF;
END $$;

-- Remove versão antiga (se existir com outro tipo de retorno)
DROP FUNCTION IF EXISTS public.ensure_user_profile() CASCADE;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u record;
  resolved_role public.user_role;
  p record;
BEGIN
  SELECT id, email, raw_app_meta_data, raw_user_meta_data
  INTO u
  FROM auth.users
  WHERE id = auth.uid();

  IF u.id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    resolved_role := COALESCE(
      (u.raw_app_meta_data->>'role')::public.user_role,
      'user'::public.user_role
    );
  EXCEPTION
    WHEN invalid_text_representation THEN
      resolved_role := 'user'::public.user_role;
  END;

  IF lower(u.email) = 'admin@noponto.io'
     OR resolved_role::text IN ('admin', 'super_admin') THEN
    resolved_role := 'admin'::public.user_role;
  ELSIF resolved_role::text NOT IN ('admin', 'user') THEN
    resolved_role := 'user'::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (
    u.id,
    COALESCE(
      u.raw_app_meta_data->>'nome',
      u.raw_user_meta_data->>'full_name',
      split_part(u.email, '@', 1)
    ),
    u.email,
    resolved_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nome = COALESCE(public.profiles.nome, EXCLUDED.nome),
    role = CASE
      WHEN lower(EXCLUDED.email) = 'admin@noponto.io' THEN 'admin'::public.user_role
      WHEN (SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = EXCLUDED.id) = 'admin'
        THEN 'admin'::public.user_role
      WHEN public.profiles.role = 'admin'::public.user_role THEN 'admin'::public.user_role
      ELSE public.profiles.role
    END,
    updated_at = now()
  RETURNING * INTO p;

  RETURN to_jsonb(p);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

INSERT INTO public.profiles (id, nome, email, role)
SELECT u.id, 'Administrador', u.email, 'admin'::public.user_role
FROM auth.users u
WHERE lower(u.email) = 'admin@noponto.io'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin'::public.user_role,
  updated_at = now();

-- Confirma que a função foi criada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_user_profile'
  ) THEN
    RAISE EXCEPTION 'ensure_user_profile não foi criada — verifique erros acima';
  END IF;
END $$;
