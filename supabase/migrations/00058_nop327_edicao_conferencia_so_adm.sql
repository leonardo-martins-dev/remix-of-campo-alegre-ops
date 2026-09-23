-- ============================================================
-- NOP-327 — Conferir chegada: edição pós-finalização só ADM
-- ============================================================

CREATE OR REPLACE FUNCTION public.salvar_edicao_conferencia(
  p_conferencia_id UUID,
  p_pedido_id UUID,
  p_motivo TEXT,
  p_itens JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_status public.status_conferencia;
  v_antes JSONB;
  v_depois JSONB := '[]'::jsonb;
  v_item JSONB;
  v_has_above BOOLEAN;
  v_has_qualidade BOOLEAN;
  v_saldo_aberto BOOLEAN;
  v_pedido_status public.status_pedido;
  v_vales_revisao INT := 0;
  v_edicao_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- NOP-327: após finalizada, só ADM edita
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Só administradores podem editar conferência finalizada';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo da edição é obrigatório';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'Itens da edição inválidos';
  END IF;

  SELECT status INTO v_status
  FROM public.conferencias
  WHERE id = p_conferencia_id AND pedido_id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conferência não encontrada';
  END IF;

  IF v_status IS DISTINCT FROM 'finalizada'::public.status_conferencia THEN
    RAISE EXCEPTION 'Só é possível editar conferência finalizada';
  END IF;

  -- Snapshot antes
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ic.id,
      'quantidade_recebida', ic.quantidade_recebida,
      'conferido', ic.conferido,
      'divergencia', ic.divergencia,
      'quantidade_divergencia', ic.quantidade_divergencia,
      'tem_problema_qualidade', ic.tem_problema_qualidade,
      'quantidade_qualidade', ic.quantidade_qualidade,
      'dentro_tolerancia', ic.dentro_tolerancia,
      'valor_divergencia', ic.valor_divergencia,
      'estimado', ic.estimado,
      'tolerancia_pct_aplicada', ic.tolerancia_pct_aplicada,
      'qtd_saida_caixas', ic.qtd_saida_caixas,
      'qtd_chegada_caixas', ic.qtd_chegada_caixas,
      'divergencia_transporte_caixas', ic.divergencia_transporte_caixas,
      'divergencia_transporte_unidades', ic.divergencia_transporte_unidades
    )
    ORDER BY ic.id
  ), '[]'::jsonb)
  INTO v_antes
  FROM public.itens_conferencia ic
  WHERE ic.conferencia_id = p_conferencia_id;

  -- Aplica itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    UPDATE public.itens_conferencia SET
      quantidade_recebida = COALESCE((v_item->>'quantidade_recebida')::numeric, quantidade_recebida),
      conferido = COALESCE((v_item->>'conferido')::boolean, conferido),
      divergencia = CASE
        WHEN v_item ? 'divergencia' THEN NULLIF(v_item->>'divergencia', '')::public.tipo_divergencia
        ELSE divergencia
      END,
      quantidade_divergencia = COALESCE((v_item->>'quantidade_divergencia')::numeric, quantidade_divergencia),
      tem_problema_qualidade = COALESCE((v_item->>'tem_problema_qualidade')::boolean, tem_problema_qualidade),
      quantidade_qualidade = COALESCE((v_item->>'quantidade_qualidade')::numeric, quantidade_qualidade),
      dentro_tolerancia = CASE
        WHEN v_item ? 'dentro_tolerancia' THEN (v_item->>'dentro_tolerancia')::boolean
        ELSE dentro_tolerancia
      END,
      valor_divergencia = CASE
        WHEN v_item ? 'valor_divergencia' THEN (v_item->>'valor_divergencia')::numeric
        ELSE valor_divergencia
      END,
      estimado = COALESCE((v_item->>'estimado')::boolean, estimado),
      tolerancia_pct_aplicada = CASE
        WHEN v_item ? 'tolerancia_pct_aplicada' THEN (v_item->>'tolerancia_pct_aplicada')::numeric
        ELSE tolerancia_pct_aplicada
      END,
      qtd_saida_caixas = CASE
        WHEN v_item ? 'qtd_saida_caixas' THEN (v_item->>'qtd_saida_caixas')::numeric
        ELSE qtd_saida_caixas
      END,
      qtd_chegada_caixas = CASE
        WHEN v_item ? 'qtd_chegada_caixas' THEN (v_item->>'qtd_chegada_caixas')::numeric
        ELSE qtd_chegada_caixas
      END,
      divergencia_transporte_caixas = CASE
        WHEN v_item ? 'divergencia_transporte_caixas' THEN (v_item->>'divergencia_transporte_caixas')::numeric
        ELSE divergencia_transporte_caixas
      END,
      divergencia_transporte_unidades = CASE
        WHEN v_item ? 'divergencia_transporte_unidades' THEN (v_item->>'divergencia_transporte_unidades')::numeric
        ELSE divergencia_transporte_unidades
      END,
      updated_at = now()
    WHERE id = (v_item->>'id')::uuid
      AND conferencia_id = p_conferencia_id;
  END LOOP;

  -- Snapshot depois
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ic.id,
      'quantidade_recebida', ic.quantidade_recebida,
      'conferido', ic.conferido,
      'divergencia', ic.divergencia,
      'quantidade_divergencia', ic.quantidade_divergencia,
      'tem_problema_qualidade', ic.tem_problema_qualidade,
      'quantidade_qualidade', ic.quantidade_qualidade,
      'dentro_tolerancia', ic.dentro_tolerancia,
      'valor_divergencia', ic.valor_divergencia,
      'estimado', ic.estimado,
      'tolerancia_pct_aplicada', ic.tolerancia_pct_aplicada,
      'qtd_saida_caixas', ic.qtd_saida_caixas,
      'qtd_chegada_caixas', ic.qtd_chegada_caixas,
      'divergencia_transporte_caixas', ic.divergencia_transporte_caixas,
      'divergencia_transporte_unidades', ic.divergencia_transporte_unidades
    )
    ORDER BY ic.id
  ), '[]'::jsonb)
  INTO v_depois
  FROM public.itens_conferencia ic
  WHERE ic.conferencia_id = p_conferencia_id;

  -- Recalcula status do pedido (mesma lógica de update_conferencia_status, sem gerar carga)
  SELECT EXISTS(
    SELECT 1 FROM public.itens_conferencia
    WHERE conferencia_id = p_conferencia_id
      AND divergencia IN ('sobra', 'falta')
      AND COALESCE(dentro_tolerancia, FALSE) = FALSE
  ) INTO v_has_above;

  SELECT EXISTS(
    SELECT 1 FROM public.itens_conferencia
    WHERE conferencia_id = p_conferencia_id
      AND (divergencia = 'qualidade' OR tem_problema_qualidade)
  ) INTO v_has_qualidade;

  SELECT EXISTS(
    SELECT 1 FROM public.v_saldo_item_pedido WHERE pedido_id = p_pedido_id AND saldo > 0
  ) INTO v_saldo_aberto;

  IF v_has_above OR v_has_qualidade THEN
    v_pedido_status := 'aguardando_liberacao'::public.status_pedido;
  ELSIF v_saldo_aberto THEN
    v_pedido_status := 'parcial'::public.status_pedido;
  ELSE
    v_pedido_status := 'recebido'::public.status_pedido;
  END IF;

  UPDATE public.pedidos_recebimento
  SET status = v_pedido_status, updated_at = now()
  WHERE id = p_pedido_id;

  UPDATE public.conferencias
  SET
    editada = TRUE,
    editada_em = now(),
    editada_por = v_uid,
    updated_at = now()
  WHERE id = p_conferencia_id;

  -- Vales pendentes/aplicados: atualiza qty/valor a partir dos itens
  UPDATE public.solicitacoes_vale sv
  SET
    quantidade_recebida = ic.quantidade_recebida,
    diferenca = GREATEST(0, ip.quantidade_pedida - ic.quantidade_recebida),
    valor_calculado = GREATEST(0, ip.quantidade_pedida - ic.quantidade_recebida)
      * COALESCE(sv.preco_unitario, 0),
    updated_at = now()
  FROM public.itens_conferencia ic
  JOIN public.itens_pedido ip ON ip.id = ic.item_pedido_id
  WHERE sv.item_conferencia_id = ic.id
    AND ic.conferencia_id = p_conferencia_id
    AND sv.status IN ('pendente', 'aplicado');

  -- Vales já no Wise: só marca revisão ADM
  UPDATE public.solicitacoes_vale sv
  SET
    precisa_revisao_adm = TRUE,
    revisao_motivo = btrim(p_motivo),
    updated_at = now()
  FROM public.itens_conferencia ic
  WHERE sv.item_conferencia_id = ic.id
    AND ic.conferencia_id = p_conferencia_id
    AND sv.status = 'lancado';

  GET DIAGNOSTICS v_vales_revisao = ROW_COUNT;

  INSERT INTO public.conferencia_edicoes (
    conferencia_id, editado_por, motivo, antes, depois, vales_revisao
  ) VALUES (
    p_conferencia_id, v_uid, btrim(p_motivo), v_antes, v_depois, v_vales_revisao
  )
  RETURNING id INTO v_edicao_id;

  RETURN jsonb_build_object(
    'edicao_id', v_edicao_id,
    'pedido_status', v_pedido_status,
    'vales_revisao', v_vales_revisao
  );
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_edicao_conferencia(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_edicao_conferencia(UUID, UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.salvar_edicao_conferencia IS
  'NOP-308/327: edita conferência finalizada (só ADM), audita, recalcula pedido/vales sem duplicar ledger';

NOTIFY pgrst, 'reload schema';
