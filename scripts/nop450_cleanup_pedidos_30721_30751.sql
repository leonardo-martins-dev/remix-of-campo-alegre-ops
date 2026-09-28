-- NOP-450 one-shot cleanup (NÃO é migration — aplicar manualmente via Infra/ops).
-- Pedidos de validação 2026-09-28: 30721 e 30751.
-- Remove conferências/itens vazios criados pelo toque no card e limpa hora_chegada
-- se ainda não houver trabalho real (qtd>0, conferido, caixa, etc.).
--
-- Antes de rodar: conferir contagens e IDs.
--   SELECT id, codigo, hora_chegada, status FROM pedidos_recebimento WHERE codigo IN ('30721','30751');
--   SELECT c.id, c.pedido_id, c.status, c.created_at,
--          (SELECT count(*) FROM itens_conferencia i WHERE i.conferencia_id = c.id) AS itens
--   FROM conferencias c
--   JOIN pedidos_recebimento p ON p.id = c.pedido_id
--   WHERE p.codigo IN ('30721','30751');

BEGIN;

WITH alvos AS (
  SELECT p.id AS pedido_id, p.codigo
  FROM public.pedidos_recebimento p
  WHERE p.codigo IN ('30721', '30751')
    AND p.data_pedido = DATE '2026-09-28'
),
confs AS (
  SELECT c.id AS conferencia_id, c.pedido_id
  FROM public.conferencias c
  JOIN alvos a ON a.pedido_id = c.pedido_id
  WHERE c.status IN ('em_andamento', 'parcial')
    AND c.created_at::date = DATE '2026-09-28'
    -- só as "vazias" do toque exploratório
    AND NOT EXISTS (
      SELECT 1
      FROM public.itens_conferencia i
      WHERE i.conferencia_id = c.id
        AND (
          COALESCE(i.quantidade_recebida, 0) <> 0
          OR COALESCE(i.conferido, false) = true
          OR i.divergencia IS NOT NULL
          OR COALESCE(i.tem_problema_qualidade, false) = true
          OR i.foto_url IS NOT NULL
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.caixas_item_conferencia cx
      JOIN public.itens_conferencia i ON i.id = cx.item_conferencia_id
      WHERE i.conferencia_id = c.id
    )
),
del_itens AS (
  DELETE FROM public.itens_conferencia i
  USING confs
  WHERE i.conferencia_id = confs.conferencia_id
  RETURNING i.id
),
del_confs AS (
  DELETE FROM public.conferencias c
  USING confs
  WHERE c.id = confs.conferencia_id
  RETURNING c.id, c.pedido_id
)
UPDATE public.pedidos_recebimento p
SET hora_chegada = NULL
FROM alvos a
WHERE p.id = a.pedido_id
  AND p.hora_chegada IS NOT NULL
  AND p.hora_chegada::date = DATE '2026-09-28'
  -- não limpa se ainda existir alguma conferência (finalizada ou com trabalho)
  AND NOT EXISTS (
    SELECT 1 FROM public.conferencias c WHERE c.pedido_id = p.id
  );

-- Relatório
SELECT 'pedidos' AS kind, p.codigo, p.id::text, p.hora_chegada::text, p.status
FROM public.pedidos_recebimento p
WHERE p.codigo IN ('30721', '30751')
UNION ALL
SELECT 'conferencias', pr.codigo, c.id::text, c.status, c.created_at::text
FROM public.conferencias c
JOIN public.pedidos_recebimento pr ON pr.id = c.pedido_id
WHERE pr.codigo IN ('30721', '30751');

COMMIT;
