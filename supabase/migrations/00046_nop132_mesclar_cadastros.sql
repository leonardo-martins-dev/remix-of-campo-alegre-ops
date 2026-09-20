-- ============================================================
-- NOP-132 — Mesclar fornecedores/clientes duplicados
--            + Código Wise separado do nome
--
-- Nada é apagado: os cadastros mesclados ficam inativos apontando para o
-- sobrevivente (mesclado_em_id) e todo o histórico é reapontado por FK.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Código Wise e marca de mesclagem nos cadastros
-- ------------------------------------------------------------
ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS codigo_wise TEXT,
  ADD COLUMN IF NOT EXISTS mesclado_em_id UUID REFERENCES public.fornecedores(id);

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS codigo_wise TEXT,
  ADD COLUMN IF NOT EXISTS mesclado_em_id UUID REFERENCES public.clientes(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fornecedores_codigo_wise
  ON public.fornecedores (codigo_wise)
  WHERE codigo_wise IS NOT NULL AND btrim(codigo_wise) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_codigo_wise
  ON public.clientes (codigo_wise)
  WHERE codigo_wise IS NOT NULL AND btrim(codigo_wise) <> '';

CREATE INDEX IF NOT EXISTS idx_fornecedores_mesclado ON public.fornecedores (mesclado_em_id)
  WHERE mesclado_em_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_mesclado ON public.clientes (mesclado_em_id)
  WHERE mesclado_em_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Auditoria das mesclagens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mesclagens_cadastro (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             TEXT NOT NULL,
  sobrevivente_id  UUID NOT NULL,
  mesclados_ids    UUID[] NOT NULL,
  user_id          UUID REFERENCES public.profiles(id),
  preview_snapshot JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_mesclagem_tipo CHECK (tipo IN ('fornecedor', 'cliente'))
);

CREATE INDEX IF NOT EXISTS idx_mesclagens_sobrevivente
  ON public.mesclagens_cadastro (sobrevivente_id);

ALTER TABLE public.mesclagens_cadastro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mesclagens_select_auth ON public.mesclagens_cadastro;
CREATE POLICY mesclagens_select_auth ON public.mesclagens_cadastro
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS mesclagens_insert_admin ON public.mesclagens_cadastro;
CREATE POLICY mesclagens_insert_admin ON public.mesclagens_cadastro
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS mesclagens_delete_admin ON public.mesclagens_cadastro;
CREATE POLICY mesclagens_delete_admin ON public.mesclagens_cadastro
  FOR DELETE USING (public.is_admin());

-- ------------------------------------------------------------
-- 3. Descoberta de FKs — reapontar tudo sem lista fixa de tabelas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fks_que_referenciam(p_alvo REGCLASS)
RETURNS TABLE (tabela REGCLASS, nome_tabela TEXT, coluna TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.conrelid::regclass, cl.relname::text, a.attname::text
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'f'
    AND c.confrelid = p_alvo
    AND cardinality(c.conkey) = 1
    AND n.nspname = 'public'
  ORDER BY 2, 3;
$$;

-- ------------------------------------------------------------
-- 4. Prévia da mesclagem: o que muda de dono
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_mesclar_cadastro(
  p_tipo TEXT,
  p_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alvo REGCLASS;
  v_tipo_pos public.tipo_posicao_caixa;
  v_fk RECORD;
  v_linhas BIGINT;
  v_relacionados JSONB := '[]'::jsonb;
  v_cadastros JSONB;
  v_aliases JSONB;
  v_saldo JSONB;
  v_movimentos BIGINT := 0;
  v_conflitos JSONB := '[]'::jsonb;
BEGIN
  IF p_tipo NOT IN ('fornecedor', 'cliente') THEN
    RAISE EXCEPTION 'Tipo inválido: %', p_tipo;
  END IF;
  IF COALESCE(array_length(p_ids, 1), 0) < 1 THEN
    RAISE EXCEPTION 'Informe os cadastros';
  END IF;

  v_alvo := CASE WHEN p_tipo = 'fornecedor' THEN 'public.fornecedores'::regclass
                 ELSE 'public.clientes'::regclass END;
  v_tipo_pos := (CASE WHEN p_tipo = 'fornecedor' THEN 'fornecedor' ELSE 'cliente' END)
                ::public.tipo_posicao_caixa;

  IF p_tipo = 'fornecedor' THEN
    SELECT jsonb_agg(jsonb_build_object(
             'id', f.id, 'nome', f.nome, 'ativo', f.ativo,
             'codigo_wise', f.codigo_wise, 'cnpj', NULL,
             'mesclado_em_id', f.mesclado_em_id
           ) ORDER BY f.nome)
    INTO v_cadastros
    FROM public.fornecedores f WHERE f.id = ANY (p_ids);
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
             'id', c.id, 'nome', c.nome, 'ativo', c.ativo,
             'codigo_wise', c.codigo_wise, 'cnpj', c.cnpj,
             'mesclado_em_id', c.mesclado_em_id
           ) ORDER BY c.nome)
    INTO v_cadastros
    FROM public.clientes c WHERE c.id = ANY (p_ids);
  END IF;

  -- contagem por tabela que aponta para o cadastro
  FOR v_fk IN SELECT * FROM public.fks_que_referenciam(v_alvo) LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = ANY($1)', v_fk.tabela, v_fk.coluna)
      INTO v_linhas USING p_ids;
    IF v_linhas > 0 THEN
      v_relacionados := v_relacionados || jsonb_build_object(
        'tabela', v_fk.nome_tabela, 'coluna', v_fk.coluna, 'linhas', v_linhas
      );
    END IF;
  END LOOP;

  -- caixas: movimentos e saldo das posições desses cadastros
  SELECT count(*)
  INTO v_movimentos
  FROM public.movimentacoes_caixa m
  WHERE m.origem_posicao_id IN (
          SELECT p.id FROM public.posicoes_caixa p
          WHERE p.tipo = v_tipo_pos AND p.ref_id = ANY (p_ids))
     OR m.destino_posicao_id IN (
          SELECT p.id FROM public.posicoes_caixa p
          WHERE p.tipo = v_tipo_pos AND p.ref_id = ANY (p_ids));

  SELECT COALESCE(jsonb_object_agg(x.tipo_caixa, x.saldo), '{}'::jsonb)
  INTO v_saldo
  FROM (
    SELECT s.tipo_caixa, SUM(s.saldo) AS saldo
    FROM public.v_saldos_caixa s
    JOIN public.posicoes_caixa p ON p.id = s.posicao_id
    WHERE p.tipo = v_tipo_pos AND p.ref_id = ANY (p_ids) AND s.tipo_caixa IS NOT NULL
    GROUP BY s.tipo_caixa
  ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', a.id, 'nome_externo', a.nome_externo,
           'codigo_externo', a.codigo_externo, 'entidade_id', a.entidade_id
         ) ORDER BY a.nome_externo), '[]'::jsonb)
  INTO v_aliases
  FROM public.aliases a
  WHERE a.tipo::text = p_tipo AND a.entidade_id = ANY (p_ids);

  -- conflito de fator: mesmo produto × tipo de caixa com fatores diferentes
  IF p_tipo = 'fornecedor' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'produto_id', x.produto_id,
             'produto', pr.nome,
             'tipo_caixa_id', x.tipo_caixa_id,
             'tipo_caixa', tc.sigla,
             'opcoes', x.opcoes
           )), '[]'::jsonb)
    INTO v_conflitos
    FROM (
      SELECT c.produto_id,
             c.tipo_caixa_id,
             jsonb_agg(DISTINCT jsonb_build_object('fornecedor_id', c.fornecedor_id, 'fator', c.fator)) AS opcoes
      FROM public.conversoes_fornecedor c
      WHERE c.fornecedor_id = ANY (p_ids) AND c.ativo
      GROUP BY c.produto_id, c.tipo_caixa_id
      HAVING count(DISTINCT c.fator) > 1
    ) x
    JOIN public.produtos pr ON pr.id = x.produto_id
    JOIN public.tipos_caixa tc ON tc.id = x.tipo_caixa_id;
  END IF;

  RETURN jsonb_build_object(
    'tipo', p_tipo,
    'cadastros', COALESCE(v_cadastros, '[]'::jsonb),
    'relacionados', v_relacionados,
    'movimentos_caixa', v_movimentos,
    'saldo_caixas', v_saldo,
    'aliases', v_aliases,
    'conflitos_conversao', v_conflitos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_mesclar_cadastro(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_mesclar_cadastro(TEXT, UUID[]) TO authenticated;

-- ------------------------------------------------------------
-- 5. Mesclagem propriamente dita (atômica)
-- p_resolucao_conversoes: [{ produto_id, tipo_caixa_id, fator }]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mesclar_cadastro(
  p_tipo TEXT,
  p_sobrevivente_id UUID,
  p_mesclados_ids UUID[],
  p_resolucao_conversoes JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alvo REGCLASS;
  v_tipo_pos public.tipo_posicao_caixa;
  v_fk RECORD;
  v_item JSONB;
  v_id UUID;
  v_pos_antiga UUID;
  v_pos_nova UUID;
  v_preview JSONB;
  v_mescla_id UUID;
  -- tabelas com UNIQUE envolvendo o cadastro: tratadas à mão logo abaixo
  v_skip TEXT[] := ARRAY[
    'conversoes_fornecedor',
    'minimo_estoque_fornecedor_caixa',
    'destinatario_cliente_map'
  ];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem mesclar cadastros';
  END IF;
  IF p_tipo NOT IN ('fornecedor', 'cliente') THEN
    RAISE EXCEPTION 'Tipo inválido: %', p_tipo;
  END IF;
  IF COALESCE(array_length(p_mesclados_ids, 1), 0) < 1 THEN
    RAISE EXCEPTION 'Selecione ao menos um cadastro para mesclar';
  END IF;
  IF p_sobrevivente_id = ANY (p_mesclados_ids) THEN
    RAISE EXCEPTION 'O cadastro que fica não pode estar na lista dos mesclados';
  END IF;

  v_alvo := CASE WHEN p_tipo = 'fornecedor' THEN 'public.fornecedores'::regclass
                 ELSE 'public.clientes'::regclass END;
  v_tipo_pos := (CASE WHEN p_tipo = 'fornecedor' THEN 'fornecedor' ELSE 'cliente' END)
                ::public.tipo_posicao_caixa;

  v_preview := public.preview_mesclar_cadastro(
    p_tipo, p_sobrevivente_id || p_mesclados_ids
  );

  -- 5.1 conversões e mínimos (fornecedor) / vínculos de destinatário (cliente)
  IF p_tipo = 'fornecedor' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_resolucao_conversoes, '[]'::jsonb)) LOOP
      INSERT INTO public.conversoes_fornecedor (fornecedor_id, produto_id, tipo_caixa_id, fator, ativo)
      VALUES (
        p_sobrevivente_id,
        (v_item->>'produto_id')::uuid,
        (v_item->>'tipo_caixa_id')::uuid,
        (v_item->>'fator')::int,
        TRUE
      )
      ON CONFLICT (fornecedor_id, produto_id, tipo_caixa_id)
      DO UPDATE SET fator = EXCLUDED.fator, ativo = TRUE, updated_at = now();
    END LOOP;

    UPDATE public.conversoes_fornecedor c
    SET fornecedor_id = p_sobrevivente_id, updated_at = now()
    WHERE c.fornecedor_id = ANY (p_mesclados_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.conversoes_fornecedor s
        WHERE s.fornecedor_id = p_sobrevivente_id
          AND s.produto_id = c.produto_id
          AND s.tipo_caixa_id = c.tipo_caixa_id
      );

    -- as que sobraram são duplicatas: ficam no cadastro mesclado, inativas
    UPDATE public.conversoes_fornecedor
    SET ativo = FALSE, updated_at = now()
    WHERE fornecedor_id = ANY (p_mesclados_ids);

    UPDATE public.minimo_estoque_fornecedor_caixa m
    SET fornecedor_id = p_sobrevivente_id, updated_at = now()
    WHERE m.fornecedor_id = ANY (p_mesclados_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.minimo_estoque_fornecedor_caixa s
        WHERE s.fornecedor_id = p_sobrevivente_id AND s.tipo_caixa = m.tipo_caixa
      );

    UPDATE public.minimo_estoque_fornecedor_caixa
    SET ativo = FALSE, updated_at = now()
    WHERE fornecedor_id = ANY (p_mesclados_ids);
  ELSE
    UPDATE public.destinatario_cliente_map d
    SET cliente_id = p_sobrevivente_id
    WHERE d.cliente_id = ANY (p_mesclados_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.destinatario_cliente_map s
        WHERE s.cliente_id = p_sobrevivente_id AND s.destinatario_id = d.destinatario_id
      );

    -- o mesmo destinatário já aponta para o sobrevivente: o vínculo repetido
    -- some para a importação não ficar ambígua (é um vínculo, não um cadastro).
    DELETE FROM public.destinatario_cliente_map WHERE cliente_id = ANY (p_mesclados_ids);
  END IF;

  -- 5.2 posições de caixa: movimentos/contagens passam para a posição do sobrevivente
  FOREACH v_id IN ARRAY p_mesclados_ids LOOP
    SELECT id INTO v_pos_antiga
    FROM public.posicoes_caixa
    WHERE tipo = v_tipo_pos AND ref_id = v_id;

    IF v_pos_antiga IS NOT NULL THEN
      v_pos_nova := public.ensure_posicao(v_tipo_pos, p_sobrevivente_id);
      FOR v_fk IN SELECT * FROM public.fks_que_referenciam('public.posicoes_caixa'::regclass) LOOP
        EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', v_fk.tabela, v_fk.coluna, v_fk.coluna)
          USING v_pos_nova, v_pos_antiga;
      END LOOP;
    END IF;
  END LOOP;

  -- 5.3 nomes Wise: aliases existentes e o próprio nome do mesclado apontam
  -- para o sobrevivente, então a próxima importação não recria o cadastro.
  UPDATE public.aliases
  SET entidade_id = p_sobrevivente_id
  WHERE tipo::text = p_tipo AND entidade_id = ANY (p_mesclados_ids);

  UPDATE public.pendencias_vinculo
  SET entidade_id = p_sobrevivente_id
  WHERE tipo::text = p_tipo AND entidade_id = ANY (p_mesclados_ids);

  IF p_tipo = 'fornecedor' THEN
    INSERT INTO public.aliases (tipo, nome_externo, codigo_externo, entidade_id, origem)
    SELECT 'fornecedor'::public.tipo_alias, f.nome, f.codigo_wise, p_sobrevivente_id, 'mesclagem'
    FROM public.fornecedores f
    WHERE f.id = ANY (p_mesclados_ids) AND btrim(f.nome) <> ''
    ON CONFLICT (tipo, origem, nome_externo) DO UPDATE SET entidade_id = EXCLUDED.entidade_id;
  ELSE
    INSERT INTO public.aliases (tipo, nome_externo, codigo_externo, entidade_id, origem)
    SELECT 'cliente'::public.tipo_alias, c.nome, COALESCE(c.codigo_wise, c.cnpj), p_sobrevivente_id, 'mesclagem'
    FROM public.clientes c
    WHERE c.id = ANY (p_mesclados_ids) AND btrim(c.nome) <> ''
    ON CONFLICT (tipo, origem, nome_externo) DO UPDATE SET entidade_id = EXCLUDED.entidade_id;
  END IF;

  -- 5.4 todo o resto por FK (pedidos, movimentos, vales, quebras, saídas, perfis…)
  FOR v_fk IN SELECT * FROM public.fks_que_referenciam(v_alvo) LOOP
    IF v_fk.nome_tabela = ANY (v_skip) THEN
      CONTINUE;
    END IF;
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = ANY($2)', v_fk.tabela, v_fk.coluna, v_fk.coluna)
      USING p_sobrevivente_id, p_mesclados_ids;
  END LOOP;

  -- 5.5 marca os mesclados (nada é apagado)
  IF p_tipo = 'fornecedor' THEN
    UPDATE public.fornecedores
    SET ativo = FALSE, mesclado_em_id = p_sobrevivente_id, updated_at = now()
    WHERE id = ANY (p_mesclados_ids);
  ELSE
    UPDATE public.clientes
    SET ativo = FALSE, mesclado_em_id = p_sobrevivente_id, updated_at = now()
    WHERE id = ANY (p_mesclados_ids);
  END IF;

  INSERT INTO public.mesclagens_cadastro (tipo, sobrevivente_id, mesclados_ids, user_id, preview_snapshot)
  VALUES (p_tipo, p_sobrevivente_id, p_mesclados_ids, auth.uid(), v_preview)
  RETURNING id INTO v_mescla_id;

  RETURN jsonb_build_object(
    'mesclagem_id', v_mescla_id,
    'tipo', p_tipo,
    'sobrevivente_id', p_sobrevivente_id,
    'mesclados', COALESCE(array_length(p_mesclados_ids, 1), 0),
    'preview', v_preview
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mesclar_cadastro(TEXT, UUID, UUID[], JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mesclar_cadastro(TEXT, UUID, UUID[], JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 6. Separar código Wise grudado no nome
-- Guarda o nome antigo como alias para a importação continuar casando.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_codigo_wise(
  p_tipo TEXT,
  p_id UUID,
  p_codigo TEXT,
  p_nome TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_antigo TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem editar o código Wise';
  END IF;
  IF p_tipo NOT IN ('fornecedor', 'cliente') THEN
    RAISE EXCEPTION 'Tipo inválido: %', p_tipo;
  END IF;
  IF COALESCE(btrim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'Informe o nome';
  END IF;

  IF p_tipo = 'fornecedor' THEN
    SELECT nome INTO v_nome_antigo FROM public.fornecedores WHERE id = p_id;
    UPDATE public.fornecedores
    SET nome = btrim(p_nome), codigo_wise = NULLIF(btrim(COALESCE(p_codigo, '')), ''), updated_at = now()
    WHERE id = p_id;
  ELSE
    SELECT nome INTO v_nome_antigo FROM public.clientes WHERE id = p_id;
    UPDATE public.clientes
    SET nome = btrim(p_nome), codigo_wise = NULLIF(btrim(COALESCE(p_codigo, '')), ''), updated_at = now()
    WHERE id = p_id;
  END IF;

  IF v_nome_antigo IS NULL THEN
    RAISE EXCEPTION 'Cadastro não encontrado';
  END IF;

  IF v_nome_antigo <> btrim(p_nome) THEN
    INSERT INTO public.aliases (tipo, nome_externo, codigo_externo, entidade_id, origem)
    VALUES (
      p_tipo::public.tipo_alias, v_nome_antigo,
      NULLIF(btrim(COALESCE(p_codigo, '')), ''), p_id, 'separacao_codigo'
    )
    ON CONFLICT (tipo, origem, nome_externo) DO UPDATE SET entidade_id = EXCLUDED.entidade_id;
  END IF;

  RETURN jsonb_build_object('id', p_id, 'nome', btrim(p_nome), 'codigo_wise', p_codigo);
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_codigo_wise(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aplicar_codigo_wise(TEXT, UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
