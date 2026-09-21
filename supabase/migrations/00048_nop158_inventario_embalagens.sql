-- ============================================================
-- NOP-158 — Inventário semanal de embalagens (só Packing)
--
-- Contagem semanal das embalagens (tipos do NOP-157) na posição
-- Packing. É paralelo ao inventário de caixas (NOP-15) e totalmente
-- independente de entrada/saída de mercadoria: nada de recebimento,
-- expedição ou pedido entra aqui.
--
-- REGRA DE CADÊNCIA (documentada aqui e refletida na view de status):
--   * A semana vai de segunda a domingo no fuso America/Sao_Paulo.
--   * O vencimento da semana é a SEXTA-FEIRA dessa semana.
--   * A contagem da semana está OK quando existe `contagens_embalagem`
--     com `data >= segunda-feira da semana corrente`.
--   * Fica PENDENTE quando não há contagem na semana corrente E
--     (hoje >= sexta da semana corrente  OU  dias desde a última
--      contagem >= 7) — mesmo grau de urgência do inventário de caixas.
--   * Sem nenhuma contagem registrada: só vira pendência a partir da
--     sexta (evita alarme em massa no go-live, igual ao 00040).
--   * A pendência é SÓ visual/alerta — nenhuma movimentação é
--     bloqueada por inventário de embalagem atrasado.
--
-- Não há posição loja/fornecedor: embalagem só é contada no Packing.
-- Sem esperado × contado — a variação semana a semana é o consumo
-- aparente (contagem_anterior − contagem_atual).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cabeçalho da contagem
-- ------------------------------------------------------------
-- Uma linha por fechamento de contagem. A posição é implícita
-- (Packing), por isso não há posicao_id como em contagens_caixa.
-- Mais de uma contagem no mesmo dia é permitida (retificação): o
-- histórico mostra todas e a "última" é a mais recente.
CREATE TABLE IF NOT EXISTS public.contagens_embalagem (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data        DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  contado_por UUID REFERENCES public.profiles(id),
  observacao  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contagens_embalagem_data
  ON public.contagens_embalagem (data DESC, created_at DESC);

COMMENT ON TABLE public.contagens_embalagem IS
  'NOP-158: contagem semanal de embalagens no Packing (vencimento sexta, BRT).';

-- ------------------------------------------------------------
-- 2. Itens da contagem — evolui o stub criado no NOP-157
-- ------------------------------------------------------------
-- O stub nasceu sem cabeçalho (só tipo/quantidade/contado_em/contado_por).
-- Agora o cabeçalho passa a ser o dono da data e do responsável.
ALTER TABLE public.contagem_embalagem_itens
  ADD COLUMN IF NOT EXISTS contagem_id UUID;

-- Backfill: qualquer item órfão do stub vira uma contagem própria,
-- agrupada por dia (BRT) + responsável. Guardado por existência da
-- coluna para o script continuar re-executável depois do DROP abaixo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contagem_embalagem_itens'
      AND column_name = 'contado_em'
  ) THEN
    EXECUTE $q$
      WITH grupos AS (
        SELECT DISTINCT
          (contado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
          contado_por
        FROM public.contagem_embalagem_itens
        WHERE contagem_id IS NULL
      ),
      novos AS (
        INSERT INTO public.contagens_embalagem (data, contado_por, observacao)
        SELECT dia, contado_por, 'Backfill NOP-158 — itens sem cabeçalho'
        FROM grupos
        RETURNING id, data, contado_por
      )
      UPDATE public.contagem_embalagem_itens i
      SET contagem_id = n.id
      FROM novos n
      WHERE i.contagem_id IS NULL
        AND (i.contado_em AT TIME ZONE 'America/Sao_Paulo')::date = n.data
        AND i.contado_por IS NOT DISTINCT FROM n.contado_por
    $q$;
  END IF;
END;
$$;

-- FK para o cabeçalho. tipo_embalagem_id continua ON DELETE RESTRICT
-- (o bloqueio de exclusão do NOP-157 depende dele).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_contagem_embalagem_itens_contagem'
  ) THEN
    ALTER TABLE public.contagem_embalagem_itens
      ADD CONSTRAINT fk_contagem_embalagem_itens_contagem
      FOREIGN KEY (contagem_id) REFERENCES public.contagens_embalagem(id) ON DELETE CASCADE;
  END IF;
END;
$$;

ALTER TABLE public.contagem_embalagem_itens
  ALTER COLUMN contagem_id SET NOT NULL;

-- Uma linha por tipo dentro da contagem.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contagem_embalagem_item
  ON public.contagem_embalagem_itens (contagem_id, tipo_embalagem_id);

CREATE INDEX IF NOT EXISTS idx_contagem_embalagem_itens_contagem
  ON public.contagem_embalagem_itens (contagem_id);

-- Data e responsável agora vivem no cabeçalho — sem coluna redundante.
ALTER TABLE public.contagem_embalagem_itens
  DROP COLUMN IF EXISTS contado_em,
  DROP COLUMN IF EXISTS contado_por;

-- ------------------------------------------------------------
-- 3. Ajustes livres (compra / sobra / perda / outro)
-- ------------------------------------------------------------
-- NÃO é um razão obrigatório de movimentação: é um registro livre,
-- com observação obrigatória, que aparece no histórico do tipo para
-- explicar variações fora do consumo normal.
-- quantidade é assinada: positiva entra (compra/sobra), negativa sai (perda).
CREATE TABLE IF NOT EXISTS public.ajustes_embalagem (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_embalagem_id UUID NOT NULL REFERENCES public.tipos_embalagem(id) ON DELETE RESTRICT,
  quantidade        NUMERIC(14,3) NOT NULL,
  tipo              TEXT NOT NULL,
  observacao        TEXT NOT NULL,
  registrado_por    UUID REFERENCES public.profiles(id),
  registrado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ajustes_embalagem_tipo CHECK (tipo IN ('compra', 'sobra', 'perda', 'outro')),
  CONSTRAINT ck_ajustes_embalagem_obs CHECK (btrim(observacao) <> ''),
  CONSTRAINT ck_ajustes_embalagem_qty CHECK (quantidade <> 0)
);

CREATE INDEX IF NOT EXISTS idx_ajustes_embalagem_tipo
  ON public.ajustes_embalagem (tipo_embalagem_id, registrado_em DESC);

COMMENT ON TABLE public.ajustes_embalagem IS
  'NOP-158: ajuste livre de embalagem com observação (compra/sobra/perda/outro). Informativo, não bloqueia nada.';

-- ------------------------------------------------------------
-- 4. Parâmetros
-- ------------------------------------------------------------
INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('inventario_embalagem_alerta', 'true',
   'Alertar quando a contagem semanal de embalagens não foi fechada até sexta (BRT)'),
  ('inventario_embalagem_frequencia_dias', '7',
   'Frequência da contagem de embalagens (dias) — vencimento na sexta da semana corrente')
ON CONFLICT (chave) DO NOTHING;

-- ------------------------------------------------------------
-- 5. View: status semanal (pendência da sexta)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_inventario_embalagem_status
WITH (security_invoker = true) AS
WITH hoje AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS dia
),
semana AS (
  SELECT
    dia,
    -- segunda-feira da semana corrente (ISODOW: segunda = 1)
    dia - (EXTRACT(ISODOW FROM dia)::int - 1) AS inicio_semana,
    -- sexta-feira = vencimento da contagem
    dia - (EXTRACT(ISODOW FROM dia)::int - 1) + 4 AS vencimento
  FROM hoje
),
ultima AS (
  SELECT c.id, c.data, c.contado_por, c.created_at
  FROM public.contagens_embalagem c
  ORDER BY c.data DESC, c.created_at DESC
  LIMIT 1
)
SELECT
  u.id                                            AS ultima_contagem_id,
  u.data                                          AS ultima_contagem_data,
  pr.nome                                         AS ultima_contagem_responsavel,
  s.dia                                           AS hoje,
  s.inicio_semana,
  s.vencimento,
  (s.dia - u.data)::int                           AS dias_desde_contagem,
  (u.id IS NULL)                                  AS nunca_contado,
  COALESCE(u.data >= s.inicio_semana, FALSE)      AS contagem_semana_ok,
  (
    COALESCE(u.data >= s.inicio_semana, FALSE) = FALSE
    AND (s.dia >= s.vencimento OR COALESCE((s.dia - u.data)::int, 0) >= 7)
  )                                               AS pendente,
  CASE
    WHEN COALESCE(u.data >= s.inicio_semana, FALSE) THEN 'em_dia'
    WHEN u.id IS NULL AND s.dia >= s.vencimento    THEN 'sem_contagem'
    WHEN u.id IS NULL                              THEN 'em_dia'
    WHEN (s.dia - u.data)::int >= 7                THEN 'atrasado'
    WHEN s.dia >= s.vencimento                     THEN 'pendente'
    ELSE 'em_dia'
  END                                             AS situacao
FROM semana s
LEFT JOIN ultima u ON TRUE
LEFT JOIN public.profiles pr ON pr.id = u.contado_por;

GRANT SELECT ON public.v_inventario_embalagem_status TO authenticated;

COMMENT ON VIEW public.v_inventario_embalagem_status IS
  'NOP-158: uma linha com a situação da contagem semanal de embalagens. Vence na sexta (BRT); pendência é apenas visual.';

-- ------------------------------------------------------------
-- 6. View: quantidade atual e anterior por tipo (para o formulário)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_embalagem_contagem_atual
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    i.tipo_embalagem_id,
    i.quantidade,
    c.data,
    ROW_NUMBER() OVER (
      PARTITION BY i.tipo_embalagem_id
      ORDER BY c.data DESC, c.created_at DESC
    ) AS rn
  FROM public.contagem_embalagem_itens i
  JOIN public.contagens_embalagem c ON c.id = i.contagem_id
)
SELECT
  te.id               AS tipo_embalagem_id,
  te.nome,
  te.unidade_contagem,
  te.qty_por_pacote,
  ult.quantidade      AS ultima_quantidade,
  ult.data            AS ultima_data,
  ant.quantidade      AS anterior_quantidade,
  ant.data            AS anterior_data,
  -- consumo aparente entre as duas últimas contagens
  (ant.quantidade - ult.quantidade) AS consumo_aparente
FROM public.tipos_embalagem te
LEFT JOIN ranked ult ON ult.tipo_embalagem_id = te.id AND ult.rn = 1
LEFT JOIN ranked ant ON ant.tipo_embalagem_id = te.id AND ant.rn = 2
WHERE te.ativo = TRUE
ORDER BY te.nome;

GRANT SELECT ON public.v_embalagem_contagem_atual TO authenticated;

-- ------------------------------------------------------------
-- 7. View: histórico por tipo com variação semana a semana
-- ------------------------------------------------------------
-- consumo_aparente = contagem anterior − contagem atual (sem
-- esperado × contado: não existe razão de movimentação de embalagem).
CREATE OR REPLACE VIEW public.v_historico_contagem_embalagem
WITH (security_invoker = true) AS
SELECT
  c.id                AS contagem_id,
  c.data,
  c.created_at,
  c.observacao,
  c.contado_por,
  pr.nome             AS contado_por_nome,
  i.tipo_embalagem_id,
  te.nome             AS tipo_nome,
  te.unidade_contagem,
  te.ativo            AS tipo_ativo,
  i.quantidade,
  LAG(i.quantidade) OVER w AS quantidade_anterior,
  LAG(c.data)       OVER w AS data_anterior,
  (LAG(i.quantidade) OVER w) - i.quantidade AS consumo_aparente
FROM public.contagem_embalagem_itens i
JOIN public.contagens_embalagem c ON c.id = i.contagem_id
JOIN public.tipos_embalagem te ON te.id = i.tipo_embalagem_id
LEFT JOIN public.profiles pr ON pr.id = c.contado_por
WINDOW w AS (PARTITION BY i.tipo_embalagem_id ORDER BY c.data, c.created_at);

GRANT SELECT ON public.v_historico_contagem_embalagem TO authenticated;

-- ------------------------------------------------------------
-- 8. RLS — mesmo padrão de tipos_embalagem / contagens_caixa
-- ------------------------------------------------------------
ALTER TABLE public.contagens_embalagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajustes_embalagem ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['contagens_embalagem', 'ajustes_embalagem'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contagens_embalagem TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ajustes_embalagem TO authenticated;

-- ------------------------------------------------------------
-- 9. Bloqueio de exclusão do tipo: contagem OU ajuste lançado
-- ------------------------------------------------------------
-- Mantém o EXISTS em contagem_embalagem_itens do NOP-157 e cobre
-- também os ajustes (que têm FK RESTRICT e dariam erro cru).
CREATE OR REPLACE FUNCTION public.tipo_embalagem_em_uso(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contagem_embalagem_itens WHERE tipo_embalagem_id = p_id
  ) OR EXISTS (
    SELECT 1 FROM public.ajustes_embalagem WHERE tipo_embalagem_id = p_id
  );
$$;

-- ------------------------------------------------------------
-- 10. RPC: fecha a contagem (cabeçalho + itens) em uma transação
-- ------------------------------------------------------------
-- Evita cabeçalho órfão se o insert dos itens falhar — um cabeçalho
-- sem itens marcaria a semana como contada sem nenhuma quantidade.
-- SECURITY INVOKER: a RLS das duas tabelas continua valendo.
CREATE OR REPLACE FUNCTION public.registrar_contagem_embalagem(
  p_data        DATE,
  p_contado_por UUID,
  p_observacao  TEXT,
  p_itens       JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_id UUID;
BEGIN
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um tipo de embalagem na contagem';
  END IF;

  INSERT INTO public.contagens_embalagem (data, contado_por, observacao)
  VALUES (
    COALESCE(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    p_contado_por,
    NULLIF(btrim(COALESCE(p_observacao, '')), '')
  )
  RETURNING id INTO v_id;

  -- Só tipos ativos entram na contagem.
  INSERT INTO public.contagem_embalagem_itens (contagem_id, tipo_embalagem_id, quantidade)
  SELECT v_id, te.id, (e->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) e
  JOIN public.tipos_embalagem te ON te.id = (e->>'tipo_embalagem_id')::UUID
  WHERE te.ativo = TRUE;

  IF NOT EXISTS (SELECT 1 FROM public.contagem_embalagem_itens WHERE contagem_id = v_id) THEN
    RAISE EXCEPTION 'Nenhum tipo de embalagem ativo na contagem';
  END IF;

  RETURN v_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.registrar_contagem_embalagem(DATE, UUID, TEXT, JSONB) TO authenticated;

-- ------------------------------------------------------------
-- 11. Página no menu (ao lado do inventário de caixas)
-- ------------------------------------------------------------
INSERT INTO public.pages (slug, nome, grupo, icone, ordem, ativo) VALUES
  ('embalagens/inventario', 'Inventário de embalagens', 'Caixas', 'Package', 32, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

NOTIFY pgrst, 'reload schema';
