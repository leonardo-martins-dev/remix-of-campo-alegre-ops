-- ============================================================
-- FIX: "Database error querying schema" no login
-- GoTrue não aceita NULL em colunas de token em auth.users
-- Execute no SQL Editor do Supabase Studio
-- ============================================================

ALTER TABLE auth.users ALTER COLUMN confirmation_token SET DEFAULT '';
ALTER TABLE auth.users ALTER COLUMN recovery_token SET DEFAULT '';
ALTER TABLE auth.users ALTER COLUMN email_change_token_new SET DEFAULT '';
ALTER TABLE auth.users ALTER COLUMN email_change SET DEFAULT '';

UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
UPDATE auth.users SET recovery_token = '' WHERE recovery_token IS NULL;
UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;

UPDATE auth.identities SET created_at = now() WHERE created_at IS NULL;
UPDATE auth.identities SET updated_at = now() WHERE updated_at IS NULL;

UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now()
WHERE email = 'admin@noponto.io';

INSERT INTO public.profiles (id, nome, email, role)
SELECT u.id, 'Administrador', u.email, 'admin'::public.user_role
FROM auth.users u
WHERE u.email = 'admin@noponto.io'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin'::public.user_role,
  nome = EXCLUDED.nome,
  updated_at = now();
