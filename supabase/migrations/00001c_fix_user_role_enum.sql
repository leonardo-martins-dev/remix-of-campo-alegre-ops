-- Campo Alegre usa roles: admin + user
-- Este banco herdou enum de outro projeto: super_admin, admin, hr, responsible
-- Rode ANTES do 00001b se CREATE TABLE profiles falhar em DEFAULT 'user'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role'
      AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'user'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'user';
  END IF;
END $$;

-- Diagnostico
SELECT e.enumlabel AS valor
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'user_role'
ORDER BY e.enumsortorder;
