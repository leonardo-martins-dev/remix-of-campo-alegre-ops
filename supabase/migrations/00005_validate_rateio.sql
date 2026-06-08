-- Valida que soma do rateio não excede quantidade_pedida do item

CREATE OR REPLACE FUNCTION public.check_rateio_quantidade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_pedida NUMERIC;
  v_item_id UUID;
BEGIN
  v_item_id := COALESCE(NEW.item_pedido_id, OLD.item_pedido_id);

  SELECT quantidade_pedida INTO v_pedida
  FROM public.itens_pedido
  WHERE id = v_item_id;

  SELECT COALESCE(SUM(quantidade), 0) INTO v_total
  FROM public.itens_pedido_rateio
  WHERE item_pedido_id = v_item_id;

  IF v_total > v_pedida THEN
    RAISE EXCEPTION 'Rateio (%) excede quantidade do produto (%)', v_total, v_pedida;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_check_rateio_quantidade ON public.itens_pedido_rateio;
CREATE TRIGGER trg_check_rateio_quantidade
  AFTER INSERT OR UPDATE ON public.itens_pedido_rateio
  FOR EACH ROW EXECUTE FUNCTION public.check_rateio_quantidade();
