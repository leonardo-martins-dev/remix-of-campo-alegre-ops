-- ============================================================
-- NOP-157 — Tipos de embalagem (cadastro em Configurações)
--
-- Cadastro simples no mesmo padrão de tipos_caixa: nome, unidade de
-- contagem (unidade, pacote, rolo, caixa fechada… texto livre),
-- quantidade por pacote quando faz sentido, e ativo/inativo.
--
-- O histórico é preservado: quando o tipo já tem contagem lançada, o
-- DELETE é bloqueado e o usuário deve inativar. A tabela stub
-- contagem_embalagem_itens existe só para essa FK — o inventário
-- semanal de embalagens vem no NOP-158.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tipos de embalagem
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tipos_embalagem (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              TEXT NOT NULL,
  unidade_contagem  TEXT NOT NULL DEFAULT 'unidade',
  qty_por_pacote    NUMERIC(12,3),
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_tipos_embalagem_nome CHECK (btrim(nome) <> ''),
  CONSTRAINT ck_tipos_embalagem_unidade CHECK (btrim(unidade_contagem) <> ''),
  CONSTRAINT ck_tipos_embalagem_qty CHECK (qty_por_pacote IS NULL OR qty_por_pacote > 0)
);

-- Sem limite de tipos; nome único ignorando caixa/espaços.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tipos_embalagem_nome
  ON public.tipos_embalagem (lower(btrim(nome)));

DROP TRIGGER IF EXISTS set_updated_at_tipos_embalagem ON public.tipos_embalagem;
CREATE TRIGGER set_updated_at_tipos_embalagem
  BEFORE UPDATE ON public.tipos_embalagem
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- 2. Stub da contagem (NOP-158 preenche o resto)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contagem_embalagem_itens (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_embalagem_id  UUID NOT NULL REFERENCES public.tipos_embalagem(id) ON DELETE RESTRICT,
  quantidade         NUMERIC(14,3) NOT NULL DEFAULT 0,
  contado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  contado_por        UUID REFERENCES public.profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contagem_embalagem_itens_tipo
  ON public.contagem_embalagem_itens (tipo_embalagem_id);

-- ------------------------------------------------------------
-- 3. RLS — igual a tipos_caixa (leitura/escrita autenticado, delete admin)
-- ------------------------------------------------------------
ALTER TABLE public.tipos_embalagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contagem_embalagem_itens ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tipos_embalagem', 'contagem_embalagem_itens'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (TRUE)', t || '_select_auth', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (TRUE)', t || '_insert_auth', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (TRUE)', t || '_update_auth', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_admin())', t || '_delete_admin', t
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_embalagem TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contagem_embalagem_itens TO authenticated;

-- ------------------------------------------------------------
-- 4. Bloqueio de exclusão quando o tipo já tem contagem
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tipo_embalagem_em_uso(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contagem_embalagem_itens WHERE tipo_embalagem_id = p_id
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_delete_tipo_embalagem()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.tipo_embalagem_em_uso(OLD.id) THEN
    RAISE EXCEPTION 'Tipo de embalagem % já tem contagem lançada e não pode ser excluído — inative o cadastro', OLD.nome;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_tipo_embalagem ON public.tipos_embalagem;
CREATE TRIGGER trg_prevent_delete_tipo_embalagem
  BEFORE DELETE ON public.tipos_embalagem
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_tipo_embalagem();

-- ------------------------------------------------------------
-- 5. Seed de exemplos (editáveis/inativáveis pelo galpão)
-- ------------------------------------------------------------
INSERT INTO public.tipos_embalagem (nome, unidade_contagem, qty_por_pacote) VALUES
  ('Sacos',     'pacote',  100),
  ('Filme',     'rolo',    NULL),
  ('Etiqueta',  'rolo',    NULL),
  ('Bandeja',   'pacote',  50)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
