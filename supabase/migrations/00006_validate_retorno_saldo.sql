-- Impede retorno maior que o saldo disponível por tipo de caixa

CREATE OR REPLACE FUNCTION public.check_retorno_saldo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo NUMERIC;
BEGIN
  IF NEW.caixas_g > 0 THEN
    SELECT COALESCE(saldo, 0) INTO v_saldo
    FROM public.v_saldo_caixas_cliente
    WHERE cliente_id = NEW.cliente_id AND tipo_caixa = 'G';

    IF COALESCE(v_saldo, 0) < NEW.caixas_g THEN
      RAISE EXCEPTION 'Retorno de caixas G (%) excede saldo disponível (%)', NEW.caixas_g, COALESCE(v_saldo, 0);
    END IF;
  END IF;

  IF NEW.caixas_i > 0 THEN
    SELECT COALESCE(saldo, 0) INTO v_saldo
    FROM public.v_saldo_caixas_cliente
    WHERE cliente_id = NEW.cliente_id AND tipo_caixa = 'I';

    IF COALESCE(v_saldo, 0) < NEW.caixas_i THEN
      RAISE EXCEPTION 'Retorno de caixas I (%) excede saldo disponível (%)', NEW.caixas_i, COALESCE(v_saldo, 0);
    END IF;
  END IF;

  IF NEW.caixas_p > 0 THEN
    SELECT COALESCE(saldo, 0) INTO v_saldo
    FROM public.v_saldo_caixas_cliente
    WHERE cliente_id = NEW.cliente_id AND tipo_caixa = 'P';

    IF COALESCE(v_saldo, 0) < NEW.caixas_p THEN
      RAISE EXCEPTION 'Retorno de caixas P (%) excede saldo disponível (%)', NEW.caixas_p, COALESCE(v_saldo, 0);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_retorno_saldo ON public.retornos_caixa;
CREATE TRIGGER trg_check_retorno_saldo
  BEFORE INSERT ON public.retornos_caixa
  FOR EACH ROW EXECUTE FUNCTION public.check_retorno_saldo();
