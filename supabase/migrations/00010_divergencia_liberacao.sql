-- Divergência exige liberação do admin antes de expedição

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_pedido' AND e.enumlabel = 'aguardando_liberacao'
  ) THEN
    ALTER TYPE public.status_pedido ADD VALUE 'aguardando_liberacao';
  END IF;
END $$;

ALTER TABLE public.pedidos_recebimento
  ADD COLUMN IF NOT EXISTS liberado_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS liberado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observacao_liberacao TEXT;

-- liberar_pedido_divergencia criada em 00012 após gerar_cargas_pos_conferencia
