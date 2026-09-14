-- ============================================================
-- NOP-17 — Expedição: Separação por Rota
-- Filtro rota → supermercado com sugestão de caixas
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extensão da tabela rotas
-- ------------------------------------------------------------
ALTER TABLE public.rotas
  ADD COLUMN IF NOT EXISTS dias_semana TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS motorista_padrao_id UUID REFERENCES public.motoristas(id),
  ADD COLUMN IF NOT EXISTS caminhao_padrao_id UUID REFERENCES public.caminhoes(id),
  ADD COLUMN IF NOT EXISTS ordem INT DEFAULT 0;

COMMENT ON COLUMN public.rotas.dias_semana IS 'Array de dias: seg, ter, qua, qui, sex, sab, dom';

-- ------------------------------------------------------------
-- 2. Alocação de supermercado (cliente) à rota
-- ------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS rota_id UUID REFERENCES public.rotas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_rota ON public.clientes (rota_id) WHERE rota_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Status de separação por loja na carga
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.status_separacao_loja AS ENUM ('pendente', 'separado', 'carregado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.cargas
  ADD COLUMN IF NOT EXISTS status_separacao public.status_separacao_loja DEFAULT 'pendente';

-- ------------------------------------------------------------
-- 4. Função para calcular sugestão de caixas baseado no fator do produto
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_caixas_sugeridas(
  p_quantidade NUMERIC,
  p_unidades_por_caixa NUMERIC
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN COALESCE(p_unidades_por_caixa, 0) <= 0 THEN CEIL(p_quantidade)::INT
    ELSE CEIL(p_quantidade / p_unidades_por_caixa)::INT
  END;
$$;

-- ------------------------------------------------------------
-- 5. View: Supermercados por rota (inclui "Sem rota")
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_clientes_por_rota
WITH (security_invoker = true) AS
SELECT
  COALESCE(r.id, '00000000-0000-0000-0000-000000000000'::uuid) AS rota_id,
  COALESCE(r.nome, 'Sem rota') AS rota_nome,
  r.dias_semana,
  r.ativo AS rota_ativa,
  c.id AS cliente_id,
  c.nome AS cliente_nome,
  c.ativo AS cliente_ativo
FROM public.clientes c
LEFT JOIN public.rotas r ON r.id = c.rota_id
WHERE c.ativo = TRUE
ORDER BY r.ordem NULLS LAST, r.nome NULLS LAST, c.nome;

GRANT SELECT ON public.v_clientes_por_rota TO authenticated;

-- ------------------------------------------------------------
-- 6. View: Cargas do dia por rota com totais de produto
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_expedicao_por_rota
WITH (security_invoker = true) AS
SELECT
  cg.data_carga,
  COALESCE(r.id, '00000000-0000-0000-0000-000000000000'::uuid) AS rota_id,
  COALESCE(r.nome, 'Sem rota') AS rota_nome,
  r.dias_semana,
  r.motorista_padrao_id,
  r.caminhao_padrao_id,
  COUNT(DISTINCT cg.id) AS total_cargas,
  COUNT(DISTINCT cg.cliente_id) AS total_lojas,
  SUM(CASE WHEN cg.status_separacao = 'carregado' THEN 1 ELSE 0 END)::INT AS lojas_carregadas,
  SUM(CASE WHEN cg.status_separacao = 'separado' THEN 1 ELSE 0 END)::INT AS lojas_separadas
FROM public.cargas cg
JOIN public.clientes c ON c.id = cg.cliente_id
LEFT JOIN public.rotas r ON r.id = c.rota_id
WHERE cg.data_carga = public.today_brt()
  AND cg.status IN ('aguardando', 'carregando')
GROUP BY cg.data_carga, r.id, r.nome, r.dias_semana, r.motorista_padrao_id, r.caminhao_padrao_id, r.ordem
ORDER BY r.ordem NULLS LAST, r.nome NULLS LAST;

GRANT SELECT ON public.v_expedicao_por_rota TO authenticated;

-- ------------------------------------------------------------
-- 7. View: Produtos agregados por rota (total a separar)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_produtos_por_rota
WITH (security_invoker = true) AS
SELECT
  cg.data_carga,
  COALESCE(r.id, '00000000-0000-0000-0000-000000000000'::uuid) AS rota_id,
  COALESCE(r.nome, 'Sem rota') AS rota_nome,
  ri.produto_id,
  p.nome AS produto_nome,
  p.unidade,
  p.unidades_por_caixa,
  fp.nome AS familia_nome,
  SUM(ri.quantidade_romaneio) AS quantidade_total,
  SUM(ri.quantidade_real) AS quantidade_separada,
  public.calcular_caixas_sugeridas(
    SUM(ri.quantidade_romaneio),
    p.unidades_por_caixa
  ) AS caixas_sugeridas,
  COUNT(DISTINCT cg.cliente_id) AS num_lojas
FROM public.cargas cg
JOIN public.clientes c ON c.id = cg.cliente_id
LEFT JOIN public.rotas r ON r.id = c.rota_id
JOIN public.romaneio_itens ri ON ri.carga_id = cg.id
JOIN public.produtos p ON p.id = ri.produto_id
LEFT JOIN public.familias_produto fp ON fp.id = p.familia_id
WHERE cg.data_carga = public.today_brt()
  AND cg.status IN ('aguardando', 'carregando')
GROUP BY cg.data_carga, r.id, r.nome, ri.produto_id, p.id, p.nome, p.unidade, p.unidades_por_caixa, fp.nome, fp.ordem
ORDER BY fp.ordem NULLS LAST, fp.nome NULLS LAST, p.nome;

GRANT SELECT ON public.v_produtos_por_rota TO authenticated;

-- ------------------------------------------------------------
-- 8. View: Detalhamento por loja dentro da rota
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_carga_loja_rota
WITH (security_invoker = true) AS
SELECT
  cg.id AS carga_id,
  cg.codigo AS carga_codigo,
  cg.data_carga,
  cg.status AS carga_status,
  cg.status_separacao,
  COALESCE(r.id, '00000000-0000-0000-0000-000000000000'::uuid) AS rota_id,
  COALESCE(r.nome, 'Sem rota') AS rota_nome,
  c.id AS cliente_id,
  c.nome AS cliente_nome,
  m.nome AS motorista_nome,
  cm.placa AS caminhao_placa,
  (
    SELECT COUNT(*) 
    FROM public.romaneio_itens ri 
    WHERE ri.carga_id = cg.id
  )::INT AS total_itens,
  (
    SELECT SUM(ri.quantidade_romaneio)
    FROM public.romaneio_itens ri
    WHERE ri.carga_id = cg.id
  ) AS quantidade_total,
  (
    SELECT public.calcular_caixas_sugeridas(
      SUM(ri.quantidade_romaneio),
      AVG(p.unidades_por_caixa)
    )
    FROM public.romaneio_itens ri
    JOIN public.produtos p ON p.id = ri.produto_id
    WHERE ri.carga_id = cg.id
  ) AS caixas_sugeridas
FROM public.cargas cg
JOIN public.clientes c ON c.id = cg.cliente_id
LEFT JOIN public.rotas r ON r.id = c.rota_id
LEFT JOIN public.motoristas m ON m.id = cg.motorista_id
LEFT JOIN public.caminhoes cm ON cm.id = cg.caminhao_id
WHERE cg.data_carga = public.today_brt()
  AND cg.status IN ('aguardando', 'carregando')
ORDER BY r.ordem NULLS LAST, r.nome NULLS LAST, c.nome;

GRANT SELECT ON public.v_carga_loja_rota TO authenticated;

-- ------------------------------------------------------------
-- 9. View: Itens de uma carga com sugestão de caixas
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_romaneio_com_caixas
WITH (security_invoker = true) AS
SELECT
  ri.id,
  ri.carga_id,
  ri.produto_id,
  ri.quantidade_romaneio,
  ri.quantidade_real,
  ri.status,
  ri.caixas,
  p.nome AS produto_nome,
  p.unidade,
  p.unidades_por_caixa,
  fp.nome AS familia_nome,
  public.calcular_caixas_sugeridas(ri.quantidade_romaneio, p.unidades_por_caixa) AS caixas_sugeridas
FROM public.romaneio_itens ri
JOIN public.produtos p ON p.id = ri.produto_id
LEFT JOIN public.familias_produto fp ON fp.id = p.familia_id
ORDER BY fp.ordem NULLS LAST, fp.nome NULLS LAST, p.nome;

GRANT SELECT ON public.v_romaneio_com_caixas TO authenticated;

-- ------------------------------------------------------------
-- 10. RPC: Atualizar status de separação da carga (por loja)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_status_separacao(
  p_carga_id UUID,
  p_status public.status_separacao_loja
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cargas
  SET status_separacao = p_status,
      updated_at = now()
  WHERE id = p_carga_id;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_status_separacao(UUID, public.status_separacao_loja) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_status_separacao(UUID, public.status_separacao_loja) TO authenticated;

-- ------------------------------------------------------------
-- 11. Página no menu
-- ------------------------------------------------------------
INSERT INTO public.pages (slug, nome, grupo, icone, ordem) VALUES
  ('expedicao/rotas', 'Expedição por Rota', 'Expedição', 'Route', 7)
ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, grupo = EXCLUDED.grupo, ordem = EXCLUDED.ordem;

-- ------------------------------------------------------------
-- 12. Triggers para updated_at em rotas
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_rotas ON public.rotas;

ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TRIGGER set_updated_at_rotas
  BEFORE UPDATE ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
