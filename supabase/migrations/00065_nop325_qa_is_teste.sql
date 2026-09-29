-- ============================================================
-- NOP-325 — Separar base QA / operação (flag is_teste)
--
-- Soft-exclusion only: no mass-delete. Evidence backup lives in
-- scripts/nop325_backup_qa_flagged.json (pre-flag snapshot).
-- Formulas of KPIs are NOT changed here — only mark known QA
-- partners/positions and expose is_teste on v_saldos_caixa so
-- indicators can exclude flagged rows.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------
ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS is_teste BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS teste_motivo TEXT;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS is_teste BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS teste_motivo TEXT;

ALTER TABLE public.posicoes_caixa
  ADD COLUMN IF NOT EXISTS is_teste BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS teste_motivo TEXT;

ALTER TABLE public.movimentacoes_caixa
  ADD COLUMN IF NOT EXISTS is_teste BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS teste_motivo TEXT;

COMMENT ON COLUMN public.fornecedores.is_teste IS
  'NOP-325: cadastro de QA/teste — excluir de indicadores de operação';
COMMENT ON COLUMN public.clientes.is_teste IS
  'NOP-325: cadastro de QA/teste — excluir de indicadores de operação';
COMMENT ON COLUMN public.posicoes_caixa.is_teste IS
  'NOP-325: posição de QA/teste — excluir de v_saldos_caixa_operacao';
COMMENT ON COLUMN public.movimentacoes_caixa.is_teste IS
  'NOP-325: movimento de QA/teste (soft). Ledger bruto permanece.';

CREATE INDEX IF NOT EXISTS idx_fornecedores_is_teste ON public.fornecedores (is_teste) WHERE is_teste;
CREATE INDEX IF NOT EXISTS idx_clientes_is_teste ON public.clientes (is_teste) WHERE is_teste;
CREATE INDEX IF NOT EXISTS idx_posicoes_caixa_is_teste ON public.posicoes_caixa (is_teste) WHERE is_teste;
CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_is_teste ON public.movimentacoes_caixa (is_teste) WHERE is_teste;

-- ------------------------------------------------------------
-- 2. Flag known QA seeds (idempotent)
--    Criteria (explicit, conservative — do NOT guess):
--      BOB N, TESTE QA*, FORN *TEST*, Aguardando vínculo
-- ------------------------------------------------------------
UPDATE public.fornecedores f
SET
  is_teste = TRUE,
  teste_motivo = CASE
    WHEN f.nome ~* '^BOB[[:space:]]*[0-9]+$' THEN 'bob_seed'
    WHEN f.nome ~* '^TESTE[[:space:]]*QA' THEN 'teste_qa_seed'
    WHEN f.nome ~* '^FORN[[:space:]].*TEST' THEN 'forn_test_seed'
    WHEN lower(f.nome) IN ('aguardando vínculo', 'aguardando vinculo') THEN 'aguardando_vinculo_fantasma'
    ELSE COALESCE(f.teste_motivo, 'qa_seed')
  END
WHERE
  f.nome ~* '^BOB[[:space:]]*[0-9]+$'
  OR f.nome ~* '^TESTE[[:space:]]*QA'
  OR f.nome ~* '^FORN[[:space:]].*TEST'
  OR lower(f.nome) IN ('aguardando vínculo', 'aguardando vinculo');

UPDATE public.posicoes_caixa p
SET
  is_teste = TRUE,
  teste_motivo = COALESCE(f.teste_motivo, 'parceiro_qa')
FROM public.fornecedores f
WHERE p.tipo = 'fornecedor'
  AND p.ref_id = f.id
  AND f.is_teste = TRUE;

UPDATE public.posicoes_caixa p
SET
  is_teste = TRUE,
  teste_motivo = COALESCE(c.teste_motivo, 'parceiro_qa')
FROM public.clientes c
WHERE p.tipo = 'cliente'
  AND p.ref_id = c.id
  AND c.is_teste = TRUE;

-- Demo movements (if any remain)
UPDATE public.movimentacoes_caixa
SET is_teste = TRUE, teste_motivo = 'observacoes_demo'
WHERE observacoes = '__demo__' AND is_teste = FALSE;

-- Movements whose both ends are teste positions
UPDATE public.movimentacoes_caixa m
SET is_teste = TRUE, teste_motivo = COALESCE(m.teste_motivo, 'posicao_qa')
WHERE m.is_teste = FALSE
  AND EXISTS (
    SELECT 1 FROM public.posicoes_caixa po
    WHERE po.is_teste
      AND (po.id = m.origem_posicao_id OR po.id = m.destino_posicao_id)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.posicoes_caixa po2
    WHERE po2.is_teste = FALSE
      AND (po2.id = m.origem_posicao_id OR po2.id = m.destino_posicao_id)
  );

-- ------------------------------------------------------------
-- 3. Expose is_teste on v_saldos_caixa (formula unchanged)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_saldos_caixa
WITH (security_invoker = true) AS
SELECT
  p.id AS posicao_id,
  p.tipo AS posicao_tipo,
  p.ref_id,
  m.tipo_caixa,
  COALESCE(SUM(CASE WHEN m.destino_posicao_id = p.id THEN m.quantidade ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN m.origem_posicao_id = p.id THEN m.quantidade ELSE 0 END), 0) AS saldo,
  COALESCE(SUM(CASE
    WHEN m.destino_posicao_id = p.id AND COALESCE(m.natureza, m.tipo) IN ('envio', 'entrega_vazias')
    THEN m.quantidade ELSE 0 END), 0) AS enviadas,
  COALESCE(SUM(CASE
    WHEN m.origem_posicao_id = p.id AND COALESCE(m.natureza, m.tipo) IN ('retorno', 'recebimento_cheias')
    THEN m.quantidade ELSE 0 END), 0) AS retornadas,
  COALESCE(SUM(CASE WHEN COALESCE(m.natureza, m.tipo) = 'perda' AND m.origem_posicao_id = p.id THEN m.quantidade ELSE 0 END), 0) AS perdidas,
  COALESCE(SUM(CASE WHEN COALESCE(m.natureza, m.tipo) IN ('ajuste', 'abertura') AND m.destino_posicao_id = p.id THEN m.quantidade
                    WHEN COALESCE(m.natureza, m.tipo) IN ('ajuste', 'abertura') AND m.origem_posicao_id = p.id THEN -m.quantidade
                    ELSE 0 END), 0) AS ajustes,
  p.is_teste
FROM public.posicoes_caixa p
LEFT JOIN public.movimentacoes_caixa m
  ON (m.origem_posicao_id = p.id OR m.destino_posicao_id = p.id)
  AND (m.origem_posicao_id IS NOT NULL OR m.destino_posicao_id IS NOT NULL)
GROUP BY p.id, p.tipo, p.ref_id, p.is_teste, m.tipo_caixa;

GRANT SELECT ON public.v_saldos_caixa TO authenticated;

COMMENT ON VIEW public.v_saldos_caixa IS
  'Saldo por posição/tipo (ledger completo). NOP-325: coluna is_teste da posição; filtrar via v_saldos_caixa_operacao.';

-- Operação limpa: mesma fórmula, só posições não-teste
CREATE OR REPLACE VIEW public.v_saldos_caixa_operacao
WITH (security_invoker = true) AS
SELECT *
FROM public.v_saldos_caixa
WHERE COALESCE(is_teste, FALSE) = FALSE;

GRANT SELECT ON public.v_saldos_caixa_operacao TO authenticated;

COMMENT ON VIEW public.v_saldos_caixa_operacao IS
  'NOP-325: v_saldos_caixa sem posições is_teste. Usar em KPIs de operação.';

-- Cliente/fornecedor saldo views: exclude teste masters
CREATE OR REPLACE VIEW public.v_saldo_caixas_cliente
WITH (security_invoker = true) AS
SELECT
  c.id AS cliente_id,
  c.nome AS cliente,
  s.tipo_caixa,
  s.enviadas,
  s.retornadas,
  s.perdidas,
  s.ajustes,
  s.saldo
FROM public.clientes c
LEFT JOIN public.v_saldos_caixa s ON s.posicao_tipo = 'cliente' AND s.ref_id = c.id
WHERE c.ativo = TRUE
  AND COALESCE(c.is_teste, FALSE) = FALSE
  AND COALESCE(s.is_teste, FALSE) = FALSE;

GRANT SELECT ON public.v_saldo_caixas_cliente TO authenticated;

CREATE OR REPLACE VIEW public.v_saldo_caixas_fornecedor
WITH (security_invoker = true) AS
SELECT
  f.id AS fornecedor_id,
  f.nome AS fornecedor,
  s.tipo_caixa,
  s.enviadas,
  s.retornadas,
  s.perdidas,
  s.ajustes,
  s.saldo
FROM public.fornecedores f
LEFT JOIN public.v_saldos_caixa s ON s.posicao_tipo = 'fornecedor' AND s.ref_id = f.id
WHERE f.ativo = TRUE
  AND COALESCE(f.is_teste, FALSE) = FALSE
  AND COALESCE(s.is_teste, FALSE) = FALSE
  AND f.nome IS DISTINCT FROM 'Aguardando vínculo';

GRANT SELECT ON public.v_saldo_caixas_fornecedor TO authenticated;

NOTIFY pgrst, 'reload schema';
