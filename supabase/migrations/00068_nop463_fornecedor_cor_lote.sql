-- NOP-463: cor de fornecedor em lote (sugerir → revisar → confirmar) e
-- conflito de cor como PENDÊNCIA em vez de bloqueio no vínculo.
--
-- Decisões desta issue:
--  1. Paleta operacional = 11 cores físicas de adesivo (as 10 cores da paleta
--     antiga de 18 sem adesivo físico saem do CHECK). Nenhum fornecedor tinha
--     cor gravada, então não há legado real a migrar.
--  2. Vincular produto novo a um fornecedor NÃO é mais bloqueado quando a cor
--     colide com outro fornecedor do mesmo produto: o vínculo é aceito e abre
--     uma pendência em fornecedor_cor_conflito + hold de adesivo (NOP-466).
--  3. Atribuir/alterar cor na tabela fornecedores continua com unicidade dura
--     (assert_fornecedor_cor_livre) — inclusive no lote.

-- ------------------------------------------------------------
-- 1. Paleta de 11 cores
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fornecedor_cor_paleta()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'preto', 'amarelo', 'azul', 'ciano', 'rosa', 'verde',
    'branco', 'lilas_claro', 'cinza_palido', 'vermelho', 'laranja'
  ]::text[];
$$;

COMMENT ON FUNCTION public.fornecedor_cor_paleta() IS
  'NOP-463: 11 cores com adesivo físico no galpão. Espelha src/lib/fornecedor-cores.ts.';

-- Defensivo: a paleta antiga tinha 18 ids. Na prática todas as cores estão
-- NULL (nada gravado desde NOP-360), mas se alguma tiver escapado ela volta a
-- NULL para não travar o CHECK novo — o admin re-sugere em lote na tela.
-- Trigger desligado porque ele exige cor NOT NULL ao editar cadastro.
ALTER TABLE public.fornecedores DISABLE TRIGGER trg_fornecedores_cor_validate;
UPDATE public.fornecedores
   SET cor = NULL
 WHERE cor IS NOT NULL
   AND cor <> ALL (public.fornecedor_cor_paleta());
ALTER TABLE public.fornecedores ENABLE TRIGGER trg_fornecedores_cor_validate;

ALTER TABLE public.fornecedores
  DROP CONSTRAINT IF EXISTS fornecedores_cor_check;

ALTER TABLE public.fornecedores
  ADD CONSTRAINT fornecedores_cor_check
  CHECK (
    cor IS NULL OR cor IN (
      'preto', 'amarelo', 'azul', 'ciano', 'rosa', 'verde',
      'branco', 'lilas_claro', 'cinza_palido', 'vermelho', 'laranja'
    )
  );

CREATE OR REPLACE FUNCTION public.fornecedor_cor_nome(p_cor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_cor
    -- paleta operacional (NOP-463)
    WHEN 'preto' THEN 'Preto'
    WHEN 'amarelo' THEN 'Amarelo'
    WHEN 'azul' THEN 'Azul'
    WHEN 'ciano' THEN 'Ciano'
    WHEN 'rosa' THEN 'Rosa'
    WHEN 'verde' THEN 'Verde'
    WHEN 'branco' THEN 'Branco'
    WHEN 'lilas_claro' THEN 'Lilás claro'
    WHEN 'cinza_palido' THEN 'Cinza pálido'
    WHEN 'vermelho' THEN 'Vermelho'
    WHEN 'laranja' THEN 'Laranja'
    -- legado NOP-360 (fora da paleta): só para ler auditoria antiga
    WHEN 'bordo' THEN 'Bordô (fora da paleta)'
    WHEN 'verde_limao' THEN 'Verde-limão (fora da paleta)'
    WHEN 'verde_escuro' THEN 'Verde escuro (fora da paleta)'
    WHEN 'azul_claro' THEN 'Azul claro (fora da paleta)'
    WHEN 'azul_marinho' THEN 'Azul-marinho (fora da paleta)'
    WHEN 'roxo' THEN 'Roxo (fora da paleta)'
    WHEN 'lilas' THEN 'Lilás (fora da paleta)'
    WHEN 'marrom' THEN 'Marrom (fora da paleta)'
    WHEN 'bege' THEN 'Bege (fora da paleta)'
    WHEN 'cinza' THEN 'Cinza (fora da paleta)'
    ELSE COALESCE(p_cor, '')
  END;
$$;

-- ------------------------------------------------------------
-- 2. Pendência de conflito + hold de adesivo
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fornecedor_cor_conflito (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_a_id    UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  fornecedor_b_id    UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  produto_id         UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  cor                TEXT NOT NULL,
  sugerido_trocar_id UUID REFERENCES public.fornecedores(id),
  resolvido_em       TIMESTAMPTZ,
  resolvido_por      UUID REFERENCES public.profiles(id),
  cor_resolucao      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_conflito_lados_distintos CHECK (fornecedor_a_id <> fornecedor_b_id)
);

COMMENT ON TABLE public.fornecedor_cor_conflito IS
  'NOP-463: dois fornecedores ativos do mesmo produto com a mesma cor. O vínculo é aceito e isto vira pendência.';

COMMENT ON COLUMN public.fornecedor_cor_conflito.sugerido_trocar_id IS
  'Heurística NOP-463: lado com MENOS caixas circulando (v_saldos_caixa, posição tipo=fornecedor). É um proxy provisório porque a contagem de adesivos emitidos só existe com NOP-466. Empate de saldo resolve pelo nome em ordem alfabética, igual ao helper sugerirQuemTrocar do front.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fornecedor_cor_conflito_aberto
  ON public.fornecedor_cor_conflito (produto_id, cor, fornecedor_a_id, fornecedor_b_id)
  WHERE resolvido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_fornecedor_cor_conflito_a
  ON public.fornecedor_cor_conflito (fornecedor_a_id) WHERE resolvido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_fornecedor_cor_conflito_b
  ON public.fornecedor_cor_conflito (fornecedor_b_id) WHERE resolvido_em IS NULL;

CREATE TABLE IF NOT EXISTS public.fornecedor_adesivo_hold (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id  UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  cor            TEXT NOT NULL,
  conflito_id    UUID REFERENCES public.fornecedor_cor_conflito(id) ON DELETE CASCADE,
  motivo         TEXT NOT NULL DEFAULT 'conflito_cor',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at    TIMESTAMPTZ
);

COMMENT ON TABLE public.fornecedor_adesivo_hold IS
  'NOP-463 (stub para NOP-466): enquanto há hold aberto, não enviar adesivo daquela cor para o fornecedor.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fornecedor_adesivo_hold_aberto
  ON public.fornecedor_adesivo_hold (fornecedor_id, cor)
  WHERE released_at IS NULL;

ALTER TABLE public.fornecedor_cor_conflito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_adesivo_hold ENABLE ROW LEVEL SECURITY;

-- Meu turno / cadastro de fornecedor mostram as pendências abertas para
-- qualquer usuário logado; histórico resolvido e escrita são só do admin.
DROP POLICY IF EXISTS fornecedor_cor_conflito_select ON public.fornecedor_cor_conflito;
CREATE POLICY fornecedor_cor_conflito_select ON public.fornecedor_cor_conflito
  FOR SELECT TO authenticated
  USING (resolvido_em IS NULL OR public.is_admin());

DROP POLICY IF EXISTS fornecedor_cor_conflito_admin ON public.fornecedor_cor_conflito;
CREATE POLICY fornecedor_cor_conflito_admin ON public.fornecedor_cor_conflito
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS fornecedor_adesivo_hold_select ON public.fornecedor_adesivo_hold;
CREATE POLICY fornecedor_adesivo_hold_select ON public.fornecedor_adesivo_hold
  FOR SELECT TO authenticated
  USING (released_at IS NULL OR public.is_admin());

DROP POLICY IF EXISTS fornecedor_adesivo_hold_admin ON public.fornecedor_adesivo_hold;
CREATE POLICY fornecedor_adesivo_hold_admin ON public.fornecedor_adesivo_hold
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.fornecedor_cor_conflito TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fornecedor_cor_conflito TO authenticated;
GRANT SELECT ON public.fornecedor_adesivo_hold TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fornecedor_adesivo_hold TO authenticated;

-- ------------------------------------------------------------
-- 3. Heurística de quem trocar + registro de conflito/hold
-- ------------------------------------------------------------

/**
 * Caixas circulando na posição do fornecedor (soma de todos os tipos).
 * Proxy de "custo de trocar a cor" enquanto não existe contagem de adesivos.
 */
CREATE OR REPLACE FUNCTION public.fornecedor_caixas_circulando(p_fornecedor_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(s.saldo), 0)::numeric
  FROM public.v_saldos_caixa s
  WHERE s.posicao_tipo = 'fornecedor'
    AND s.ref_id = p_fornecedor_id;
$$;

CREATE OR REPLACE FUNCTION public.hold_adesivo_conflito(
  p_fornecedor_id uuid,
  p_cor text,
  p_conflito_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_fornecedor_id IS NULL OR p_cor IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fornecedor_adesivo_hold
    WHERE fornecedor_id = p_fornecedor_id
      AND cor = p_cor
      AND released_at IS NULL
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.fornecedor_adesivo_hold (fornecedor_id, cor, conflito_id)
  VALUES (p_fornecedor_id, p_cor, p_conflito_id);
END;
$$;

/**
 * Abre (ou reaproveita) a pendência de conflito de cor e segura o adesivo dos
 * dois lados. Normaliza os ids para a_id < b_id, assim o mesmo par não gera
 * duas pendências espelhadas.
 */
CREATE OR REPLACE FUNCTION public.registrar_conflito_cor(
  p_fornecedor_x uuid,
  p_fornecedor_y uuid,
  p_produto_id uuid,
  p_cor text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a uuid;
  v_b uuid;
  v_id uuid;
  v_sug uuid;
  v_saldo_a numeric;
  v_saldo_b numeric;
  v_nome_a text;
  v_nome_b text;
BEGIN
  IF p_fornecedor_x IS NULL OR p_fornecedor_y IS NULL
     OR p_fornecedor_x = p_fornecedor_y
     OR p_produto_id IS NULL OR p_cor IS NULL OR btrim(p_cor) = '' THEN
    RETURN NULL;
  END IF;

  IF p_fornecedor_x < p_fornecedor_y THEN
    v_a := p_fornecedor_x; v_b := p_fornecedor_y;
  ELSE
    v_a := p_fornecedor_y; v_b := p_fornecedor_x;
  END IF;

  SELECT id INTO v_id
  FROM public.fornecedor_cor_conflito
  WHERE produto_id = p_produto_id
    AND cor = p_cor
    AND fornecedor_a_id = v_a
    AND fornecedor_b_id = v_b
    AND resolvido_em IS NULL
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT nome INTO v_nome_a FROM public.fornecedores WHERE id = v_a;
    SELECT nome INTO v_nome_b FROM public.fornecedores WHERE id = v_b;
    v_saldo_a := public.fornecedor_caixas_circulando(v_a);
    v_saldo_b := public.fornecedor_caixas_circulando(v_b);

    -- Menos caixas circulando = menos adesivo solto no campo = troca mais barata.
    IF v_saldo_a < v_saldo_b THEN
      v_sug := v_a;
    ELSIF v_saldo_b < v_saldo_a THEN
      v_sug := v_b;
    ELSE
      v_sug := CASE WHEN COALESCE(v_nome_a, '') <= COALESCE(v_nome_b, '') THEN v_a ELSE v_b END;
    END IF;

    INSERT INTO public.fornecedor_cor_conflito
      (fornecedor_a_id, fornecedor_b_id, produto_id, cor, sugerido_trocar_id)
    VALUES (v_a, v_b, p_produto_id, p_cor, v_sug)
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.hold_adesivo_conflito(v_a, p_cor, v_id);
  PERFORM public.hold_adesivo_conflito(v_b, p_cor, v_id);

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- 4. Vínculo de produto: aceita e abre pendência (não levanta mais)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_conversao_fornecedor_cor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cor text;
  v_outro uuid;
BEGIN
  IF NEW.ativo IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT cor INTO v_cor
  FROM public.fornecedores
  WHERE id = NEW.fornecedor_id AND ativo = TRUE;

  IF v_cor IS NULL THEN
    RETURN NEW; -- sem cor (legado / cadastro novo): vínculo ok
  END IF;

  -- NOP-463: conflito de cor em produto NÃO bloqueia mais o cadastro do
  -- vínculo. Aceita e abre pendência para o admin resolver (Meu turno,
  -- cadastro dos dois fornecedores, aviso na conferência).
  FOR v_outro IN
    SELECT DISTINCT cf.fornecedor_id
    FROM public.conversoes_fornecedor cf
    JOIN public.fornecedores f2 ON f2.id = cf.fornecedor_id
    WHERE cf.produto_id = NEW.produto_id
      AND cf.ativo = TRUE
      AND cf.fornecedor_id <> NEW.fornecedor_id
      AND f2.ativo = TRUE
      AND f2.cor = v_cor
  LOOP
    PERFORM public.registrar_conflito_cor(NEW.fornecedor_id, v_outro, NEW.produto_id, v_cor);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversao_fornecedor_cor ON public.conversoes_fornecedor;
CREATE TRIGGER trg_conversao_fornecedor_cor
  BEFORE INSERT OR UPDATE OF fornecedor_id, produto_id, ativo ON public.conversoes_fornecedor
  FOR EACH ROW EXECUTE FUNCTION public.trg_conversao_fornecedor_cor();

-- ------------------------------------------------------------
-- 5. RPCs do lote e das pendências
-- ------------------------------------------------------------

/**
 * Aplica as cores revisadas pelo admin. Nada é gravado sem esta chamada.
 * Unicidade dura: cada item passa por assert_fornecedor_cor_livre ANTES do
 * UPDATE, e como o lote roda numa transação o item N já vê as cores 1..N-1.
 * A auditoria sai do trigger trg_fornecedores_cor_validate (igual manual).
 */
CREATE OR REPLACE FUNCTION public.aplicar_sugestoes_cores_fornecedores(p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_fid uuid;
  v_cor text;
  v_aplicados int := 0;
  v_adesivos jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Só administrador aplica cores em lote'
      USING ERRCODE = '42501';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'p_itens deve ser um array de {fornecedor_id, cor}'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value) LOOP
    v_fid := NULLIF(v_item->>'fornecedor_id', '')::uuid;
    v_cor := NULLIF(btrim(COALESCE(v_item->>'cor', '')), '');

    IF v_fid IS NULL OR v_cor IS NULL THEN
      RAISE EXCEPTION 'Item inválido: fornecedor_id e cor são obrigatórios'
        USING ERRCODE = '22023';
    END IF;

    IF v_cor <> ALL (public.fornecedor_cor_paleta()) THEN
      RAISE EXCEPTION 'Cor % fora da paleta de adesivos', v_cor
        USING ERRCODE = '23514';
    END IF;

    IF v_fid = ANY (v_ids) THEN
      RAISE EXCEPTION 'Fornecedor repetido no lote'
        USING ERRCODE = '22023';
    END IF;
    v_ids := v_ids || v_fid;

    PERFORM public.assert_fornecedor_cor_livre(v_fid, v_cor, NULL);

    UPDATE public.fornecedores
       SET cor = v_cor
     WHERE id = v_fid AND ativo = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fornecedor % não encontrado ou inativo', v_fid
        USING ERRCODE = '23503';
    END IF;

    v_aplicados := v_aplicados + 1;
  END LOOP;

  -- Lista de adesivos a enviar. `em_espera` respeita o hold de NOP-466: se o
  -- fornecedor está em conflito naquela cor, o adesivo não sai ainda.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'fornecedor_id', f.id,
        'fornecedor_nome', f.nome,
        'cor', f.cor,
        'cor_nome', public.fornecedor_cor_nome(f.cor),
        'em_espera', EXISTS (
          SELECT 1 FROM public.fornecedor_adesivo_hold h
          WHERE h.fornecedor_id = f.id
            AND h.cor = f.cor
            AND h.released_at IS NULL
        )
      ) ORDER BY f.nome
    ),
    '[]'::jsonb
  )
  INTO v_adesivos
  FROM public.fornecedores f
  WHERE f.id = ANY (v_ids);

  RETURN jsonb_build_object('aplicados', v_aplicados, 'adesivos', v_adesivos);
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_conflitos_cor_abertos()
RETURNS TABLE (
  id uuid,
  fornecedor_a_id uuid,
  fornecedor_a_nome text,
  fornecedor_b_id uuid,
  fornecedor_b_nome text,
  produto_id uuid,
  produto_nome text,
  cor text,
  cor_nome text,
  sugerido_trocar_id uuid,
  sugerido_trocar_nome text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.fornecedor_a_id,
    fa.nome,
    c.fornecedor_b_id,
    fb.nome,
    c.produto_id,
    pr.nome,
    c.cor,
    public.fornecedor_cor_nome(c.cor),
    c.sugerido_trocar_id,
    fs.nome,
    c.created_at
  FROM public.fornecedor_cor_conflito c
  JOIN public.fornecedores fa ON fa.id = c.fornecedor_a_id
  JOIN public.fornecedores fb ON fb.id = c.fornecedor_b_id
  JOIN public.produtos pr ON pr.id = c.produto_id
  LEFT JOIN public.fornecedores fs ON fs.id = c.sugerido_trocar_id
  WHERE c.resolvido_em IS NULL
  ORDER BY c.created_at DESC;
$$;

/** Cores da paleta que ninguém usa naquele produto (opções para resolver). */
CREATE OR REPLACE FUNCTION public.cores_livres_produto(p_produto_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT c
      FROM unnest(public.fornecedor_cor_paleta()) WITH ORDINALITY AS p(c, ord)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.conversoes_fornecedor cf
        JOIN public.fornecedores f ON f.id = cf.fornecedor_id
        WHERE cf.produto_id = p_produto_id
          AND cf.ativo = TRUE
          AND f.ativo = TRUE
          AND f.cor = p.c
      )
      ORDER BY p.ord
    ),
    ARRAY[]::text[]
  );
$$;

/**
 * Resolve a pendência trocando a cor de UM dos dois fornecedores.
 * A troca passa pela unicidade dura (assert + trigger da tabela fornecedores),
 * marca o conflito como resolvido e libera os holds de adesivo dele.
 */
CREATE OR REPLACE FUNCTION public.resolver_conflito_cor(
  p_conflito_id uuid,
  p_fornecedor_id uuid,
  p_nova_cor text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conf public.fornecedor_cor_conflito;
  v_cor text := NULLIF(btrim(COALESCE(p_nova_cor, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Só administrador resolve conflito de cor'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_conf
  FROM public.fornecedor_cor_conflito
  WHERE id = p_conflito_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conflito não encontrado' USING ERRCODE = '23503';
  END IF;
  IF v_conf.resolvido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Conflito já resolvido' USING ERRCODE = '23505';
  END IF;
  IF p_fornecedor_id IS DISTINCT FROM v_conf.fornecedor_a_id
     AND p_fornecedor_id IS DISTINCT FROM v_conf.fornecedor_b_id THEN
    RAISE EXCEPTION 'Fornecedor não faz parte deste conflito' USING ERRCODE = '22023';
  END IF;
  IF v_cor IS NULL OR v_cor <> ALL (public.fornecedor_cor_paleta()) THEN
    RAISE EXCEPTION 'Escolha uma cor da paleta de adesivos' USING ERRCODE = '23514';
  END IF;
  IF v_cor = v_conf.cor THEN
    RAISE EXCEPTION 'A cor nova tem de ser diferente de %',
      public.fornecedor_cor_nome(v_conf.cor)
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.assert_fornecedor_cor_livre(p_fornecedor_id, v_cor, NULL);

  UPDATE public.fornecedores
     SET cor = v_cor
   WHERE id = p_fornecedor_id;

  UPDATE public.fornecedor_cor_conflito
     SET resolvido_em = now(),
         resolvido_por = auth.uid(),
         cor_resolucao = v_cor
   WHERE id = p_conflito_id;

  UPDATE public.fornecedor_adesivo_hold
     SET released_at = now()
   WHERE conflito_id = p_conflito_id
     AND released_at IS NULL;

  RETURN jsonb_build_object(
    'conflito_id', p_conflito_id,
    'fornecedor_id', p_fornecedor_id,
    'cor', v_cor,
    'cor_nome', public.fornecedor_cor_nome(v_cor)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fornecedor_cor_paleta() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fornecedor_caixas_circulando(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_sugestoes_cores_fornecedores(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_conflitos_cor_abertos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cores_livres_produto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_conflito_cor(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
