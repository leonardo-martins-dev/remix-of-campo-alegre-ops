-- NOP-129 — posições de caixa dos motoristas.
-- Migration separada de 00042 porque o valor 'motorista' do enum
-- tipo_posicao_caixa só pode ser usado depois do commit que o criou.

INSERT INTO public.posicoes_caixa (tipo, ref_id)
SELECT 'motorista'::public.tipo_posicao_caixa, m.id
FROM public.motoristas m
ON CONFLICT (tipo, ref_id) DO NOTHING;

-- Posição de trânsito sem motorista: veículo do fornecedor.
INSERT INTO public.posicoes_caixa (tipo, ref_id)
VALUES ('motorista'::public.tipo_posicao_caixa, NULL)
ON CONFLICT (tipo, ref_id) DO NOTHING;

-- Novos motoristas passam a ganhar posição automaticamente.
CREATE OR REPLACE FUNCTION public.ensure_posicao_on_master()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'clientes' THEN
    PERFORM public.ensure_posicao('cliente', NEW.id);
  ELSIF TG_TABLE_NAME = 'fornecedores' THEN
    PERFORM public.ensure_posicao('fornecedor', NEW.id);
  ELSIF TG_TABLE_NAME = 'motoristas' THEN
    PERFORM public.ensure_posicao('motorista', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posicao_motorista ON public.motoristas;
CREATE TRIGGER trg_posicao_motorista
  AFTER INSERT ON public.motoristas
  FOR EACH ROW EXECUTE FUNCTION public.ensure_posicao_on_master();

NOTIFY pgrst, 'reload schema';
