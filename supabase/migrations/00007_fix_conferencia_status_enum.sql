-- Corrige cast de status_pedido no trigger de finalização de conferência
-- Erro: column "status" is of type public.status_pedido but expression is of type text

CREATE OR REPLACE FUNCTION public.handle_conferencia_finalizada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_divergencia BOOLEAN;
  v_status public.status_pedido;
BEGIN
  IF NEW.status = 'finalizada'::public.status_conferencia
     AND OLD.status IS DISTINCT FROM 'finalizada'::public.status_conferencia THEN
    NEW.finalizada_em = now();

    SELECT EXISTS(
      SELECT 1 FROM public.itens_conferencia
      WHERE conferencia_id = NEW.id AND divergencia IS NOT NULL
    ) INTO v_has_divergencia;

    v_status := CASE
      WHEN v_has_divergencia THEN 'divergencia'::public.status_pedido
      ELSE 'conferido'::public.status_pedido
    END;

    UPDATE public.pedidos_recebimento
    SET status = v_status,
        updated_at = now()
    WHERE id = NEW.pedido_id;
  END IF;

  RETURN NEW;
END;
$$;
