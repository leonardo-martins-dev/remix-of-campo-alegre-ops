-- ============================================================
-- NOP-129 — Saída na roça
-- Etapa opcional entre o pedido e a conferência de chegada.
-- Fornecedor/motorista/admin registra o que saiu da roça; as caixas
-- cheias saem do fornecedor e ficam em trânsito (motorista) até a
-- chegada no packing, quando vão para o galpão.
--
-- Nada bloqueia: sem saída, a chegada continua exatamente como hoje.
--
-- Atenção: valores novos de enum criados aqui só podem ser usados
-- depois do commit desta transação. Por isso nenhuma expressão fora de
-- corpo de função usa 'em_transito'/'motorista' — as views comparam
-- com ::text e o seed das posições fica em 00043.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Novos valores de enum
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_pedido' AND e.enumlabel = 'em_transito'
  ) THEN ALTER TYPE public.status_pedido ADD VALUE 'em_transito'; END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tipo_posicao_caixa' AND e.enumlabel = 'motorista'
  ) THEN ALTER TYPE public.tipo_posicao_caixa ADD VALUE 'motorista'; END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Tabelas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saidas_roca (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id            UUID NOT NULL REFERENCES public.pedidos_recebimento(id) ON DELETE CASCADE,
  -- entrega a que a saída se refere (numero da conferência de chegada).
  -- Um pedido parcial pode ter várias saídas, uma por entrega.
  conferencia_numero   INT,
  conferencia_id       UUID REFERENCES public.conferencias(id) ON DELETE SET NULL,
  fornecedor_id        UUID NOT NULL REFERENCES public.fornecedores(id),
  motorista_id         UUID REFERENCES public.motoristas(id),
  veiculo_fornecedor   BOOLEAN NOT NULL DEFAULT FALSE,
  registrado_por       UUID REFERENCES public.profiles(id),
  registrado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  chegada_em           TIMESTAMPTZ,
  total_caixas         INT NOT NULL DEFAULT 0,
  total_caixas_chegada INT,
  foto_url             TEXT,
  observacoes          TEXT,
  status               TEXT NOT NULL DEFAULT 'confirmada',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_saida_roca_status CHECK (status IN ('confirmada', 'recebida', 'cancelada')),
  CONSTRAINT ck_saida_roca_transporte CHECK (veiculo_fornecedor OR motorista_id IS NOT NULL)
);

-- Uma saída por entrega (pedido + numero da conferência).
CREATE UNIQUE INDEX IF NOT EXISTS uq_saida_roca_entrega
  ON public.saidas_roca (pedido_id, conferencia_numero)
  WHERE status <> 'cancelada';

CREATE INDEX IF NOT EXISTS idx_saida_roca_pedido ON public.saidas_roca (pedido_id);
CREATE INDEX IF NOT EXISTS idx_saida_roca_fornecedor ON public.saidas_roca (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_saida_roca_status ON public.saidas_roca (status);

CREATE TABLE IF NOT EXISTS public.itens_saida_roca (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saida_id            UUID NOT NULL REFERENCES public.saidas_roca(id) ON DELETE CASCADE,
  item_pedido_id      UUID REFERENCES public.itens_pedido(id) ON DELETE SET NULL,
  produto_id          UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  quantidade_pedida   NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantidade_unidades NUMERIC(10,2),
  total_caixas        INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_item_saida_roca UNIQUE (saida_id, item_pedido_id)
);

CREATE INDEX IF NOT EXISTS idx_item_saida_roca_saida ON public.itens_saida_roca (saida_id);
CREATE INDEX IF NOT EXISTS idx_item_saida_roca_item_pedido ON public.itens_saida_roca (item_pedido_id);

CREATE TABLE IF NOT EXISTS public.caixas_item_saida (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_saida_id    UUID NOT NULL REFERENCES public.itens_saida_roca(id) ON DELETE CASCADE,
  tipo_caixa_id    UUID REFERENCES public.tipos_caixa(id) ON DELETE SET NULL,
  tipo_caixa_sigla TEXT NOT NULL,
  qtd              INT NOT NULL DEFAULT 0,
  fator_usado      NUMERIC(10,2),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_caixa_item_saida UNIQUE (item_saida_id, tipo_caixa_id)
);

CREATE INDEX IF NOT EXISTS idx_caixa_item_saida ON public.caixas_item_saida (item_saida_id);

DROP TRIGGER IF EXISTS set_updated_at_saidas_roca ON public.saidas_roca;
CREATE TRIGGER set_updated_at_saidas_roca
  BEFORE UPDATE ON public.saidas_roca
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- 3. Divergência de transporte na chegada (saída × chegada)
-- Separada da divergência pedido × recebido, que continua em
-- itens_conferencia.divergencia / quantidade_divergencia.
-- ------------------------------------------------------------
ALTER TABLE public.itens_conferencia
  ADD COLUMN IF NOT EXISTS qtd_saida_caixas INT,
  ADD COLUMN IF NOT EXISTS qtd_chegada_caixas INT,
  ADD COLUMN IF NOT EXISTS divergencia_transporte_caixas INT,
  ADD COLUMN IF NOT EXISTS divergencia_transporte_unidades NUMERIC(10,2);

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
ALTER TABLE public.saidas_roca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_saida_roca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixas_item_saida ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saidas_roca_select_auth ON public.saidas_roca;
CREATE POLICY saidas_roca_select_auth ON public.saidas_roca
  FOR SELECT TO authenticated
  USING (
    public.current_fornecedor_id() IS NULL
    OR fornecedor_id = public.current_fornecedor_id()
  );
DROP POLICY IF EXISTS saidas_roca_insert_auth ON public.saidas_roca;
CREATE POLICY saidas_roca_insert_auth ON public.saidas_roca
  FOR INSERT TO authenticated WITH CHECK (TRUE);
DROP POLICY IF EXISTS saidas_roca_update_auth ON public.saidas_roca;
CREATE POLICY saidas_roca_update_auth ON public.saidas_roca
  FOR UPDATE TO authenticated USING (TRUE);
DROP POLICY IF EXISTS saidas_roca_delete_admin ON public.saidas_roca;
CREATE POLICY saidas_roca_delete_admin ON public.saidas_roca
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS itens_saida_roca_select_auth ON public.itens_saida_roca;
CREATE POLICY itens_saida_roca_select_auth ON public.itens_saida_roca
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS itens_saida_roca_insert_auth ON public.itens_saida_roca;
CREATE POLICY itens_saida_roca_insert_auth ON public.itens_saida_roca
  FOR INSERT TO authenticated WITH CHECK (TRUE);
DROP POLICY IF EXISTS itens_saida_roca_update_auth ON public.itens_saida_roca;
CREATE POLICY itens_saida_roca_update_auth ON public.itens_saida_roca
  FOR UPDATE TO authenticated USING (TRUE);
DROP POLICY IF EXISTS itens_saida_roca_delete_admin ON public.itens_saida_roca;
CREATE POLICY itens_saida_roca_delete_admin ON public.itens_saida_roca
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS caixas_item_saida_select_auth ON public.caixas_item_saida;
CREATE POLICY caixas_item_saida_select_auth ON public.caixas_item_saida
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS caixas_item_saida_insert_auth ON public.caixas_item_saida;
CREATE POLICY caixas_item_saida_insert_auth ON public.caixas_item_saida
  FOR INSERT TO authenticated WITH CHECK (TRUE);
DROP POLICY IF EXISTS caixas_item_saida_update_auth ON public.caixas_item_saida;
CREATE POLICY caixas_item_saida_update_auth ON public.caixas_item_saida
  FOR UPDATE TO authenticated USING (TRUE);
DROP POLICY IF EXISTS caixas_item_saida_delete_admin ON public.caixas_item_saida;
CREATE POLICY caixas_item_saida_delete_admin ON public.caixas_item_saida
  FOR DELETE USING (public.is_admin());

-- ------------------------------------------------------------
-- 5. RPC: confirmar saída na roça (atômico)
-- p_itens: [{ item_pedido_id, produto_id, quantidade_pedida,
--             quantidade_unidades, caixas: [{ tipo_caixa_id,
--             tipo_caixa_sigla, qtd, fator_usado }] }]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_saida_roca(
  p_pedido_id UUID,
  p_itens JSONB,
  p_motorista_id UUID DEFAULT NULL,
  p_veiculo_fornecedor BOOLEAN DEFAULT FALSE,
  p_foto_url TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_perfil RECORD;
  v_numero INT;
  v_saida_id UUID;
  v_item JSONB;
  v_caixa JSONB;
  v_item_saida_id UUID;
  v_item_caixas INT;
  v_total INT := 0;
  v_origem UUID;
  v_destino UUID;
  v_motorista UUID := p_motorista_id;
  v_veiculo BOOLEAN := COALESCE(p_veiculo_fornecedor, FALSE);
BEGIN
  SELECT pr.id, pr.fornecedor_id, pr.status::text AS status
  INTO v_pedido
  FROM public.pedidos_recebimento pr
  WHERE pr.id = p_pedido_id
  FOR UPDATE;

  IF v_pedido.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  SELECT p.fornecedor_id, p.motorista_id
  INTO v_perfil
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_perfil.fornecedor_id IS NOT NULL AND v_perfil.fornecedor_id <> v_pedido.fornecedor_id THEN
    RAISE EXCEPTION 'Este pedido é de outro fornecedor';
  END IF;

  IF v_veiculo THEN
    v_motorista := NULL;
  ELSIF NOT public.is_admin() AND v_perfil.motorista_id IS NOT NULL THEN
    -- motorista logado só registra em nome dele mesmo
    v_motorista := v_perfil.motorista_id;
  END IF;

  IF NOT v_veiculo AND v_motorista IS NULL THEN
    RAISE EXCEPTION 'Informe o motorista ou marque veículo do fornecedor';
  END IF;

  IF v_pedido.status NOT IN ('pendente', 'parcial') THEN
    RAISE EXCEPTION 'Pedido não está aberto para saída (status: %)', v_pedido.status;
  END IF;

  -- Entrega alvo: conferência aberta, se houver; senão a próxima.
  SELECT c.numero INTO v_numero
  FROM public.conferencias c
  WHERE c.pedido_id = p_pedido_id
    AND c.status::text IN ('em_andamento', 'parcial')
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_numero IS NULL THEN
    SELECT COALESCE(MAX(c.numero), 0) + 1 INTO v_numero
    FROM public.conferencias c
    WHERE c.pedido_id = p_pedido_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.conferencias c
    WHERE c.pedido_id = p_pedido_id
      AND c.numero = v_numero
      AND c.status::text = 'finalizada'
  ) THEN
    RAISE EXCEPTION 'A chegada desta entrega já foi finalizada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.saidas_roca s
    WHERE s.pedido_id = p_pedido_id
      AND s.conferencia_numero = v_numero
      AND s.status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'Já existe saída registrada para esta entrega';
  END IF;

  INSERT INTO public.saidas_roca (
    pedido_id, conferencia_numero, fornecedor_id, motorista_id,
    veiculo_fornecedor, registrado_por, foto_url, observacoes
  ) VALUES (
    p_pedido_id, v_numero, v_pedido.fornecedor_id, v_motorista,
    v_veiculo, auth.uid(), p_foto_url, p_observacoes
  )
  RETURNING id INTO v_saida_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_itens, '[]'::jsonb)) LOOP
    v_item_caixas := 0;

    INSERT INTO public.itens_saida_roca (
      saida_id, item_pedido_id, produto_id, quantidade_pedida, quantidade_unidades
    ) VALUES (
      v_saida_id,
      NULLIF(v_item->>'item_pedido_id', '')::uuid,
      NULLIF(v_item->>'produto_id', '')::uuid,
      COALESCE(NULLIF(v_item->>'quantidade_pedida', '')::numeric, 0),
      NULLIF(v_item->>'quantidade_unidades', '')::numeric
    )
    RETURNING id INTO v_item_saida_id;

    FOR v_caixa IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'caixas', '[]'::jsonb)) LOOP
      IF COALESCE(NULLIF(v_caixa->>'qtd', '')::int, 0) > 0 THEN
        INSERT INTO public.caixas_item_saida (
          item_saida_id, tipo_caixa_id, tipo_caixa_sigla, qtd, fator_usado
        ) VALUES (
          v_item_saida_id,
          NULLIF(v_caixa->>'tipo_caixa_id', '')::uuid,
          v_caixa->>'tipo_caixa_sigla',
          (v_caixa->>'qtd')::int,
          NULLIF(v_caixa->>'fator_usado', '')::numeric
        )
        ON CONFLICT (item_saida_id, tipo_caixa_id) DO UPDATE SET qtd = EXCLUDED.qtd;

        v_item_caixas := v_item_caixas + (v_caixa->>'qtd')::int;
      END IF;
    END LOOP;

    UPDATE public.itens_saida_roca SET total_caixas = v_item_caixas WHERE id = v_item_saida_id;
    v_total := v_total + v_item_caixas;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma caixa';
  END IF;

  UPDATE public.saidas_roca SET total_caixas = v_total WHERE id = v_saida_id;

  UPDATE public.pedidos_recebimento
  SET status = 'em_transito'::public.status_pedido, updated_at = now()
  WHERE id = p_pedido_id;

  -- Ledger NOP-21: fornecedor → motorista (em trânsito).
  -- Veículo do fornecedor usa a posição de trânsito sem motorista (ref_id NULL).
  v_origem := public.ensure_posicao('fornecedor', v_pedido.fornecedor_id);
  v_destino := public.ensure_posicao('motorista', v_motorista);

  INSERT INTO public.movimentacoes_caixa (
    tipo, natureza, tipo_caixa, quantidade,
    origem_posicao_id, destino_posicao_id,
    fornecedor_id, motorista_id, registrado_por, observacoes,
    data_movimento, hora_registro, documento_tipo, documento_id, confirmacao_status
  )
  SELECT
    'transferencia'::public.tipo_movimentacao,
    'transferencia'::public.tipo_movimentacao,
    cis.tipo_caixa_sigla,
    SUM(cis.qtd)::int,
    v_origem,
    v_destino,
    v_pedido.fornecedor_id,
    v_motorista,
    auth.uid(),
    CASE WHEN v_veiculo THEN 'Saída na roça · veículo do fornecedor' ELSE 'Saída na roça' END,
    public.today_brt(),
    now(),
    'saida_roca',
    v_saida_id,
    'nao_aplicavel'::public.confirmacao_movimento
  FROM public.caixas_item_saida cis
  JOIN public.itens_saida_roca isr ON isr.id = cis.item_saida_id
  WHERE isr.saida_id = v_saida_id AND cis.qtd > 0
  GROUP BY cis.tipo_caixa_sigla;

  RETURN jsonb_build_object(
    'saida_id', v_saida_id,
    'conferencia_numero', v_numero,
    'total_caixas', v_total,
    'motorista_id', v_motorista,
    'veiculo_fornecedor', v_veiculo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_saida_roca(UUID, JSONB, UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_saida_roca(UUID, JSONB, UUID, BOOLEAN, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 6. RPC: chegada no packing (motorista → galpão)
-- p_caixas: { "VM": 12, "AM": 3 } — total que chegou por tipo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_chegada_saida_roca(
  p_saida_id UUID,
  p_conferencia_id UUID,
  p_caixas JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saida RECORD;
  v_origem UUID;
  v_galpao UUID;
  v_total INT := 0;
BEGIN
  SELECT * INTO v_saida FROM public.saidas_roca WHERE id = p_saida_id FOR UPDATE;
  IF v_saida.id IS NULL THEN
    RAISE EXCEPTION 'Saída na roça não encontrada';
  END IF;

  v_origem := public.ensure_posicao('motorista', v_saida.motorista_id);
  v_galpao := public.ensure_posicao('galpao', NULL);

  -- idempotente: refinalizar a mesma entrega substitui o movimento
  DELETE FROM public.movimentacoes_caixa
  WHERE documento_tipo = 'chegada_roca' AND documento_id = p_saida_id;

  INSERT INTO public.movimentacoes_caixa (
    tipo, natureza, tipo_caixa, quantidade,
    origem_posicao_id, destino_posicao_id,
    fornecedor_id, motorista_id, registrado_por, observacoes,
    data_movimento, hora_registro, documento_tipo, documento_id, confirmacao_status
  )
  SELECT
    'transferencia'::public.tipo_movimentacao,
    'transferencia'::public.tipo_movimentacao,
    c.key,
    c.value::int,
    v_origem,
    v_galpao,
    v_saida.fornecedor_id,
    v_saida.motorista_id,
    auth.uid(),
    'Chegada no packing · saída na roça',
    public.today_brt(),
    now(),
    'chegada_roca',
    p_saida_id,
    'nao_aplicavel'::public.confirmacao_movimento
  FROM jsonb_each_text(COALESCE(p_caixas, '{}'::jsonb)) AS c(key, value)
  WHERE COALESCE(NULLIF(c.value, '')::int, 0) > 0;

  SELECT COALESCE(SUM(COALESCE(NULLIF(c.value, '')::int, 0)), 0) INTO v_total
  FROM jsonb_each_text(COALESCE(p_caixas, '{}'::jsonb)) AS c(key, value);

  UPDATE public.saidas_roca
  SET status = 'recebida',
      chegada_em = now(),
      conferencia_id = COALESCE(p_conferencia_id, conferencia_id),
      total_caixas_chegada = v_total,
      updated_at = now()
  WHERE id = p_saida_id;

  RETURN jsonb_build_object(
    'saida_id', p_saida_id,
    'total_caixas_saida', v_saida.total_caixas,
    'total_caixas_chegada', v_total,
    'divergencia_transporte_caixas', v_total - v_saida.total_caixas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_chegada_saida_roca(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_chegada_saida_roca(UUID, UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 7. Views
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_saidas_roca;
CREATE VIEW public.v_saidas_roca
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.pedido_id,
  pr.codigo AS pedido_codigo,
  pr.data_pedido,
  pr.status::text AS pedido_status,
  s.conferencia_numero,
  s.conferencia_id,
  s.fornecedor_id,
  f.nome AS fornecedor_nome,
  s.motorista_id,
  m.nome AS motorista_nome,
  s.veiculo_fornecedor,
  s.registrado_por,
  s.registrado_em,
  s.chegada_em,
  s.total_caixas,
  s.total_caixas_chegada,
  s.foto_url,
  s.observacoes,
  s.status,
  EXTRACT(EPOCH FROM (now() - s.registrado_em)) / 60 AS minutos_em_transito
FROM public.saidas_roca s
JOIN public.pedidos_recebimento pr ON pr.id = s.pedido_id
JOIN public.fornecedores f ON f.id = s.fornecedor_id
LEFT JOIN public.motoristas m ON m.id = s.motorista_id;

GRANT SELECT ON public.v_saidas_roca TO authenticated;

-- Divergência de transporte (saída × chegada) — insumo para NOP-18 custos.
DROP VIEW IF EXISTS public.v_divergencia_transporte;
CREATE VIEW public.v_divergencia_transporte
WITH (security_invoker = true) AS
SELECT
  s.id AS saida_id,
  s.pedido_id,
  pr.codigo AS pedido_codigo,
  pr.data_pedido,
  s.conferencia_id,
  s.fornecedor_id,
  f.nome AS fornecedor_nome,
  s.motorista_id,
  m.nome AS motorista_nome,
  s.veiculo_fornecedor,
  s.registrado_em,
  s.chegada_em,
  s.total_caixas AS caixas_saida,
  COALESCE(s.total_caixas_chegada, 0) AS caixas_chegada,
  COALESCE(s.total_caixas_chegada, 0) - s.total_caixas AS divergencia_caixas,
  COALESCE(SUM(ic.divergencia_transporte_unidades), 0) AS divergencia_unidades
FROM public.saidas_roca s
JOIN public.pedidos_recebimento pr ON pr.id = s.pedido_id
JOIN public.fornecedores f ON f.id = s.fornecedor_id
LEFT JOIN public.motoristas m ON m.id = s.motorista_id
LEFT JOIN public.itens_conferencia ic ON ic.conferencia_id = s.conferencia_id
WHERE s.status = 'recebida'
GROUP BY s.id, pr.codigo, pr.data_pedido, f.nome, m.nome;

GRANT SELECT ON public.v_divergencia_transporte TO authenticated;

-- ------------------------------------------------------------
-- 8. Página + permissões
-- ------------------------------------------------------------
INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo) VALUES
  ('recebimento/saida-roca', 'Saída na roça', 'Recebimento', 'Truck', 3, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

-- Fornecedores e motoristas já cadastrados ganham acesso direto.
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT pf.id, pg.id, TRUE
FROM public.profiles pf
CROSS JOIN public.pages pg
WHERE pg.slug = 'recebimento/saida-roca'
  AND (pf.fornecedor_id IS NOT NULL OR pf.motorista_id IS NOT NULL)
ON CONFLICT (user_id, page_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
