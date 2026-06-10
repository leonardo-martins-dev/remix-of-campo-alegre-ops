-- Ponte recebimento → expedição

DO $$ BEGIN
  CREATE TYPE public.origem_carga AS ENUM ('manual', 'wisetec', 'conferencia', 'excel');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.destinatario_cliente_map (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id  UUID NOT NULL REFERENCES public.destinatarios(id) ON DELETE CASCADE,
  cliente_id       UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dest_cliente UNIQUE (destinatario_id, cliente_id)
);

ALTER TABLE public.cargas
  ADD COLUMN IF NOT EXISTS origem public.origem_carga DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS wise_carregamento_id TEXT,
  ADD COLUMN IF NOT EXISTS pedido_origem_id UUID REFERENCES public.pedidos_recebimento(id);

CREATE INDEX IF NOT EXISTS idx_cargas_pedido_origem ON public.cargas (pedido_origem_id);
CREATE INDEX IF NOT EXISTS idx_cargas_wise_id ON public.cargas (wise_carregamento_id);

ALTER TABLE public.cargas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.resolve_cliente_destinatario(p_destinatario_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_cliente_id UUID;
  v_nome TEXT;
BEGIN
  SELECT cliente_id INTO v_cliente_id
  FROM public.destinatario_cliente_map
  WHERE destinatario_id = p_destinatario_id
  LIMIT 1;

  IF v_cliente_id IS NOT NULL THEN
    RETURN v_cliente_id;
  END IF;

  SELECT nome INTO v_nome FROM public.destinatarios WHERE id = p_destinatario_id;

  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE lower(trim(nome)) = lower(trim(v_nome))
    AND ativo = TRUE
  LIMIT 1;

  RETURN v_cliente_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_cargas_pos_conferencia(p_pedido_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conf_id UUID;
  v_pedido record;
  v_row record;
  v_cliente_id UUID;
  v_carga_id UUID;
  v_codigo TEXT;
  v_created jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_recebimento WHERE id = p_pedido_id;
  IF v_pedido.id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_pedido.status NOT IN ('conferido'::public.status_pedido) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT id INTO v_conf_id
  FROM public.conferencias
  WHERE pedido_id = p_pedido_id AND status = 'finalizada'
  ORDER BY finalizada_em DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_conf_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF EXISTS (SELECT 1 FROM public.cargas WHERE pedido_origem_id = p_pedido_id) THEN
    SELECT jsonb_agg(jsonb_build_object('carga_id', id, 'codigo', codigo)) INTO v_created
    FROM public.cargas WHERE pedido_origem_id = p_pedido_id;
    RETURN COALESCE(v_created, '[]'::jsonb);
  END IF;

  FOR v_row IN
    SELECT
      r.destinatario_id,
      iped.produto_id,
      SUM(
        CASE
          WHEN iped.quantidade_pedida > 0 THEN
            (ic.quantidade_recebida * r.quantidade / iped.quantidade_pedida)
          ELSE 0
        END
      ) AS qty
    FROM public.itens_conferencia ic
    JOIN public.itens_pedido iped ON iped.id = ic.item_pedido_id
    JOIN public.itens_pedido_rateio r ON r.item_pedido_id = iped.id
    WHERE ic.conferencia_id = v_conf_id
      AND ic.conferido = TRUE
    GROUP BY r.destinatario_id, iped.produto_id
    HAVING SUM(
      CASE WHEN iped.quantidade_pedida > 0 THEN (ic.quantidade_recebida * r.quantidade / iped.quantidade_pedida) ELSE 0 END
    ) > 0
  LOOP
    v_cliente_id := public.resolve_cliente_destinatario(v_row.destinatario_id);
    IF v_cliente_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_carga_id
    FROM public.cargas
    WHERE pedido_origem_id = p_pedido_id
      AND cliente_id = v_cliente_id
      AND data_carga = public.today_brt()
    LIMIT 1;

    IF v_carga_id IS NULL THEN
      v_codigo := v_pedido.codigo || '-' || substr(v_cliente_id::text, 1, 8);
      INSERT INTO public.cargas (codigo, cliente_id, data_carga, status, origem, pedido_origem_id, progresso)
      VALUES (v_codigo, v_cliente_id, public.today_brt(), 'aguardando', 'conferencia', p_pedido_id, 0)
      RETURNING id INTO v_carga_id;

      INSERT INTO public.carga_caixas_resumo (carga_id) VALUES (v_carga_id)
      ON CONFLICT (carga_id) DO NOTHING;

      v_created := v_created || jsonb_build_array(jsonb_build_object('carga_id', v_carga_id, 'codigo', v_codigo));
    END IF;

    INSERT INTO public.romaneio_itens (
      carga_id, produto_id, quantidade_romaneio, quantidade_real, status
    ) VALUES (
      v_carga_id, v_row.produto_id, round(v_row.qty::numeric, 2), 0, 'pendente'
    );
  END LOOP;

  INSERT INTO public.registros_ciclo (pedido_id, data_registro, hora_conferencia_ok)
  SELECT p_pedido_id, public.today_brt(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.registros_ciclo WHERE pedido_id = p_pedido_id
  );

  RETURN COALESCE(v_created, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_cargas_pos_conferencia(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_cargas_pos_conferencia(UUID) TO authenticated;

CREATE OR REPLACE VIEW public.v_fila_expedicao AS
SELECT
  p.id AS pedido_id,
  p.codigo,
  p.status,
  p.data_pedido,
  f.nome AS fornecedor,
  c.id AS conferencia_id,
  c.finalizada_em
FROM public.pedidos_recebimento p
JOIN public.fornecedores f ON f.id = p.fornecedor_id
LEFT JOIN public.conferencias c ON c.pedido_id = p.id AND c.status = 'finalizada'
WHERE p.status = 'conferido'::public.status_pedido
  AND NOT EXISTS (SELECT 1 FROM public.cargas cg WHERE cg.pedido_origem_id = p.id);

GRANT SELECT ON public.v_fila_expedicao TO authenticated;

CREATE OR REPLACE FUNCTION public.liberar_pedido_divergencia(
  p_pedido_id UUID,
  p_observacao TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem liberar pedidos com divergência';
  END IF;

  UPDATE public.pedidos_recebimento
  SET
    status = 'conferido'::public.status_pedido,
    liberado_por = auth.uid(),
    liberado_em = now(),
    observacao_liberacao = COALESCE(p_observacao, observacao_liberacao),
    updated_at = now()
  WHERE id = p_pedido_id
    AND status IN (
      'aguardando_liberacao'::public.status_pedido,
      'divergencia'::public.status_pedido
    )
  RETURNING * INTO p;

  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está aguardando liberação';
  END IF;

  PERFORM public.gerar_cargas_pos_conferencia(p_pedido_id);

  RETURN to_jsonb(p);
END;
$$;

REVOKE ALL ON FUNCTION public.liberar_pedido_divergencia(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.liberar_pedido_divergencia(UUID, TEXT) TO authenticated;
