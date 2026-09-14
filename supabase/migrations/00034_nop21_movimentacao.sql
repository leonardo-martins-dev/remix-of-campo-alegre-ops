-- NOP-21: Unify Retorno + Fornecedor + Motorista → Movimentação de Caixas
-- Adds unified menu page and deactivates the three legacy entries.

DO $$
DECLARE
  v_ordem int;
BEGIN
  SELECT ordem INTO v_ordem FROM public.pages WHERE slug = 'caixas/retorno' LIMIT 1;
  v_ordem := COALESCE(v_ordem, 10);

  INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo)
  VALUES ('caixas/movimentacao', 'Movimentação', 'Caixas', 'RotateCcw', v_ordem, true)
  ON CONFLICT (slug) DO UPDATE
    SET ativo = true, nome = EXCLUDED.nome, icone = EXCLUDED.icone, ordem = EXCLUDED.ordem;

  UPDATE public.pages SET ativo = false
  WHERE slug IN ('caixas/retorno', 'caixas/fornecedor', 'caixas/motorista');
END $$;
