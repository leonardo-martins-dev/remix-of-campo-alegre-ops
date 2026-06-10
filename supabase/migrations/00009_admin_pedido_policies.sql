-- Timezone Brasília para filtros server-side
CREATE OR REPLACE FUNCTION public.today_brt()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

GRANT EXECUTE ON FUNCTION public.today_brt() TO authenticated;

-- Pedidos conferidos: só admin pode UPDATE/DELETE
DROP POLICY IF EXISTS pedidos_update_auth ON public.pedidos_recebimento;
DROP POLICY IF EXISTS pedidos_delete_admin ON public.pedidos_recebimento;

CREATE POLICY pedidos_update_auth ON public.pedidos_recebimento
  FOR UPDATE TO authenticated
  USING (
    status = 'pendente'::public.status_pedido
    OR public.is_admin()
  );

CREATE POLICY pedidos_delete_admin ON public.pedidos_recebimento
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS itens_pedido_update_auth ON public.itens_pedido;
CREATE POLICY itens_pedido_update_auth ON public.itens_pedido
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pedidos_recebimento p
      WHERE p.id = pedido_id
        AND (p.status = 'pendente'::public.status_pedido OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS rateio_update_auth ON public.itens_pedido_rateio;
CREATE POLICY rateio_update_auth ON public.itens_pedido_rateio
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itens_pedido ip
      JOIN public.pedidos_recebimento p ON p.id = ip.pedido_id
      WHERE ip.id = item_pedido_id
        AND (p.status = 'pendente'::public.status_pedido OR public.is_admin())
    )
  );
