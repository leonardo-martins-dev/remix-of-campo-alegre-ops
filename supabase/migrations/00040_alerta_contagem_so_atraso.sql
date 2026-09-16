-- Alertas de inventário: só atraso real (já houve contagem e passou da frequência).
-- Posições nunca contadas (go-live / base zerada) deixam de aparecer como "999 dias".

CREATE OR REPLACE VIEW public.v_posicoes_contagem_pendente
WITH (security_invoker = true) AS
WITH freq AS (
  SELECT public.config_num('inventario_frequencia_dias', 7)::INT AS dias
),
ultima AS (
  SELECT * FROM public.v_ultima_contagem_posicao
)
SELECT
  p.id AS posicao_id,
  p.tipo AS posicao_tipo,
  p.ref_id,
  CASE
    WHEN p.tipo = 'galpao' THEN 'Galpão'
    WHEN p.tipo = 'cliente' THEN cl.nome
    WHEN p.tipo = 'fornecedor' THEN f.nome
    ELSE p.tipo::text
  END AS posicao_nome,
  u.ultima_contagem_data,
  u.dias_desde_contagem,
  freq.dias AS frequencia_dias
FROM public.posicoes_caixa p
CROSS JOIN freq
INNER JOIN ultima u ON u.posicao_id = p.id
LEFT JOIN public.clientes cl ON p.tipo = 'cliente' AND cl.id = p.ref_id
LEFT JOIN public.fornecedores f ON p.tipo = 'fornecedor' AND f.id = p.ref_id
WHERE (
    (p.tipo = 'galpao')
    OR (p.tipo = 'cliente' AND cl.ativo = TRUE)
    OR (p.tipo = 'fornecedor' AND f.ativo = TRUE)
  )
  AND u.dias_desde_contagem >= freq.dias
ORDER BY
  u.dias_desde_contagem DESC,
  CASE p.tipo WHEN 'galpao' THEN 1 WHEN 'fornecedor' THEN 2 WHEN 'cliente' THEN 3 END;

GRANT SELECT ON public.v_posicoes_contagem_pendente TO authenticated;
