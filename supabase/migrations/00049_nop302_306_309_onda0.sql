-- ============================================================
-- Onda 0 — NOP-302 / NOP-306 / NOP-309
--   • Ordem sem cliente visível (LEFT JOIN)
--   • Revinculação em massa de fornecedores
--   • Produtos sem conversão (view + uso recente)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Normalização de nome de cadastro (espelha normalizeNomeCadastro)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.norm_cadastro_nome(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(translate(
            coalesce(
              -- tira código/CNPJ grudado no começo: "35.527.016 JOSUE…"
              CASE
                WHEN coalesce(p, '') ~ '^\d[\d.\-/]*\s+\S.*[A-Za-zÀ-ÿ]'
                THEN regexp_replace(p, '^\d[\d.\-/]*\s+', '')
                ELSE coalesce(p, '')
              END,
              ''
            ),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
            'AAAAAEEEEIIIIOOOOOUUUUcaaaaaeeeeiiiiooooouuuuc'
          )),
          '\s+(e outra|e outras|e outro|e outros|e cia|e filhos)\s*$',
          '',
          'i'
        ),
        '[.,;]+$',
        ''
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

COMMENT ON FUNCTION public.norm_cadastro_nome(text) IS
  'Chave de comparação de cadastros: sem acento/caixa, sem código grudado e sem E OUTRA/E OUTROS';

-- ------------------------------------------------------------
-- 2. NOP-302 — v_ordem_expedicao inclui órfãs (cliente_id NULL)
-- ------------------------------------------------------------
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
  COALESCE(cl.nome, 'Sem loja vinculada') AS cliente_nome,
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
LEFT JOIN public.clientes cl ON cl.id = cg.cliente_id
LEFT JOIN public.motoristas m ON m.id = cg.motorista_id
LEFT JOIN public.profiles ps ON ps.id = cg.separado_por
LEFT JOIN public.profiles pc ON pc.id = cg.conferido_por
LEFT JOIN public.profiles pe ON pe.id = cg.entregue_por;

GRANT SELECT ON public.v_ordem_expedicao TO authenticated;

-- Vincular loja manualmente em carga órfã
CREATE OR REPLACE FUNCTION public.vincular_cliente_carga(
  p_carga_id UUID,
  p_cliente_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga RECORD;
  v_cliente RECORD;
  v_pend INT := 0;
BEGIN
  IF p_carga_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Informe carga e cliente';
  END IF;

  SELECT id, cliente_id, cliente_cnpj, codigo, numero_ordem
  INTO v_carga
  FROM public.cargas
  WHERE id = p_carga_id
  FOR UPDATE;

  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'Carga não encontrada';
  END IF;

  SELECT id, nome, cnpj, codigo_wise INTO v_cliente
  FROM public.clientes
  WHERE id = p_cliente_id AND ativo IS TRUE AND mesclado_em_id IS NULL;

  IF v_cliente.id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado ou inativo';
  END IF;

  UPDATE public.cargas
  SET
    cliente_id = p_cliente_id,
    cliente_cnpj = COALESCE(NULLIF(btrim(cliente_cnpj), ''), v_cliente.cnpj),
    updated_at = now()
  WHERE id = p_carga_id;

  -- Fecha pendências de destinatário ligadas à carga
  UPDATE public.pendencias_vinculo pend
  SET
    status = 'vinculada',
    entidade_id = p_cliente_id,
    motivo = COALESCE(pend.motivo, 'manual: vincular_cliente_carga'),
    resolved_at = COALESCE(pend.resolved_at, now()),
    resolved_by = auth.uid()
  WHERE pend.status = 'aberta'
    AND pend.carga_id = p_carga_id
    AND pend.tipo = 'destinatario';
  GET DIAGNOSTICS v_pend = ROW_COUNT;

  -- Preenche codigo_wise do cliente se ainda vazio (CNPJ da carga ou código da pendência)
  IF NULLIF(btrim(COALESCE(v_cliente.codigo_wise, '')), '') IS NULL THEN
    UPDATE public.clientes
    SET codigo_wise = COALESCE(
      NULLIF(regexp_replace(COALESCE(v_carga.cliente_cnpj, ''), '\D', '', 'g'), ''),
      (
        SELECT NULLIF(btrim(pend.codigo_externo), '')
        FROM public.pendencias_vinculo pend
        WHERE pend.carga_id = p_carga_id
          AND pend.tipo = 'destinatario'
        ORDER BY pend.resolved_at DESC NULLS LAST
        LIMIT 1
      )
    )
    WHERE id = p_cliente_id
      AND codigo_wise IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'carga_id', p_carga_id,
    'cliente_id', p_cliente_id,
    'cliente_nome', v_cliente.nome,
    'pendencias_fechadas', v_pend
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_cliente_carga(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vincular_cliente_carga(UUID, UUID) TO authenticated;

-- Guard: saída exige loja vinculada
CREATE OR REPLACE FUNCTION public.confirmar_saida_expedicao(
  p_carga_id UUID,
  p_motorista_id UUID DEFAULT NULL,
  p_caixa_ids UUID[] DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga RECORD;
  v_motorista UUID := p_motorista_id;
  v_perfil RECORD;
  v_total INT;
  v_saida_id UUID;
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

  IF v_carga.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Ordem sem loja vinculada. Vincule o supermercado antes de confirmar a saída.';
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
-- 3. NOP-306 — revinculação em massa de fornecedores
-- Match certo (sem fuzzy): ID:EMPRESA / codigo_wise / CNPJ digitos / nome normalizado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_pendencias_fornecedor_certas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aliases INT := 0;
  v_pend INT := 0;
  v_pedidos INT := 0;
  v_status INT := 0;
  v_sem_match INT := 0;
  r RECORD;
  v_forn_id UUID;
  v_motivo TEXT;
  v_cod TEXT;
  v_digitos TEXT;
  v_nome_norm TEXT;
BEGIN
  -- Conta abertas de fornecedor (para o relatório de sem match no fim)
  SELECT COUNT(*)::int INTO v_sem_match
  FROM public.pendencias_vinculo
  WHERE status = 'aberta' AND tipo = 'fornecedor';

  FOR r IN
    SELECT
      pend.id AS pendencia_id,
      pend.nome_externo,
      pend.codigo_externo,
      pend.pedido_id
    FROM public.pendencias_vinculo pend
    WHERE pend.status = 'aberta'
      AND pend.tipo = 'fornecedor'
    ORDER BY pend.created_at DESC
  LOOP
    v_forn_id := NULL;
    v_motivo := NULL;
    v_cod := NULLIF(btrim(COALESCE(r.codigo_externo, '')), '');
    v_digitos := NULLIF(regexp_replace(COALESCE(r.codigo_externo, r.nome_externo, ''), '\D', '', 'g'), '');
    v_nome_norm := public.norm_cadastro_nome(r.nome_externo);

    -- 1) Alias por codigo_externo (ID:EMPRESA / código Wise)
    IF v_cod IS NOT NULL THEN
      SELECT a.entidade_id INTO v_forn_id
      FROM public.aliases a
      WHERE a.tipo = 'fornecedor'
        AND a.entidade_id IS NOT NULL
        AND (
          btrim(COALESCE(a.codigo_externo, '')) = v_cod
          OR a.nome_externo = v_cod
        )
      LIMIT 1;
      IF v_forn_id IS NOT NULL THEN
        v_motivo := 'auto: alias codigo_externo / ID:EMPRESA';
      END IF;
    END IF;

    -- 2) codigo_wise do cadastro
    IF v_forn_id IS NULL AND v_cod IS NOT NULL THEN
      SELECT f.id INTO v_forn_id
      FROM public.fornecedores f
      WHERE f.ativo IS TRUE
        AND f.mesclado_em_id IS NULL
        AND NULLIF(btrim(COALESCE(f.codigo_wise, '')), '') IS NOT NULL
        AND btrim(f.codigo_wise) = v_cod
      LIMIT 1;
      IF v_forn_id IS NOT NULL THEN
        v_motivo := 'auto: codigo_wise';
      END IF;
    END IF;

    -- 3) CNPJ/código só dígitos (11+) vs codigo_wise numérico ou alias
    IF v_forn_id IS NULL AND v_digitos IS NOT NULL AND length(v_digitos) >= 11 THEN
      SELECT f.id INTO v_forn_id
      FROM public.fornecedores f
      WHERE f.ativo IS TRUE
        AND f.mesclado_em_id IS NULL
        AND regexp_replace(COALESCE(f.codigo_wise, ''), '\D', '', 'g') = v_digitos
      LIMIT 1;
      IF v_forn_id IS NULL THEN
        SELECT a.entidade_id INTO v_forn_id
        FROM public.aliases a
        WHERE a.tipo = 'fornecedor'
          AND a.entidade_id IS NOT NULL
          AND regexp_replace(COALESCE(a.codigo_externo, a.nome_externo, ''), '\D', '', 'g') = v_digitos
        LIMIT 1;
      END IF;
      IF v_forn_id IS NOT NULL THEN
        v_motivo := 'auto: CNPJ/digitos';
      END IF;
    END IF;

    -- 4) Nome normalizado = fornecedores.nome
    IF v_forn_id IS NULL AND NULLIF(v_nome_norm, '') IS NOT NULL THEN
      SELECT f.id INTO v_forn_id
      FROM public.fornecedores f
      WHERE f.ativo IS TRUE
        AND f.mesclado_em_id IS NULL
        AND public.norm_cadastro_nome(f.nome) = v_nome_norm
      LIMIT 1;
      IF v_forn_id IS NOT NULL THEN
        v_motivo := 'auto: nome normalizado';
      END IF;
    END IF;

    -- 5) Nome normalizado = alias.nome_externo
    IF v_forn_id IS NULL AND NULLIF(v_nome_norm, '') IS NOT NULL THEN
      SELECT a.entidade_id INTO v_forn_id
      FROM public.aliases a
      WHERE a.tipo = 'fornecedor'
        AND a.entidade_id IS NOT NULL
        AND public.norm_cadastro_nome(a.nome_externo) = v_nome_norm
      LIMIT 1;
      IF v_forn_id IS NOT NULL THEN
        v_motivo := 'auto: alias nome normalizado';
      END IF;
    END IF;

    IF v_forn_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Garante que o sobrevivente não está mesclado
    SELECT COALESCE(f.mesclado_em_id, f.id) INTO v_forn_id
    FROM public.fornecedores f
    WHERE f.id = v_forn_id;

    INSERT INTO public.aliases (tipo, nome_externo, codigo_externo, entidade_id, origem)
    VALUES ('fornecedor', r.nome_externo, r.codigo_externo, v_forn_id, 'wise')
    ON CONFLICT (tipo, origem, nome_externo) DO UPDATE
      SET entidade_id = EXCLUDED.entidade_id,
          codigo_externo = COALESCE(EXCLUDED.codigo_externo, public.aliases.codigo_externo);
    v_aliases := v_aliases + 1;

    UPDATE public.pendencias_vinculo
    SET
      status = 'vinculada',
      entidade_id = v_forn_id,
      motivo = COALESCE(motivo, v_motivo),
      resolved_at = COALESCE(resolved_at, now()),
      resolved_by = auth.uid()
    WHERE id = r.pendencia_id;
    v_pend := v_pend + 1;

    IF r.pedido_id IS NOT NULL THEN
      UPDATE public.pedidos_recebimento
      SET fornecedor_id = v_forn_id
      WHERE id = r.pedido_id
        AND fornecedor_id IS NULL;
      IF FOUND THEN
        v_pedidos := v_pedidos + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.pedidos_recebimento ped
  SET status = 'pendente'
  WHERE ped.status = 'aguardando_vinculo'
    AND ped.fornecedor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.pendencias_vinculo x
      WHERE x.pedido_id = ped.id
        AND x.tipo = 'fornecedor'
        AND x.status = 'aberta'
    );
  GET DIAGNOSTICS v_status = ROW_COUNT;

  SELECT COUNT(*)::int INTO v_sem_match
  FROM public.pendencias_vinculo
  WHERE status = 'aberta' AND tipo = 'fornecedor';

  RETURN jsonb_build_object(
    'vinculados', v_pend,
    'aliases_criados', v_aliases,
    'pedidos_fornecedor', v_pedidos,
    'pedidos_status_pendente', v_status,
    'sem_match', v_sem_match
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_pendencias_fornecedor_certas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_pendencias_fornecedor_certas() TO authenticated;

-- ------------------------------------------------------------
-- 4. NOP-309 — produtos sem conversão (saída vs fornecedor×tipo)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_produtos_sem_conversao
WITH (security_invoker = true) AS
WITH uso AS (
  SELECT
    i.produto_id,
    MAX(COALESCE(ped.data_pedido, ped.created_at::date)) AS ultimo_pedido_em,
    COUNT(*)::int AS usos_recentes
  FROM public.itens_pedido i
  JOIN public.pedidos_recebimento ped ON ped.id = i.pedido_id
  WHERE i.produto_id IS NOT NULL
    AND COALESCE(ped.data_pedido, ped.created_at::date) >= (public.today_brt() - 180)
  GROUP BY i.produto_id
),
faltas_forn AS (
  SELECT DISTINCT
    i.produto_id,
    ped.fornecedor_id,
    f.nome AS fornecedor_nome
  FROM public.itens_pedido i
  JOIN public.pedidos_recebimento ped ON ped.id = i.pedido_id
  JOIN public.fornecedores f ON f.id = ped.fornecedor_id
  WHERE i.produto_id IS NOT NULL
    AND ped.fornecedor_id IS NOT NULL
    AND COALESCE(ped.data_pedido, ped.created_at::date) >= (public.today_brt() - 180)
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversoes_fornecedor cf
      WHERE cf.produto_id = i.produto_id
        AND cf.fornecedor_id = ped.fornecedor_id
        AND cf.ativo IS TRUE
    )
),
agg_forn AS (
  SELECT
    produto_id,
    COUNT(*)::int AS qtd_fornecedores_sem_fator,
    jsonb_agg(
      jsonb_build_object('id', fornecedor_id, 'nome', fornecedor_nome)
      ORDER BY fornecedor_nome
    ) AS fornecedores_sem_fator
  FROM faltas_forn
  GROUP BY produto_id
)
SELECT
  p.id AS produto_id,
  p.nome AS produto_nome,
  p.codigo AS produto_codigo,
  p.unidade,
  p.ativo,
  NOT EXISTS (
    SELECT 1
    FROM public.conversoes_produto_caixa c
    WHERE c.produto_id = p.id AND c.ativo IS TRUE
  ) AS falta_saida,
  COALESCE(af.qtd_fornecedores_sem_fator, 0) > 0 AS falta_fornecedor,
  COALESCE(af.qtd_fornecedores_sem_fator, 0) AS qtd_fornecedores_sem_fator,
  COALESCE(af.fornecedores_sem_fator, '[]'::jsonb) AS fornecedores_sem_fator,
  u.ultimo_pedido_em,
  COALESCE(u.usos_recentes, 0) AS usos_recentes
FROM public.produtos p
LEFT JOIN uso u ON u.produto_id = p.id
LEFT JOIN agg_forn af ON af.produto_id = p.id
WHERE p.ativo IS TRUE
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.conversoes_produto_caixa c
      WHERE c.produto_id = p.id AND c.ativo IS TRUE
    )
    OR COALESCE(af.qtd_fornecedores_sem_fator, 0) > 0
  );

GRANT SELECT ON public.v_produtos_sem_conversao TO authenticated;
