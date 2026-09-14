-- ============================================================
-- NOP-20 — Vales lifecycle: Pendente → Aplicado → Lançado / Recusado
-- Adds "lancado" status, batch-apply RPC, mark-launched RPC,
-- and updates the fornecedor summary view.
-- ============================================================

-- 1. Add enum value
ALTER TYPE public.status_vale ADD VALUE IF NOT EXISTS 'lancado';

-- 2. New columns on solicitacoes_vale
ALTER TABLE public.solicitacoes_vale
  ADD COLUMN IF NOT EXISTS lancado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lancado_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS ref_wise    TEXT;

-- 3. RPC: marcar_vale_lancado (admin only, aplicado → lancado)
CREATE OR REPLACE FUNCTION public.marcar_vale_lancado(
  p_vale_id  UUID,
  p_ref_wise TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem marcar vales como lançados';
  END IF;

  UPDATE public.solicitacoes_vale
  SET
    status      = 'lancado'::public.status_vale,
    ref_wise    = COALESCE(p_ref_wise, ref_wise),
    lancado_por = auth.uid(),
    lancado_em  = now(),
    updated_at  = now()
  WHERE id = p_vale_id
    AND status = 'aplicado'::public.status_vale
  RETURNING * INTO v_sol;

  IF v_sol.id IS NULL THEN
    RAISE EXCEPTION 'Vale não encontrado ou não está aplicado';
  END IF;

  RETURN to_jsonb(v_sol);
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_vale_lancado(UUID, TEXT) TO authenticated;

-- 4. RPC: aplicar_vales_lote (admin only, batch apply from pendente)
CREATE OR REPLACE FUNCTION public.aplicar_vales_lote(
  p_vale_ids UUID[],
  p_valores  JSONB DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_val NUMERIC;
  v_count INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem aplicar vales em lote';
  END IF;

  FOREACH v_id IN ARRAY p_vale_ids LOOP
    -- Optional per-id valor override from JSONB {"<uuid>": <valor>}
    v_val := NULL;
    IF p_valores IS NOT NULL AND p_valores ? v_id::text THEN
      v_val := (p_valores ->> v_id::text)::NUMERIC;
    END IF;

    UPDATE public.solicitacoes_vale
    SET
      status      = 'aplicado'::public.status_vale,
      valor_final = COALESCE(v_val, valor_calculado),
      decidido_por = auth.uid(),
      decidido_em  = now(),
      updated_at   = now()
    WHERE id = v_id
      AND status = 'pendente'::public.status_vale;

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('aplicados', v_count, 'total', array_length(p_vale_ids, 1));
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_vales_lote(UUID[], JSONB) TO authenticated;

-- 5. Update the fornecedor summary view to include lancados
DROP VIEW IF EXISTS public.v_vales_por_fornecedor;
CREATE VIEW public.v_vales_por_fornecedor
WITH (security_invoker = true) AS
SELECT
  f.id   AS fornecedor_id,
  f.nome AS fornecedor,
  COUNT(*) FILTER (WHERE sv.status = 'pendente')  AS pendentes,
  COUNT(*) FILTER (WHERE sv.status = 'aplicado')  AS aplicados,
  COUNT(*) FILTER (WHERE sv.status = 'lancado')   AS lancados,
  COUNT(*) FILTER (WHERE sv.status = 'recusado')  AS recusados,
  COALESCE(SUM(sv.valor_final)     FILTER (WHERE sv.status = 'aplicado'), 0) AS valor_aplicado,
  COALESCE(SUM(sv.valor_final)     FILTER (WHERE sv.status = 'lancado'),  0) AS valor_lancado,
  COALESCE(SUM(sv.valor_calculado) FILTER (WHERE sv.status = 'pendente'), 0) AS valor_pendente
FROM public.fornecedores f
LEFT JOIN public.solicitacoes_vale sv ON sv.fornecedor_id = f.id
WHERE f.ativo = TRUE
GROUP BY f.id, f.nome;

GRANT SELECT ON public.v_vales_por_fornecedor TO authenticated;

-- 6. Rename menu entry from "Vales pendentes" to "Vales", place after Liberações (ordem 5)
UPDATE public.pages
SET nome  = 'Vales',
    ordem = 5
WHERE slug = 'recebimento/vales';
