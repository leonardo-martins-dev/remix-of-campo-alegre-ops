-- NOP-18: Custos Operacionais - Painel cruzando caixas, recebimento, quebra e inventário
-- Agregação de custos por fornecedor, supermercado, rota, motorista e tipo de caixa

-- ------------------------------------------------------------
-- 1. View de perda de caixas por ajuste de inventário
-- (divergências conciliadas onde o motivo entra em custo)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_custo_perda_caixas;
CREATE VIEW public.v_custo_perda_caixas
WITH (security_invoker = true) AS
SELECT
  m.id AS movimento_id,
  m.data_movimento,
  m.tipo_caixa,
  m.quantidade,
  tc.custo_unitario,
  m.quantidade * COALESCE(tc.custo_unitario, 0) AS valor_perda,
  p.tipo AS posicao_tipo,
  p.ref_id AS posicao_ref_id,
  CASE
    WHEN p.tipo = 'fornecedor' THEN f.id
    ELSE NULL
  END AS fornecedor_id,
  CASE
    WHEN p.tipo = 'fornecedor' THEN f.nome
    ELSE NULL
  END AS fornecedor_nome,
  CASE
    WHEN p.tipo = 'cliente' THEN c.id
    ELSE NULL
  END AS cliente_id,
  CASE
    WHEN p.tipo = 'cliente' THEN c.nome
    ELSE NULL
  END AS cliente_nome,
  CASE
    WHEN p.tipo = 'galpao' THEN 'Galpão'
    WHEN p.tipo = 'fornecedor' THEN f.nome
    WHEN p.tipo = 'cliente' THEN c.nome
    ELSE 'Desconhecido'
  END AS posicao_nome,
  cc.id AS contagem_id,
  ma.nome AS motivo_nome,
  ma.entra_em_custo
FROM public.movimentacoes_caixa m
LEFT JOIN public.tipos_caixa tc ON tc.sigla = m.tipo_caixa
LEFT JOIN public.posicoes_caixa p ON p.id = m.origem_posicao_id
LEFT JOIN public.fornecedores f ON p.tipo = 'fornecedor' AND f.id = p.ref_id
LEFT JOIN public.clientes c ON p.tipo = 'cliente' AND c.id = p.ref_id
LEFT JOIN public.contagens_caixa cc ON m.documento_tipo = 'inventario' AND m.documento_id = cc.id
LEFT JOIN public.motivos_ajuste_caixa ma ON cc.motivo_id = ma.id
WHERE m.natureza = 'perda'
   OR (m.documento_tipo = 'inventario' AND m.origem_posicao_id IS NOT NULL AND COALESCE(ma.entra_em_custo, FALSE) = TRUE);

GRANT SELECT ON public.v_custo_perda_caixas TO authenticated;

-- ------------------------------------------------------------
-- 2. View de perda de caixas por rota/motorista (via cargas)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_custo_perda_rota;
CREATE VIEW public.v_custo_perda_rota
WITH (security_invoker = true) AS
SELECT
  cg.id AS carga_id,
  cg.codigo AS carga_codigo,
  cg.data_carga,
  cg.rota_id,
  r.nome AS rota_nome,
  cg.motorista_id,
  mot.nome AS motorista_nome,
  cg.cliente_id,
  cl.nome AS cliente_nome,
  COALESCE(SUM(vp.valor_perda), 0) AS valor_perda_total,
  COALESCE(SUM(vp.quantidade), 0) AS caixas_perdidas
FROM public.cargas cg
LEFT JOIN public.rotas r ON r.id = cg.rota_id
LEFT JOIN public.motoristas mot ON mot.id = cg.motorista_id
LEFT JOIN public.clientes cl ON cl.id = cg.cliente_id
LEFT JOIN public.v_custo_perda_caixas vp ON vp.cliente_id = cg.cliente_id
  AND vp.data_movimento >= cg.data_carga
  AND vp.data_movimento <= cg.data_carga + INTERVAL '7 days'
GROUP BY cg.id, cg.codigo, cg.data_carga, cg.rota_id, r.nome, cg.motorista_id, mot.nome, cg.cliente_id, cl.nome;

GRANT SELECT ON public.v_custo_perda_rota TO authenticated;

-- ------------------------------------------------------------
-- 3. View de custos de recebimento (divergências valorizadas)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_custo_recebimento;
CREATE VIEW public.v_custo_recebimento
WITH (security_invoker = true) AS
SELECT
  ic.id AS item_conferencia_id,
  pr.id AS pedido_id,
  pr.codigo AS pedido_codigo,
  pr.data_pedido,
  pr.fornecedor_id,
  forn.nome AS fornecedor_nome,
  ic.divergencia,
  ic.quantidade_divergencia,
  COALESCE(ic.valor_divergencia, ic.quantidade_divergencia * COALESCE(ip.preco_unitario, 4.5)) AS valor_divergencia,
  ic.dentro_tolerancia,
  ip.quantidade_pedida,
  ic.quantidade_recebida,
  prod.id AS produto_id,
  prod.nome AS produto_nome
FROM public.itens_conferencia ic
JOIN public.conferencias conf ON conf.id = ic.conferencia_id AND conf.status = 'finalizada'
JOIN public.itens_pedido ip ON ip.id = ic.item_pedido_id
JOIN public.pedidos_recebimento pr ON pr.id = ip.pedido_id
JOIN public.fornecedores forn ON forn.id = pr.fornecedor_id
LEFT JOIN public.produtos prod ON prod.id = ip.produto_id
WHERE ic.divergencia IS NOT NULL
  AND pr.status IN ('recebido', 'encerrado', 'parcial');

GRANT SELECT ON public.v_custo_recebimento TO authenticated;

-- ------------------------------------------------------------
-- 4. View de custos de quebra por fornecedor
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_custo_quebra;
CREATE VIEW public.v_custo_quebra
WITH (security_invoker = true) AS
SELECT
  q.id AS quebra_id,
  q.fornecedor_id,
  forn.nome AS fornecedor_nome,
  q.registrado_em,
  DATE(q.registrado_em) AS data_quebra,
  qi.id AS item_id,
  qi.produto_id,
  prod.nome AS produto_nome,
  qi.quantidade,
  COALESCE(qi.valor, qi.quantidade * COALESCE(qi.preco_unitario, 4.5)) AS valor,
  qi.estimado
FROM public.quebras q
JOIN public.fornecedores forn ON forn.id = q.fornecedor_id
JOIN public.quebra_itens qi ON qi.quebra_id = q.id
LEFT JOIN public.produtos prod ON prod.id = qi.produto_id
WHERE q.status != 'removido';

GRANT SELECT ON public.v_custo_quebra TO authenticated;

-- ------------------------------------------------------------
-- 5. View de fator real vs cadastrado
-- (desvio médio por fornecedor × produto)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_fator_real_desvio;
CREATE VIEW public.v_fator_real_desvio
WITH (security_invoker = true) AS
SELECT
  pr.fornecedor_id,
  forn.nome AS fornecedor_nome,
  ip.produto_id,
  prod.nome AS produto_nome,
  prod.unidade,
  COUNT(*) AS entregas,
  SUM(ip.quantidade_pedida) AS total_pedido,
  SUM(COALESCE(sip.recebido_acumulado, 0)) AS total_recebido,
  CASE
    WHEN SUM(ip.quantidade_pedida) > 0
    THEN ROUND((SUM(COALESCE(sip.recebido_acumulado, 0)) / SUM(ip.quantidade_pedida) - 1) * 100, 2)
    ELSE 0
  END AS desvio_pct,
  ABS(SUM(ip.quantidade_pedida) - SUM(COALESCE(sip.recebido_acumulado, 0))) AS diferenca_absoluta
FROM public.itens_pedido ip
JOIN public.pedidos_recebimento pr ON pr.id = ip.pedido_id
JOIN public.fornecedores forn ON forn.id = pr.fornecedor_id
LEFT JOIN public.produtos prod ON prod.id = ip.produto_id
LEFT JOIN public.v_saldo_item_pedido sip ON sip.item_pedido_id = ip.id
WHERE pr.status IN ('recebido', 'encerrado')
GROUP BY pr.fornecedor_id, forn.nome, ip.produto_id, prod.nome, prod.unidade
HAVING COUNT(*) >= 1;

GRANT SELECT ON public.v_fator_real_desvio TO authenticated;

-- ------------------------------------------------------------
-- 6. View de contagens pendentes e divergências abertas
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_contagem_pendente;
CREATE VIEW public.v_contagem_pendente
WITH (security_invoker = true) AS
SELECT
  cc.id AS contagem_id,
  cc.posicao_id,
  p.tipo AS posicao_tipo,
  p.ref_id AS posicao_ref_id,
  CASE
    WHEN p.tipo = 'galpao' THEN 'Galpão'
    WHEN p.tipo = 'fornecedor' THEN forn.nome
    WHEN p.tipo = 'cliente' THEN cl.nome
    ELSE 'Desconhecido'
  END AS posicao_nome,
  CASE
    WHEN p.tipo = 'cliente' THEN cl.id
    ELSE NULL
  END AS cliente_id,
  CASE
    WHEN p.tipo = 'cliente' THEN cl.nome
    ELSE NULL
  END AS cliente_nome,
  CASE
    WHEN p.tipo = 'fornecedor' THEN forn.id
    ELSE NULL
  END AS fornecedor_id,
  CASE
    WHEN p.tipo = 'fornecedor' THEN forn.nome
    ELSE NULL
  END AS fornecedor_nome,
  cc.data AS data_contagem,
  cc.status,
  cc.origem,
  CURRENT_DATE - cc.data AS dias_pendente,
  SUM(ABS(cci.diferenca)) AS total_diferenca
FROM public.contagens_caixa cc
JOIN public.posicoes_caixa p ON p.id = cc.posicao_id
LEFT JOIN public.fornecedores forn ON p.tipo = 'fornecedor' AND forn.id = p.ref_id
LEFT JOIN public.clientes cl ON p.tipo = 'cliente' AND cl.id = p.ref_id
LEFT JOIN public.contagem_caixa_itens cci ON cci.contagem_id = cc.id
WHERE cc.status = 'pendente'
GROUP BY cc.id, cc.posicao_id, p.tipo, p.ref_id, forn.nome, forn.id, cl.nome, cl.id, cc.data, cc.status, cc.origem;

GRANT SELECT ON public.v_contagem_pendente TO authenticated;

-- ------------------------------------------------------------
-- 7. View agregada de ranking por fornecedor
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_ranking_custo_fornecedor;
CREATE VIEW public.v_ranking_custo_fornecedor
WITH (security_invoker = true) AS
WITH perda AS (
  SELECT fornecedor_id, fornecedor_nome, SUM(valor_perda) AS custo_perda
  FROM public.v_custo_perda_caixas
  WHERE fornecedor_id IS NOT NULL
  GROUP BY fornecedor_id, fornecedor_nome
),
recebimento AS (
  SELECT fornecedor_id, fornecedor_nome,
    SUM(CASE WHEN divergencia IN ('falta', 'qualidade') THEN valor_divergencia ELSE 0 END) AS custo_recebimento
  FROM public.v_custo_recebimento
  GROUP BY fornecedor_id, fornecedor_nome
),
quebra AS (
  SELECT fornecedor_id, fornecedor_nome, SUM(valor) AS custo_quebra
  FROM public.v_custo_quebra
  GROUP BY fornecedor_id, fornecedor_nome
)
SELECT
  COALESCE(p.fornecedor_id, r.fornecedor_id, q.fornecedor_id) AS fornecedor_id,
  COALESCE(p.fornecedor_nome, r.fornecedor_nome, q.fornecedor_nome) AS fornecedor_nome,
  COALESCE(p.custo_perda, 0) AS custo_perda,
  COALESCE(r.custo_recebimento, 0) AS custo_recebimento,
  COALESCE(q.custo_quebra, 0) AS custo_quebra,
  COALESCE(p.custo_perda, 0) + COALESCE(r.custo_recebimento, 0) + COALESCE(q.custo_quebra, 0) AS custo_total
FROM perda p
FULL OUTER JOIN recebimento r ON p.fornecedor_id = r.fornecedor_id
FULL OUTER JOIN quebra q ON COALESCE(p.fornecedor_id, r.fornecedor_id) = q.fornecedor_id
ORDER BY custo_total DESC;

GRANT SELECT ON public.v_ranking_custo_fornecedor TO authenticated;

-- ------------------------------------------------------------
-- 8. View agregada de ranking por supermercado (cliente)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_ranking_custo_cliente;
CREATE VIEW public.v_ranking_custo_cliente
WITH (security_invoker = true) AS
WITH perda AS (
  SELECT cliente_id, cliente_nome, SUM(valor_perda) AS custo_perda
  FROM public.v_custo_perda_caixas
  WHERE cliente_id IS NOT NULL
  GROUP BY cliente_id, cliente_nome
),
contagem AS (
  SELECT cliente_id, cliente_nome, SUM(total_diferenca) AS divergencias_abertas
  FROM public.v_contagem_pendente
  WHERE cliente_id IS NOT NULL
  GROUP BY cliente_id, cliente_nome
)
SELECT
  COALESCE(p.cliente_id, c.cliente_id) AS cliente_id,
  COALESCE(p.cliente_nome, c.cliente_nome) AS cliente_nome,
  COALESCE(p.custo_perda, 0) AS custo_perda,
  COALESCE(c.divergencias_abertas, 0) AS divergencias_abertas,
  COALESCE(p.custo_perda, 0) AS custo_total
FROM perda p
FULL OUTER JOIN contagem c ON p.cliente_id = c.cliente_id
ORDER BY custo_total DESC;

GRANT SELECT ON public.v_ranking_custo_cliente TO authenticated;

-- ------------------------------------------------------------
-- 9. Registrar página no sistema
-- ------------------------------------------------------------
INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo) VALUES
  ('relatorios/custos', 'Custos operacionais', 'Relatórios', 'DollarSign', 55, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

NOTIFY pgrst, 'reload schema';
