-- NOP-360: cor do fornecedor (obrigatória em create/edit; legado pode ficar NULL).
-- Unicidade por produto via conversoes_fornecedor. Sem grant em lote.

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS cor TEXT;

ALTER TABLE public.fornecedores
  DROP CONSTRAINT IF EXISTS fornecedores_cor_check;

ALTER TABLE public.fornecedores
  ADD CONSTRAINT fornecedores_cor_check
  CHECK (
    cor IS NULL OR cor IN (
      'vermelho', 'bordo', 'rosa', 'laranja', 'amarelo',
      'verde_limao', 'verde', 'verde_escuro', 'ciano', 'azul_claro',
      'azul', 'azul_marinho', 'roxo', 'lilas', 'marrom',
      'bege', 'cinza', 'preto'
    )
  );

CREATE INDEX IF NOT EXISTS idx_fornecedores_cor
  ON public.fornecedores (cor)
  WHERE cor IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fornecedor_cor_auditoria (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id   UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  cor_anterior    TEXT,
  cor_nova        TEXT,
  alterado_por    UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedor_cor_aud_forn
  ON public.fornecedor_cor_auditoria (fornecedor_id, created_at DESC);

ALTER TABLE public.fornecedor_cor_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fornecedor_cor_aud_select ON public.fornecedor_cor_auditoria;
CREATE POLICY fornecedor_cor_aud_select ON public.fornecedor_cor_auditoria
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS fornecedor_cor_aud_insert ON public.fornecedor_cor_auditoria;
CREATE POLICY fornecedor_cor_aud_insert ON public.fornecedor_cor_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR alterado_por = auth.uid());

CREATE OR REPLACE FUNCTION public.fornecedor_cor_nome(p_cor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_cor
    WHEN 'vermelho' THEN 'Vermelho'
    WHEN 'bordo' THEN 'Bordô'
    WHEN 'rosa' THEN 'Rosa'
    WHEN 'laranja' THEN 'Laranja'
    WHEN 'amarelo' THEN 'Amarelo'
    WHEN 'verde_limao' THEN 'Verde-limão'
    WHEN 'verde' THEN 'Verde'
    WHEN 'verde_escuro' THEN 'Verde escuro'
    WHEN 'ciano' THEN 'Ciano'
    WHEN 'azul_claro' THEN 'Azul claro'
    WHEN 'azul' THEN 'Azul'
    WHEN 'azul_marinho' THEN 'Azul-marinho'
    WHEN 'roxo' THEN 'Roxo'
    WHEN 'lilas' THEN 'Lilás'
    WHEN 'marrom' THEN 'Marrom'
    WHEN 'bege' THEN 'Bege'
    WHEN 'cinza' THEN 'Cinza'
    WHEN 'preto' THEN 'Preto'
    ELSE COALESCE(p_cor, '')
  END;
$$;

/**
 * Levanta se p_cor do fornecedor conflita com outro no mesmo produto.
 * p_produto_id opcional: restringe a um produto (vínculo). Sem ele, checa todos os produtos do fornecedor.
 */
CREATE OR REPLACE FUNCTION public.assert_fornecedor_cor_livre(
  p_fornecedor_id uuid,
  p_cor text,
  p_produto_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hit record;
BEGIN
  IF p_cor IS NULL OR btrim(p_cor) = '' THEN
    RETURN;
  END IF;

  SELECT
    f2.nome AS fornecedor_nome,
    pr.nome AS produto_nome,
    f2.cor AS cor
  INTO v_hit
  FROM public.conversoes_fornecedor cf1
  JOIN public.conversoes_fornecedor cf2
    ON cf2.produto_id = cf1.produto_id
   AND cf2.fornecedor_id IS DISTINCT FROM cf1.fornecedor_id
   AND cf2.ativo = TRUE
  JOIN public.fornecedores f2 ON f2.id = cf2.fornecedor_id AND f2.cor = p_cor AND f2.ativo = TRUE
  JOIN public.produtos pr ON pr.id = cf1.produto_id
  WHERE cf1.fornecedor_id = p_fornecedor_id
    AND cf1.ativo = TRUE
    AND (p_produto_id IS NULL OR cf1.produto_id = p_produto_id)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION '% já é do fornecedor % em %',
      public.fornecedor_cor_nome(p_cor),
      v_hit.fornecedor_nome,
      v_hit.produto_nome
      USING ERRCODE = '23514';
  END IF;

  -- Ao vincular um produto novo: o fornecedor ainda pode não ter conversão nele;
  -- checa outros fornecedores do produto com a mesma cor.
  IF p_produto_id IS NOT NULL THEN
    SELECT
      f2.nome AS fornecedor_nome,
      pr.nome AS produto_nome
    INTO v_hit
    FROM public.conversoes_fornecedor cf2
    JOIN public.fornecedores f2 ON f2.id = cf2.fornecedor_id
    JOIN public.produtos pr ON pr.id = cf2.produto_id
    WHERE cf2.produto_id = p_produto_id
      AND cf2.ativo = TRUE
      AND cf2.fornecedor_id IS DISTINCT FROM p_fornecedor_id
      AND f2.cor = p_cor
      AND f2.ativo = TRUE
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION '% já é do fornecedor % em %',
        public.fornecedor_cor_nome(p_cor),
        v_hit.fornecedor_nome,
        v_hit.produto_nome
        USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fornecedores_cor_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cadastro_mudou boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.id IS NULL THEN
      NEW.id := gen_random_uuid();
    END IF;
    IF NEW.cor IS NULL OR btrim(NEW.cor) = '' THEN
      RAISE EXCEPTION 'Cor é obrigatória no cadastro do fornecedor'
        USING ERRCODE = '23514';
    END IF;
    PERFORM public.assert_fornecedor_cor_livre(NEW.id, NEW.cor, NULL);
    RETURN NEW;
  END IF;

  -- UPDATE: edição de cadastro (nome/código/contato/cor) exige cor; só ativo/mescla não.
  v_cadastro_mudou :=
    OLD.nome IS DISTINCT FROM NEW.nome
    OR OLD.codigo_wise IS DISTINCT FROM NEW.codigo_wise
    OR OLD.contato IS DISTINCT FROM NEW.contato
    OR OLD.telefone IS DISTINCT FROM NEW.telefone
    OR OLD.email IS DISTINCT FROM NEW.email
    OR OLD.cor IS DISTINCT FROM NEW.cor;

  IF v_cadastro_mudou THEN
    IF NEW.cor IS NULL OR btrim(NEW.cor) = '' THEN
      RAISE EXCEPTION 'Cor é obrigatória ao salvar o fornecedor'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.cor IS NOT NULL AND NEW.cor IS DISTINCT FROM OLD.cor THEN
    PERFORM public.assert_fornecedor_cor_livre(NEW.id, NEW.cor, NULL);
  END IF;

  IF OLD.cor IS DISTINCT FROM NEW.cor THEN
    INSERT INTO public.fornecedor_cor_auditoria (fornecedor_id, cor_anterior, cor_nova, alterado_por)
    VALUES (NEW.id, OLD.cor, NEW.cor, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fornecedores_cor_validate ON public.fornecedores;
CREATE TRIGGER trg_fornecedores_cor_validate
  BEFORE INSERT OR UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.trg_fornecedores_cor_validate();

CREATE OR REPLACE FUNCTION public.trg_conversao_fornecedor_cor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cor text;
BEGIN
  IF NEW.ativo IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT cor INTO v_cor FROM public.fornecedores WHERE id = NEW.fornecedor_id;
  IF v_cor IS NULL THEN
    RETURN NEW; -- legado sem cor: vínculo ok
  END IF;

  PERFORM public.assert_fornecedor_cor_livre(NEW.fornecedor_id, v_cor, NEW.produto_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversao_fornecedor_cor ON public.conversoes_fornecedor;
CREATE TRIGGER trg_conversao_fornecedor_cor
  BEFORE INSERT OR UPDATE OF fornecedor_id, produto_id, ativo ON public.conversoes_fornecedor
  FOR EACH ROW EXECUTE FUNCTION public.trg_conversao_fornecedor_cor();

-- Cores em uso nos produtos de um fornecedor (para o seletor marcar, não esconder).
CREATE OR REPLACE FUNCTION public.cores_em_uso_fornecedor(p_fornecedor_id uuid)
RETURNS TABLE (cor text, produto_nome text, fornecedor_nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    f2.cor,
    pr.nome AS produto_nome,
    f2.nome AS fornecedor_nome
  FROM public.conversoes_fornecedor cf1
  JOIN public.conversoes_fornecedor cf2
    ON cf2.produto_id = cf1.produto_id
   AND cf2.fornecedor_id IS DISTINCT FROM cf1.fornecedor_id
   AND cf2.ativo = TRUE
  JOIN public.fornecedores f2 ON f2.id = cf2.fornecedor_id AND f2.cor IS NOT NULL AND f2.ativo = TRUE
  JOIN public.produtos pr ON pr.id = cf1.produto_id
  WHERE cf1.fornecedor_id = p_fornecedor_id
    AND cf1.ativo = TRUE;
$$;

GRANT EXECUTE ON FUNCTION public.cores_em_uso_fornecedor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fornecedor_cor_nome(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_fornecedor_cor_livre(uuid, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
