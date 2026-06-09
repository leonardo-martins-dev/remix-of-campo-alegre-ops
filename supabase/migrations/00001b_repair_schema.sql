-- REPARO IDEMPOTENTE: schema Campo Alegre (tabelas faltando, enums ja existem)
-- Rode ESTE arquivo antes de 00003-00008

DO $$ BEGIN CREATE TYPE public.user_role AS ENUM ('admin', 'user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.status_pedido AS ENUM ('pendente', 'conferido', 'divergencia'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.origem_pedido AS ENUM ('wisetec', 'manual', 'excel'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.status_conferencia AS ENUM ('em_andamento', 'parcial', 'finalizada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.status_carga AS ENUM ('aguardando', 'carregando', 'concluida', 'cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.status_romaneio AS ENUM ('pendente', 'ok', 'corrigido'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tipo_caixa_enum AS ENUM ('G', 'I', 'P'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tipo_divergencia AS ENUM ('falta', 'sobra', 'qualidade'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tipo_movimentacao AS ENUM ('envio', 'retorno', 'perda', 'ajuste'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.unidade_medida AS ENUM ('mc', 'kg', 'un', 'cx', 'pct'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.status_cobranca AS ENUM ('pendente', 'cobrado', 'pago', 'cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Garante valores faltantes em enums ja existentes (ex: user_role sem 'user')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'user_role' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'admin';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'user_role' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'user'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'user';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_pedido' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_pedido' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'pendente'
  ) THEN
    ALTER TYPE public.status_pedido ADD VALUE 'pendente';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_pedido' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_pedido' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'conferido'
  ) THEN
    ALTER TYPE public.status_pedido ADD VALUE 'conferido';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_pedido' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_pedido' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'divergencia'
  ) THEN
    ALTER TYPE public.status_pedido ADD VALUE 'divergencia';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'origem_pedido' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'origem_pedido' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'wisetec'
  ) THEN
    ALTER TYPE public.origem_pedido ADD VALUE 'wisetec';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'origem_pedido' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'origem_pedido' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'manual'
  ) THEN
    ALTER TYPE public.origem_pedido ADD VALUE 'manual';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'origem_pedido' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'origem_pedido' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'excel'
  ) THEN
    ALTER TYPE public.origem_pedido ADD VALUE 'excel';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_conferencia' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_conferencia' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'em_andamento'
  ) THEN
    ALTER TYPE public.status_conferencia ADD VALUE 'em_andamento';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_conferencia' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_conferencia' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'parcial'
  ) THEN
    ALTER TYPE public.status_conferencia ADD VALUE 'parcial';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_conferencia' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_conferencia' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'finalizada'
  ) THEN
    ALTER TYPE public.status_conferencia ADD VALUE 'finalizada';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_carga' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_carga' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'aguardando'
  ) THEN
    ALTER TYPE public.status_carga ADD VALUE 'aguardando';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_carga' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_carga' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'carregando'
  ) THEN
    ALTER TYPE public.status_carga ADD VALUE 'carregando';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_carga' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_carga' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'concluida'
  ) THEN
    ALTER TYPE public.status_carga ADD VALUE 'concluida';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_carga' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_carga' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'cancelada'
  ) THEN
    ALTER TYPE public.status_carga ADD VALUE 'cancelada';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_romaneio' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_romaneio' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'pendente'
  ) THEN
    ALTER TYPE public.status_romaneio ADD VALUE 'pendente';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_romaneio' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_romaneio' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'ok'
  ) THEN
    ALTER TYPE public.status_romaneio ADD VALUE 'ok';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_romaneio' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_romaneio' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'corrigido'
  ) THEN
    ALTER TYPE public.status_romaneio ADD VALUE 'corrigido';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_caixa_enum' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_caixa_enum' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'G'
  ) THEN
    ALTER TYPE public.tipo_caixa_enum ADD VALUE 'G';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_caixa_enum' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_caixa_enum' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'I'
  ) THEN
    ALTER TYPE public.tipo_caixa_enum ADD VALUE 'I';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_caixa_enum' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_caixa_enum' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'P'
  ) THEN
    ALTER TYPE public.tipo_caixa_enum ADD VALUE 'P';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_divergencia' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_divergencia' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'falta'
  ) THEN
    ALTER TYPE public.tipo_divergencia ADD VALUE 'falta';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_divergencia' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_divergencia' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'sobra'
  ) THEN
    ALTER TYPE public.tipo_divergencia ADD VALUE 'sobra';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_divergencia' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_divergencia' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'qualidade'
  ) THEN
    ALTER TYPE public.tipo_divergencia ADD VALUE 'qualidade';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_movimentacao' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_movimentacao' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'envio'
  ) THEN
    ALTER TYPE public.tipo_movimentacao ADD VALUE 'envio';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_movimentacao' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_movimentacao' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'retorno'
  ) THEN
    ALTER TYPE public.tipo_movimentacao ADD VALUE 'retorno';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_movimentacao' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_movimentacao' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'perda'
  ) THEN
    ALTER TYPE public.tipo_movimentacao ADD VALUE 'perda';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'tipo_movimentacao' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tipo_movimentacao' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'ajuste'
  ) THEN
    ALTER TYPE public.tipo_movimentacao ADD VALUE 'ajuste';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'mc'
  ) THEN
    ALTER TYPE public.unidade_medida ADD VALUE 'mc';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'kg'
  ) THEN
    ALTER TYPE public.unidade_medida ADD VALUE 'kg';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'un'
  ) THEN
    ALTER TYPE public.unidade_medida ADD VALUE 'un';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'cx'
  ) THEN
    ALTER TYPE public.unidade_medida ADD VALUE 'cx';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'unidade_medida' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'pct'
  ) THEN
    ALTER TYPE public.unidade_medida ADD VALUE 'pct';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_cobranca' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_cobranca' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'pendente'
  ) THEN
    ALTER TYPE public.status_cobranca ADD VALUE 'pendente';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_cobranca' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_cobranca' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'cobrado'
  ) THEN
    ALTER TYPE public.status_cobranca ADD VALUE 'cobrado';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_cobranca' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_cobranca' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'pago'
  ) THEN
    ALTER TYPE public.status_cobranca ADD VALUE 'pago';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    WHERE t.typname = 'status_cobranca' AND t.typnamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_cobranca' AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'cancelado'
  ) THEN
    ALTER TYPE public.status_cobranca ADD VALUE 'cancelado';
  END IF;
END $$;

-- 2. CONTROLE DE ACESSO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        public.user_role NOT NULL DEFAULT 'user',
  avatar_url  TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);

CREATE TABLE IF NOT EXISTS public.pages (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug  TEXT NOT NULL,
  nome  TEXT NOT NULL,
  grupo TEXT NOT NULL,
  icone TEXT,
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT uq_pages_slug UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS public.user_page_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  page_id    UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  can_access BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_user_page UNIQUE (user_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON public.user_page_permissions (user_id);


-- ============================================================
-- 3. DADOS MESTRES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.destinatarios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_destinatario_nome UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS public.familias_produto (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  ordem      INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_familia_nome UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS public.produtos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  unidade    public.unidade_medida NOT NULL DEFAULT 'un',
  familia_id UUID REFERENCES public.familias_produto(id) ON DELETE SET NULL,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produtos_familia ON public.produtos (familia_id);

CREATE TABLE IF NOT EXISTS public.fornecedores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  contato    TEXT,
  telefone   TEXT,
  email      TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tipos_caixa (
  id              public.tipo_caixa_enum PRIMARY KEY,
  nome            TEXT NOT NULL,
  custo_unitario  NUMERIC(10,2) NOT NULL,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clientes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  contato    TEXT,
  telefone   TEXT,
  email      TEXT,
  endereco   TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.motoristas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  telefone   TEXT,
  cnh        TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.caminhoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa            TEXT NOT NULL,
  modelo           TEXT,
  capacidade_caixas INT,
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_caminhao_placa UNIQUE (placa)
);

CREATE TABLE IF NOT EXISTS public.rotas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  descricao  TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 4. RECEBIMENTO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pedidos_recebimento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          TEXT NOT NULL,
  fornecedor_id   UUID NOT NULL REFERENCES public.fornecedores(id),
  origem          public.origem_pedido NOT NULL DEFAULT 'manual',
  data_pedido     DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_chegada    TIMESTAMPTZ,
  status          public.status_pedido NOT NULL DEFAULT 'pendente',
  observacoes     TEXT,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_pedido_codigo UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_fornecedor ON public.pedidos_recebimento (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_data ON public.pedidos_recebimento (data_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos_recebimento (status);

CREATE TABLE IF NOT EXISTS public.itens_pedido (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         UUID NOT NULL REFERENCES public.pedidos_recebimento(id) ON DELETE CASCADE,
  produto_id        UUID NOT NULL REFERENCES public.produtos(id),
  quantidade_pedida NUMERIC(10,2) NOT NULL CHECK (quantidade_pedida > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido ON public.itens_pedido (pedido_id);

CREATE TABLE IF NOT EXISTS public.itens_pedido_rateio (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_pedido_id  UUID NOT NULL REFERENCES public.itens_pedido(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES public.destinatarios(id),
  quantidade      NUMERIC(10,2) NOT NULL CHECK (quantidade >= 0),

  CONSTRAINT uq_rateio_item_dest UNIQUE (item_pedido_id, destinatario_id)
);

CREATE INDEX IF NOT EXISTS idx_rateio_item ON public.itens_pedido_rateio (item_pedido_id);

CREATE TABLE IF NOT EXISTS public.conferencias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id      UUID NOT NULL REFERENCES public.pedidos_recebimento(id),
  conferente_id  UUID NOT NULL REFERENCES public.profiles(id),
  status         public.status_conferencia NOT NULL DEFAULT 'em_andamento',
  iniciada_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizada_em  TIMESTAMPTZ,
  observacoes    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conferencias_pedido ON public.conferencias (pedido_id);

CREATE TABLE IF NOT EXISTS public.itens_conferencia (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conferencia_id         UUID NOT NULL REFERENCES public.conferencias(id) ON DELETE CASCADE,
  item_pedido_id         UUID NOT NULL REFERENCES public.itens_pedido(id),
  quantidade_recebida    NUMERIC(10,2) NOT NULL DEFAULT 0,
  conferido              BOOLEAN NOT NULL DEFAULT FALSE,
  divergencia            public.tipo_divergencia,
  quantidade_divergencia NUMERIC(10,2) DEFAULT 0,
  tem_problema_qualidade BOOLEAN NOT NULL DEFAULT FALSE,
  quantidade_qualidade   NUMERIC(10,2) DEFAULT 0,
  foto_url               TEXT,
  observacoes            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_conf_item UNIQUE (conferencia_id, item_pedido_id)
);

CREATE INDEX IF NOT EXISTS idx_itens_conf_conferencia ON public.itens_conferencia (conferencia_id);


-- ============================================================
-- 5. EXPEDIÇÃO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cargas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        TEXT NOT NULL,
  cliente_id    UUID NOT NULL REFERENCES public.clientes(id),
  motorista_id  UUID REFERENCES public.motoristas(id),
  caminhao_id   UUID REFERENCES public.caminhoes(id),
  rota_id       UUID REFERENCES public.rotas(id),
  data_carga    DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio   TIMESTAMPTZ,
  hora_fim      TIMESTAMPTZ,
  status        public.status_carga NOT NULL DEFAULT 'aguardando',
  progresso     NUMERIC(5,2) NOT NULL DEFAULT 0,
  observacoes   TEXT,
  created_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_carga_codigo UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_cargas_cliente ON public.cargas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cargas_data ON public.cargas (data_carga);
CREATE INDEX IF NOT EXISTS idx_cargas_status ON public.cargas (status);

CREATE TABLE IF NOT EXISTS public.romaneio_itens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id            UUID NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  produto_id          UUID NOT NULL REFERENCES public.produtos(id),
  quantidade_romaneio NUMERIC(10,2) NOT NULL,
  quantidade_real     NUMERIC(10,2) NOT NULL DEFAULT 0,
  caixas_g            INT NOT NULL DEFAULT 0 CHECK (caixas_g >= 0),
  caixas_i            INT NOT NULL DEFAULT 0 CHECK (caixas_i >= 0),
  caixas_p            INT NOT NULL DEFAULT 0 CHECK (caixas_p >= 0),
  status              public.status_romaneio NOT NULL DEFAULT 'pendente',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_romaneio_carga ON public.romaneio_itens (carga_id);

CREATE TABLE IF NOT EXISTS public.carga_caixas_resumo (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id    UUID NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  sugerido_g  INT NOT NULL DEFAULT 0,
  sugerido_i  INT NOT NULL DEFAULT 0,
  sugerido_p  INT NOT NULL DEFAULT 0,
  real_g      INT NOT NULL DEFAULT 0,
  real_i      INT NOT NULL DEFAULT 0,
  real_p      INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_carga_resumo UNIQUE (carga_id)
);


-- ============================================================
-- 6. GESTÃO DE CAIXAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.retornos_caixa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES public.clientes(id),
  motorista_id    UUID REFERENCES public.motoristas(id),
  registrado_por  UUID REFERENCES public.profiles(id),
  caixas_g        INT NOT NULL DEFAULT 0 CHECK (caixas_g >= 0),
  caixas_i        INT NOT NULL DEFAULT 0 CHECK (caixas_i >= 0),
  caixas_p        INT NOT NULL DEFAULT 0 CHECK (caixas_p >= 0),
  offline         BOOLEAN NOT NULL DEFAULT FALSE,
  sincronizado_em TIMESTAMPTZ,
  data_retorno    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retornos_cliente ON public.retornos_caixa (cliente_id);
CREATE INDEX IF NOT EXISTS idx_retornos_data ON public.retornos_caixa (data_retorno);

CREATE TABLE IF NOT EXISTS public.movimentacoes_caixa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES public.clientes(id),
  tipo            public.tipo_movimentacao NOT NULL,
  tipo_caixa      public.tipo_caixa_enum NOT NULL,
  quantidade      INT NOT NULL CHECK (quantidade > 0),
  carga_id        UUID REFERENCES public.cargas(id),
  retorno_id      UUID REFERENCES public.retornos_caixa(id),
  registrado_por  UUID REFERENCES public.profiles(id),
  observacoes     TEXT,
  data_movimento  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_cliente ON public.movimentacoes_caixa (cliente_id);
CREATE INDEX IF NOT EXISTS idx_mov_tipo ON public.movimentacoes_caixa (tipo);
CREATE INDEX IF NOT EXISTS idx_mov_data ON public.movimentacoes_caixa (data_movimento);
CREATE INDEX IF NOT EXISTS idx_mov_carga ON public.movimentacoes_caixa (carga_id) WHERE carga_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_retorno ON public.movimentacoes_caixa (retorno_id) WHERE retorno_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cobrancas_caixa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES public.clientes(id),
  tipo_caixa      public.tipo_caixa_enum NOT NULL,
  quantidade      INT NOT NULL CHECK (quantidade > 0),
  custo_unitario  NUMERIC(10,2) NOT NULL,
  valor_total     NUMERIC(10,2) NOT NULL GENERATED ALWAYS AS (quantidade * custo_unitario) STORED,
  status          public.status_cobranca NOT NULL DEFAULT 'pendente',
  data_cobranca   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobrancas_cliente ON public.cobrancas_caixa (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_status ON public.cobrancas_caixa (status);


-- ============================================================
-- 7. INDICADORES / CICLO OPERACIONAL
-- ============================================================

CREATE TABLE IF NOT EXISTS public.registros_ciclo (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id               UUID REFERENCES public.pedidos_recebimento(id),
  carga_id                UUID REFERENCES public.cargas(id),
  hora_chegada_fornecedor TIMESTAMPTZ,
  hora_conferencia_ok     TIMESTAMPTZ,
  hora_inicio_carga       TIMESTAMPTZ,
  hora_saida_caminhao     TIMESTAMPTZ,
  hora_retorno_caixas     TIMESTAMPTZ,
  data_registro           DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ciclo_data ON public.registros_ciclo (data_registro);
CREATE INDEX IF NOT EXISTS idx_ciclo_pedido ON public.registros_ciclo (pedido_id) WHERE pedido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ciclo_carga ON public.registros_ciclo (carga_id) WHERE carga_id IS NOT NULL;


-- ============================================================
-- 8. CONFIGURAÇÕES E AUDITORIA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.configuracoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave      TEXT NOT NULL,
  valor      JSONB NOT NULL,
  descricao  TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_config_chave UNIQUE (chave)
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES public.profiles(id),
  tabela           TEXT NOT NULL,
  registro_id      UUID,
  acao             TEXT NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE')),
  dados_anteriores JSONB,
  dados_novos      JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_tabela ON public.audit_log (tabela);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log (created_at);


-- ============================================================
-- 9. VIEWS CALCULADAS
-- ============================================================

-- Saldo de caixas por cliente (enviadas - retornadas - perdas + ajustes)
CREATE OR REPLACE VIEW public.v_saldo_caixas_cliente AS
SELECT
  c.id                 AS cliente_id,
  c.nome               AS cliente,
  m.tipo_caixa,
  COALESCE(SUM(CASE WHEN m.tipo = 'envio'   THEN m.quantidade ELSE 0 END), 0) AS enviadas,
  COALESCE(SUM(CASE WHEN m.tipo = 'retorno' THEN m.quantidade ELSE 0 END), 0) AS retornadas,
  COALESCE(SUM(CASE WHEN m.tipo = 'perda'   THEN m.quantidade ELSE 0 END), 0) AS perdidas,
  COALESCE(SUM(CASE WHEN m.tipo = 'ajuste'  THEN m.quantidade ELSE 0 END), 0) AS ajustes,
  COALESCE(SUM(CASE WHEN m.tipo = 'envio'   THEN m.quantidade ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN m.tipo = 'retorno' THEN m.quantidade ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN m.tipo = 'perda'   THEN m.quantidade ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN m.tipo = 'ajuste'  THEN m.quantidade ELSE 0 END), 0)
    AS saldo
FROM public.clientes c
LEFT JOIN public.movimentacoes_caixa m ON m.cliente_id = c.id
WHERE c.ativo = TRUE
GROUP BY c.id, c.nome, m.tipo_caixa;

-- Fill rate por fornecedor
CREATE OR REPLACE VIEW public.v_fill_rate_fornecedor AS
SELECT
  f.id                       AS fornecedor_id,
  f.nome                     AS fornecedor,
  COUNT(ip.id)               AS total_itens,
  SUM(CASE
    WHEN ic.quantidade_recebida >= ip.quantidade_pedida THEN 1
    ELSE 0
  END)                       AS itens_completos,
  CASE
    WHEN COUNT(ip.id) = 0 THEN 0
    ELSE ROUND(
      SUM(CASE WHEN ic.quantidade_recebida >= ip.quantidade_pedida THEN 1 ELSE 0 END)::NUMERIC
      / COUNT(ip.id) * 100, 1
    )
  END                        AS fill_rate
FROM public.fornecedores f
JOIN public.pedidos_recebimento pr ON pr.fornecedor_id = f.id
JOIN public.itens_pedido ip ON ip.pedido_id = pr.id
LEFT JOIN public.itens_conferencia ic ON ic.item_pedido_id = ip.id
WHERE f.ativo = TRUE
GROUP BY f.id, f.nome;

-- Perda por cliente (agregado)
CREATE OR REPLACE VIEW public.v_perda_por_cliente AS
SELECT
  c.id                AS cliente_id,
  c.nome              AS cliente,
  COALESCE(SUM(CASE WHEN m.tipo = 'envio' THEN m.quantidade ELSE 0 END), 0) AS enviadas,
  COALESCE(SUM(CASE WHEN m.tipo = 'perda' THEN m.quantidade ELSE 0 END), 0) AS perdidas,
  CASE
    WHEN SUM(CASE WHEN m.tipo = 'envio' THEN m.quantidade ELSE 0 END) = 0 THEN 0
    ELSE ROUND(
      SUM(CASE WHEN m.tipo = 'perda' THEN m.quantidade ELSE 0 END)::NUMERIC
      / SUM(CASE WHEN m.tipo = 'envio' THEN m.quantidade ELSE 0 END) * 100, 1
    )
  END AS taxa_perda
FROM public.clientes c
LEFT JOIN public.movimentacoes_caixa m ON m.cliente_id = c.id
WHERE c.ativo = TRUE
GROUP BY c.id, c.nome;

-- Tempos do ciclo operacional
CREATE OR REPLACE VIEW public.v_indicadores_ciclo AS
SELECT
  data_registro,
  AVG(EXTRACT(EPOCH FROM (hora_conferencia_ok - hora_chegada_fornecedor)) / 60)
    AS tempo_medio_conferencia_min,
  AVG(EXTRACT(EPOCH FROM (hora_saida_caminhao - hora_inicio_carga)) / 60)
    AS tempo_medio_carga_min,
  AVG(EXTRACT(EPOCH FROM (hora_saida_caminhao - hora_chegada_fornecedor)) / 60)
    AS ciclo_total_medio_min,
  AVG(EXTRACT(EPOCH FROM (hora_retorno_caixas - hora_saida_caminhao)) / 60)
    AS retorno_medio_caixas_min
FROM public.registros_ciclo
WHERE hora_chegada_fornecedor IS NOT NULL
GROUP BY data_registro;


-- ============================================================
-- 10. FUNCTIONS
-- ============================================================

-- Verifica se o usuario tem acesso a uma pagina
CREATE OR REPLACE FUNCTION public.user_has_page_access(
  p_user_id UUID,
  p_page_slug TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN (SELECT role FROM public.profiles WHERE id = p_user_id) = 'admin' THEN TRUE
      WHEN EXISTS (
        SELECT 1
        FROM public.user_page_permissions upp
        JOIN public.pages p ON p.id = upp.page_id
        WHERE upp.user_id = p_user_id
          AND p.slug = p_page_slug
          AND upp.can_access = TRUE
          AND p.ativo = TRUE
      ) THEN TRUE
      ELSE FALSE
    END;
$$;

-- Retorna todas as paginas que um usuario pode acessar
CREATE OR REPLACE FUNCTION public.get_user_accessible_pages(p_user_id UUID)
RETURNS TABLE (
  page_id UUID,
  slug    TEXT,
  nome    TEXT,
  grupo   TEXT,
  icone   TEXT,
  ordem   INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.slug, p.nome, p.grupo, p.icone, p.ordem
  FROM public.pages p
  WHERE p.ativo = TRUE
    AND (
      (SELECT role FROM public.profiles WHERE id = p_user_id) = 'admin'
      OR EXISTS (
        SELECT 1
        FROM public.user_page_permissions upp
        WHERE upp.page_id = p.id
          AND upp.user_id = p_user_id
          AND upp.can_access = TRUE
      )
    )
  ORDER BY p.ordem;
$$;

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger para criar profile automaticamente ao registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_role public.user_role := 'user';
  meta_role text := NEW.raw_app_meta_data->>'role';
BEGIN
  IF lower(NEW.email) = 'admin@noponto.io' OR meta_role IN ('admin', 'super_admin') THEN
    resolved_role := 'admin';
  ELSIF meta_role IS NOT NULL THEN
    BEGIN
      resolved_role := meta_role::public.user_role;
      IF resolved_role::text NOT IN ('admin', 'user') THEN
        resolved_role := 'user';
      END IF;
    EXCEPTION
      WHEN invalid_text_representation THEN
        resolved_role := 'user';
    END;
  END IF;

  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_app_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', 'Novo Usuario'),
    NEW.email,
    resolved_role
  );
  RETURN NEW;
END;
$$;

-- Trigger para registrar movimentacao ao finalizar carga
CREATE OR REPLACE FUNCTION public.handle_carga_finalizada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'concluida' AND OLD.status != 'concluida' THEN
    INSERT INTO public.movimentacoes_caixa (cliente_id, tipo, tipo_caixa, quantidade, carga_id, data_movimento)
    SELECT
      NEW.cliente_id, 'envio', 'G', COALESCE(SUM(ri.caixas_g), 0), NEW.id, NEW.data_carga
    FROM public.romaneio_itens ri WHERE ri.carga_id = NEW.id
    HAVING COALESCE(SUM(ri.caixas_g), 0) > 0;

    INSERT INTO public.movimentacoes_caixa (cliente_id, tipo, tipo_caixa, quantidade, carga_id, data_movimento)
    SELECT
      NEW.cliente_id, 'envio', 'I', COALESCE(SUM(ri.caixas_i), 0), NEW.id, NEW.data_carga
    FROM public.romaneio_itens ri WHERE ri.carga_id = NEW.id
    HAVING COALESCE(SUM(ri.caixas_i), 0) > 0;

    INSERT INTO public.movimentacoes_caixa (cliente_id, tipo, tipo_caixa, quantidade, carga_id, data_movimento)
    SELECT
      NEW.cliente_id, 'envio', 'P', COALESCE(SUM(ri.caixas_p), 0), NEW.id, NEW.data_carga
    FROM public.romaneio_itens ri WHERE ri.carga_id = NEW.id
    HAVING COALESCE(SUM(ri.caixas_p), 0) > 0;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger para registrar movimentacao ao confirmar retorno
CREATE OR REPLACE FUNCTION public.handle_retorno_caixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.caixas_g > 0 THEN
    INSERT INTO public.movimentacoes_caixa (cliente_id, tipo, tipo_caixa, quantidade, retorno_id, data_movimento)
    VALUES (NEW.cliente_id, 'retorno', 'G', NEW.caixas_g, NEW.id, NEW.data_retorno);
  END IF;

  IF NEW.caixas_i > 0 THEN
    INSERT INTO public.movimentacoes_caixa (cliente_id, tipo, tipo_caixa, quantidade, retorno_id, data_movimento)
    VALUES (NEW.cliente_id, 'retorno', 'I', NEW.caixas_i, NEW.id, NEW.data_retorno);
  END IF;

  IF NEW.caixas_p > 0 THEN
    INSERT INTO public.movimentacoes_caixa (cliente_id, tipo, tipo_caixa, quantidade, retorno_id, data_movimento)
    VALUES (NEW.cliente_id, 'retorno', 'P', NEW.caixas_p, NEW.id, NEW.data_retorno);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger para atualizar status do pedido apos conferencia
CREATE OR REPLACE FUNCTION public.handle_conferencia_finalizada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_has_divergencia BOOLEAN;
BEGIN
  IF NEW.status = 'finalizada' AND OLD.status != 'finalizada' THEN
    NEW.finalizada_em = now();

    SELECT EXISTS(
      SELECT 1 FROM public.itens_conferencia
      WHERE conferencia_id = NEW.id AND divergencia IS NOT NULL
    ) INTO v_has_divergencia;

    UPDATE public.pedidos_recebimento
    SET status = CASE WHEN v_has_divergencia THEN 'divergencia' ELSE 'conferido' END,
        updated_at = now()
    WHERE id = NEW.pedido_id;
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================================
-- 11. TRIGGERS
-- ============================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_produtos
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_fornecedores
  BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_clientes
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_pedidos
  BEFORE UPDATE ON public.pedidos_recebimento
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_itens_conf
  BEFORE UPDATE ON public.itens_conferencia
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_cargas
  BEFORE UPDATE ON public.cargas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_romaneio
  BEFORE UPDATE ON public.romaneio_itens
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_cobrancas
  BEFORE UPDATE ON public.cobrancas_caixa
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_carga_finalizada
  AFTER UPDATE ON public.cargas
  FOR EACH ROW EXECUTE FUNCTION public.handle_carga_finalizada();

CREATE TRIGGER on_retorno_caixa
  AFTER INSERT ON public.retornos_caixa
  FOR EACH ROW EXECUTE FUNCTION public.handle_retorno_caixa();

CREATE TRIGGER on_conferencia_finalizada
  BEFORE UPDATE ON public.conferencias
  FOR EACH ROW EXECUTE FUNCTION public.handle_conferencia_finalizada();


-- ============================================================
-- 12. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.familias_produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caminhoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_recebimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido_rateio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_conferencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.romaneio_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carga_caixas_resumo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retornos_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobrancas_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_ciclo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Profiles: usuarios veem seu proprio perfil; admins veem todos
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (
  auth.uid() = id
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (
  auth.uid() = id
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Pages: todos os autenticados podem ver paginas ativas
DROP POLICY IF EXISTS pages_select ON public.pages;
CREATE POLICY pages_select ON public.pages FOR SELECT
  TO authenticated
  USING (ativo = TRUE);

DROP POLICY IF EXISTS pages_admin_all ON public.pages;
CREATE POLICY pages_admin_all ON public.pages FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Permissoes: usuarios veem suas proprias; admins gerenciam todas
DROP POLICY IF EXISTS perms_select ON public.user_page_permissions;
CREATE POLICY perms_select ON public.user_page_permissions FOR SELECT USING (
  user_id = auth.uid()
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

DROP POLICY IF EXISTS perms_admin_all ON public.user_page_permissions;
CREATE POLICY perms_admin_all ON public.user_page_permissions FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Dados operacionais: todos autenticados podem ler; apenas admins deletam
-- (politica aplicada a todas as tabelas operacionais)

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'destinatarios', 'familias_produto', 'produtos', 'fornecedores',
    'tipos_caixa', 'clientes', 'motoristas', 'caminhoes', 'rotas',
    'pedidos_recebimento', 'itens_pedido', 'itens_pedido_rateio',
    'conferencias', 'itens_conferencia',
    'cargas', 'romaneio_itens', 'carga_caixas_resumo',
    'retornos_caixa', 'movimentacoes_caixa', 'cobrancas_caixa',
    'registros_ciclo', 'configuracoes'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_auth', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (TRUE)',
      tbl || '_select_auth', tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert_auth', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (TRUE)',
      tbl || '_insert_auth', tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update_auth', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (TRUE)',
      tbl || '_update_auth', tbl
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete_admin', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = ''admin'')',
      tbl || '_delete_admin', tbl
    );
  END LOOP;
END $$;

-- Audit log: admins leem; sistema insere
DROP POLICY IF EXISTS audit_select_admin ON public.audit_log;
CREATE POLICY audit_select_admin ON public.audit_log FOR SELECT USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

DROP POLICY IF EXISTS audit_insert ON public.audit_log;
CREATE POLICY audit_insert ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);


-- ============================================================

-- Seeds (idempotentes)
INSERT INTO public.pages (slug, nome, grupo, icone, ordem) VALUES
  ('dashboard', 'Dashboard', 'Navegacao', 'LayoutDashboard', 1),
  ('recebimento', 'Conferencia', 'Recebimento', 'ClipboardCheck', 2),
  ('recebimento/conferir', 'Conferir Chegada', 'Recebimento', 'PackageCheck', 3),
  ('recebimento/faltas', 'Relatorio de Faltas', 'Recebimento', 'AlertTriangle', 4),
  ('expedicao', 'Painel de Carga', 'Expedicao', 'Truck', 5),
  ('expedicao/tv', 'Modo TV', 'Expedicao', 'Monitor', 6),
  ('caixas/saldo', 'Saldo por Cliente', 'Caixas', 'Package', 7),
  ('caixas/economia', 'Custo & Perda', 'Caixas', 'TrendingDown', 8),
  ('caixas/retorno', 'Registro de Retorno', 'Caixas', 'RotateCcw', 9),
  ('indicadores', 'Tempos & Ciclo', 'Indicadores', 'Clock', 10),
  ('gestao', 'Configuracoes', 'Gestao', 'Settings', 11)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.tipos_caixa (id, nome, custo_unitario) VALUES
  ('G', 'Grande', 38.00), ('I', 'Isopor', 22.00), ('P', 'Plastica', 18.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.familias_produto (nome, ordem) VALUES
  ('Folhas', 1), ('Frutos', 2), ('Raizes', 3), ('Refrigerados', 4)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.destinatarios (nome) VALUES
  ('Campo Alegre'), ('Anderson'), ('Parceiro Sul')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('impacto_falta_por_unidade', '4.50', 'Valor em R$ usado para calcular impacto financeiro de faltas'),
  ('benchmark_taxa_perda', '2.0', 'Taxa de perda benchmark (%) para calculo de economia potencial'),
  ('aging_alerta_dias', '6', 'Dias de aging para disparar alerta amarelo'),
  ('aging_critico_dias', '10', 'Dias de aging para disparar alerta vermelho'),
  ('auto_rotate_tv_segundos', '20', 'Intervalo de rotacao automatica no modo TV')
ON CONFLICT (chave) DO NOTHING;

-- Profile do admin (auth.users ja deve existir; nao recria usuario)
INSERT INTO public.profiles (id, nome, email, role)
SELECT u.id, 'Administrador', u.email, 'admin'::public.user_role
FROM auth.users u WHERE lower(u.email) = 'admin@noponto.io'
ON CONFLICT (id) DO UPDATE SET role = 'admin'::public.user_role, updated_at = now();

-- Verificacao
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'profiles'
) AS profiles_criada;
