-- Verificação do schema Campo Alegre (rode no SQL Editor)
-- Use o resultado para saber quais migrations 00003–00008 ainda faltam.

-- Tabelas essenciais
SELECT 'tabela' AS tipo, table_name AS nome,
  CASE WHEN table_name IS NOT NULL THEN 'ok' ELSE 'falta' END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'pages', 'pedidos_recebimento', 'conferencias', 'retornos_caixa')
ORDER BY table_name;

-- Funções / triggers das correções QA
SELECT 'funcao' AS tipo, p.proname AS nome, 'ok' AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'ensure_user_profile',
    'is_admin',
    'check_rateio_quantidade',
    'check_retorno_saldo',
    'handle_conferencia_finalizada',
    'update_conferencia_status'
  )
ORDER BY p.proname;

-- Funções v2 (plano pós-QA v4)
SELECT 'funcao' AS tipo, p.proname AS nome, 'ok' AS status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'today_brt',
    'liberar_pedido_divergencia',
    'gerar_cargas_pos_conferencia',
    'resolve_cliente_destinatario'
  )
ORDER BY p.proname;

-- O que aplicar (referência):
-- ensure_user_profile ausente     → 00003_fix_admin_profile.sql
-- is_admin ausente                → 00004_fix_rls_recursion.sql
-- check_rateio_quantidade ausente → 00005_validate_rateio.sql
-- check_retorno_saldo ausente     → 00006_validate_retorno_saldo.sql
-- update_conferencia_status ausente → 00008 (substitui 00007)
-- Plano v2: 00009 → 00013 em sequência
