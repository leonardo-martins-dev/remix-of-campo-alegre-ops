-- ============================================================
-- RODADA 2 — Packing House (set/2026)
-- PH-C01 tipos UUID · PH-R01/R02 import Wise · PH-R03 entregas
-- PH-R04 tolerância · PH-R05 preço · PH-C02 ledger 3 posições
-- PH-C03/C04/C05/C06 caixas · PH-Q01/Q02/Q03 quebra · PH-T01
-- ============================================================

-- ------------------------------------------------------------
-- 0. ENUMS
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_pedido' AND e.enumlabel = 'aguardando_vinculo'
  ) THEN ALTER TYPE public.status_pedido ADD VALUE 'aguardando_vinculo'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_pedido' AND e.enumlabel = 'parcial'
  ) THEN ALTER TYPE public.status_pedido ADD VALUE 'parcial'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_pedido' AND e.enumlabel = 'recebido'
  ) THEN ALTER TYPE public.status_pedido ADD VALUE 'recebido'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_pedido' AND e.enumlabel = 'encerrado'
  ) THEN ALTER TYPE public.status_pedido ADD VALUE 'encerrado'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'fornecedor'
  ) THEN ALTER TYPE public.user_role ADD VALUE 'fornecedor'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tipo_movimentacao' AND e.enumlabel = 'recebimento_cheias'
  ) THEN ALTER TYPE public.tipo_movimentacao ADD VALUE 'recebimento_cheias'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tipo_movimentacao' AND e.enumlabel = 'entrega_vazias'
  ) THEN ALTER TYPE public.tipo_movimentacao ADD VALUE 'entrega_vazias'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tipo_movimentacao' AND e.enumlabel = 'abertura'
  ) THEN ALTER TYPE public.tipo_movimentacao ADD VALUE 'abertura'; END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tipo_posicao_caixa AS ENUM ('galpao', 'cliente', 'fornecedor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.confirmacao_movimento AS ENUM (
    'nao_aplicavel', 'pendente', 'confirmado', 'contestado', 'resolvido'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tipo_alias AS ENUM ('fornecedor', 'produto', 'destinatario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.status_pendencia_vinculo AS ENUM (
    'aberta', 'vinculada', 'criada', 'dispensada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.status_contagem AS ENUM ('pendente', 'conciliada', 'mantida');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.status_quebra AS ENUM ('registrado', 'editado', 'removido');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- 1. PH-C01 — tipos de caixa configuráveis (UUID + sigla)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_saldo_caixas_cliente CASCADE;
DROP VIEW IF EXISTS public.v_perda_por_cliente CASCADE;
DROP VIEW IF EXISTS public.v_retorno_ranking_motorista CASCADE;

CREATE TABLE IF NOT EXISTS public.tipos_caixa_cfg (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sigla           TEXT NOT NULL,
  nome            TEXT NOT NULL,
  custo_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ordem           INT NOT NULL DEFAULT 0,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tipos_caixa_sigla UNIQUE (sigla),
  CONSTRAINT ck_tipos_caixa_sigla CHECK (char_length(sigla) BETWEEN 1 AND 2)
);

INSERT INTO public.tipos_caixa_cfg (sigla, nome, custo_unitario, ordem, ativo)
SELECT t.id::text, t.nome, t.custo_unitario,
  CASE t.id::text WHEN 'G' THEN 1 WHEN 'I' THEN 2 WHEN 'P' THEN 3 ELSE 9 END,
  t.ativo
FROM public.tipos_caixa t
ON CONFLICT (sigla) DO UPDATE SET
  nome = EXCLUDED.nome,
  custo_unitario = EXCLUDED.custo_unitario,
  ativo = EXCLUDED.ativo;

ALTER TABLE public.romaneio_itens
  ADD COLUMN IF NOT EXISTS caixas JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.retornos_caixa
  ADD COLUMN IF NOT EXISTS caixas JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.carga_caixas_resumo
  ADD COLUMN IF NOT EXISTS sugerido JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS real JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.romaneio_itens SET caixas = jsonb_build_object(
  'G', COALESCE(caixas_g, 0), 'I', COALESCE(caixas_i, 0), 'P', COALESCE(caixas_p, 0)
) WHERE caixas = '{}'::jsonb OR caixas IS NULL;

UPDATE public.retornos_caixa SET caixas = jsonb_build_object(
  'G', COALESCE(caixas_g, 0), 'I', COALESCE(caixas_i, 0), 'P', COALESCE(caixas_p, 0)
) WHERE caixas = '{}'::jsonb OR caixas IS NULL;

UPDATE public.carga_caixas_resumo SET
  sugerido = jsonb_build_object('G', COALESCE(sugerido_g, 0), 'I', COALESCE(sugerido_i, 0), 'P', COALESCE(sugerido_p, 0)),
  real = jsonb_build_object('G', COALESCE(real_g, 0), 'I', COALESCE(real_i, 0), 'P', COALESCE(real_p, 0))
WHERE sugerido = '{}'::jsonb OR real = '{}'::jsonb;

ALTER TABLE public.movimentacoes_caixa
  ALTER COLUMN tipo_caixa TYPE TEXT USING tipo_caixa::text;
ALTER TABLE public.cobrancas_caixa
  ALTER COLUMN tipo_caixa TYPE TEXT USING tipo_caixa::text;

ALTER TABLE public.cobrancas_caixa
  ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES public.fornecedores(id);

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_caixa_padrao_id UUID REFERENCES public.tipos_caixa_cfg(id),
  ADD COLUMN IF NOT EXISTS tolerancia_pct NUMERIC(6,2);

-- Swap tipos_caixa → cfg (mantém o nome esperado pelo app)
ALTER TABLE public.tipos_caixa RENAME TO tipos_caixa_enum_legacy;
ALTER TABLE public.tipos_caixa_cfg RENAME TO tipos_caixa;

ALTER TABLE public.tipos_caixa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tipos_caixa_select_auth ON public.tipos_caixa;
DROP POLICY IF EXISTS tipos_caixa_insert_auth ON public.tipos_caixa;
DROP POLICY IF EXISTS tipos_caixa_update_auth ON public.tipos_caixa;
DROP POLICY IF EXISTS tipos_caixa_delete_admin ON public.tipos_caixa;
CREATE POLICY tipos_caixa_select_auth ON public.tipos_caixa FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY tipos_caixa_insert_auth ON public.tipos_caixa FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY tipos_caixa_update_auth ON public.tipos_caixa FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY tipos_caixa_delete_admin ON public.tipos_caixa FOR DELETE USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.tipo_caixa_em_uso(p_sigla TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.movimentacoes_caixa WHERE tipo_caixa = p_sigla
    UNION ALL
    SELECT 1 FROM public.romaneio_itens WHERE COALESCE((caixas ->> p_sigla)::int, 0) > 0
    UNION ALL
    SELECT 1 FROM public.retornos_caixa WHERE COALESCE((caixas ->> p_sigla)::int, 0) > 0
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_delete_tipo_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.tipo_caixa_em_uso(OLD.sigla) THEN
    RAISE EXCEPTION 'Tipo de caixa % possui movimentação e não pode ser excluído', OLD.sigla;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_tipo_caixa ON public.tipos_caixa;
CREATE TRIGGER trg_prevent_delete_tipo_caixa
  BEFORE DELETE ON public.tipos_caixa
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_tipo_caixa();

-- ------------------------------------------------------------
-- 2. PH-C02 — posições e ledger origem/destino
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.posicoes_caixa (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        public.tipo_posicao_caixa NOT NULL,
  ref_id      UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_posicao UNIQUE NULLS NOT DISTINCT (tipo, ref_id)
);

INSERT INTO public.posicoes_caixa (tipo, ref_id)
VALUES ('galpao', NULL)
ON CONFLICT (tipo, ref_id) DO NOTHING;

INSERT INTO public.posicoes_caixa (tipo, ref_id)
SELECT 'cliente', c.id FROM public.clientes c
ON CONFLICT (tipo, ref_id) DO NOTHING;

INSERT INTO public.posicoes_caixa (tipo, ref_id)
SELECT 'fornecedor', f.id FROM public.fornecedores f
ON CONFLICT (tipo, ref_id) DO NOTHING;

ALTER TABLE public.movimentacoes_caixa
  ALTER COLUMN cliente_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS origem_posicao_id UUID REFERENCES public.posicoes_caixa(id),
  ADD COLUMN IF NOT EXISTS destino_posicao_id UUID REFERENCES public.posicoes_caixa(id),
  ADD COLUMN IF NOT EXISTS natureza public.tipo_movimentacao,
  ADD COLUMN IF NOT EXISTS documento_tipo TEXT,
  ADD COLUMN IF NOT EXISTS documento_id UUID,
  ADD COLUMN IF NOT EXISTS confirmacao_status public.confirmacao_movimento NOT NULL DEFAULT 'nao_aplicavel',
  ADD COLUMN IF NOT EXISTS confirmado_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qtd_contestada INT,
  ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES public.fornecedores(id);

UPDATE public.movimentacoes_caixa m
SET natureza = m.tipo
WHERE m.natureza IS NULL;

UPDATE public.movimentacoes_caixa m
SET origem_posicao_id = CASE
    WHEN m.tipo = 'envio' THEN (SELECT id FROM public.posicoes_caixa WHERE tipo = 'galpao' LIMIT 1)
    WHEN m.tipo = 'retorno' THEN (SELECT id FROM public.posicoes_caixa WHERE tipo = 'cliente' AND ref_id = m.cliente_id)
    ELSE (SELECT id FROM public.posicoes_caixa WHERE tipo = 'cliente' AND ref_id = m.cliente_id)
  END,
  destino_posicao_id = CASE
    WHEN m.tipo = 'envio' THEN (SELECT id FROM public.posicoes_caixa WHERE tipo = 'cliente' AND ref_id = m.cliente_id)
    WHEN m.tipo = 'retorno' THEN (SELECT id FROM public.posicoes_caixa WHERE tipo = 'galpao' LIMIT 1)
    ELSE (SELECT id FROM public.posicoes_caixa WHERE tipo = 'cliente' AND ref_id = m.cliente_id)
  END
WHERE m.origem_posicao_id IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_posicao(p_tipo public.tipo_posicao_caixa, p_ref UUID)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.posicoes_caixa WHERE tipo = p_tipo AND ref_id IS NOT DISTINCT FROM p_ref;
  IF v_id IS NULL THEN
    INSERT INTO public.posicoes_caixa (tipo, ref_id) VALUES (p_tipo, p_ref) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_posicao_on_master()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'clientes' THEN
    PERFORM public.ensure_posicao('cliente', NEW.id);
  ELSIF TG_TABLE_NAME = 'fornecedores' THEN
    PERFORM public.ensure_posicao('fornecedor', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posicao_cliente ON public.clientes;
CREATE TRIGGER trg_posicao_cliente
  AFTER INSERT ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.ensure_posicao_on_master();

DROP TRIGGER IF EXISTS trg_posicao_fornecedor ON public.fornecedores;
CREATE TRIGGER trg_posicao_fornecedor
  AFTER INSERT ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.ensure_posicao_on_master();

-- ------------------------------------------------------------
-- 3. PH-R01 / R02 — import Wise, aliases, pendências
-- ------------------------------------------------------------
ALTER TABLE public.pedidos_recebimento
  ADD COLUMN IF NOT EXISTS wise_pedido_id TEXT,
  ADD COLUMN IF NOT EXISTS data_prevista DATE,
  ADD COLUMN IF NOT EXISTS importacao_id UUID,
  ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS encerrado_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS motivo_encerramento TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_wise_id
  ON public.pedidos_recebimento (wise_pedido_id)
  WHERE wise_pedido_id IS NOT NULL;

ALTER TABLE public.itens_pedido
  ADD COLUMN IF NOT EXISTS preco_unitario NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS unidade TEXT;

ALTER TABLE public.conferencias
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS numero INT,
  ADD COLUMN IF NOT EXISTS chegada_em TIMESTAMPTZ;

ALTER TABLE public.itens_conferencia
  ADD COLUMN IF NOT EXISTS dentro_tolerancia BOOLEAN,
  ADD COLUMN IF NOT EXISTS valor_divergencia NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS estimado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tolerancia_pct_aplicada NUMERIC(6,2);

CREATE TABLE IF NOT EXISTS public.importacoes_pedido (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo         TEXT NOT NULL,
  formato         TEXT NOT NULL DEFAULT 'xlsx',
  usuario_id      UUID REFERENCES public.profiles(id),
  pedidos_novos   INT NOT NULL DEFAULT 0,
  pedidos_atualizados INT NOT NULL DEFAULT 0,
  itens           INT NOT NULL DEFAULT 0,
  pendencias      INT NOT NULL DEFAULT 0,
  linhas_ignoradas INT NOT NULL DEFAULT 0,
  ignoradas_motivo JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT NOT NULL DEFAULT 'ok',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos_recebimento
  ADD CONSTRAINT fk_pedido_importacao
  FOREIGN KEY (importacao_id) REFERENCES public.importacoes_pedido(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.aliases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           public.tipo_alias NOT NULL,
  nome_externo   TEXT NOT NULL,
  codigo_externo TEXT,
  entidade_id    UUID NOT NULL,
  origem         TEXT NOT NULL DEFAULT 'wise',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_alias UNIQUE (tipo, origem, nome_externo)
);

CREATE TABLE IF NOT EXISTS public.pendencias_vinculo (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id  UUID REFERENCES public.importacoes_pedido(id) ON DELETE CASCADE,
  pedido_id      UUID REFERENCES public.pedidos_recebimento(id) ON DELETE SET NULL,
  tipo           public.tipo_alias NOT NULL,
  nome_externo   TEXT NOT NULL,
  codigo_externo TEXT,
  ocorrencias    INT NOT NULL DEFAULT 1,
  status         public.status_pendencia_vinculo NOT NULL DEFAULT 'aberta',
  motivo         TEXT,
  entidade_id    UUID,
  resolved_by    UUID REFERENCES public.profiles(id),
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 4. PH-C03 — caixas da entrega
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conferencia_caixas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conferencia_id  UUID NOT NULL REFERENCES public.conferencias(id) ON DELETE CASCADE,
  tipo_caixa_sigla TEXT NOT NULL,
  qtd_cheias      INT NOT NULL DEFAULT 0,
  qtd_vazias      INT NOT NULL DEFAULT 0,
  CONSTRAINT uq_conf_caixa UNIQUE (conferencia_id, tipo_caixa_sigla)
);

-- ------------------------------------------------------------
-- 5. PH-C04 — contagem do galpão
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contagens_galpao (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data          DATE NOT NULL DEFAULT CURRENT_DATE,
  contado_por   UUID REFERENCES public.profiles(id),
  status        public.status_contagem NOT NULL DEFAULT 'pendente',
  observacao    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contagem_galpao_itens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id         UUID NOT NULL REFERENCES public.contagens_galpao(id) ON DELETE CASCADE,
  tipo_caixa_sigla    TEXT NOT NULL,
  qtd_contada         INT NOT NULL DEFAULT 0,
  qtd_calculada       INT NOT NULL DEFAULT 0,
  diferenca           INT NOT NULL DEFAULT 0,
  ajuste_movimento_id UUID REFERENCES public.movimentacoes_caixa(id),
  CONSTRAINT uq_contagem_tipo UNIQUE (contagem_id, tipo_caixa_sigla)
);

-- ------------------------------------------------------------
-- 6. PH-C05 — perfil fornecedor
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 7. PH-Q01 — quebra
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quebras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id   UUID NOT NULL REFERENCES public.fornecedores(id),
  registrado_por  UUID REFERENCES public.profiles(id),
  registrado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao      TEXT,
  status          public.status_quebra NOT NULL DEFAULT 'registrado'
);

CREATE TABLE IF NOT EXISTS public.quebra_itens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quebra_id         UUID NOT NULL REFERENCES public.quebras(id) ON DELETE CASCADE,
  produto_id        UUID NOT NULL REFERENCES public.produtos(id),
  quantidade        NUMERIC(10,2) NOT NULL CHECK (quantidade > 0),
  conferencia_item_id UUID REFERENCES public.itens_conferencia(id),
  preco_unitario    NUMERIC(12,2),
  valor             NUMERIC(12,2),
  estimado          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.quebra_historico (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quebra_id   UUID NOT NULL REFERENCES public.quebras(id) ON DELETE CASCADE,
  item_id     UUID REFERENCES public.quebra_itens(id) ON DELETE SET NULL,
  antes       JSONB,
  depois      JSONB,
  autor_id    UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 8. Views
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_saldo_item_pedido
WITH (security_invoker = true) AS
SELECT
  ip.id AS item_pedido_id,
  ip.pedido_id,
  ip.produto_id,
  ip.quantidade_pedida,
  COALESCE(SUM(ic.quantidade_recebida) FILTER (WHERE c.status = 'finalizada'), 0) AS recebido_acumulado,
  ip.quantidade_pedida
    - COALESCE(SUM(ic.quantidade_recebida) FILTER (WHERE c.status = 'finalizada'), 0) AS saldo
FROM public.itens_pedido ip
LEFT JOIN public.itens_conferencia ic ON ic.item_pedido_id = ip.id
LEFT JOIN public.conferencias c ON c.id = ic.conferencia_id
GROUP BY ip.id, ip.pedido_id, ip.produto_id, ip.quantidade_pedida;

CREATE OR REPLACE VIEW public.v_saldos_caixa
WITH (security_invoker = true) AS
SELECT
  p.id AS posicao_id,
  p.tipo AS posicao_tipo,
  p.ref_id,
  m.tipo_caixa,
  COALESCE(SUM(CASE WHEN m.destino_posicao_id = p.id THEN m.quantidade ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN m.origem_posicao_id = p.id THEN m.quantidade ELSE 0 END), 0) AS saldo,
  COALESCE(SUM(CASE
    WHEN m.destino_posicao_id = p.id AND COALESCE(m.natureza, m.tipo) IN ('envio', 'entrega_vazias')
    THEN m.quantidade ELSE 0 END), 0) AS enviadas,
  COALESCE(SUM(CASE
    WHEN m.origem_posicao_id = p.id AND COALESCE(m.natureza, m.tipo) IN ('retorno', 'recebimento_cheias')
    THEN m.quantidade ELSE 0 END), 0) AS retornadas,
  COALESCE(SUM(CASE WHEN COALESCE(m.natureza, m.tipo) = 'perda' AND m.origem_posicao_id = p.id THEN m.quantidade ELSE 0 END), 0) AS perdidas,
  COALESCE(SUM(CASE WHEN COALESCE(m.natureza, m.tipo) = 'ajuste' AND m.destino_posicao_id = p.id THEN m.quantidade
                    WHEN COALESCE(m.natureza, m.tipo) = 'ajuste' AND m.origem_posicao_id = p.id THEN -m.quantidade
                    ELSE 0 END), 0) AS ajustes
FROM public.posicoes_caixa p
LEFT JOIN public.movimentacoes_caixa m
  ON m.origem_posicao_id = p.id OR m.destino_posicao_id = p.id
GROUP BY p.id, p.tipo, p.ref_id, m.tipo_caixa;

CREATE OR REPLACE VIEW public.v_saldo_caixas_cliente
WITH (security_invoker = true) AS
SELECT
  c.id AS cliente_id,
  c.nome AS cliente,
  s.tipo_caixa,
  s.enviadas,
  s.retornadas,
  s.perdidas,
  s.ajustes,
  s.saldo
FROM public.clientes c
LEFT JOIN public.v_saldos_caixa s ON s.posicao_tipo = 'cliente' AND s.ref_id = c.id
WHERE c.ativo = TRUE;

CREATE OR REPLACE VIEW public.v_perda_por_cliente
WITH (security_invoker = true) AS
SELECT
  c.id AS cliente_id,
  c.nome AS cliente,
  COALESCE(SUM(s.enviadas), 0) AS enviadas,
  COALESCE(SUM(s.perdidas), 0) AS perdidas,
  CASE
    WHEN COALESCE(SUM(s.enviadas), 0) = 0 THEN 0
    ELSE ROUND(COALESCE(SUM(s.perdidas), 0)::NUMERIC / SUM(s.enviadas) * 100, 1)
  END AS taxa_perda
FROM public.clientes c
LEFT JOIN public.v_saldos_caixa s ON s.posicao_tipo = 'cliente' AND s.ref_id = c.id
WHERE c.ativo = TRUE
GROUP BY c.id, c.nome;

CREATE OR REPLACE VIEW public.v_retorno_ranking_motorista
WITH (security_invoker = true) AS
SELECT
  m.id AS motorista_id,
  m.nome AS motorista,
  r.data_retorno,
  COUNT(*) AS total_retornos,
  SUM(COALESCE((r.caixas ->> 'G')::int, r.caixas_g, 0)) AS total_g,
  SUM(COALESCE((r.caixas ->> 'I')::int, r.caixas_i, 0)) AS total_i,
  SUM(COALESCE((r.caixas ->> 'P')::int, r.caixas_p, 0)) AS total_p,
  SUM(
    COALESCE((SELECT SUM((v)::int) FROM jsonb_each_text(r.caixas) AS x(k, v)), r.caixas_g + r.caixas_i + r.caixas_p, 0)
  ) AS total_caixas,
  COUNT(DISTINCT r.cliente_id) AS lojas_atendidas
FROM public.retornos_caixa r
LEFT JOIN public.motoristas m ON m.id = r.motorista_id
GROUP BY m.id, m.nome, r.data_retorno;

CREATE OR REPLACE VIEW public.v_fill_rate_fornecedor
WITH (security_invoker = true) AS
SELECT
  f.id AS fornecedor_id,
  f.nome AS fornecedor,
  COUNT(ip.id) AS total_itens,
  SUM(CASE WHEN COALESCE(s.recebido_acumulado, 0) >= ip.quantidade_pedida THEN 1 ELSE 0 END) AS itens_completos,
  CASE
    WHEN COUNT(ip.id) = 0 THEN 0
    ELSE ROUND(
      SUM(CASE WHEN COALESCE(s.recebido_acumulado, 0) >= ip.quantidade_pedida THEN 1 ELSE 0 END)::NUMERIC
      / COUNT(ip.id) * 100, 1)
  END AS fill_rate,
  COALESCE(SUM(ip.quantidade_pedida * COALESCE(ip.preco_unitario, 4.5)), 0) AS valor_pedido,
  COALESCE(SUM(LEAST(COALESCE(s.recebido_acumulado, 0), ip.quantidade_pedida) * COALESCE(ip.preco_unitario, 4.5)), 0) AS valor_recebido,
  CASE
    WHEN COALESCE(SUM(ip.quantidade_pedida * COALESCE(ip.preco_unitario, 4.5)), 0) = 0 THEN 0
    ELSE ROUND(
      SUM(LEAST(COALESCE(s.recebido_acumulado, 0), ip.quantidade_pedida) * COALESCE(ip.preco_unitario, 4.5))
      / SUM(ip.quantidade_pedida * COALESCE(ip.preco_unitario, 4.5)) * 100, 1)
  END AS fill_rate_valor
FROM public.fornecedores f
JOIN public.pedidos_recebimento pr ON pr.fornecedor_id = f.id
JOIN public.itens_pedido ip ON ip.pedido_id = pr.id
LEFT JOIN public.v_saldo_item_pedido s ON s.item_pedido_id = ip.id
WHERE f.ativo = TRUE
  AND pr.status NOT IN ('aguardando_vinculo')
GROUP BY f.id, f.nome;

GRANT SELECT ON public.v_saldo_item_pedido TO authenticated;
GRANT SELECT ON public.v_saldos_caixa TO authenticated;
GRANT SELECT ON public.v_saldo_caixas_cliente TO authenticated;
GRANT SELECT ON public.v_perda_por_cliente TO authenticated;
GRANT SELECT ON public.v_retorno_ranking_motorista TO authenticated;
GRANT SELECT ON public.v_fill_rate_fornecedor TO authenticated;

-- ------------------------------------------------------------
-- 9. Triggers de ledger (carga / retorno) — 3 posições
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_carga_finalizada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_galpao UUID;
  v_cliente UUID;
  v_sigla TEXT;
  v_qty INT;
BEGIN
  IF NEW.status = 'concluida' AND OLD.status IS DISTINCT FROM 'concluida' THEN
    v_galpao := public.ensure_posicao('galpao', NULL);
    v_cliente := public.ensure_posicao('cliente', NEW.cliente_id);

    FOR v_sigla, v_qty IN
      SELECT key, SUM((value)::int)
      FROM public.romaneio_itens ri, jsonb_each_text(ri.caixas)
      WHERE ri.carga_id = NEW.id
      GROUP BY key
      HAVING SUM((value)::int) > 0
    LOOP
      INSERT INTO public.movimentacoes_caixa (
        cliente_id, tipo, tipo_caixa, quantidade, carga_id, data_movimento,
        origem_posicao_id, destino_posicao_id, natureza, documento_tipo, documento_id
      ) VALUES (
        NEW.cliente_id, 'envio', v_sigla, v_qty, NEW.id, NEW.data_carga,
        v_galpao, v_cliente, 'envio', 'carga', NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_retorno_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_galpao UUID;
  v_cliente UUID;
  v_sigla TEXT;
  v_qty INT;
  v_map JSONB;
BEGIN
  v_galpao := public.ensure_posicao('galpao', NULL);
  v_cliente := public.ensure_posicao('cliente', NEW.cliente_id);
  v_map := CASE WHEN NEW.caixas IS NOT NULL AND NEW.caixas <> '{}'::jsonb THEN NEW.caixas
    ELSE jsonb_build_object('G', NEW.caixas_g, 'I', NEW.caixas_i, 'P', NEW.caixas_p) END;

  FOR v_sigla, v_qty IN SELECT key, (value)::int FROM jsonb_each_text(v_map)
  LOOP
    IF v_qty > 0 THEN
      INSERT INTO public.movimentacoes_caixa (
        cliente_id, tipo, tipo_caixa, quantidade, retorno_id, data_movimento, registrado_por,
        origem_posicao_id, destino_posicao_id, natureza, documento_tipo, documento_id
      ) VALUES (
        NEW.cliente_id, 'retorno', v_sigla, v_qty, NEW.id, NEW.data_retorno, NEW.registrado_por,
        v_cliente, v_galpao, 'retorno', 'retorno', NEW.id
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 10. RPCs — conferência, cargas por entrega, encerramento
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.config_num(p_chave TEXT, p_default NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NULLIF(regexp_replace(valor::text, '[^0-9.\-]', '', 'g'), '')::NUMERIC
                   FROM public.configuracoes WHERE chave = p_chave), p_default);
$$;

CREATE OR REPLACE FUNCTION public.gerar_cargas_pos_conferencia(p_pedido_id UUID, p_conferencia_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conf_id UUID := p_conferencia_id;
  v_pedido record;
  v_row record;
  v_cliente_id UUID;
  v_carga_id UUID;
  v_codigo TEXT;
  v_created jsonb := '[]'::jsonb;
  v_romaneio_id UUID;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_recebimento WHERE id = p_pedido_id;
  IF v_pedido.id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_pedido.status NOT IN (
    'conferido'::public.status_pedido,
    'parcial'::public.status_pedido,
    'recebido'::public.status_pedido
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_conf_id IS NULL THEN
    SELECT id INTO v_conf_id
    FROM public.conferencias
    WHERE pedido_id = p_pedido_id AND status = 'finalizada'
    ORDER BY finalizada_em DESC NULLS LAST, created_at DESC
    LIMIT 1;
  END IF;
  IF v_conf_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cargas
    WHERE pedido_origem_id = p_pedido_id
      AND observacoes = 'entrega:' || v_conf_id::text
  ) THEN
    SELECT jsonb_agg(jsonb_build_object('carga_id', id, 'codigo', codigo)) INTO v_created
    FROM public.cargas
    WHERE pedido_origem_id = p_pedido_id AND observacoes = 'entrega:' || v_conf_id::text;
    RETURN COALESCE(v_created, '[]'::jsonb);
  END IF;

  FOR v_row IN
    SELECT
      r.destinatario_id,
      iped.produto_id,
      SUM(
        CASE WHEN iped.quantidade_pedida > 0
          THEN (ic.quantidade_recebida * r.quantidade / iped.quantidade_pedida)
          ELSE 0 END
      ) AS qty
    FROM public.itens_conferencia ic
    JOIN public.itens_pedido iped ON iped.id = ic.item_pedido_id
    JOIN public.itens_pedido_rateio r ON r.item_pedido_id = iped.id
    WHERE ic.conferencia_id = v_conf_id AND ic.conferido = TRUE
    GROUP BY r.destinatario_id, iped.produto_id
    HAVING SUM(CASE WHEN iped.quantidade_pedida > 0
      THEN (ic.quantidade_recebida * r.quantidade / iped.quantidade_pedida) ELSE 0 END) > 0
  LOOP
    v_cliente_id := public.resolve_cliente_destinatario(v_row.destinatario_id);
    IF v_cliente_id IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_carga_id
    FROM public.cargas
    WHERE cliente_id = v_cliente_id
      AND data_carga = public.today_brt()
      AND status = 'aguardando'
    LIMIT 1;

    IF v_carga_id IS NULL THEN
      v_codigo := v_pedido.codigo || '-' || substr(v_conf_id::text, 1, 8) || '-' || substr(v_cliente_id::text, 1, 4);
      INSERT INTO public.cargas (codigo, cliente_id, data_carga, status, origem, pedido_origem_id, progresso, observacoes)
      VALUES (v_codigo, v_cliente_id, public.today_brt(), 'aguardando', 'conferencia', p_pedido_id, 0, 'entrega:' || v_conf_id::text)
      RETURNING id INTO v_carga_id;

      INSERT INTO public.carga_caixas_resumo (carga_id) VALUES (v_carga_id)
      ON CONFLICT (carga_id) DO NOTHING;

      v_created := v_created || jsonb_build_array(jsonb_build_object('carga_id', v_carga_id, 'codigo', v_codigo, 'acao', 'criada'));
    ELSE
      v_created := v_created || jsonb_build_array(jsonb_build_object('carga_id', v_carga_id, 'codigo', (SELECT codigo FROM public.cargas WHERE id = v_carga_id), 'acao', 'atualizada'));
    END IF;

    SELECT id INTO v_romaneio_id FROM public.romaneio_itens
    WHERE carga_id = v_carga_id AND produto_id = v_row.produto_id LIMIT 1;

    IF v_romaneio_id IS NOT NULL THEN
      UPDATE public.romaneio_itens
      SET quantidade_romaneio = quantidade_romaneio + round(v_row.qty::numeric, 2)
      WHERE id = v_romaneio_id;
    ELSE
      INSERT INTO public.romaneio_itens (carga_id, produto_id, quantidade_romaneio, quantidade_real, status)
      VALUES (v_carga_id, v_row.produto_id, round(v_row.qty::numeric, 2), 0, 'pendente');
    END IF;
  END LOOP;

  RETURN COALESCE(v_created, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_conferencia_status(
  p_conferencia_id UUID,
  p_pedido_id UUID,
  p_status TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_above BOOLEAN;
  v_has_qualidade BOOLEAN;
  v_saldo_aberto BOOLEAN;
  v_pedido_status public.status_pedido;
  v_cargas jsonb := '[]'::jsonb;
  v_num INT;
BEGIN
  IF p_status NOT IN ('parcial', 'finalizada') THEN
    RAISE EXCEPTION 'Status de conferência inválido: %', p_status;
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_num
  FROM public.conferencias WHERE pedido_id = p_pedido_id AND id <> p_conferencia_id;

  UPDATE public.conferencias
  SET
    status = p_status::public.status_conferencia,
    numero = COALESCE(numero, v_num),
    finalizada_em = CASE WHEN p_status = 'finalizada' THEN COALESCE(finalizada_em, now()) ELSE finalizada_em END,
    updated_at = now()
  WHERE id = p_conferencia_id;

  IF p_status <> 'finalizada' THEN
    RETURN jsonb_build_object('pedido_status', 'em_andamento', 'cargas', '[]'::jsonb);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.itens_conferencia
    WHERE conferencia_id = p_conferencia_id
      AND divergencia IS NOT NULL
      AND COALESCE(dentro_tolerancia, FALSE) = FALSE
      AND divergencia IN ('falta', 'sobra')
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

  IF v_pedido_status IN ('parcial'::public.status_pedido, 'recebido'::public.status_pedido) THEN
    v_cargas := public.gerar_cargas_pos_conferencia(p_pedido_id, p_conferencia_id);
  END IF;

  RETURN jsonb_build_object('pedido_status', v_pedido_status, 'cargas', v_cargas);
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_pedido_divergencia(
  p_pedido_id UUID,
  p_observacao TEXT DEFAULT NULL,
  p_conferencia_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  v_conf UUID := p_conferencia_id;
  v_saldo BOOLEAN;
  v_status public.status_pedido;
  v_cargas jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem liberar pedidos com divergência';
  END IF;

  IF v_conf IS NULL THEN
    SELECT id INTO v_conf FROM public.conferencias
    WHERE pedido_id = p_pedido_id AND status = 'finalizada'
    ORDER BY finalizada_em DESC NULLS LAST LIMIT 1;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.v_saldo_item_pedido WHERE pedido_id = p_pedido_id AND saldo > 0)
  INTO v_saldo;
  v_status := CASE WHEN v_saldo THEN 'parcial'::public.status_pedido ELSE 'recebido'::public.status_pedido END;

  UPDATE public.pedidos_recebimento
  SET
    status = v_status,
    liberado_por = auth.uid(),
    liberado_em = now(),
    observacao_liberacao = COALESCE(p_observacao, observacao_liberacao),
    updated_at = now()
  WHERE id = p_pedido_id
    AND status IN ('aguardando_liberacao'::public.status_pedido, 'divergencia'::public.status_pedido)
  RETURNING * INTO p;

  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está aguardando liberação';
  END IF;

  v_cargas := public.gerar_cargas_pos_conferencia(p_pedido_id, v_conf);
  RETURN jsonb_build_object('pedido', to_jsonb(p), 'cargas', v_cargas);
END;
$$;

CREATE OR REPLACE FUNCTION public.encerrar_pedido(p_pedido_id UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem encerrar pedidos';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'Observação obrigatória para encerrar com falta';
  END IF;
  UPDATE public.pedidos_recebimento
  SET status = 'encerrado'::public.status_pedido,
      encerrado_em = now(),
      encerrado_por = auth.uid(),
      motivo_encerramento = p_motivo,
      updated_at = now()
  WHERE id = p_pedido_id
    AND status IN ('parcial'::public.status_pedido, 'pendente'::public.status_pedido);
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
  n INT;
BEGIN
  v_dias := public.config_num('dias_encerrar_pedido', 1)::INT;
  UPDATE public.pedidos_recebimento
  SET status = 'encerrado'::public.status_pedido,
      encerrado_em = now(),
      motivo_encerramento = 'Encerramento automático por saldo após data prevista',
      updated_at = now()
  WHERE status = 'parcial'::public.status_pedido
    AND COALESCE(data_prevista, data_pedido) + v_dias <= public.today_brt();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ------------------------------------------------------------
-- 11. RLS novas tabelas
-- ------------------------------------------------------------
ALTER TABLE public.posicoes_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacoes_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendencias_vinculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencia_caixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contagens_galpao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contagem_galpao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quebras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quebra_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quebra_historico ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'posicoes_caixa', 'importacoes_pedido', 'aliases', 'pendencias_vinculo',
    'conferencia_caixas', 'contagens_galpao', 'contagem_galpao_itens',
    'quebras', 'quebra_itens', 'quebra_historico'
  ])
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

-- Fornecedor: só os próprios movimentos
CREATE OR REPLACE FUNCTION public.current_fornecedor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fornecedor_id FROM public.profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS mov_select_auth ON public.movimentacoes_caixa;
CREATE POLICY mov_select_auth ON public.movimentacoes_caixa FOR SELECT TO authenticated
USING (
  public.current_fornecedor_id() IS NULL
  OR fornecedor_id = public.current_fornecedor_id()
  OR destino_posicao_id IN (SELECT id FROM public.posicoes_caixa WHERE tipo = 'fornecedor' AND ref_id = public.current_fornecedor_id())
  OR origem_posicao_id IN (SELECT id FROM public.posicoes_caixa WHERE tipo = 'fornecedor' AND ref_id = public.current_fornecedor_id())
);

-- ------------------------------------------------------------
-- 12. Páginas + parâmetros
-- ------------------------------------------------------------
INSERT INTO public.pages (slug, nome, grupo, icone, ordem) VALUES
  ('quebra/lancar',       'Lançar quebra',           'Quebra',  'AlertTriangle', 12),
  ('quebra',              'Quebras',                 'Quebra',  'AlertTriangle', 13),
  ('fornecedores',        'Fornecedores',            'Quebra',  'Activity',      14),
  ('caixas/galpao',       'Contagem do galpão',      'Caixas',  'Box',           15),
  ('caixas/fornecedor',   'Movimento com fornecedor','Caixas',  'RotateCcw',     16)
ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, grupo = EXCLUDED.grupo, ordem = EXCLUDED.ordem;

INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('tolerancia_pct', '5', 'Tolerância de divergência (%)'),
  ('tolerancia_min_cx', '1', 'Tolerância mínima (caixas)'),
  ('dias_encerrar_pedido', '1', 'Dias para encerrar pedido com saldo após data prevista'),
  ('diferenca_contagem_tolerada', '5', 'Diferença de contagem tolerada (caixas)'),
  ('lembrete_contagem_dias', '7', 'Lembrar contagem a cada N dias'),
  ('dias_confirmacao_fornecedor', '3', 'Dias para confirmação do fornecedor'),
  ('alvo_fill_rate', '95', 'Alvo de fill rate (%)'),
  ('benchmark_quebra_fornecedor', '2', 'Benchmark de quebra por fornecedor (%)')
ON CONFLICT (chave) DO NOTHING;
