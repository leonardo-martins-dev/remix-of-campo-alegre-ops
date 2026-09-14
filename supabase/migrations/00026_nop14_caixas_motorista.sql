-- NOP-14: Caixas > Movimentação do motorista: Enviada / Retirada por parada
-- Renomeia Entrada/Saída → Enviada/Retirada para caixas
-- Tipos de caixa padrão: Vermelha e Amarela (substitui Plástica P/M/G)
-- Movimento do motorista armazena motorista, rota, parada e hora

-- ============================================================
-- 1. ATUALIZAR TIPOS DE CAIXA PADRÃO
-- ============================================================

-- Alterar tipos_caixa para usar UUID ao invés de enum (se ainda não foi feito)
-- Primeiro verificamos se a coluna id é do tipo UUID
DO $$
BEGIN
  -- Se tipos_caixa ainda usa o enum como PK, precisamos migrar
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'tipos_caixa' 
    AND column_name = 'id' 
    AND udt_name = 'tipo_caixa_enum'
  ) THEN
    -- Criar nova tabela com estrutura correta
    CREATE TABLE IF NOT EXISTS public.tipos_caixa_new (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sigla           TEXT NOT NULL UNIQUE,
      nome            TEXT NOT NULL,
      custo_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0,
      ordem           INT NOT NULL DEFAULT 0,
      ativo           BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    
    -- Migrar dados existentes
    INSERT INTO public.tipos_caixa_new (sigla, nome, custo_unitario, ativo)
    SELECT id::text, nome, custo_unitario, ativo
    FROM public.tipos_caixa
    ON CONFLICT (sigla) DO NOTHING;
    
    -- Drop old table and rename
    DROP TABLE IF EXISTS public.tipos_caixa CASCADE;
    ALTER TABLE public.tipos_caixa_new RENAME TO tipos_caixa;
    
    -- Recreate RLS
    ALTER TABLE public.tipos_caixa ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tipos_caixa_select_auth ON public.tipos_caixa FOR SELECT TO authenticated USING (TRUE);
    CREATE POLICY tipos_caixa_insert_auth ON public.tipos_caixa FOR INSERT TO authenticated WITH CHECK (TRUE);
    CREATE POLICY tipos_caixa_update_auth ON public.tipos_caixa FOR UPDATE TO authenticated USING (TRUE);
    CREATE POLICY tipos_caixa_delete_admin ON public.tipos_caixa FOR DELETE USING (public.is_admin());
  END IF;
END $$;

-- Garantir que a tabela tipos_caixa tem as colunas necessárias
ALTER TABLE public.tipos_caixa ADD COLUMN IF NOT EXISTS ordem INT NOT NULL DEFAULT 0;
ALTER TABLE public.tipos_caixa ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Inserir tipos padrão Vermelha e Amarela se não existirem
INSERT INTO public.tipos_caixa (sigla, nome, custo_unitario, ordem, ativo)
VALUES 
  ('VM', 'Vermelha', 25.00, 1, TRUE),
  ('AM', 'Amarela', 20.00, 2, TRUE)
ON CONFLICT (sigla) DO UPDATE SET
  nome = EXCLUDED.nome,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

-- ============================================================
-- 2. ADICIONAR CAMPOS À MOVIMENTACOES_CAIXA
-- ============================================================

-- Adicionar motorista_id se não existir
ALTER TABLE public.movimentacoes_caixa 
ADD COLUMN IF NOT EXISTS motorista_id UUID REFERENCES public.motoristas(id);

-- Adicionar rota_id se não existir (rota da entrega)
ALTER TABLE public.movimentacoes_caixa 
ADD COLUMN IF NOT EXISTS rota_id UUID REFERENCES public.rotas(id);

-- Adicionar carga_parada_id para vincular ao stop específico
ALTER TABLE public.movimentacoes_caixa 
ADD COLUMN IF NOT EXISTS carga_parada_id UUID REFERENCES public.cargas(id);

-- Adicionar destino_fornecedor_id para retiradas que vão para fornecedor
ALTER TABLE public.movimentacoes_caixa 
ADD COLUMN IF NOT EXISTS destino_fornecedor_id UUID REFERENCES public.fornecedores(id);

-- Adicionar hora_registro para quando o motorista registrou
ALTER TABLE public.movimentacoes_caixa 
ADD COLUMN IF NOT EXISTS hora_registro TIMESTAMPTZ;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_mov_motorista ON public.movimentacoes_caixa (motorista_id) WHERE motorista_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_rota ON public.movimentacoes_caixa (rota_id) WHERE rota_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_carga_parada ON public.movimentacoes_caixa (carga_parada_id) WHERE carga_parada_id IS NOT NULL;

-- ============================================================
-- 3. VIEW PARA PARADAS DO DIA DO MOTORISTA
-- ============================================================

CREATE OR REPLACE VIEW public.v_paradas_motorista_dia
WITH (security_invoker = true) AS
SELECT
  c.id AS carga_id,
  c.codigo AS carga_codigo,
  c.data_carga,
  c.status AS carga_status,
  c.motorista_id,
  m.nome AS motorista,
  c.cliente_id,
  cli.nome AS cliente,
  c.rota_id,
  r.nome AS rota,
  c.caminhao_id,
  cam.placa AS caminhao,
  c.hora_inicio,
  c.hora_fim,
  COALESCE(
    (SELECT jsonb_object_agg(tc.sigla, COALESCE(ri_agg.sugerido, 0))
     FROM public.tipos_caixa tc
     LEFT JOIN (
       SELECT ri.carga_id, 
              CASE 
                WHEN tc2.sigla IS NOT NULL THEN tc2.sigla
                ELSE 'VM'
              END AS sigla,
              SUM(COALESCE(
                (ri.caixas->>(CASE WHEN tc2.sigla IS NOT NULL THEN tc2.sigla ELSE 'VM' END))::int, 
                COALESCE(ri.caixas_g, 0) + COALESCE(ri.caixas_i, 0) + COALESCE(ri.caixas_p, 0)
              )) AS sugerido
       FROM public.romaneio_itens ri
       CROSS JOIN public.tipos_caixa tc2
       WHERE tc2.ativo = TRUE
       GROUP BY ri.carga_id, tc2.sigla
     ) ri_agg ON ri_agg.carga_id = c.id AND ri_agg.sigla = tc.sigla
     WHERE tc.ativo = TRUE
    ), '{}'::jsonb
  ) AS caixas_sugeridas,
  COALESCE(
    (SELECT jsonb_object_agg(mov.tipo_caixa, mov.enviadas)
     FROM (
       SELECT tipo_caixa, SUM(quantidade) AS enviadas
       FROM public.movimentacoes_caixa
       WHERE carga_parada_id = c.id
         AND COALESCE(natureza::text, tipo::text) IN ('envio', 'enviada')
       GROUP BY tipo_caixa
     ) mov
    ), '{}'::jsonb
  ) AS caixas_enviadas,
  COALESCE(
    (SELECT jsonb_object_agg(mov.tipo_caixa, mov.retiradas)
     FROM (
       SELECT tipo_caixa, SUM(quantidade) AS retiradas
       FROM public.movimentacoes_caixa
       WHERE carga_parada_id = c.id
         AND COALESCE(natureza::text, tipo::text) IN ('retorno', 'retirada')
       GROUP BY tipo_caixa
     ) mov
    ), '{}'::jsonb
  ) AS caixas_retiradas
FROM public.cargas c
LEFT JOIN public.motoristas m ON m.id = c.motorista_id
LEFT JOIN public.clientes cli ON cli.id = c.cliente_id
LEFT JOIN public.rotas r ON r.id = c.rota_id
LEFT JOIN public.caminhoes cam ON cam.id = c.caminhao_id
WHERE c.data_carga = public.today_brt()
  AND c.status IN ('aguardando', 'carregando', 'concluida')
ORDER BY c.hora_inicio NULLS LAST, c.created_at;

GRANT SELECT ON public.v_paradas_motorista_dia TO authenticated;

-- ============================================================
-- 4. VIEW DE SALDO POR CLIENTE PARA RETIRADA
-- ============================================================

CREATE OR REPLACE VIEW public.v_saldo_retirada_cliente
WITH (security_invoker = true) AS
SELECT
  p.id AS posicao_id,
  p.ref_id AS cliente_id,
  c.nome AS cliente,
  tc.sigla AS tipo_caixa,
  tc.nome AS tipo_nome,
  COALESCE(s.saldo, 0) AS saldo_disponivel
FROM public.posicoes_caixa p
JOIN public.clientes c ON c.id = p.ref_id
CROSS JOIN public.tipos_caixa tc
LEFT JOIN public.v_saldos_caixa s 
  ON s.posicao_id = p.id 
  AND s.tipo_caixa = tc.sigla
WHERE p.tipo = 'cliente'
  AND tc.ativo = TRUE
  AND c.ativo = TRUE;

GRANT SELECT ON public.v_saldo_retirada_cliente TO authenticated;

-- ============================================================
-- 5. FUNÇÃO PARA REGISTRAR MOVIMENTO DO MOTORISTA
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_movimento_motorista(
  p_carga_id UUID,
  p_tipo_caixa TEXT,
  p_quantidade INT,
  p_natureza TEXT,
  p_destino_fornecedor_id UUID DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga record;
  v_galpao_id UUID;
  v_cliente_pos_id UUID;
  v_forn_pos_id UUID;
  v_origem UUID;
  v_destino UUID;
  v_mov_id UUID;
BEGIN
  -- Buscar dados da carga
  SELECT c.*, m.id AS mot_id
  INTO v_carga
  FROM public.cargas c
  LEFT JOIN public.motoristas m ON m.id = c.motorista_id
  WHERE c.id = p_carga_id;
  
  IF v_carga.id IS NULL THEN
    RAISE EXCEPTION 'Carga não encontrada';
  END IF;
  
  IF p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero';
  END IF;
  
  -- Garantir posições
  v_galpao_id := public.ensure_posicao('galpao', NULL);
  v_cliente_pos_id := public.ensure_posicao('cliente', v_carga.cliente_id);
  
  IF p_natureza IN ('envio', 'enviada') THEN
    -- Enviada: galpão → cliente
    v_origem := v_galpao_id;
    v_destino := v_cliente_pos_id;
  ELSIF p_natureza IN ('retorno', 'retirada') THEN
    -- Retirada: cliente → galpão ou cliente → fornecedor
    v_origem := v_cliente_pos_id;
    IF p_destino_fornecedor_id IS NOT NULL THEN
      v_forn_pos_id := public.ensure_posicao('fornecedor', p_destino_fornecedor_id);
      v_destino := v_forn_pos_id;
    ELSE
      v_destino := v_galpao_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Natureza inválida: use envio/enviada ou retorno/retirada';
  END IF;
  
  -- Inserir movimento
  INSERT INTO public.movimentacoes_caixa (
    tipo, natureza, tipo_caixa, quantidade,
    origem_posicao_id, destino_posicao_id,
    cliente_id, fornecedor_id, destino_fornecedor_id,
    motorista_id, rota_id, carga_parada_id,
    registrado_por, observacoes, data_movimento,
    hora_registro, documento_tipo, confirmacao_status
  ) VALUES (
    CASE WHEN p_natureza IN ('envio', 'enviada') THEN 'envio' ELSE 'retorno' END,
    CASE WHEN p_natureza IN ('envio', 'enviada') THEN 'envio' ELSE 'retorno' END,
    p_tipo_caixa, p_quantidade,
    v_origem, v_destino,
    v_carga.cliente_id, 
    CASE WHEN p_natureza IN ('retorno', 'retirada') AND p_destino_fornecedor_id IS NOT NULL 
         THEN p_destino_fornecedor_id ELSE NULL END,
    p_destino_fornecedor_id,
    v_carga.mot_id, v_carga.rota_id, p_carga_id,
    auth.uid(), p_observacoes, public.today_brt(),
    now(), 'motorista', 'nao_aplicavel'
  )
  RETURNING id INTO v_mov_id;
  
  RETURN jsonb_build_object(
    'movimento_id', v_mov_id,
    'carga_id', p_carga_id,
    'tipo_caixa', p_tipo_caixa,
    'quantidade', p_quantidade,
    'natureza', p_natureza,
    'destino_fornecedor_id', p_destino_fornecedor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimento_motorista(UUID, TEXT, INT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_movimento_motorista(UUID, TEXT, INT, TEXT, UUID, TEXT) TO authenticated;

-- ============================================================
-- 6. ATUALIZAR MOTIVOS DE AJUSTE PARA USAR ENVIADA/RETIRADA
-- ============================================================

-- Os motivos de ajuste continuam usando entrada/saida para inventário
-- mas adicionamos label alternativo
ALTER TABLE public.motivos_ajuste_caixa 
ADD COLUMN IF NOT EXISTS label_display TEXT;

UPDATE public.motivos_ajuste_caixa 
SET label_display = CASE 
  WHEN sentido = 'entrada' AND natureza = 'ajuste' THEN 'Ajuste (entrada)'
  WHEN sentido = 'saida' AND natureza = 'ajuste' THEN 'Ajuste (saída)'
  WHEN sentido = 'saida' AND natureza = 'perda' THEN 'Perda'
  WHEN sentido = 'transferencia' THEN 'Transferência'
  ELSE nome
END
WHERE label_display IS NULL;

-- ============================================================
-- 7. PÁGINA DE MOVIMENTAÇÃO DO MOTORISTA
-- ============================================================

INSERT INTO public.pages (slug, nome, grupo, icone, ordem) VALUES
  ('caixas/motorista', 'Movimentação (Motorista)', 'Caixas', 'Truck', 35)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  grupo = EXCLUDED.grupo,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  ativo = TRUE;

NOTIFY pgrst, 'reload schema';
