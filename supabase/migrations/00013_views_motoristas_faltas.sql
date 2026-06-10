-- Views para relatório de faltas e ranking de motoristas

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS motorista_id UUID REFERENCES public.motoristas(id) ON DELETE SET NULL;

CREATE OR REPLACE VIEW public.v_faltas_por_fornecedor AS
SELECT
  f.id AS fornecedor_id,
  f.nome AS fornecedor,
  p.data_pedido,
  ic.divergencia,
  COUNT(*) AS total_itens,
  SUM(COALESCE(ic.quantidade_divergencia, 0)) AS qty_divergencia,
  SUM(GREATEST(0, ip.quantidade_pedida - ic.quantidade_recebida)) AS qty_falta
FROM public.itens_conferencia ic
JOIN public.itens_pedido ip ON ip.id = ic.item_pedido_id
JOIN public.pedidos_recebimento p ON p.id = ip.pedido_id
JOIN public.fornecedores f ON f.id = p.fornecedor_id
WHERE ic.divergencia IS NOT NULL
GROUP BY f.id, f.nome, p.data_pedido, ic.divergencia;

CREATE OR REPLACE VIEW public.v_retorno_ranking_motorista AS
SELECT
  m.id AS motorista_id,
  m.nome AS motorista,
  r.data_retorno,
  COUNT(*) AS total_retornos,
  SUM(r.caixas_g) AS total_g,
  SUM(r.caixas_i) AS total_i,
  SUM(r.caixas_p) AS total_p,
  SUM(r.caixas_g + r.caixas_i + r.caixas_p) AS total_caixas,
  COUNT(DISTINCT r.cliente_id) AS lojas_atendidas
FROM public.retornos_caixa r
LEFT JOIN public.motoristas m ON m.id = r.motorista_id
GROUP BY m.id, m.nome, r.data_retorno;

GRANT SELECT ON public.v_faltas_por_fornecedor TO authenticated;
GRANT SELECT ON public.v_retorno_ranking_motorista TO authenticated;
