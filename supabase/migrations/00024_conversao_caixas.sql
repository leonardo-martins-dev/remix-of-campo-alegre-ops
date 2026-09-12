-- ============================================================
-- NOP-10: Conversão de caixas (fator produto × fornecedor × tipo)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabela: fator padrão por produto × tipo de caixa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversoes_produto_caixa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id      UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo_caixa_id   UUID NOT NULL REFERENCES public.tipos_caixa(id) ON DELETE CASCADE,
  fator           INT NOT NULL CHECK (fator > 0),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversao_produto_tipo UNIQUE (produto_id, tipo_caixa_id)
);

CREATE INDEX idx_conversao_produto ON public.conversoes_produto_caixa (produto_id);
CREATE INDEX idx_conversao_tipo ON public.conversoes_produto_caixa (tipo_caixa_id);

-- ------------------------------------------------------------
-- 2. Tabela: fator por fornecedor × produto × tipo de caixa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversoes_fornecedor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id   UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  produto_id      UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo_caixa_id   UUID NOT NULL REFERENCES public.tipos_caixa(id) ON DELETE CASCADE,
  fator           INT NOT NULL CHECK (fator > 0),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversao_fornecedor UNIQUE (fornecedor_id, produto_id, tipo_caixa_id)
);

CREATE INDEX idx_conversao_forn_fornecedor ON public.conversoes_fornecedor (fornecedor_id);
CREATE INDEX idx_conversao_forn_produto ON public.conversoes_fornecedor (produto_id);
CREATE INDEX idx_conversao_forn_tipo ON public.conversoes_fornecedor (tipo_caixa_id);

-- ------------------------------------------------------------
-- 3. Tabela: histórico de alterações
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversao_historico (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela          TEXT NOT NULL CHECK (tabela IN ('conversoes_produto_caixa', 'conversoes_fornecedor')),
  registro_id     UUID NOT NULL,
  acao            TEXT NOT NULL CHECK (acao IN ('INSERT', 'UPDATE', 'DELETE')),
  fator_anterior  INT,
  fator_novo      INT,
  ativo_anterior  BOOLEAN,
  ativo_novo      BOOLEAN,
  alterado_por    UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversao_hist_registro ON public.conversao_historico (registro_id);
CREATE INDEX idx_conversao_hist_created ON public.conversao_historico (created_at);

-- ------------------------------------------------------------
-- 4. Triggers para histórico automático
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_conversao_produto_historico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.conversao_historico (tabela, registro_id, acao, fator_novo, ativo_novo, alterado_por)
    VALUES ('conversoes_produto_caixa', NEW.id, 'INSERT', NEW.fator, NEW.ativo, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.fator IS DISTINCT FROM NEW.fator OR OLD.ativo IS DISTINCT FROM NEW.ativo THEN
      INSERT INTO public.conversao_historico (tabela, registro_id, acao, fator_anterior, fator_novo, ativo_anterior, ativo_novo, alterado_por)
      VALUES ('conversoes_produto_caixa', NEW.id, 'UPDATE', OLD.fator, NEW.fator, OLD.ativo, NEW.ativo, auth.uid());
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.conversao_historico (tabela, registro_id, acao, fator_anterior, ativo_anterior, alterado_por)
    VALUES ('conversoes_produto_caixa', OLD.id, 'DELETE', OLD.fator, OLD.ativo, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_conversao_fornecedor_historico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.conversao_historico (tabela, registro_id, acao, fator_novo, ativo_novo, alterado_por)
    VALUES ('conversoes_fornecedor', NEW.id, 'INSERT', NEW.fator, NEW.ativo, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.fator IS DISTINCT FROM NEW.fator OR OLD.ativo IS DISTINCT FROM NEW.ativo THEN
      INSERT INTO public.conversao_historico (tabela, registro_id, acao, fator_anterior, fator_novo, ativo_anterior, ativo_novo, alterado_por)
      VALUES ('conversoes_fornecedor', NEW.id, 'UPDATE', OLD.fator, NEW.fator, OLD.ativo, NEW.ativo, auth.uid());
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.conversao_historico (tabela, registro_id, acao, fator_anterior, ativo_anterior, alterado_por)
    VALUES ('conversoes_fornecedor', OLD.id, 'DELETE', OLD.fator, OLD.ativo, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversao_produto_historico ON public.conversoes_produto_caixa;
CREATE TRIGGER trg_conversao_produto_historico
  AFTER INSERT OR UPDATE OR DELETE ON public.conversoes_produto_caixa
  FOR EACH ROW EXECUTE FUNCTION public.handle_conversao_produto_historico();

DROP TRIGGER IF EXISTS trg_conversao_fornecedor_historico ON public.conversoes_fornecedor;
CREATE TRIGGER trg_conversao_fornecedor_historico
  AFTER INSERT OR UPDATE OR DELETE ON public.conversoes_fornecedor
  FOR EACH ROW EXECUTE FUNCTION public.handle_conversao_fornecedor_historico();

-- ------------------------------------------------------------
-- 5. Trigger para updated_at automático
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_conversoes_produto ON public.conversoes_produto_caixa;
CREATE TRIGGER set_updated_at_conversoes_produto
  BEFORE UPDATE ON public.conversoes_produto_caixa
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_conversoes_fornecedor ON public.conversoes_fornecedor;
CREATE TRIGGER set_updated_at_conversoes_fornecedor
  BEFORE UPDATE ON public.conversoes_fornecedor
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- 6. Função para resolver fator de conversão
-- Prioridade: fornecedor × produto × tipo → produto × tipo → NULL
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_fator_conversao(
  p_fornecedor_id UUID,
  p_produto_id UUID,
  p_tipo_caixa_id UUID
)
RETURNS INT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT fator FROM public.conversoes_fornecedor
     WHERE fornecedor_id = p_fornecedor_id
       AND produto_id = p_produto_id
       AND tipo_caixa_id = p_tipo_caixa_id
       AND ativo = TRUE
     LIMIT 1),
    (SELECT fator FROM public.conversoes_produto_caixa
     WHERE produto_id = p_produto_id
       AND tipo_caixa_id = p_tipo_caixa_id
       AND ativo = TRUE
     LIMIT 1)
  );
$$;

-- Versão por sigla do tipo de caixa (para uso em telas)
CREATE OR REPLACE FUNCTION public.resolver_fator_conversao_sigla(
  p_fornecedor_id UUID,
  p_produto_id UUID,
  p_tipo_caixa_sigla TEXT
)
RETURNS INT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.resolver_fator_conversao(
    p_fornecedor_id,
    p_produto_id,
    (SELECT id FROM public.tipos_caixa WHERE sigla = p_tipo_caixa_sigla LIMIT 1)
  );
$$;

-- ------------------------------------------------------------
-- 7. RLS Policies
-- ------------------------------------------------------------
ALTER TABLE public.conversoes_produto_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversoes_fornecedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversao_historico ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['conversoes_produto_caixa', 'conversoes_fornecedor', 'conversao_historico'])
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

-- ------------------------------------------------------------
-- 8. View para facilitar consultas
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_conversoes_produto
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.produto_id,
  p.nome AS produto_nome,
  p.codigo AS produto_codigo,
  c.tipo_caixa_id,
  t.sigla AS tipo_caixa_sigla,
  t.nome AS tipo_caixa_nome,
  c.fator,
  c.ativo,
  c.created_at,
  c.updated_at
FROM public.conversoes_produto_caixa c
JOIN public.produtos p ON p.id = c.produto_id
JOIN public.tipos_caixa t ON t.id = c.tipo_caixa_id;

CREATE OR REPLACE VIEW public.v_conversoes_fornecedor
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.fornecedor_id,
  f.nome AS fornecedor_nome,
  c.produto_id,
  p.nome AS produto_nome,
  p.codigo AS produto_codigo,
  c.tipo_caixa_id,
  t.sigla AS tipo_caixa_sigla,
  t.nome AS tipo_caixa_nome,
  c.fator,
  c.ativo,
  c.created_at,
  c.updated_at
FROM public.conversoes_fornecedor c
JOIN public.fornecedores f ON f.id = c.fornecedor_id
JOIN public.produtos p ON p.id = c.produto_id
JOIN public.tipos_caixa t ON t.id = c.tipo_caixa_id;

CREATE OR REPLACE VIEW public.v_conversao_historico
WITH (security_invoker = true) AS
SELECT
  h.id,
  h.tabela,
  h.registro_id,
  h.acao,
  h.fator_anterior,
  h.fator_novo,
  h.ativo_anterior,
  h.ativo_novo,
  h.alterado_por,
  pr.nome AS alterado_por_nome,
  h.created_at,
  CASE WHEN h.tabela = 'conversoes_produto_caixa' THEN
    (SELECT p.nome FROM public.conversoes_produto_caixa c
     JOIN public.produtos p ON p.id = c.produto_id
     WHERE c.id = h.registro_id)
  ELSE
    (SELECT f.nome || ' → ' || p.nome FROM public.conversoes_fornecedor c
     JOIN public.fornecedores f ON f.id = c.fornecedor_id
     JOIN public.produtos p ON p.id = c.produto_id
     WHERE c.id = h.registro_id)
  END AS descricao
FROM public.conversao_historico h
LEFT JOIN public.profiles pr ON pr.id = h.alterado_por;

GRANT SELECT ON public.v_conversoes_produto TO authenticated;
GRANT SELECT ON public.v_conversoes_fornecedor TO authenticated;
GRANT SELECT ON public.v_conversao_historico TO authenticated;

-- ------------------------------------------------------------
-- 9. Tabela para importações de conversão
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.importacoes_conversao (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo           TEXT NOT NULL,
  usuario_id        UUID REFERENCES public.profiles(id),
  linhas_lidas      INT NOT NULL DEFAULT 0,
  conversoes_criadas INT NOT NULL DEFAULT 0,
  conversoes_atualizadas INT NOT NULL DEFAULT 0,
  pendencias        INT NOT NULL DEFAULT 0,
  rejeitadas        INT NOT NULL DEFAULT 0,
  detalhes          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes_conversao ENABLE ROW LEVEL SECURITY;
CREATE POLICY importacoes_conversao_select_auth ON public.importacoes_conversao FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY importacoes_conversao_insert_auth ON public.importacoes_conversao FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY importacoes_conversao_update_auth ON public.importacoes_conversao FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY importacoes_conversao_delete_admin ON public.importacoes_conversao FOR DELETE USING (public.is_admin());
