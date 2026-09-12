-- ============================================================
-- NOP-12: Caixas por item na conferência (sugerido × real)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela: caixas por item de conferência
-- Permite múltiplos tipos de caixa por item (ex: 30 Amarela + 5 Vermelha)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.caixas_item_conferencia (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_conferencia_id UUID NOT NULL REFERENCES public.itens_conferencia(id) ON DELETE CASCADE,
  tipo_caixa_id       UUID NOT NULL REFERENCES public.tipos_caixa(id) ON DELETE CASCADE,
  tipo_caixa_sigla    TEXT NOT NULL,
  qtd_sugerida        INT NOT NULL DEFAULT 0,
  qtd_real            INT NOT NULL DEFAULT 0,
  fator_usado         INT,
  registrado_por      UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_caixa_item_tipo UNIQUE (item_conferencia_id, tipo_caixa_id)
);

CREATE INDEX idx_caixa_item_conferencia ON public.caixas_item_conferencia (item_conferencia_id);
CREATE INDEX idx_caixa_item_tipo ON public.caixas_item_conferencia (tipo_caixa_id);

-- ------------------------------------------------------------
-- 2. Trigger updated_at
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_caixas_item_conferencia ON public.caixas_item_conferencia;
CREATE TRIGGER set_updated_at_caixas_item_conferencia
  BEFORE UPDATE ON public.caixas_item_conferencia
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- 3. RLS Policies
-- ------------------------------------------------------------
ALTER TABLE public.caixas_item_conferencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY caixas_item_conferencia_select_auth ON public.caixas_item_conferencia
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY caixas_item_conferencia_insert_auth ON public.caixas_item_conferencia
  FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY caixas_item_conferencia_update_auth ON public.caixas_item_conferencia
  FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY caixas_item_conferencia_delete_admin ON public.caixas_item_conferencia
  FOR DELETE USING (public.is_admin());

-- ------------------------------------------------------------
-- 4. View: Fator real por item/entrega
-- fator_real = quantidade_recebida ÷ total de caixas reais
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_fator_real_item
WITH (security_invoker = true) AS
SELECT
  ic.id AS item_conferencia_id,
  ic.conferencia_id,
  c.pedido_id,
  ip.produto_id,
  p.nome AS produto_nome,
  ic.quantidade_recebida,
  COALESCE(SUM(cic.qtd_real), 0) AS total_caixas_reais,
  CASE 
    WHEN COALESCE(SUM(cic.qtd_real), 0) = 0 THEN NULL
    ELSE ROUND(ic.quantidade_recebida / NULLIF(SUM(cic.qtd_real), 0)::NUMERIC, 2)
  END AS fator_real,
  jsonb_agg(
    jsonb_build_object(
      'tipo_caixa_sigla', cic.tipo_caixa_sigla,
      'qtd_sugerida', cic.qtd_sugerida,
      'qtd_real', cic.qtd_real,
      'fator_usado', cic.fator_usado
    ) ORDER BY cic.tipo_caixa_sigla
  ) FILTER (WHERE cic.id IS NOT NULL) AS detalhes_caixas
FROM public.itens_conferencia ic
JOIN public.conferencias c ON c.id = ic.conferencia_id
JOIN public.itens_pedido ip ON ip.id = ic.item_pedido_id
LEFT JOIN public.produtos p ON p.id = ip.produto_id
LEFT JOIN public.caixas_item_conferencia cic ON cic.item_conferencia_id = ic.id
GROUP BY ic.id, ic.conferencia_id, c.pedido_id, ip.produto_id, p.nome, ic.quantidade_recebida;

GRANT SELECT ON public.v_fator_real_item TO authenticated;

-- ------------------------------------------------------------
-- 5. View: Resumo de caixas por conferência (agregado)
-- Para usar no movimento de caixas fornecedor → galpão
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_caixas_conferencia_resumo
WITH (security_invoker = true) AS
SELECT
  c.id AS conferencia_id,
  c.pedido_id,
  pr.fornecedor_id,
  cic.tipo_caixa_id,
  cic.tipo_caixa_sigla,
  SUM(cic.qtd_sugerida) AS total_sugerido,
  SUM(cic.qtd_real) AS total_real
FROM public.conferencias c
JOIN public.pedidos_recebimento pr ON pr.id = c.pedido_id
JOIN public.itens_conferencia ic ON ic.conferencia_id = c.id
JOIN public.caixas_item_conferencia cic ON cic.item_conferencia_id = ic.id
GROUP BY c.id, c.pedido_id, pr.fornecedor_id, cic.tipo_caixa_id, cic.tipo_caixa_sigla;

GRANT SELECT ON public.v_caixas_conferencia_resumo TO authenticated;

-- ------------------------------------------------------------
-- 6. Function: Obter fator real por item e entrega
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fator_real(
  p_item_conferencia_id UUID
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT fator_real FROM public.v_fator_real_item WHERE item_conferencia_id = p_item_conferencia_id;
$$;

CREATE OR REPLACE FUNCTION public.get_fator_real_by_pedido_produto(
  p_pedido_id UUID,
  p_produto_id UUID
)
RETURNS TABLE (
  conferencia_id UUID,
  item_conferencia_id UUID,
  quantidade_recebida NUMERIC,
  total_caixas_reais NUMERIC,
  fator_real NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT 
    v.conferencia_id,
    v.item_conferencia_id,
    v.quantidade_recebida,
    v.total_caixas_reais,
    v.fator_real
  FROM public.v_fator_real_item v
  WHERE v.pedido_id = p_pedido_id AND v.produto_id = p_produto_id
  ORDER BY v.conferencia_id;
$$;
