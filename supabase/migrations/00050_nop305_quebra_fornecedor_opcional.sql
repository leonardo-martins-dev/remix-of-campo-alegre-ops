-- NOP-305: fornecedor opcional na quebra (origem não identificada)

ALTER TABLE public.quebras
  ALTER COLUMN fornecedor_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_quebra' AND e.enumlabel = 'origem_nao_identificada'
  ) THEN
    ALTER TYPE public.status_quebra ADD VALUE 'origem_nao_identificada';
  END IF;
END$$;

COMMENT ON COLUMN public.quebras.fornecedor_id IS
  'Fornecedor de origem; NULL = origem não identificada (ADM vincula depois)';

-- NOP-18: quebras sem fornecedor entram como linha própria nos custos
CREATE OR REPLACE VIEW public.v_custo_quebra
WITH (security_invoker = true) AS
SELECT
  q.id AS quebra_id,
  q.fornecedor_id,
  COALESCE(f.nome, 'Origem não identificada') AS fornecedor_nome,
  q.status,
  DATE(q.registrado_em) AS data_quebra,
  qi.id AS item_id,
  qi.produto_id,
  p.nome AS produto_nome,
  qi.quantidade,
  qi.valor,
  qi.estimado
FROM public.quebras q
LEFT JOIN public.fornecedores f ON f.id = q.fornecedor_id
JOIN public.quebra_itens qi ON qi.quebra_id = q.id
LEFT JOIN public.produtos p ON p.id = qi.produto_id
WHERE q.status IS DISTINCT FROM 'removido';

GRANT SELECT ON public.v_custo_quebra TO authenticated;
