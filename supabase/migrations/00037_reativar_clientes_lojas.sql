-- Reativa lojas operacionais usadas em cargas/movimentação.
-- Estavam todas com ativo=false, e /caixas/movimentacao filtra ativo=true
-- (RLS de SELECT em clientes permite autenticados, mas a UI escondia tudo).

UPDATE public.clientes
SET ativo = TRUE,
    updated_at = now()
WHERE nome IN ('Anderson', 'Campo Alegre', 'Parceiro Sul')
  AND ativo IS DISTINCT FROM TRUE;
