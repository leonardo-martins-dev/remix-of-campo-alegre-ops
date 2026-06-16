-- Checklist: Expedição pós-conferência (v2)
-- Execute no SQL Editor do Supabase, NA ORDEM, após 00001b/00003-00008 já aplicados.

-- 1. Verificar funções v2
SELECT proname AS funcao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'today_brt',
    'gerar_cargas_pos_conferencia',
    'liberar_pedido_divergencia',
    'resolve_cliente_destinatario',
    'update_conferencia_status'
  )
ORDER BY proname;

-- Se faltar alguma, aplicar migrations na ordem:
--   00009_admin_pedido_policies.sql
--   00010_divergencia_liberacao.sql
--   00011_conferencia_aguardando_liberacao.sql
--   00012_expedicao_bridge.sql
--   00013_views_motoristas_faltas.sql
--   00014_seed_destinatario_cliente_map.sql

-- 2. Verificar mapeamento destinatário → cliente
SELECT d.nome AS destinatario, c.nome AS cliente
FROM public.destinatario_cliente_map m
JOIN public.destinatarios d ON d.id = m.destinatario_id
JOIN public.clientes c ON c.id = m.cliente_id;

-- 3. Teste manual (substitua UUID de um pedido conferido):
-- SELECT public.gerar_cargas_pos_conferencia('PEDIDO_UUID_AQUI');

-- 4. Ver cargas geradas hoje
SELECT c.codigo, cl.nome AS cliente, c.status, c.origem, c.pedido_origem_id
FROM public.cargas c
JOIN public.clientes cl ON cl.id = c.cliente_id
WHERE c.data_carga = public.today_brt()
ORDER BY c.created_at;

-- Deploy frontend: npm run build && npx wrangler deploy
-- Edge Function: supabase functions deploy sync-wise-cargas
