-- Conferência com divergência → aguardando_liberacao (não gera carga até admin liberar)

CREATE OR REPLACE FUNCTION public.update_conferencia_status(
  p_conferencia_id UUID,
  p_pedido_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_divergencia BOOLEAN;
  v_pedido_status public.status_pedido;
BEGIN
  IF p_status NOT IN ('parcial', 'finalizada') THEN
    RAISE EXCEPTION 'Status de conferência inválido: %', p_status;
  END IF;

  UPDATE public.conferencias
  SET
    status = p_status::public.status_conferencia,
    finalizada_em = CASE
      WHEN p_status = 'finalizada' THEN COALESCE(finalizada_em, now())
      ELSE finalizada_em
    END,
    updated_at = now()
  WHERE id = p_conferencia_id;

  IF p_status = 'finalizada' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.itens_conferencia
      WHERE conferencia_id = p_conferencia_id AND divergencia IS NOT NULL
    ) INTO v_has_divergencia;

    v_pedido_status := CASE
      WHEN v_has_divergencia THEN 'aguardando_liberacao'::public.status_pedido
      ELSE 'conferido'::public.status_pedido
    END;

    UPDATE public.pedidos_recebimento
    SET status = v_pedido_status, updated_at = now()
    WHERE id = p_pedido_id;

    IF NOT v_has_divergencia THEN
      PERFORM public.gerar_cargas_pos_conferencia(p_pedido_id);
    END IF;
  END IF;
END;
$$;
