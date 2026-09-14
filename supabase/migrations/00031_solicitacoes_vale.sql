-- ============================================================
-- NOP-13 — Solicitação de vale/desconto ao ADM por recebimento
-- Conferente pode solicitar vale quando received < ordered.
-- ADM aplica ou recusa. Histórico vai para fornecedor.
-- ============================================================

-- Status do vale
DO $$ BEGIN
  CREATE TYPE public.status_vale AS ENUM ('pendente', 'aplicado', 'recusado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tabela principal de solicitações de vale
CREATE TABLE IF NOT EXISTS public.solicitacoes_vale (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id           UUID NOT NULL REFERENCES public.pedidos_recebimento(id),
  item_conferencia_id UUID REFERENCES public.itens_conferencia(id),
  fornecedor_id       UUID NOT NULL REFERENCES public.fornecedores(id),
  conferente_id       UUID NOT NULL REFERENCES public.profiles(id),
  
  -- Dados do item
  produto_nome        TEXT,
  quantidade_pedida   NUMERIC(10,2) NOT NULL,
  quantidade_recebida NUMERIC(10,2) NOT NULL,
  diferenca           NUMERIC(10,2) NOT NULL,
  preco_unitario      NUMERIC(12,2),
  
  -- Valores
  valor_calculado     NUMERIC(12,2) NOT NULL,
  valor_final         NUMERIC(12,2),
  estimado            BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Observações
  observacao_conferente TEXT,
  
  -- Decisão
  status              public.status_vale NOT NULL DEFAULT 'pendente',
  motivo_recusa       TEXT,
  decidido_por        UUID REFERENCES public.profiles(id),
  decidido_em         TIMESTAMPTZ,
  
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vales_pedido ON public.solicitacoes_vale (pedido_id);
CREATE INDEX IF NOT EXISTS idx_vales_fornecedor ON public.solicitacoes_vale (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_vales_conferente ON public.solicitacoes_vale (conferente_id);
CREATE INDEX IF NOT EXISTS idx_vales_status ON public.solicitacoes_vale (status);
CREATE INDEX IF NOT EXISTS idx_vales_created ON public.solicitacoes_vale (created_at DESC);

-- Fotos anexas à solicitação
CREATE TABLE IF NOT EXISTS public.solicitacoes_vale_fotos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_vale_id UUID NOT NULL REFERENCES public.solicitacoes_vale(id) ON DELETE CASCADE,
  url                 TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vale_fotos_solicitacao ON public.solicitacoes_vale_fotos (solicitacao_vale_id);

-- Trigger para updated_at
CREATE TRIGGER set_updated_at_solicitacoes_vale
  BEFORE UPDATE ON public.solicitacoes_vale
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.solicitacoes_vale ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_vale_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY solicitacoes_vale_select_auth ON public.solicitacoes_vale
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY solicitacoes_vale_insert_auth ON public.solicitacoes_vale
  FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY solicitacoes_vale_update_auth ON public.solicitacoes_vale
  FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY solicitacoes_vale_delete_admin ON public.solicitacoes_vale
  FOR DELETE USING (public.is_admin());

CREATE POLICY solicitacoes_vale_fotos_select_auth ON public.solicitacoes_vale_fotos
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY solicitacoes_vale_fotos_insert_auth ON public.solicitacoes_vale_fotos
  FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY solicitacoes_vale_fotos_delete_admin ON public.solicitacoes_vale_fotos
  FOR DELETE USING (public.is_admin());

-- RPC para aplicar vale (admin only)
CREATE OR REPLACE FUNCTION public.aplicar_vale(
  p_solicitacao_id UUID,
  p_valor_final NUMERIC
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
    RAISE EXCEPTION 'Apenas administradores podem aplicar vales';
  END IF;

  UPDATE public.solicitacoes_vale
  SET
    status = 'aplicado'::public.status_vale,
    valor_final = p_valor_final,
    decidido_por = auth.uid(),
    decidido_em = now(),
    updated_at = now()
  WHERE id = p_solicitacao_id
    AND status = 'pendente'::public.status_vale
  RETURNING * INTO v_sol;

  IF v_sol.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou já processada';
  END IF;

  RETURN to_jsonb(v_sol);
END;
$$;

-- RPC para recusar vale (admin only)
CREATE OR REPLACE FUNCTION public.recusar_vale(
  p_solicitacao_id UUID,
  p_motivo TEXT
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
    RAISE EXCEPTION 'Apenas administradores podem recusar vales';
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'Motivo obrigatório para recusar vale';
  END IF;

  UPDATE public.solicitacoes_vale
  SET
    status = 'recusado'::public.status_vale,
    motivo_recusa = p_motivo,
    decidido_por = auth.uid(),
    decidido_em = now(),
    updated_at = now()
  WHERE id = p_solicitacao_id
    AND status = 'pendente'::public.status_vale
  RETURNING * INTO v_sol;

  IF v_sol.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou já processada';
  END IF;

  RETURN to_jsonb(v_sol);
END;
$$;

-- View para resumo de vales por fornecedor
CREATE OR REPLACE VIEW public.v_vales_por_fornecedor
WITH (security_invoker = true) AS
SELECT
  f.id AS fornecedor_id,
  f.nome AS fornecedor,
  COUNT(*) FILTER (WHERE sv.status = 'pendente') AS pendentes,
  COUNT(*) FILTER (WHERE sv.status = 'aplicado') AS aplicados,
  COUNT(*) FILTER (WHERE sv.status = 'recusado') AS recusados,
  COALESCE(SUM(sv.valor_final) FILTER (WHERE sv.status = 'aplicado'), 0) AS valor_aplicado,
  COALESCE(SUM(sv.valor_calculado) FILTER (WHERE sv.status = 'pendente'), 0) AS valor_pendente
FROM public.fornecedores f
LEFT JOIN public.solicitacoes_vale sv ON sv.fornecedor_id = f.id
WHERE f.ativo = TRUE
GROUP BY f.id, f.nome;

GRANT SELECT ON public.v_vales_por_fornecedor TO authenticated;

-- Página no menu admin
INSERT INTO public.pages (slug, nome, grupo, icone, ordem) VALUES
  ('recebimento/vales', 'Vales pendentes', 'Recebimento', 'Receipt', 4)
ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, grupo = EXCLUDED.grupo, ordem = EXCLUDED.ordem;
