-- PH-B13/B15/B16/B14/B18/C07 — reteste 09/09
-- Não aplicar 00015.

-- ------------------------------------------------------------
-- PH-B16: recreate ensure_user_profile + GRANT (PGRST202)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ensure_user_profile() CASCADE;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u record;
  resolved_role public.user_role;
  p record;
BEGIN
  SELECT id, email, raw_app_meta_data, raw_user_meta_data
  INTO u
  FROM auth.users
  WHERE id = auth.uid();

  IF u.id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    resolved_role := COALESCE(
      (u.raw_app_meta_data->>'role')::public.user_role,
      'user'::public.user_role
    );
  EXCEPTION
    WHEN invalid_text_representation THEN
      resolved_role := 'user'::public.user_role;
  END;

  IF lower(u.email) = 'admin@noponto.io'
     OR resolved_role::text IN ('admin', 'super_admin') THEN
    resolved_role := 'admin'::public.user_role;
  ELSIF resolved_role::text NOT IN ('admin', 'user') THEN
    resolved_role := 'user'::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (
    u.id,
    COALESCE(
      u.raw_app_meta_data->>'nome',
      u.raw_user_meta_data->>'full_name',
      split_part(u.email, '@', 1)
    ),
    u.email,
    resolved_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nome = COALESCE(public.profiles.nome, EXCLUDED.nome),
    role = CASE
      WHEN lower(EXCLUDED.email) = 'admin@noponto.io' THEN 'admin'::public.user_role
      WHEN (SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = EXCLUDED.id) = 'admin'
        THEN 'admin'::public.user_role
      WHEN public.profiles.role = 'admin'::public.user_role THEN 'admin'::public.user_role
      ELSE public.profiles.role
    END,
    updated_at = now()
  RETURNING * INTO p;

  RETURN to_jsonb(p);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO service_role;

-- ------------------------------------------------------------
-- PH-B13: data_prevista + encerrar automático materializa falta
-- ------------------------------------------------------------
INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('dias_entrega_prevista', '1', 'Dias após a emissão para data prevista de entrega'),
  ('lembrete_inventario_galpao_dias', '7', 'Lembrete de inventário do galpão (dias)'),
  ('lembrete_inventario_cliente_dias', '14', 'Lembrete de inventário em loja (dias)'),
  ('lembrete_inventario_fornecedor_dias', '14', 'Lembrete de inventário no fornecedor (dias)'),
  ('dias_conciliar_inventario', '2', 'Dias para conciliar inventário pendente'),
  ('diferenca_contagem_tolerada', '5', 'Diferença de contagem tolerada (caixas)')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fill_data_prevista()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_dias INT;
BEGIN
  IF NEW.data_prevista IS NULL THEN
    v_dias := public.config_num('dias_entrega_prevista', 1)::INT;
    NEW.data_prevista := COALESCE(NEW.data_pedido, public.today_brt()) + v_dias;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_data_prevista ON public.pedidos_recebimento;
CREATE TRIGGER trg_fill_data_prevista
  BEFORE INSERT ON public.pedidos_recebimento
  FOR EACH ROW EXECUTE FUNCTION public.fill_data_prevista();

CREATE OR REPLACE VIEW public.v_saldo_item_pedido
WITH (security_invoker = true) AS
SELECT
  ip.id AS item_pedido_id,
  ip.pedido_id,
  ip.produto_id,
  ip.quantidade_pedida,
  COALESCE(SUM(ic.quantidade_recebida) FILTER (
    WHERE c.status = 'finalizada'
      AND COALESCE(c.observacoes, '') NOT LIKE 'encerramento:%'
  ), 0) AS recebido_acumulado,
  ip.quantidade_pedida
    - COALESCE(SUM(ic.quantidade_recebida) FILTER (
        WHERE c.status = 'finalizada'
          AND COALESCE(c.observacoes, '') NOT LIKE 'encerramento:%'
      ), 0) AS saldo
FROM public.itens_pedido ip
LEFT JOIN public.itens_conferencia ic ON ic.item_pedido_id = ip.id
LEFT JOIN public.conferencias c ON c.id = ic.conferencia_id
GROUP BY ip.id, ip.pedido_id, ip.produto_id, ip.quantidade_pedida;

GRANT SELECT ON public.v_saldo_item_pedido TO authenticated;

CREATE OR REPLACE FUNCTION public._encerrar_pedido_interno(p_pedido_id UUID, p_motivo TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
  v_conf UUID;
  v_item record;
  v_pct NUMERIC;
  v_min NUMERIC;
  v_limite NUMERIC;
  v_dentro BOOLEAN;
  v_fallback NUMERIC;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'Observação obrigatória para encerrar com falta';
  END IF;

  UPDATE public.pedidos_recebimento
  SET status = 'encerrado'::public.status_pedido,
      encerrado_em = now(),
      encerrado_por = COALESCE(auth.uid(), encerrado_por),
      motivo_encerramento = p_motivo,
      updated_at = now()
  WHERE id = p_pedido_id
    AND status IN (
      'parcial'::public.status_pedido,
      'pendente'::public.status_pedido,
      'aguardando_liberacao'::public.status_pedido,
      'divergencia'::public.status_pedido,
      'recebido'::public.status_pedido
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('pedido_id', p_pedido_id, 'status', 'noop');
  END IF;

  v_pct := public.config_num('tolerancia_pct', 5);
  v_min := public.config_num('tolerancia_min_un', public.config_num('tolerancia_min_cx', 1));
  v_fallback := public.config_num('impacto_falta_por_unidade', 4.5);

  INSERT INTO public.conferencias (pedido_id, status, numero, conferente_id, finalizada_em, observacoes)
  SELECT p_pedido_id, 'finalizada', COALESCE(MAX(numero), 0) + 1, auth.uid(), now(), 'encerramento:' || p_motivo
  FROM public.conferencias WHERE pedido_id = p_pedido_id
  RETURNING id INTO v_conf;

  IF v_conf IS NULL THEN
    INSERT INTO public.conferencias (pedido_id, status, numero, conferente_id, finalizada_em, observacoes)
    VALUES (p_pedido_id, 'finalizada', 1, auth.uid(), now(), 'encerramento:' || p_motivo)
    RETURNING id INTO v_conf;
  END IF;

  FOR v_item IN
    SELECT s.*, ip.preco_unitario
    FROM public.v_saldo_item_pedido s
    JOIN public.itens_pedido ip ON ip.id = s.item_pedido_id
    WHERE s.pedido_id = p_pedido_id AND s.saldo > 0
  LOOP
    v_limite := GREATEST((v_pct / 100.0) * v_item.quantidade_pedida, v_min);
    v_dentro := v_item.saldo <= v_limite;
    INSERT INTO public.itens_conferencia (
      conferencia_id, item_pedido_id, quantidade_recebida, conferido,
      divergencia, quantidade_divergencia, dentro_tolerancia, valor_divergencia,
      estimado, tolerancia_pct_aplicada
    ) VALUES (
      v_conf, v_item.item_pedido_id, 0, TRUE,
      'falta', v_item.saldo, v_dentro,
      v_item.saldo * COALESCE(v_item.preco_unitario, v_fallback),
      v_item.preco_unitario IS NULL, v_pct
    );
  END LOOP;

  RETURN jsonb_build_object('pedido_id', p_pedido_id, 'status', 'encerrado', 'conferencia_id', v_conf);
END;
$$;

DROP FUNCTION IF EXISTS public.encerrar_pedido(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.encerrar_pedido(p_pedido_id UUID, p_motivo TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem encerrar pedidos';
  END IF;
  RETURN public._encerrar_pedido_interno(p_pedido_id, p_motivo);
END;
$$;

CREATE OR REPLACE FUNCTION public.encerrar_pedidos_vencidos()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dias INT;
  v_id UUID;
  n INT := 0;
BEGIN
  v_dias := public.config_num('dias_encerrar_pedido', 1)::INT;
  FOR v_id IN
    SELECT id FROM public.pedidos_recebimento
    WHERE status = 'parcial'::public.status_pedido
      AND COALESCE(data_prevista, data_pedido) + v_dias <= public.today_brt()
  LOOP
    PERFORM public._encerrar_pedido_interno(
      v_id,
      'Encerramento automático por saldo após data prevista'
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public._encerrar_pedido_interno(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encerrar_pedido(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.encerrar_pedidos_vencidos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encerrar_pedido(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_pedidos_vencidos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_pedidos_vencidos() TO service_role;

-- ------------------------------------------------------------
-- PH-B18: unique inventario + limpeza de duplicados
-- ------------------------------------------------------------
DELETE FROM public.movimentacoes_caixa a
USING public.movimentacoes_caixa b
WHERE a.documento_tipo IN ('contagem', 'inventario')
  AND b.documento_tipo = a.documento_tipo
  AND a.documento_id IS NOT NULL
  AND a.documento_id = b.documento_id
  AND a.tipo_caixa = b.tipo_caixa
  AND a.id <> b.id
  AND (
    a.created_at > b.created_at
    OR (a.created_at = b.created_at AND a.id > b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_mov_inventario_tipo
  ON public.movimentacoes_caixa (documento_id, tipo_caixa)
  WHERE documento_tipo IN ('contagem', 'inventario')
    AND documento_id IS NOT NULL;

-- ------------------------------------------------------------
-- PH-C07: inventário nas 3 posições + motivos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.motivos_ajuste_caixa (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                   TEXT NOT NULL,
  sentido                TEXT NOT NULL CHECK (sentido IN ('entrada', 'saida', 'transferencia')),
  natureza               TEXT NOT NULL CHECK (natureza IN ('perda', 'ajuste')),
  entra_em_custo         BOOLEAN NOT NULL DEFAULT FALSE,
  exige_posicao_contraria BOOLEAN NOT NULL DEFAULT FALSE,
  ativo                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.motivos_ajuste_caixa (nome, sentido, natureza, entra_em_custo, exige_posicao_contraria)
SELECT v.nome, v.sentido, v.natureza, v.entra_em_custo, v.exige
FROM (VALUES
  ('Perda / extravio', 'saida', 'perda', TRUE, FALSE),
  ('Ajuste de inventário (entrada)', 'entrada', 'ajuste', FALSE, FALSE),
  ('Ajuste de inventário (saída)', 'saida', 'ajuste', FALSE, FALSE),
  ('Transferência entre posições', 'transferencia', 'ajuste', FALSE, TRUE)
) AS v(nome, sentido, natureza, entra_em_custo, exige)
WHERE NOT EXISTS (
  SELECT 1 FROM public.motivos_ajuste_caixa m WHERE m.nome = v.nome
);

CREATE TABLE IF NOT EXISTS public.contagens_caixa (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posicao_id     UUID NOT NULL REFERENCES public.posicoes_caixa(id),
  origem         TEXT NOT NULL DEFAULT 'interna' CHECK (origem IN ('interna', 'motorista', 'fornecedor')),
  data           DATE NOT NULL DEFAULT CURRENT_DATE,
  contado_por    UUID REFERENCES public.profiles(id),
  status         public.status_contagem NOT NULL DEFAULT 'pendente',
  observacao     TEXT,
  motivo_id      UUID REFERENCES public.motivos_ajuste_caixa(id),
  conciliado_por UUID REFERENCES public.profiles(id),
  conciliado_em  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contagem_caixa_itens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id         UUID NOT NULL REFERENCES public.contagens_caixa(id) ON DELETE CASCADE,
  tipo_caixa          TEXT NOT NULL,
  qtd_contada         INT NOT NULL DEFAULT 0,
  qtd_calculada       INT NOT NULL DEFAULT 0,
  diferenca           INT NOT NULL DEFAULT 0,
  ajuste_movimento_id UUID REFERENCES public.movimentacoes_caixa(id),
  CONSTRAINT uq_contagem_caixa_tipo UNIQUE (contagem_id, tipo_caixa)
);

INSERT INTO public.contagens_caixa (id, posicao_id, origem, data, contado_por, status, observacao, created_at)
SELECT g.id,
       (SELECT p.id FROM public.posicoes_caixa p WHERE p.tipo = 'galpao' LIMIT 1),
       'interna',
       g.data,
       g.contado_por,
       g.status,
       g.observacao,
       g.created_at
FROM public.contagens_galpao g
WHERE NOT EXISTS (SELECT 1 FROM public.contagens_caixa c WHERE c.id = g.id)
  AND EXISTS (SELECT 1 FROM public.posicoes_caixa p WHERE p.tipo = 'galpao');

INSERT INTO public.contagem_caixa_itens (id, contagem_id, tipo_caixa, qtd_contada, qtd_calculada, diferenca, ajuste_movimento_id)
SELECT i.id, i.contagem_id, i.tipo_caixa_sigla, i.qtd_contada, i.qtd_calculada, i.diferenca, i.ajuste_movimento_id
FROM public.contagem_galpao_itens i
WHERE EXISTS (SELECT 1 FROM public.contagens_caixa c WHERE c.id = i.contagem_id)
  AND NOT EXISTS (SELECT 1 FROM public.contagem_caixa_itens n WHERE n.id = i.id);

CREATE OR REPLACE VIEW public.v_contagens_galpao
WITH (security_invoker = true) AS
SELECT c.id, c.data, c.contado_por, c.status, c.observacao, c.created_at, c.conciliado_por, c.conciliado_em
FROM public.contagens_caixa c
JOIN public.posicoes_caixa p ON p.id = c.posicao_id
WHERE p.tipo = 'galpao';

GRANT SELECT ON public.v_contagens_galpao TO authenticated;

ALTER TABLE public.contagens_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contagem_caixa_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motivos_ajuste_caixa ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['contagens_caixa', 'contagem_caixa_itens', 'motivos_ajuste_caixa'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_auth', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert_auth', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update_auth', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete_admin', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (TRUE)', tbl || '_select_auth', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (TRUE)', tbl || '_insert_auth', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (TRUE)', tbl || '_update_auth', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_admin())', tbl || '_delete_admin', tbl);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.conciliar_inventario(
  p_contagem_id UUID,
  p_motivo_id UUID,
  p_observacao TEXT DEFAULT NULL,
  p_posicao_contraria_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cont record;
  v_motivo record;
  v_item record;
  v_mov UUID;
  v_nat TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem conciliar inventário';
  END IF;

  SELECT * INTO v_cont FROM public.contagens_caixa WHERE id = p_contagem_id;
  IF v_cont.id IS NULL THEN
    RAISE EXCEPTION 'Contagem não encontrada';
  END IF;
  IF v_cont.status <> 'pendente' THEN
    RAISE EXCEPTION 'Conciliação já existente não reabre';
  END IF;

  SELECT * INTO v_motivo FROM public.motivos_ajuste_caixa WHERE id = p_motivo_id AND ativo;
  IF v_motivo.id IS NULL THEN
    RAISE EXCEPTION 'Motivo de ajuste inválido';
  END IF;
  IF v_motivo.exige_posicao_contraria AND p_posicao_contraria_id IS NULL THEN
    RAISE EXCEPTION 'Este motivo exige posição contrária';
  END IF;

  FOR v_item IN
    SELECT * FROM public.contagem_caixa_itens WHERE contagem_id = p_contagem_id AND diferenca <> 0
  LOOP
    v_nat := v_motivo.natureza;
    IF v_motivo.exige_posicao_contraria THEN
      INSERT INTO public.movimentacoes_caixa (
        tipo, natureza, tipo_caixa, quantidade,
        origem_posicao_id, destino_posicao_id,
        registrado_por, observacoes, data_movimento,
        documento_tipo, documento_id, confirmacao_status
      ) VALUES (
        'ajuste', v_nat, v_item.tipo_caixa, ABS(v_item.diferenca),
        CASE WHEN v_item.diferenca > 0 THEN p_posicao_contraria_id ELSE v_cont.posicao_id END,
        CASE WHEN v_item.diferenca > 0 THEN v_cont.posicao_id ELSE p_posicao_contraria_id END,
        auth.uid(), COALESCE(p_observacao, v_motivo.nome), public.today_brt(),
        'inventario', p_contagem_id, 'nao_aplicavel'
      )
      RETURNING id INTO v_mov;
    ELSIF v_item.diferenca > 0 THEN
      INSERT INTO public.movimentacoes_caixa (
        tipo, natureza, tipo_caixa, quantidade,
        destino_posicao_id, registrado_por, observacoes, data_movimento,
        documento_tipo, documento_id, confirmacao_status
      ) VALUES (
        'ajuste', 'ajuste', v_item.tipo_caixa, v_item.diferenca,
        v_cont.posicao_id, auth.uid(), COALESCE(p_observacao, v_motivo.nome), public.today_brt(),
        'inventario', p_contagem_id, 'nao_aplicavel'
      )
      RETURNING id INTO v_mov;
    ELSE
      INSERT INTO public.movimentacoes_caixa (
        tipo, natureza, tipo_caixa, quantidade,
        origem_posicao_id, registrado_por, observacoes, data_movimento,
        documento_tipo, documento_id, confirmacao_status
      ) VALUES (
        'ajuste', v_nat, v_item.tipo_caixa, ABS(v_item.diferenca),
        v_cont.posicao_id, auth.uid(), COALESCE(p_observacao, v_motivo.nome), public.today_brt(),
        'inventario', p_contagem_id, 'nao_aplicavel'
      )
      RETURNING id INTO v_mov;
    END IF;

    UPDATE public.contagem_caixa_itens
    SET ajuste_movimento_id = v_mov
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.contagens_caixa
  SET status = 'conciliada',
      motivo_id = p_motivo_id,
      observacao = COALESCE(p_observacao, observacao),
      conciliado_por = auth.uid(),
      conciliado_em = now()
  WHERE id = p_contagem_id;

  RETURN jsonb_build_object('contagem_id', p_contagem_id, 'status', 'conciliada');
END;
$$;

REVOKE ALL ON FUNCTION public.conciliar_inventario(UUID, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conciliar_inventario(UUID, UUID, TEXT, UUID) TO authenticated;

INSERT INTO public.pages (slug, nome, grupo, icone, ordem) VALUES
  ('caixas/inventario', 'Inventário de caixas', 'Caixas', 'Warehouse', 17)
ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, grupo = EXCLUDED.grupo, ordem = EXCLUDED.ordem;

NOTIFY pgrst, 'reload schema';
