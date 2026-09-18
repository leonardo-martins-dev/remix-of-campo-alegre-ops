-- Add 'transferencia' to tipo_movimentacao.
-- Used by /caixas/movimentacao for cliente→fornecedor (and fallback pairs).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tipo_movimentacao' AND e.enumlabel = 'transferencia'
  ) THEN ALTER TYPE public.tipo_movimentacao ADD VALUE 'transferencia'; END IF;
END $$;
