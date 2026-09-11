-- Resolve pendências de vínculo só com match certo:
--   produto: codigo_externo = produtos.codigo
--   fornecedor: nome_externo = fornecedores.nome (trim + case-insensitive)
-- Não cria cadastro novo e não faz match fuzzy.

CREATE OR REPLACE FUNCTION public.resolver_pendencias_certas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aliases_prod INT := 0;
  v_aliases_forn INT := 0;
  v_itens INT := 0;
  v_pend_prod INT := 0;
  v_pend_forn INT := 0;
  v_pedidos_forn INT := 0;
  v_pedidos_status INT := 0;
  r RECORD;
BEGIN
  -- Aliases de produto (nome Wise → id pelo código)
  FOR r IN
    SELECT DISTINCT ON (pend.nome_externo)
      pend.nome_externo,
      pend.codigo_externo,
      p.id AS entidade_id
    FROM public.pendencias_vinculo pend
    JOIN public.produtos p
      ON p.codigo IS NOT NULL
     AND btrim(p.codigo) = btrim(pend.codigo_externo)
    WHERE pend.status = 'aberta'
      AND pend.tipo = 'produto'
      AND NULLIF(btrim(pend.codigo_externo), '') IS NOT NULL
    ORDER BY pend.nome_externo, pend.created_at DESC
  LOOP
    INSERT INTO public.aliases (tipo, nome_externo, codigo_externo, entidade_id, origem)
    VALUES ('produto', r.nome_externo, r.codigo_externo, r.entidade_id, 'wise')
    ON CONFLICT (tipo, origem, nome_externo) DO UPDATE
      SET entidade_id = EXCLUDED.entidade_id,
          codigo_externo = COALESCE(EXCLUDED.codigo_externo, public.aliases.codigo_externo);
    v_aliases_prod := v_aliases_prod + 1;
  END LOOP;

  -- Itens sem produto_id com código já no catálogo
  UPDATE public.itens_pedido i
  SET produto_id = p.id
  FROM public.produtos p
  WHERE i.produto_id IS NULL
    AND NULLIF(btrim(i.codigo_externo), '') IS NOT NULL
    AND btrim(i.codigo_externo) = btrim(p.codigo);
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  UPDATE public.pendencias_vinculo pend
  SET
    status = 'vinculada',
    entidade_id = p.id,
    motivo = COALESCE(pend.motivo, 'auto: codigo_externo = produtos.codigo'),
    resolved_at = COALESCE(pend.resolved_at, now())
  FROM public.produtos p
  WHERE pend.status = 'aberta'
    AND pend.tipo = 'produto'
    AND NULLIF(btrim(pend.codigo_externo), '') IS NOT NULL
    AND btrim(pend.codigo_externo) = btrim(p.codigo);
  GET DIAGNOSTICS v_pend_prod = ROW_COUNT;

  -- Aliases de fornecedor (nome exato)
  FOR r IN
    SELECT DISTINCT ON (pend.nome_externo)
      pend.nome_externo,
      pend.codigo_externo,
      f.id AS entidade_id
    FROM public.pendencias_vinculo pend
    JOIN public.fornecedores f
      ON upper(btrim(f.nome)) = upper(btrim(pend.nome_externo))
    WHERE pend.status = 'aberta'
      AND pend.tipo = 'fornecedor'
    ORDER BY pend.nome_externo, pend.created_at DESC
  LOOP
    INSERT INTO public.aliases (tipo, nome_externo, codigo_externo, entidade_id, origem)
    VALUES ('fornecedor', r.nome_externo, r.codigo_externo, r.entidade_id, 'wise')
    ON CONFLICT (tipo, origem, nome_externo) DO UPDATE
      SET entidade_id = EXCLUDED.entidade_id,
          codigo_externo = COALESCE(EXCLUDED.codigo_externo, public.aliases.codigo_externo);
    v_aliases_forn := v_aliases_forn + 1;
  END LOOP;

  -- Pedidos sem fornecedor_id com pendência aberta de nome exato
  UPDATE public.pedidos_recebimento ped
  SET fornecedor_id = f.id
  FROM public.pendencias_vinculo pend
  JOIN public.fornecedores f
    ON upper(btrim(f.nome)) = upper(btrim(pend.nome_externo))
  WHERE pend.pedido_id = ped.id
    AND pend.status = 'aberta'
    AND pend.tipo = 'fornecedor'
    AND ped.fornecedor_id IS NULL;
  GET DIAGNOSTICS v_pedidos_forn = ROW_COUNT;

  UPDATE public.pendencias_vinculo pend
  SET
    status = 'vinculada',
    entidade_id = f.id,
    motivo = COALESCE(pend.motivo, 'auto: nome_externo = fornecedores.nome'),
    resolved_at = COALESCE(pend.resolved_at, now())
  FROM public.fornecedores f
  WHERE pend.status = 'aberta'
    AND pend.tipo = 'fornecedor'
    AND upper(btrim(pend.nome_externo)) = upper(btrim(f.nome));
  GET DIAGNOSTICS v_pend_forn = ROW_COUNT;

  -- Sai de aguardando_vinculo quando já tem fornecedor e não resta pendência de fornecedor
  UPDATE public.pedidos_recebimento ped
  SET status = 'pendente'
  WHERE ped.status = 'aguardando_vinculo'
    AND ped.fornecedor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.pendencias_vinculo x
      WHERE x.pedido_id = ped.id
        AND x.tipo = 'fornecedor'
        AND x.status = 'aberta'
    );
  GET DIAGNOSTICS v_pedidos_status = ROW_COUNT;

  RETURN jsonb_build_object(
    'aliases_produto', v_aliases_prod,
    'aliases_fornecedor', v_aliases_forn,
    'itens_vinculados', v_itens,
    'pendencias_produto', v_pend_prod,
    'pendencias_fornecedor', v_pend_forn,
    'pedidos_fornecedor', v_pedidos_forn,
    'pedidos_status_pendente', v_pedidos_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_pendencias_certas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_pendencias_certas() TO authenticated;

-- Aplicar só quando pedir: SELECT public.resolver_pendencias_certas();
