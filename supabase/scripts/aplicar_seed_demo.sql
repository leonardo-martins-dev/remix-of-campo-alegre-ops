-- Aplica a seed de demonstração (00015_seed_demo_completa.sql)
--
-- Pré-requisitos:
--   1. Migrations 00001–00014 já aplicadas
--   2. Login feito ao menos uma vez (public.profiles populado)
--
-- Opção A — Supabase CLI (projeto linkado):
--   supabase db execute --file supabase/migrations/00015_seed_demo_completa.sql
--
-- Opção B — SQL Editor (self-hosted ou Dashboard):
--   Cole e execute o conteúdo de supabase/migrations/00015_seed_demo_completa.sql
--
-- Verificação rápida após aplicar:
SELECT codigo, status, data_pedido FROM public.pedidos_recebimento WHERE observacoes = '__demo__' ORDER BY codigo;
SELECT codigo, status, progresso FROM public.cargas WHERE observacoes = '__demo__' ORDER BY codigo;
SELECT * FROM public.v_fila_expedicao;
SELECT motorista, total_retornos, lojas_atendidas FROM public.v_retorno_ranking_motorista WHERE data_retorno = public.today_brt();
