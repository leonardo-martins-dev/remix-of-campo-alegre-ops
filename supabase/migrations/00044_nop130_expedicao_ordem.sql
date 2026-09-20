-- ============================================================
-- NOP-130 — Expedição: Saída para o supermercado pela Ordem de Separação
--
-- Três etapas sobre a mesma ordem (carga):
--   1. Base       — ordem importada do Wise (nº, loja+CNPJ, itens por família,
--                   totais e qtde de caixas do Wise)
--   2. Separação  — caixas numeradas 1/N..N/N com conteúdo; Separado por
--   3. Saída      — motorista + supermercado; Conferido por; galpão → motorista
--   4. Entrega    — motorista na loja: entregues / recusadas + vazias
--
-- Status da ordem é TEXT + CHECK (e não enum) de propósito: evita o problema de
-- "unsafe use of new value" e mantém cargas.status legado intacto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ordem de separação sobre cargas
-- ------------------------------------------------------------
ALTER TABLE public.cargas
  ADD COLUMN IF NOT EXISTS numero_ordem TEXT,
  ADD COLUMN IF NOT EXISTS cliente_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS qtde_itens_wise NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS qtde_caixas_wise INT,
  ADD COLUMN IF NOT EXISTS status_ordem TEXT NOT NULL DEFAULT 'importada',
  ADD COLUMN IF NOT EXISTS separado_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS separado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conferido_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS conferido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entregue_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recebedor_nome TEXT,
  ADD COLUMN IF NOT EXISTS canhoto_foto_url TEXT,
  ADD COLUMN IF NOT EXISTS confirmacao_manual_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS justificativa_admin TEXT;

DO $$ BEGIN
  ALTER TABLE public.cargas
    ADD CONSTRAINT ck_cargas_status_ordem CHECK (status_ordem IN (
      'importada', 'separada', 'em_transito', 'entregue', 'entregue_parcial', 'recusada'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Preenche o número da ordem das cargas PV-{nr} já importadas.
UPDATE public.cargas
SET numero_ordem = regexp_replace(codigo, '^PV-', '')
WHERE numero_ordem IS NULL AND codigo ~ '^PV-';

CREATE INDEX IF NOT EXISTS idx_cargas_numero_ordem ON public.cargas (numero_ordem);
CREATE INDEX IF NOT EXISTS idx_cargas_status_ordem ON public.cargas (status_ordem);

-- ------------------------------------------------------------
-- 2. Caixas da ordem (etiqueta "130572 · 2/4") e seu conteúdo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.caixas_ordem (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id         UUID NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  numero           INT NOT NULL,
  total_caixas     INT NOT NULL DEFAULT 1,
  codigo_etiqueta  TEXT NOT NULL,
  tipo_caixa_id    UUID REFERENCES public.tipos_caixa(id) ON DELETE SET NULL,
  tipo_caixa_sigla TEXT,
  status           TEXT NOT NULL DEFAULT 'separada',
  motivo_recusa    TEXT,
  separado_por     UUID REFERENCES public.profiles(id),
  separado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  saida_em         TIMESTAMPTZ,
  entregue_em      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_caixa_ordem_numero UNIQUE (carga_id, numero),
  CONSTRAINT ck_caixa_ordem_status CHECK (status IN (
    'separada', 'em_transito', 'entregue', 'recusada', 'nao_localizada'
  ))
);

CREATE INDEX IF NOT EXISTS idx_caixas_ordem_carga ON public.caixas_ordem (carga_id);
CREATE INDEX IF NOT EXISTS idx_caixas_ordem_etiqueta ON public.caixas_ordem (codigo_etiqueta);

CREATE TABLE IF NOT EXISTS public.itens_caixa_ordem (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id            UUID NOT NULL REFERENCES public.caixas_ordem(id) ON DELETE CASCADE,
  romaneio_item_id    UUID REFERENCES public.romaneio_itens(id) ON DELETE SET NULL,
  produto_id          UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  quantidade          NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantidade_entregue NUMERIC(10,2),
  quantidade_recusada NUMERIC(10,2),
  status              TEXT NOT NULL DEFAULT 'separada',
  motivo_recusa       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_item_caixa_status CHECK (status IN (
    'separada', 'em_transito', 'entregue', 'recusada'
  ))
);

CREATE INDEX IF NOT EXISTS idx_itens_caixa_ordem_caixa ON public.itens_caixa_ordem (caixa_id);
CREATE INDEX IF NOT EXISTS idx_itens_caixa_ordem_produto ON public.itens_caixa_ordem (produto_id);

DROP TRIGGER IF EXISTS set_updated_at_caixas_ordem ON public.caixas_ordem;
CREATE TRIGGER set_updated_at_caixas_ordem
  BEFORE UPDATE ON public.caixas_ordem
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- 3. Saída (conferência de expedição) e entrega na loja
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saidas_expedicao (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id      UUID NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  cliente_id    UUID NOT NULL REFERENCES public.clientes(id),
  motorista_id  UUID REFERENCES public.motoristas(id),
  conferido_por UUID REFERENCES public.profiles(id),
  saida_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_caixas  INT NOT NULL DEFAULT 0,
  observacoes   TEXT,
  status        TEXT NOT NULL DEFAULT 'em_transito',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_saida_expedicao_status CHECK (status IN ('em_transito', 'finalizada', 'cancelada'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_saida_expedicao_carga
  ON public.saidas_expedicao (carga_id) WHERE status <> 'cancelada';
CREATE INDEX IF NOT EXISTS idx_saida_expedicao_motorista ON public.saidas_expedicao (motorista_id);

CREATE TABLE IF NOT EXISTS public.entregas_expedicao (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saida_id                UUID NOT NULL REFERENCES public.saidas_expedicao(id) ON DELETE CASCADE,
  carga_id                UUID NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  motorista_id            UUID REFERENCES public.motoristas(id),
  entregue_por            UUID REFERENCES public.profiles(id),
  entregue_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  recebedor_nome          TEXT,
  canhoto_foto_url        TEXT,
  status                  TEXT NOT NULL DEFAULT 'entregue',
  total_caixas_entregues  INT NOT NULL DEFAULT 0,
  total_caixas_recusadas  INT NOT NULL DEFAULT 0,
  caixas_vazias_retiradas JSONB NOT NULL DEFAULT '{}'::jsonb,
  observacoes             TEXT,
  confirmacao_manual      BOOLEAN NOT NULL DEFAULT FALSE,
  justificativa           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_entrega_expedicao_status CHECK (status IN (
    'entregue', 'entregue_parcial', 'recusada'
  ))
);

CREATE INDEX IF NOT EXISTS idx_entrega_expedicao_carga ON public.entregas_expedicao (carga_id);

CREATE TABLE IF NOT EXISTS public.entregas_caixa (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id  UUID NOT NULL REFERENCES public.entregas_expedicao(id) ON DELETE CASCADE,
  caixa_id    UUID NOT NULL REFERENCES public.caixas_ordem(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  motivo      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_entrega_caixa UNIQUE (entrega_id, caixa_id),
  CONSTRAINT ck_entrega_caixa_status CHECK (status IN ('entregue', 'recusada', 'nao_localizada'))
);

-- ------------------------------------------------------------
-- 4. Quebra de origem expedição (recusa na loja) — NOP-16 reaproveitado
-- ------------------------------------------------------------
ALTER TABLE public.quebras
  ALTER COLUMN fornecedor_id DROP NOT NULL;

ALTER TABLE public.quebras
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'recebimento',
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS carga_id UUID REFERENCES public.cargas(id) ON DELETE SET NULL;

ALTER TABLE public.quebra_itens
  ADD COLUMN IF NOT EXISTS caixa_ordem_id UUID REFERENCES public.caixas_ordem(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo TEXT;

CREATE INDEX IF NOT EXISTS idx_quebras_carga ON public.quebras (carga_id) WHERE carga_id IS NOT NULL;

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------
ALTER TABLE public.caixas_ordem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_caixa_ordem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saidas_expedicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregas_expedicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregas_caixa ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'caixas_ordem', 'itens_caixa_ordem', 'saidas_expedicao', 'entregas_expedicao', 'entregas_caixa'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (TRUE)', t || '_select_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (TRUE)', t || '_insert_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (TRUE)', t || '_update_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_admin())', t || '_delete_admin', t
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6. RPC: confirmar separação da ordem
-- p_caixas: [{ numero, tipo_caixa_id, tipo_caixa_sigla,
--              itens: [{ romaneio_item_id, produto_id, quantidade }] }]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_separacao_ordem(
  p_carga_id UUID,
  p_caixas JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga RECORD;
  v_caixa JSONB;
  v_item JSONB;
  v_caixa_id UUID;
  v_total INT;
  v_numero INT;
  v_etiqueta TEXT;
  v_ordem TEXT;
BEGIN
  SELECT c.id, c.codigo, c.numero_ordem, c.status_ordem
  INTO v_carga
  FROM public.cargas c
  WHERE c.id = p_carga_id
  FOR UPDATE;

  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada';
  END IF;

  IF v_carga.status_ordem NOT IN ('importada', 'separada') THEN
    RAISE EXCEPTION 'Ordem já saiu do packing (status: %)', v_carga.status_ordem;
  END IF;

  v_ordem := COALESCE(v_carga.numero_ordem, regexp_replace(v_carga.codigo, '^PV-', ''));
  v_total := jsonb_array_length(COALESCE(p_caixas, '[]'::jsonb));

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma caixa';
  END IF;

  -- Reseparação substitui as caixas anteriores (ainda não saíram).
  DELETE FROM public.caixas_ordem WHERE carga_id = p_carga_id;

  FOR v_caixa IN SELECT * FROM jsonb_array_elements(p_caixas) LOOP
    v_numero := COALESCE(NULLIF(v_caixa->>'numero', '')::int, 0);
    IF v_numero <= 0 THEN
      RAISE EXCEPTION 'Caixa sem número';
    END IF;
    v_etiqueta := v_ordem || ' · ' || v_numero || '/' || v_total;

    INSERT INTO public.caixas_ordem (
      carga_id, numero, total_caixas, codigo_etiqueta,
      tipo_caixa_id, tipo_caixa_sigla, status, separado_por, separado_em
    ) VALUES (
      p_carga_id, v_numero, v_total, v_etiqueta,
      NULLIF(v_caixa->>'tipo_caixa_id', '')::uuid,
      NULLIF(v_caixa->>'tipo_caixa_sigla', ''),
      'separada', auth.uid(), now()
    )
    RETURNING id INTO v_caixa_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_caixa->'itens', '[]'::jsonb)) LOOP
      IF COALESCE(NULLIF(v_item->>'quantidade', '')::numeric, 0) > 0 THEN
        INSERT INTO public.itens_caixa_ordem (
          caixa_id, romaneio_item_id, produto_id, quantidade, status
        ) VALUES (
          v_caixa_id,
          NULLIF(v_item->>'romaneio_item_id', '')::uuid,
          NULLIF(v_item->>'produto_id', '')::uuid,
          (v_item->>'quantidade')::numeric,
          'separada'
        );
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.cargas
  SET status_ordem = 'separada',
      status_separacao = 'separado',
      separado_por = auth.uid(),
      separado_em = now(),
      numero_ordem = COALESCE(numero_ordem, v_ordem),
      updated_at = now()
  WHERE id = p_carga_id;

  RETURN jsonb_build_object('carga_id', p_carga_id, 'total_caixas', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_separacao_ordem(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_separacao_ordem(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 7. RPC: confirmar saída para o supermercado (galpão → motorista)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_saida_expedicao(
  p_carga_id UUID,
  p_motorista_id UUID,
  p_caixa_ids UUID[] DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga RECORD;
  v_perfil RECORD;
  v_motorista UUID := p_motorista_id;
  v_saida_id UUID;
  v_total INT := 0;
  v_galpao UUID;
  v_destino UUID;
BEGIN
  SELECT c.id, c.cliente_id, c.status_ordem
  INTO v_carga
  FROM public.cargas c
  WHERE c.id = p_carga_id
  FOR UPDATE;

  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'Ordem não encontrada';
  END IF;

  IF v_carga.status_ordem <> 'separada' THEN
    RAISE EXCEPTION 'Só ordens separadas podem sair (status: %)', v_carga.status_ordem;
  END IF;

  SELECT p.motorista_id INTO v_perfil FROM public.profiles p WHERE p.id = auth.uid();
  IF v_motorista IS NULL THEN
    v_motorista := v_perfil.motorista_id;
  END IF;
  IF v_motorista IS NULL THEN
    RAISE EXCEPTION 'Informe o motorista';
  END IF;

  -- Caixas que efetivamente sobem no caminhão (padrão: todas as separadas).
  UPDATE public.caixas_ordem
  SET status = 'em_transito', saida_em = now()
  WHERE carga_id = p_carga_id
    AND status = 'separada'
    AND (p_caixa_ids IS NULL OR id = ANY (p_caixa_ids));

  GET DIAGNOSTICS v_total = ROW_COUNT;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhuma caixa separada para esta ordem';
  END IF;

  UPDATE public.itens_caixa_ordem ico
  SET status = 'em_transito'
  FROM public.caixas_ordem co
  WHERE co.id = ico.caixa_id
    AND co.carga_id = p_carga_id
    AND co.status = 'em_transito';

  INSERT INTO public.saidas_expedicao (
    carga_id, cliente_id, motorista_id, conferido_por, total_caixas, observacoes
  ) VALUES (
    p_carga_id, v_carga.cliente_id, v_motorista, auth.uid(), v_total, p_observacoes
  )
  RETURNING id INTO v_saida_id;

  UPDATE public.cargas
  SET status_ordem = 'em_transito',
      status_separacao = 'carregado',
      status = 'concluida'::public.status_carga,
      motorista_id = COALESCE(motorista_id, v_motorista),
      conferido_por = auth.uid(),
      conferido_em = now(),
      hora_fim = COALESCE(hora_fim, now()),
      progresso = 100,
      updated_at = now()
  WHERE id = p_carga_id;

  -- Ledger NOP-21/129: packing → motorista.
  v_galpao := public.ensure_posicao('galpao', NULL);
  v_destino := public.ensure_posicao('motorista', v_motorista);

  INSERT INTO public.movimentacoes_caixa (
    tipo, natureza, tipo_caixa, quantidade,
    origem_posicao_id, destino_posicao_id,
    cliente_id, motorista_id, carga_parada_id, registrado_por, observacoes,
    data_movimento, hora_registro, documento_tipo, documento_id, confirmacao_status
  )
  SELECT
    'transferencia'::public.tipo_movimentacao,
    'transferencia'::public.tipo_movimentacao,
    co.tipo_caixa_sigla,
    COUNT(*)::int,
    v_galpao,
    v_destino,
    v_carga.cliente_id,
    v_motorista,
    p_carga_id,
    auth.uid(),
    'Saída para o supermercado',
    public.today_brt(),
    now(),
    'saida_expedicao',
    v_saida_id,
    'nao_aplicavel'::public.confirmacao_movimento
  FROM public.caixas_ordem co
  WHERE co.carga_id = p_carga_id
    AND co.status = 'em_transito'
    AND co.tipo_caixa_sigla IS NOT NULL
  GROUP BY co.tipo_caixa_sigla;

  RETURN jsonb_build_object('saida_id', v_saida_id, 'total_caixas', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_saida_expedicao(UUID, UUID, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_saida_expedicao(UUID, UUID, UUID[], TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 8. RPC: confirmar entrega na loja
-- p_caixas: [{ caixa_id, status: entregue|recusada|nao_localizada, motivo }]
-- p_vazias: { "VM": 8, "AM": 2 } — vazias retiradas na loja (opcional)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_entrega_expedicao(
  p_saida_id UUID,
  p_caixas JSONB,
  p_recebedor_nome TEXT DEFAULT NULL,
  p_canhoto_foto_url TEXT DEFAULT NULL,
  p_vazias JSONB DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_confirmacao_manual BOOLEAN DEFAULT FALSE,
  p_justificativa TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saida RECORD;
  v_entrega_id UUID;
  v_entregues INT := 0;
  v_recusadas INT := 0;
  v_status TEXT;
  v_galpao UUID;
  v_origem UUID;
  v_cliente_pos UUID;
  v_quebra_id UUID;
  v_tem_recusa BOOLEAN;
BEGIN
  SELECT s.*, c.numero_ordem, c.codigo
  INTO v_saida
  FROM public.saidas_expedicao s
  JOIN public.cargas c ON c.id = s.carga_id
  WHERE s.id = p_saida_id
  FOR UPDATE OF s;

  IF v_saida.id IS NULL THEN
    RAISE EXCEPTION 'Saída de expedição não encontrada';
  END IF;

  IF v_saida.status = 'finalizada' THEN
    RAISE EXCEPTION 'Entrega desta ordem já foi confirmada';
  END IF;

  INSERT INTO public.entregas_expedicao (
    saida_id, carga_id, motorista_id, entregue_por, recebedor_nome,
    canhoto_foto_url, status, caixas_vazias_retiradas, observacoes,
    confirmacao_manual, justificativa
  ) VALUES (
    p_saida_id, v_saida.carga_id, v_saida.motorista_id, auth.uid(), p_recebedor_nome,
    p_canhoto_foto_url, 'entregue', COALESCE(p_vazias, '{}'::jsonb), p_observacoes,
    COALESCE(p_confirmacao_manual, FALSE), p_justificativa
  )
  RETURNING id INTO v_entrega_id;

  -- Status por caixa (default: entregue quando não informada)
  INSERT INTO public.entregas_caixa (entrega_id, caixa_id, status, motivo)
  SELECT
    v_entrega_id,
    co.id,
    COALESCE(inf.status, 'entregue'),
    inf.motivo
  FROM public.caixas_ordem co
  LEFT JOIN (
    SELECT
      NULLIF(x->>'caixa_id', '')::uuid AS caixa_id,
      NULLIF(x->>'status', '') AS status,
      NULLIF(x->>'motivo', '') AS motivo
    FROM jsonb_array_elements(COALESCE(p_caixas, '[]'::jsonb)) AS x
  ) inf ON inf.caixa_id = co.id
  WHERE co.carga_id = v_saida.carga_id
    AND co.status IN ('em_transito', 'entregue', 'recusada', 'nao_localizada')
  ON CONFLICT (entrega_id, caixa_id) DO NOTHING;

  UPDATE public.caixas_ordem co
  SET status = ec.status,
      motivo_recusa = ec.motivo,
      entregue_em = now()
  FROM public.entregas_caixa ec
  WHERE ec.entrega_id = v_entrega_id AND ec.caixa_id = co.id;

  UPDATE public.itens_caixa_ordem ico
  SET status = CASE WHEN co.status = 'entregue' THEN 'entregue' ELSE 'recusada' END,
      quantidade_entregue = CASE WHEN co.status = 'entregue' THEN ico.quantidade ELSE 0 END,
      quantidade_recusada = CASE WHEN co.status = 'entregue' THEN 0 ELSE ico.quantidade END,
      motivo_recusa = co.motivo_recusa
  FROM public.caixas_ordem co
  WHERE co.id = ico.caixa_id
    AND co.carga_id = v_saida.carga_id
    AND co.status IN ('entregue', 'recusada', 'nao_localizada');

  SELECT
    COUNT(*) FILTER (WHERE status = 'entregue'),
    COUNT(*) FILTER (WHERE status IN ('recusada', 'nao_localizada'))
  INTO v_entregues, v_recusadas
  FROM public.entregas_caixa WHERE entrega_id = v_entrega_id;

  v_status := CASE
    WHEN v_entregues = 0 THEN 'recusada'
    WHEN v_recusadas > 0 THEN 'entregue_parcial'
    ELSE 'entregue'
  END;

  UPDATE public.entregas_expedicao
  SET status = v_status,
      total_caixas_entregues = v_entregues,
      total_caixas_recusadas = v_recusadas
  WHERE id = v_entrega_id;

  UPDATE public.saidas_expedicao SET status = 'finalizada', updated_at = now() WHERE id = p_saida_id;

  UPDATE public.cargas
  SET status_ordem = v_status,
      entregue_por = auth.uid(),
      entregue_em = now(),
      recebedor_nome = COALESCE(p_recebedor_nome, recebedor_nome),
      canhoto_foto_url = COALESCE(p_canhoto_foto_url, canhoto_foto_url),
      confirmacao_manual_admin = COALESCE(p_confirmacao_manual, FALSE),
      justificativa_admin = COALESCE(p_justificativa, justificativa_admin),
      updated_at = now()
  WHERE id = v_saida.carga_id;

  -- Ledger: entregues motorista → loja; recusadas voltam ao packing.
  v_galpao := public.ensure_posicao('galpao', NULL);
  v_origem := public.ensure_posicao('motorista', v_saida.motorista_id);
  v_cliente_pos := public.ensure_posicao('cliente', v_saida.cliente_id);

  INSERT INTO public.movimentacoes_caixa (
    tipo, natureza, tipo_caixa, quantidade,
    origem_posicao_id, destino_posicao_id,
    cliente_id, motorista_id, carga_parada_id, registrado_por, observacoes,
    data_movimento, hora_registro, documento_tipo, documento_id, confirmacao_status
  )
  SELECT
    'envio'::public.tipo_movimentacao,
    'envio'::public.tipo_movimentacao,
    co.tipo_caixa_sigla,
    COUNT(*)::int,
    v_origem,
    v_cliente_pos,
    v_saida.cliente_id,
    v_saida.motorista_id,
    v_saida.carga_id,
    auth.uid(),
    'Entrega no supermercado',
    public.today_brt(),
    now(),
    'entrega_expedicao',
    v_entrega_id,
    'nao_aplicavel'::public.confirmacao_movimento
  FROM public.caixas_ordem co
  WHERE co.carga_id = v_saida.carga_id
    AND co.status = 'entregue'
    AND co.tipo_caixa_sigla IS NOT NULL
  GROUP BY co.tipo_caixa_sigla;

  INSERT INTO public.movimentacoes_caixa (
    tipo, natureza, tipo_caixa, quantidade,
    origem_posicao_id, destino_posicao_id,
    cliente_id, motorista_id, carga_parada_id, registrado_por, observacoes,
    data_movimento, hora_registro, documento_tipo, documento_id, confirmacao_status
  )
  SELECT
    'transferencia'::public.tipo_movimentacao,
    'transferencia'::public.tipo_movimentacao,
    co.tipo_caixa_sigla,
    COUNT(*)::int,
    v_origem,
    v_galpao,
    v_saida.cliente_id,
    v_saida.motorista_id,
    v_saida.carga_id,
    auth.uid(),
    'Recusa na loja · volta ao packing',
    public.today_brt(),
    now(),
    'recusa_expedicao',
    v_entrega_id,
    'nao_aplicavel'::public.confirmacao_movimento
  FROM public.caixas_ordem co
  WHERE co.carga_id = v_saida.carga_id
    -- "não localizada" não volta fisicamente: a caixa segue com o motorista
    -- até o inventário resolver.
    AND co.status = 'recusada'
    AND co.tipo_caixa_sigla IS NOT NULL
  GROUP BY co.tipo_caixa_sigla;

  -- Vazias retiradas na loja (padrão NOP-21 cliente → galpão).
  INSERT INTO public.movimentacoes_caixa (
    tipo, natureza, tipo_caixa, quantidade,
    origem_posicao_id, destino_posicao_id,
    cliente_id, motorista_id, carga_parada_id, registrado_por, observacoes,
    data_movimento, hora_registro, documento_tipo, documento_id, confirmacao_status
  )
  SELECT
    'retorno'::public.tipo_movimentacao,
    'retorno'::public.tipo_movimentacao,
    v.key,
    v.value::int,
    v_cliente_pos,
    v_galpao,
    v_saida.cliente_id,
    v_saida.motorista_id,
    v_saida.carga_id,
    auth.uid(),
    'Vazias retiradas na entrega',
    public.today_brt(),
    now(),
    'retorno_expedicao',
    v_entrega_id,
    'nao_aplicavel'::public.confirmacao_movimento
  FROM jsonb_each_text(COALESCE(p_vazias, '{}'::jsonb)) AS v(key, value)
  WHERE COALESCE(NULLIF(v.value, '')::int, 0) > 0;

  -- Recusa vira laudo de quebra (NOP-16) com origem expedição.
  SELECT EXISTS (
    SELECT 1 FROM public.caixas_ordem co
    WHERE co.carga_id = v_saida.carga_id AND co.status IN ('recusada', 'nao_localizada')
  ) INTO v_tem_recusa;

  IF v_tem_recusa THEN
    INSERT INTO public.quebras (fornecedor_id, cliente_id, carga_id, origem, registrado_por, observacao, status)
    VALUES (
      NULL, v_saida.cliente_id, v_saida.carga_id, 'expedicao', auth.uid(),
      'Recusa na entrega · ordem ' || COALESCE(v_saida.numero_ordem, v_saida.codigo),
      'registrado'::public.status_quebra
    )
    RETURNING id INTO v_quebra_id;

    INSERT INTO public.quebra_itens (
      quebra_id, produto_id, quantidade, caixa_ordem_id, motivo,
      preco_unitario, valor, estimado, tipo_ocorrencia, observacao
    )
    SELECT
      v_quebra_id,
      ico.produto_id,
      SUM(ico.quantidade),
      (array_agg(co.id))[1],
      COALESCE(MIN(co.motivo_recusa), 'Recusada na loja'),
      NULL,
      0,
      TRUE,
      'quebra'::public.tipo_ocorrencia_quebra,
      'Caixa ' || string_agg(DISTINCT co.codigo_etiqueta, ', ')
    FROM public.itens_caixa_ordem ico
    JOIN public.caixas_ordem co ON co.id = ico.caixa_id
    WHERE co.carga_id = v_saida.carga_id
      AND co.status IN ('recusada', 'nao_localizada')
      AND ico.produto_id IS NOT NULL
      AND ico.quantidade > 0
    GROUP BY ico.produto_id;
  END IF;

  RETURN jsonb_build_object(
    'entrega_id', v_entrega_id,
    'status', v_status,
    'caixas_entregues', v_entregues,
    'caixas_recusadas', v_recusadas,
    'quebra_id', v_quebra_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_entrega_expedicao(UUID, JSONB, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_entrega_expedicao(UUID, JSONB, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 9. RPC: confirmação manual do admin (fim do dia, sem confirmação do motorista)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_entrega_admin(
  p_carga_id UUID,
  p_justificativa TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saida_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem confirmar entregas manualmente';
  END IF;

  IF COALESCE(btrim(p_justificativa), '') = '' THEN
    RAISE EXCEPTION 'Justificativa obrigatória';
  END IF;

  SELECT id INTO v_saida_id
  FROM public.saidas_expedicao
  WHERE carga_id = p_carga_id AND status = 'em_transito'
  ORDER BY saida_em DESC
  LIMIT 1;

  IF v_saida_id IS NULL THEN
    RAISE EXCEPTION 'Ordem sem saída em trânsito';
  END IF;

  RETURN public.confirmar_entrega_expedicao(
    v_saida_id, '[]'::jsonb, NULL, NULL, NULL,
    'Confirmação manual do administrador', TRUE, p_justificativa
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_entrega_admin(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_entrega_admin(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 10. Views
-- ------------------------------------------------------------

-- Ordem no formato do papel: totais Wise × separado × saída × entrega.
DROP VIEW IF EXISTS public.v_ordem_expedicao;
CREATE VIEW public.v_ordem_expedicao
WITH (security_invoker = true) AS
SELECT
  cg.id AS carga_id,
  cg.codigo,
  COALESCE(cg.numero_ordem, regexp_replace(cg.codigo, '^PV-', '')) AS numero_ordem,
  cg.data_carga,
  cg.status_ordem,
  cg.status_separacao,
  cg.cliente_id,
  cl.nome AS cliente_nome,
  COALESCE(cg.cliente_cnpj, cl.cnpj) AS cliente_cnpj,
  cg.rota_id,
  cg.motorista_id,
  m.nome AS motorista_nome,
  cg.qtde_itens_wise,
  cg.qtde_caixas_wise,
  cg.separado_por,
  ps.nome AS separado_por_nome,
  cg.separado_em,
  cg.conferido_por,
  pc.nome AS conferido_por_nome,
  cg.conferido_em,
  cg.entregue_por,
  pe.nome AS entregue_por_nome,
  cg.entregue_em,
  cg.recebedor_nome,
  cg.canhoto_foto_url,
  cg.confirmacao_manual_admin,
  cg.justificativa_admin,
  (SELECT COUNT(*) FROM public.romaneio_itens ri WHERE ri.carga_id = cg.id)::int AS total_linhas,
  (SELECT COALESCE(SUM(ri.quantidade_romaneio), 0) FROM public.romaneio_itens ri WHERE ri.carga_id = cg.id) AS total_itens,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id)::int AS caixas_separadas,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id AND co.status = 'em_transito')::int AS caixas_em_transito,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id AND co.status = 'entregue')::int AS caixas_entregues,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id AND co.status IN ('recusada', 'nao_localizada'))::int AS caixas_recusadas
FROM public.cargas cg
JOIN public.clientes cl ON cl.id = cg.cliente_id
LEFT JOIN public.motoristas m ON m.id = cg.motorista_id
LEFT JOIN public.profiles ps ON ps.id = cg.separado_por
LEFT JOIN public.profiles pc ON pc.id = cg.conferido_por
LEFT JOIN public.profiles pe ON pe.id = cg.entregue_por;

GRANT SELECT ON public.v_ordem_expedicao TO authenticated;

-- Rastreio por caixa: linha do tempo de quem/quando/onde.
DROP VIEW IF EXISTS public.v_rastreio_caixa;
CREATE VIEW public.v_rastreio_caixa
WITH (security_invoker = true) AS
SELECT
  co.id AS caixa_id,
  co.carga_id,
  co.codigo_etiqueta,
  co.numero,
  co.total_caixas,
  co.tipo_caixa_sigla,
  co.status AS caixa_status,
  co.motivo_recusa,
  co.separado_em,
  co.saida_em,
  co.entregue_em,
  cg.codigo AS ordem_codigo,
  COALESCE(cg.numero_ordem, regexp_replace(cg.codigo, '^PV-', '')) AS numero_ordem,
  cg.data_carga,
  cg.status_ordem,
  cg.cliente_id,
  cl.nome AS cliente_nome,
  COALESCE(cg.cliente_cnpj, cl.cnpj) AS cliente_cnpj,
  ps.nome AS separado_por_nome,
  pc.nome AS conferido_por_nome,
  pe.nome AS entregue_por_nome,
  cg.recebedor_nome,
  cg.conferido_em,
  cg.entregue_em AS ordem_entregue_em,
  m.nome AS motorista_nome,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'produto_id', ico.produto_id,
      'produto', p.nome,
      'unidade', p.unidade,
      'familia', fp.nome,
      'quantidade', ico.quantidade,
      'status', ico.status
    ) ORDER BY p.nome)
    FROM public.itens_caixa_ordem ico
    LEFT JOIN public.produtos p ON p.id = ico.produto_id
    LEFT JOIN public.familias_produto fp ON fp.id = p.familia_id
    WHERE ico.caixa_id = co.id
  ) AS conteudo
FROM public.caixas_ordem co
JOIN public.cargas cg ON cg.id = co.carga_id
JOIN public.clientes cl ON cl.id = cg.cliente_id
LEFT JOIN public.motoristas m ON m.id = cg.motorista_id
LEFT JOIN public.profiles ps ON ps.id = co.separado_por
LEFT JOIN public.profiles pc ON pc.id = cg.conferido_por
LEFT JOIN public.profiles pe ON pe.id = cg.entregue_por;

GRANT SELECT ON public.v_rastreio_caixa TO authenticated;

-- Em trânsito sem confirmação do motorista até o fim do dia.
DROP VIEW IF EXISTS public.v_entregas_sem_confirmacao;
CREATE VIEW public.v_entregas_sem_confirmacao
WITH (security_invoker = true) AS
SELECT
  s.id AS saida_id,
  s.carga_id,
  cg.codigo AS ordem_codigo,
  COALESCE(cg.numero_ordem, regexp_replace(cg.codigo, '^PV-', '')) AS numero_ordem,
  cg.data_carga,
  s.cliente_id,
  cl.nome AS cliente_nome,
  s.motorista_id,
  m.nome AS motorista_nome,
  s.saida_em,
  s.total_caixas,
  pc.nome AS conferido_por_nome,
  EXTRACT(EPOCH FROM (now() - s.saida_em)) / 60 AS minutos_em_transito
FROM public.saidas_expedicao s
JOIN public.cargas cg ON cg.id = s.carga_id
JOIN public.clientes cl ON cl.id = s.cliente_id
LEFT JOIN public.motoristas m ON m.id = s.motorista_id
LEFT JOIN public.profiles pc ON pc.id = s.conferido_por
WHERE s.status = 'em_transito'
  -- "fim do dia": vira pendência a partir das 18h do dia da carga, e sempre
  -- que a carga for de um dia anterior.
  AND (
    cg.data_carga < public.today_brt()
    OR EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo')) >= 18
  );

GRANT SELECT ON public.v_entregas_sem_confirmacao TO authenticated;

-- Divergências da expedição para o painel de custos (NOP-18).
DROP VIEW IF EXISTS public.v_divergencias_expedicao;
CREATE VIEW public.v_divergencias_expedicao
WITH (security_invoker = true) AS
SELECT
  cg.id AS carga_id,
  COALESCE(cg.numero_ordem, regexp_replace(cg.codigo, '^PV-', '')) AS numero_ordem,
  cg.data_carga,
  cg.cliente_id,
  cl.nome AS cliente_nome,
  cg.motorista_id,
  m.nome AS motorista_nome,
  cg.status_ordem,
  COALESCE(cg.qtde_caixas_wise, 0) AS caixas_wise,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id)::int AS caixas_separadas,
  COALESCE(s.total_caixas, 0) AS caixas_saida,
  COALESCE(e.total_caixas_entregues, 0) AS caixas_entregues,
  COALESCE(e.total_caixas_recusadas, 0) AS caixas_recusadas,
  (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id)::int
    - COALESCE(cg.qtde_caixas_wise, (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id))
    AS divergencia_wise_separacao,
  COALESCE(s.total_caixas, 0)
    - (SELECT COUNT(*) FROM public.caixas_ordem co WHERE co.carga_id = cg.id)::int
    AS divergencia_separacao_saida,
  COALESCE(e.total_caixas_entregues, 0) - COALESCE(s.total_caixas, 0) AS divergencia_saida_entrega,
  e.status AS status_entrega,
  e.entregue_em
FROM public.cargas cg
JOIN public.clientes cl ON cl.id = cg.cliente_id
LEFT JOIN public.motoristas m ON m.id = cg.motorista_id
LEFT JOIN public.saidas_expedicao s ON s.carga_id = cg.id AND s.status <> 'cancelada'
LEFT JOIN public.entregas_expedicao e ON e.saida_id = s.id
WHERE cg.status_ordem <> 'importada';

GRANT SELECT ON public.v_divergencias_expedicao TO authenticated;

-- Recusas por produto — insumo direto de custo.
DROP VIEW IF EXISTS public.v_recusas_expedicao;
CREATE VIEW public.v_recusas_expedicao
WITH (security_invoker = true) AS
SELECT
  cg.id AS carga_id,
  COALESCE(cg.numero_ordem, regexp_replace(cg.codigo, '^PV-', '')) AS numero_ordem,
  cg.data_carga,
  cg.cliente_id,
  cl.nome AS cliente_nome,
  co.id AS caixa_id,
  co.codigo_etiqueta,
  co.motivo_recusa,
  ico.produto_id,
  p.nome AS produto_nome,
  ico.quantidade AS quantidade_recusada
FROM public.caixas_ordem co
JOIN public.cargas cg ON cg.id = co.carga_id
JOIN public.clientes cl ON cl.id = cg.cliente_id
JOIN public.itens_caixa_ordem ico ON ico.caixa_id = co.id
LEFT JOIN public.produtos p ON p.id = ico.produto_id
WHERE co.status IN ('recusada', 'nao_localizada');

GRANT SELECT ON public.v_recusas_expedicao TO authenticated;

-- ------------------------------------------------------------
-- 11. Páginas
-- ------------------------------------------------------------
INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo) VALUES
  ('expedicao/saida', 'Saída para a loja', 'Expedição', 'Truck', 8, TRUE),
  ('expedicao/entrega', 'Entrega na loja', 'Expedição', 'Store', 9, TRUE),
  ('expedicao/rastreio', 'Rastreio', 'Expedição', 'Search', 10, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

-- Motoristas já cadastrados enxergam saída e entrega.
INSERT INTO public.user_page_permissions (user_id, page_id, can_access)
SELECT pf.id, pg.id, TRUE
FROM public.profiles pf
CROSS JOIN public.pages pg
WHERE pg.slug IN ('expedicao/saida', 'expedicao/entrega', 'expedicao/rastreio')
  AND pf.motorista_id IS NOT NULL
ON CONFLICT (user_id, page_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
