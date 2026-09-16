-- Padrões un/cx para linha HIG/saladas do pedido 30413 (e demais fornecedores).
-- Base: parentes da planilha NOP-22 (ervas UND = 80/V; salada mista = 20/V).
-- Idempotente.

WITH tipos AS (
  SELECT
    (SELECT id FROM public.tipos_caixa WHERE sigla = 'V' AND ativo LIMIT 1) AS vermelha
),
produtos AS (
  SELECT * FROM (VALUES
    ('938', 80),  -- CHEIRO VERDE HIG 80G
    ('953', 80),  -- CEBOLINHA HIG 80G
    ('952', 80),  -- SALSINHA HIG 80G
    ('49',  20),  -- COUVE PICADA HIG 200G
    ('995', 20),  -- SALADA CAMPESTRE 200G
    ('996', 20),  -- SALADA SILVESTRE 200G
    ('997', 20),  -- SALADA NATIVA 200G
    ('957', 20),  -- MIX DE FOLHAS HIG 180G
    ('950', 20)   -- ALFACE AMERICANA HIG 250G
  ) AS t(codigo, fator)
)
INSERT INTO public.conversoes_produto_caixa (produto_id, tipo_caixa_id, fator, ativo)
SELECT p.id, tipos.vermelha, pr.fator, true
FROM produtos pr
JOIN public.produtos p ON btrim(p.codigo) = pr.codigo
CROSS JOIN tipos
WHERE tipos.vermelha IS NOT NULL
ON CONFLICT (produto_id, tipo_caixa_id) DO UPDATE
  SET fator = EXCLUDED.fator,
      ativo = true,
      updated_at = now();

COMMENT ON TABLE public.conversoes_produto_caixa IS
  'Fator padrão produto × tipo. Inclui seed HIG/saladas (00036) além do MODE da planilha NOP-22.';
