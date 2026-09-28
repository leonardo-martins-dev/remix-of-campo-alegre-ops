-- NOP-159 (QA return): fechar vazamento de valores de caixa via PostgREST.
-- Views financeiras e tipos_caixa.custo_unitario deixam de ser SELECT para authenticated;
-- números só via RPC SECURITY DEFINER com is_admin().

-- ------------------------------------------------------------
-- 1. REVOKE SELECT nas views de valor
-- ------------------------------------------------------------
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_total_geral_caixas',
    'v_ranking_custo_fornecedor',
    'v_ranking_custo_cliente',
    'v_custo_perda_caixas',
    'v_custo_quebra',
    'v_custo_perda_rota',
    'v_custo_recebimento'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v AND c.relkind IN ('v','m')
    ) THEN
      -- RPCs SECURITY DEFINER precisam que a view use privilégios do owner, não do invocador
      BEGIN
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = false)', v);
      EXCEPTION WHEN OTHERS THEN
        NULL; -- PG antigo / não suportado
      END;
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. tipos_caixa: authenticated lê tudo EXCETO custo_unitario
-- ------------------------------------------------------------
REVOKE SELECT ON TABLE public.tipos_caixa FROM PUBLIC, anon, authenticated;

-- Colunas operacionais (sem custo_unitario) — dinâmico conforme schema real
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tipos_caixa'
    AND column_name <> 'custo_unitario';
  IF cols IS NULL OR btrim(cols) = '' THEN
    RAISE EXCEPTION 'tipos_caixa sem colunas operacionais';
  END IF;
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.tipos_caixa TO authenticated', cols);
END $$;

GRANT INSERT, UPDATE, REFERENCES ON TABLE public.tipos_caixa TO authenticated;

-- Trava: só admin altera custo_unitario
CREATE OR REPLACE FUNCTION public.trg_tipos_caixa_custo_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.custo_unitario, 0) <> 0 AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Apenas administradores definem custo unitário'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.custo_unitario IS DISTINCT FROM NEW.custo_unitario AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores alteram custo unitário'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tipos_caixa_custo_admin_only ON public.tipos_caixa;
CREATE TRIGGER trg_tipos_caixa_custo_admin_only
  BEFORE INSERT OR UPDATE OF custo_unitario ON public.tipos_caixa
  FOR EACH ROW EXECUTE FUNCTION public.trg_tipos_caixa_custo_admin_only();

-- ------------------------------------------------------------
-- 3. Helper de autorização
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_admin_valores_caixa()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso restrito a administradores (valores de caixa)'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 3b. Garantir ranking views (podem ter sumido via CASCADE em 00050)
--     security_invoker=false p/ RPCs DEFINER lerem custo_unitario
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_ranking_custo_fornecedor;
CREATE VIEW public.v_ranking_custo_fornecedor
WITH (security_invoker = false) AS
WITH perda AS (
  SELECT fornecedor_id, fornecedor_nome, SUM(valor_perda) AS custo_perda
  FROM public.v_custo_perda_caixas
  WHERE fornecedor_id IS NOT NULL
  GROUP BY fornecedor_id, fornecedor_nome
),
recebimento AS (
  SELECT fornecedor_id, fornecedor_nome,
    SUM(CASE WHEN divergencia IN ('falta', 'qualidade') THEN valor_divergencia ELSE 0 END) AS custo_recebimento
  FROM public.v_custo_recebimento
  GROUP BY fornecedor_id, fornecedor_nome
),
quebra AS (
  SELECT fornecedor_id, fornecedor_nome, SUM(valor) AS custo_quebra
  FROM public.v_custo_quebra
  GROUP BY fornecedor_id, fornecedor_nome
)
SELECT
  COALESCE(p.fornecedor_id, r.fornecedor_id, q.fornecedor_id) AS fornecedor_id,
  COALESCE(p.fornecedor_nome, r.fornecedor_nome, q.fornecedor_nome) AS fornecedor_nome,
  COALESCE(p.custo_perda, 0) AS custo_perda,
  COALESCE(r.custo_recebimento, 0) AS custo_recebimento,
  COALESCE(q.custo_quebra, 0) AS custo_quebra,
  COALESCE(p.custo_perda, 0) + COALESCE(r.custo_recebimento, 0) + COALESCE(q.custo_quebra, 0) AS custo_total
FROM perda p
FULL OUTER JOIN recebimento r ON p.fornecedor_id = r.fornecedor_id
FULL OUTER JOIN quebra q ON COALESCE(p.fornecedor_id, r.fornecedor_id) = q.fornecedor_id
ORDER BY custo_total DESC;

DROP VIEW IF EXISTS public.v_ranking_custo_cliente;
CREATE VIEW public.v_ranking_custo_cliente
WITH (security_invoker = false) AS
WITH perda AS (
  SELECT cliente_id, cliente_nome, SUM(valor_perda) AS custo_perda
  FROM public.v_custo_perda_caixas
  WHERE cliente_id IS NOT NULL
  GROUP BY cliente_id, cliente_nome
),
contagem AS (
  SELECT cliente_id, cliente_nome, SUM(total_diferenca) AS divergencias_abertas
  FROM public.v_contagem_pendente
  WHERE cliente_id IS NOT NULL
  GROUP BY cliente_id, cliente_nome
)
SELECT
  COALESCE(p.cliente_id, c.cliente_id) AS cliente_id,
  COALESCE(p.cliente_nome, c.cliente_nome) AS cliente_nome,
  COALESCE(p.custo_perda, 0) AS custo_perda,
  COALESCE(c.divergencias_abertas, 0) AS divergencias_abertas,
  COALESCE(p.custo_perda, 0) AS custo_total
FROM perda p
FULL OUTER JOIN contagem c ON p.cliente_id = c.cliente_id
ORDER BY custo_total DESC;

REVOKE ALL ON TABLE public.v_ranking_custo_fornecedor FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.v_ranking_custo_cliente FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 4. RPCs SECURITY DEFINER
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_v_total_geral_caixas()
RETURNS SETOF public.v_total_geral_caixas
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_valores_caixa();
  RETURN QUERY SELECT * FROM public.v_total_geral_caixas;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_v_ranking_custo_fornecedor()
RETURNS SETOF public.v_ranking_custo_fornecedor
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_valores_caixa();
  RETURN QUERY SELECT * FROM public.v_ranking_custo_fornecedor;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_v_ranking_custo_cliente()
RETURNS SETOF public.v_ranking_custo_cliente
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_valores_caixa();
  RETURN QUERY SELECT * FROM public.v_ranking_custo_cliente;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_v_custo_perda_caixas(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL,
  p_tipo_caixa text DEFAULT NULL
)
RETURNS SETOF public.v_custo_perda_caixas
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_valores_caixa();
  RETURN QUERY
  SELECT v.*
  FROM public.v_custo_perda_caixas v
  WHERE (p_from IS NULL OR v.data_movimento >= p_from)
    AND (p_to IS NULL OR v.data_movimento <= p_to)
    AND (p_fornecedor_id IS NULL OR v.fornecedor_id = p_fornecedor_id)
    AND (p_cliente_id IS NULL OR v.cliente_id = p_cliente_id)
    AND (p_tipo_caixa IS NULL OR v.tipo_caixa = p_tipo_caixa);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_v_custo_quebra(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL
)
RETURNS SETOF public.v_custo_quebra
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_valores_caixa();
  RETURN QUERY
  SELECT v.*
  FROM public.v_custo_quebra v
  WHERE (p_from IS NULL OR v.data_quebra >= p_from)
    AND (p_to IS NULL OR v.data_quebra <= p_to)
    AND (p_fornecedor_id IS NULL OR v.fornecedor_id = p_fornecedor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_v_custo_perda_rota(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_rota_id uuid DEFAULT NULL,
  p_motorista_id uuid DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS SETOF public.v_custo_perda_rota
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_valores_caixa();
  RETURN QUERY
  SELECT v.*
  FROM public.v_custo_perda_rota v
  WHERE (p_from IS NULL OR v.data_carga >= p_from)
    AND (p_to IS NULL OR v.data_carga <= p_to)
    AND (p_rota_id IS NULL OR v.rota_id = p_rota_id)
    AND (p_motorista_id IS NULL OR v.motorista_id = p_motorista_id)
    AND (p_cliente_id IS NULL OR v.cliente_id = p_cliente_id);
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_v_custo_recebimento(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL
)
RETURNS SETOF public.v_custo_recebimento
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_valores_caixa();
  RETURN QUERY
  SELECT v.*
  FROM public.v_custo_recebimento v
  WHERE (p_from IS NULL OR v.data_pedido >= p_from)
    AND (p_to IS NULL OR v.data_pedido <= p_to)
    AND (p_fornecedor_id IS NULL OR v.fornecedor_id = p_fornecedor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_tipos_caixa_custos()
RETURNS TABLE (
  id uuid,
  sigla text,
  custo_unitario numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_valores_caixa();
  RETURN QUERY
  SELECT t.id, t.sigla, t.custo_unitario
  FROM public.tipos_caixa t
  WHERE t.ativo = TRUE
  ORDER BY t.ordem;
END;
$$;

-- Tipos com custo (cadastro admin)
CREATE OR REPLACE FUNCTION public.admin_tipos_caixa_full(p_include_inactive boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  sigla text,
  nome text,
  custo_unitario numeric,
  ordem int,
  ativo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_valores_caixa();
  RETURN QUERY
  SELECT t.id, t.sigla, t.nome, t.custo_unitario, t.ordem, t.ativo
  FROM public.tipos_caixa t
  WHERE p_include_inactive OR t.ativo = TRUE
  ORDER BY t.ordem;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_admin_valores_caixa() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_v_total_geral_caixas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_v_ranking_custo_fornecedor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_v_ranking_custo_cliente() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_v_custo_perda_caixas(date, date, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_v_custo_quebra(date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_v_custo_perda_rota(date, date, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_v_custo_recebimento(date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_tipos_caixa_custos() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_tipos_caixa_full(boolean) FROM PUBLIC;

-- assert_admin_valores_caixa: só uso interno (PERFORM); sem EXECUTE p/ clientes
GRANT EXECUTE ON FUNCTION public.admin_v_total_geral_caixas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_v_ranking_custo_fornecedor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_v_ranking_custo_cliente() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_v_custo_perda_caixas(date, date, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_v_custo_quebra(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_v_custo_perda_rota(date, date, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_v_custo_recebimento(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tipos_caixa_custos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tipos_caixa_full(boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
