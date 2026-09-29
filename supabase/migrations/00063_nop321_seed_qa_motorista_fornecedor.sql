-- NOP-321 (retorno QA): seed mínimo de usuários QA motorista + fornecedor
-- vinculados a cadastros existentes (não inventa nomes de negócio).
--
-- Contas:
--   qamotorista1@noponto.com  → role user + motorista João Silva
--   qafornecedor1@noponto.com → role fornecedor + CAMPO ALEGRE LAVOURA
-- Senha inicial (só neste arquivo): QaNoponto321!
-- Idempotente: reexecutar não duplica auth.users / profiles / permissões.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_mot_id UUID;
  v_forn_id UUID;
  v_mot_user UUID := '589a2e83-154d-447b-8fac-bf4ea72a7e6f';
  v_forn_user UUID := '47b0eae0-378a-4645-8d9f-696547ec3347';
  v_pwd TEXT := crypt('QaNoponto321!', gen_salt('bf'));
BEGIN
  -- Reusa cadastros existentes (demo / real), sem criar phantom
  SELECT id INTO v_mot_id
  FROM public.motoristas
  WHERE id = 'd6000001-0000-4000-8000-000000000001'::uuid
     OR lower(nome) = lower('João Silva')
  ORDER BY CASE WHEN id = 'd6000001-0000-4000-8000-000000000001'::uuid THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT id INTO v_forn_id
  FROM public.fornecedores
  WHERE id = '18a9771b-1e86-4a2e-9bfb-ea8a3b70040f'::uuid
     OR upper(nome) = 'CAMPO ALEGRE LAVOURA'
  ORDER BY CASE WHEN id = '18a9771b-1e86-4a2e-9bfb-ea8a3b70040f'::uuid THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_mot_id IS NULL THEN
    RAISE NOTICE 'NOP-321 seed: nenhum motorista encontrado — skip vínculo motorista';
  END IF;
  IF v_forn_id IS NULL THEN
    RAISE NOTICE 'NOP-321 seed: nenhum fornecedor CAMPO ALEGRE LAVOURA — skip vínculo fornecedor';
  END IF;

  -- ---------- Motorista QA ----------
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'qamotorista1@noponto.com') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_mot_user,
      '00000000-0000-0000-0000-000000000000',
      'qamotorista1@noponto.com',
      v_pwd,
      now(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email'], 'role', 'user', 'nome', 'QA MOTORISTA 1'),
      jsonb_build_object('full_name', 'QA MOTORISTA 1'),
      'authenticated', 'authenticated', now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_mot_user, v_mot_user,
      jsonb_build_object('sub', v_mot_user::text, 'email', 'qamotorista1@noponto.com'),
      'email', v_mot_user::text, now(), now(), now()
    );
  ELSE
    SELECT id INTO v_mot_user FROM auth.users WHERE lower(email) = 'qamotorista1@noponto.com';
  END IF;

  INSERT INTO public.profiles (id, nome, email, role, ativo, motorista_id, fornecedor_id)
  VALUES (v_mot_user, 'QA MOTORISTA 1', 'qamotorista1@noponto.com', 'user', TRUE, v_mot_id, NULL)
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    role = 'user',
    ativo = TRUE,
    motorista_id = COALESCE(EXCLUDED.motorista_id, public.profiles.motorista_id),
    fornecedor_id = NULL,
    updated_at = now();

  -- ---------- Fornecedor QA ----------
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'qafornecedor1@noponto.com') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_forn_user,
      '00000000-0000-0000-0000-000000000000',
      'qafornecedor1@noponto.com',
      v_pwd,
      now(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email'], 'role', 'fornecedor', 'nome', 'QA FORNECEDOR 1'),
      jsonb_build_object('full_name', 'QA FORNECEDOR 1'),
      'authenticated', 'authenticated', now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_forn_user, v_forn_user,
      jsonb_build_object('sub', v_forn_user::text, 'email', 'qafornecedor1@noponto.com'),
      'email', v_forn_user::text, now(), now(), now()
    );
  ELSE
    SELECT id INTO v_forn_user FROM auth.users WHERE lower(email) = 'qafornecedor1@noponto.com';
  END IF;

  INSERT INTO public.profiles (id, nome, email, role, ativo, motorista_id, fornecedor_id)
  VALUES (v_forn_user, 'QA FORNECEDOR 1', 'qafornecedor1@noponto.com', 'fornecedor', TRUE, NULL, v_forn_id)
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    role = 'fornecedor',
    ativo = TRUE,
    motorista_id = NULL,
    fornecedor_id = COALESCE(EXCLUDED.fornecedor_id, public.profiles.fornecedor_id),
    updated_at = now();
END $$;

-- Permissões do motorista QA (Meu turno / Minha rota / Saída / Entrega)
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT pf.id, pg.id, TRUE
FROM public.profiles pf
CROSS JOIN public.pages pg
WHERE lower(pf.email) = 'qamotorista1@noponto.com'
  AND pg.slug IN (
    'dashboard',
    'expedir',
    'expedicao',
    'expedicao/minha-rota',
    'expedicao/saida',
    'expedicao/entrega'
  )
ON CONFLICT (user_id, page_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
