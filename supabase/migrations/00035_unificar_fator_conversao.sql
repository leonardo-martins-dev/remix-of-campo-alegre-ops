-- ============================================================
-- Unifica "unidades por caixa": fonte = conversoes_* (NOP-22)
-- Expedição deixa de depender só de produtos.unidades_por_caixa
-- ============================================================

-- Fator padrão do produto: 1º tipo de caixa ativo (ordem), senão coluna legada
CREATE OR REPLACE FUNCTION public.fator_padrao_produto(p_produto_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT c.fator::NUMERIC
      FROM public.conversoes_produto_caixa c
      JOIN public.tipos_caixa t ON t.id = c.tipo_caixa_id
      WHERE c.produto_id = p_produto_id
        AND c.ativo IS TRUE
        AND t.ativo IS TRUE
      ORDER BY t.ordem NULLS LAST, t.sigla
      LIMIT 1
    ),
    (SELECT p.unidades_por_caixa FROM public.produtos p WHERE p.id = p_produto_id)
  );
$$;

COMMENT ON FUNCTION public.fator_padrao_produto(UUID) IS
  'Fator un/cx para expedição: conversoes_produto_caixa (tipo por ordem) com fallback em produtos.unidades_por_caixa';

GRANT EXECUTE ON FUNCTION public.fator_padrao_produto(UUID) TO authenticated;

-- ------------------------------------------------------------
-- Views de expedição: leem o fator unificado
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
  public.fator_padrao_produto(p.id) AS unidades_por_caixa,
  fp.nome AS familia_nome,
  SUM(ri.quantidade_romaneio) AS quantidade_total,
  SUM(ri.quantidade_real) AS quantidade_separada,
  public.calcular_caixas_sugeridas(
    SUM(ri.quantidade_romaneio),
    public.fator_padrao_produto(p.id)
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
GROUP BY cg.data_carga, r.id, r.nome, ri.produto_id, p.id, p.nome, p.unidade, fp.nome, fp.ordem
ORDER BY fp.ordem NULLS LAST, fp.nome NULLS LAST, p.nome;

GRANT SELECT ON public.v_produtos_por_rota TO authenticated;

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
    SELECT COALESCE(SUM(
      public.calcular_caixas_sugeridas(
        ri.quantidade_romaneio,
        public.fator_padrao_produto(ri.produto_id)
      )
    ), 0)::INT
    FROM public.romaneio_itens ri
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
  public.fator_padrao_produto(p.id) AS unidades_por_caixa,
  fp.nome AS familia_nome,
  public.calcular_caixas_sugeridas(
    ri.quantidade_romaneio,
    public.fator_padrao_produto(p.id)
  ) AS caixas_sugeridas
FROM public.romaneio_itens ri
JOIN public.produtos p ON p.id = ri.produto_id
LEFT JOIN public.familias_produto fp ON fp.id = p.familia_id
ORDER BY fp.ordem NULLS LAST, fp.nome NULLS LAST, p.nome;

GRANT SELECT ON public.v_romaneio_com_caixas TO authenticated;

COMMENT ON COLUMN public.produtos.unidades_por_caixa IS
  'LEGADO. Preferir conversoes_produto_caixa / conversao UI. Mantido só como fallback do fator_padrao_produto.';
