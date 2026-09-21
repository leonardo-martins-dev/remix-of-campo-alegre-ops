-- 00042: seed aliases from local cadastro (origem=wise). Idempotent.
-- Full CMP218-driven seed remains in wise-sync-service (seed:aliases).

CREATE INDEX IF NOT EXISTS idx_aliases_codigo_externo
  ON public.aliases (tipo, origem, codigo_externo)
  WHERE codigo_externo IS NOT NULL AND btrim(codigo_externo) <> '';

-- Produtos com codigo Wise (um alias por nome_externo)
INSERT INTO public.aliases (tipo, nome_externo, codigo_externo, entidade_id, origem)
SELECT DISTINCT ON (p.nome)
  'produto'::public.tipo_alias,
  p.nome,
  btrim(p.codigo),
  p.id,
  'wise'
FROM public.produtos p
WHERE p.ativo
  AND p.codigo IS NOT NULL
  AND btrim(p.codigo) <> ''
ORDER BY p.nome, p.created_at ASC
ON CONFLICT (tipo, origem, nome_externo) DO UPDATE SET
  codigo_externo = EXCLUDED.codigo_externo,
  entidade_id = EXCLUDED.entidade_id;

-- Fornecedores com codigo_wise (coluna já existente em prod)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fornecedores' AND column_name = 'codigo_wise'
  ) THEN
    INSERT INTO public.aliases (tipo, nome_externo, codigo_externo, entidade_id, origem)
    SELECT DISTINCT ON (f.nome)
      'fornecedor'::public.tipo_alias,
      f.nome,
      btrim(f.codigo_wise),
      f.id,
      'wise'
    FROM public.fornecedores f
    WHERE f.ativo
      AND f.codigo_wise IS NOT NULL
      AND btrim(f.codigo_wise) <> ''
    ORDER BY f.nome, f.created_at ASC
    ON CONFLICT (tipo, origem, nome_externo) DO UPDATE SET
      codigo_externo = EXCLUDED.codigo_externo,
      entidade_id = EXCLUDED.entidade_id;
  END IF;
END $$;
