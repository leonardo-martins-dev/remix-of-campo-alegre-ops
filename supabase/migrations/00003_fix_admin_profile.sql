-- Garante profile ao login e corrige role do admin seed

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u record;
  resolved_role public.user_role;
  p public.profiles;
BEGIN
  SELECT id, email, raw_app_meta_data, raw_user_meta_data
  INTO u
  FROM auth.users
  WHERE id = auth.uid();

  IF u.id IS NULL THEN
    RETURN NULL;
  END IF;

  resolved_role := COALESCE(
    (u.raw_app_meta_data->>'role')::public.user_role,
    'user'::public.user_role
  );

  IF lower(u.email) = 'admin@noponto.io' THEN
    resolved_role := 'admin'::public.user_role;
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

  RETURN p;
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
