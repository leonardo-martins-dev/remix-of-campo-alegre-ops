-- Seed de demonstração — dados fake para todos os módulos
-- Idempotente: remove registros anteriores marcados com observacoes = '__demo__'
-- Requer: schema base (00001+) e ao menos 1 row em profiles (login feito)
--
-- Cenários criados para a data de hoje em America/Sao_Paulo:
--   DEMO-PED-001  pendente              → Conferência / recebimento
--   DEMO-PED-002  conferido + cargas    → Painel expedição (aguardando / carregando / concluída)
--   DEMO-PED-003  aguardando_liberacao  → Divergência aguardando admin
--   DEMO-PED-004  conferido sem carga   → Fila expedição (v_fila_expedicao)
--   Retornos, saldos, cobrança pendente → Módulo caixas + ranking motoristas

-- Garante today_brt() (00009) — necessário para alinhar datas com a UI
CREATE OR REPLACE FUNCTION public.today_brt()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

GRANT EXECUTE ON FUNCTION public.today_brt() TO authenticated;

-- Garante status aguardando_liberacao (00010)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'status_pedido' AND e.enumlabel = 'aguardando_liberacao'
  ) THEN
    ALTER TYPE public.status_pedido ADD VALUE 'aguardando_liberacao';
  END IF;
END $$;

ALTER TABLE public.pedidos_recebimento
  ADD COLUMN IF NOT EXISTS liberado_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS liberado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observacao_liberacao TEXT;

-- Garante ponte expedição (00012)
DO $$ BEGIN
  CREATE TYPE public.origem_carga AS ENUM ('manual', 'wisetec', 'conferencia', 'excel');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.destinatario_cliente_map (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id  UUID NOT NULL REFERENCES public.destinatarios(id) ON DELETE CASCADE,
  cliente_id       UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dest_cliente UNIQUE (destinatario_id, cliente_id)
);

ALTER TABLE public.cargas
  ADD COLUMN IF NOT EXISTS origem public.origem_carga DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS wise_carregamento_id TEXT,
  ADD COLUMN IF NOT EXISTS pedido_origem_id UUID REFERENCES public.pedidos_recebimento(id);

-- Enum recém-adicionado só pode ser usado após commit
COMMIT;

-- ============================================================
-- 1. Limpeza de demo anterior
-- ============================================================
DELETE FROM public.registros_ciclo
WHERE pedido_id IN (SELECT id FROM public.pedidos_recebimento WHERE observacoes = '__demo__')
   OR carga_id IN (SELECT id FROM public.cargas WHERE observacoes = '__demo__');

DELETE FROM public.movimentacoes_caixa WHERE observacoes = '__demo__';

DELETE FROM public.cobrancas_caixa WHERE id = 'db000002-0000-4000-8000-000000000001'::uuid;

DELETE FROM public.retornos_caixa WHERE id IN (
  'db000001-0000-4000-8000-000000000001'::uuid,
  'db000001-0000-4000-8000-000000000002'::uuid,
  'db000001-0000-4000-8000-000000000003'::uuid
);

DELETE FROM public.conferencias
WHERE pedido_id IN (SELECT id FROM public.pedidos_recebimento WHERE observacoes = '__demo__');

DELETE FROM public.cargas WHERE observacoes = '__demo__';
DELETE FROM public.pedidos_recebimento WHERE observacoes = '__demo__';

-- ============================================================
-- 2. Cadastros base (upsert)
-- ============================================================
INSERT INTO public.familias_produto (id, nome, ordem) VALUES
  ('d1000001-0000-4000-8000-000000000001'::uuid, 'Folhas', 1),
  ('d1000001-0000-4000-8000-000000000002'::uuid, 'Frutos', 2),
  ('d1000001-0000-4000-8000-000000000003'::uuid, 'Raízes', 3)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.fornecedores (id, nome, contato, telefone, ativo) VALUES
  ('d3000001-0000-4000-8000-000000000001'::uuid, 'Hortifruti Vale Verde', 'Carlos Mendes', '(19) 99801-1100', TRUE),
  ('d3000001-0000-4000-8000-000000000002'::uuid, 'Cooperativa Sul Mineira', 'Ana Paula', '(35) 99802-2200', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.destinatarios (id, nome, ativo) VALUES
  ('d4000001-0000-4000-8000-000000000001'::uuid, 'Campo Alegre', TRUE),
  ('d4000001-0000-4000-8000-000000000002'::uuid, 'Anderson', TRUE),
  ('d4000001-0000-4000-8000-000000000003'::uuid, 'Parceiro Sul', TRUE)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.clientes (id, nome, contato, telefone, ativo)
SELECT v.id, v.nome, v.contato, v.telefone, TRUE
FROM (VALUES
  ('d5000001-0000-4000-8000-000000000001'::uuid, 'Campo Alegre', 'Loja Centro', '(19) 3344-1000'),
  ('d5000001-0000-4000-8000-000000000002'::uuid, 'Anderson', 'Filial Norte', '(19) 3344-2000'),
  ('d5000001-0000-4000-8000-000000000003'::uuid, 'Parceiro Sul', 'CD Campinas', '(19) 3344-3000')
) AS v(id, nome, contato, telefone)
WHERE NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.nome = v.nome);

INSERT INTO public.motoristas (id, nome, telefone, ativo) VALUES
  ('d6000001-0000-4000-8000-000000000001'::uuid, 'João Silva', '(19) 99901-0001', TRUE),
  ('d6000001-0000-4000-8000-000000000002'::uuid, 'Marcos Oliveira', '(19) 99901-0002', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO public.caminhoes (id, placa, modelo, capacidade_caixas, ativo) VALUES
  ('d7000001-0000-4000-8000-000000000001'::uuid, 'ABC-1D23', 'Mercedes Accelo', 800, TRUE)
ON CONFLICT (placa) DO NOTHING;

INSERT INTO public.rotas (id, nome, descricao, ativo) VALUES
  ('d8000001-0000-4000-8000-000000000001'::uuid, 'Rota Interior', 'Campinas · Piracicaba · Limeira', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.produtos (id, nome, unidade, familia_id, ativo) VALUES
  ('d2000001-0000-4000-8000-000000000001'::uuid, 'ALFACE CRESPA', 'un', (SELECT id FROM public.familias_produto WHERE nome = 'Folhas' LIMIT 1), TRUE),
  ('d2000001-0000-4000-8000-000000000002'::uuid, 'TOMATE SALADETE', 'un', (SELECT id FROM public.familias_produto WHERE nome = 'Frutos' LIMIT 1), TRUE),
  ('d2000001-0000-4000-8000-000000000003'::uuid, 'COUVE MANTEIGA', 'un', (SELECT id FROM public.familias_produto WHERE nome = 'Folhas' LIMIT 1), TRUE),
  ('d2000001-0000-4000-8000-000000000004'::uuid, 'BANANA PRATA', 'un', (SELECT id FROM public.familias_produto WHERE nome = 'Frutos' LIMIT 1), TRUE),
  ('d2000001-0000-4000-8000-000000000005'::uuid, 'CENOURA', 'kg', (SELECT id FROM public.familias_produto WHERE nome = 'Raízes' LIMIT 1), TRUE),
  ('d2000001-0000-4000-8000-000000000006'::uuid, 'AGRIAO CONVENCIONAL', 'un', (SELECT id FROM public.familias_produto WHERE nome = 'Folhas' LIMIT 1), TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.destinatario_cliente_map (destinatario_id, cliente_id)
SELECT d.id, c.id
FROM public.destinatarios d
JOIN public.clientes c ON lower(trim(c.nome)) = lower(trim(d.nome))
WHERE d.nome IN ('Campo Alegre', 'Anderson', 'Parceiro Sul')
ON CONFLICT (destinatario_id, cliente_id) DO NOTHING;

INSERT INTO public.tipos_caixa (id, nome, custo_unitario, ativo) VALUES
  ('G', 'Grande', 38.00, TRUE),
  ('I', 'Isopor', 22.00, TRUE),
  ('P', 'Plástica', 18.00, TRUE)
ON CONFLICT (id) DO UPDATE SET custo_unitario = EXCLUDED.custo_unitario;

INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('impacto_falta_por_unidade', '4.50', 'Valor R$ por unidade em falta'),
  ('benchmark_taxa_perda', '2.0', 'Benchmark taxa de perda %'),
  ('aging_alerta_dias', '6', 'Aging alerta amarelo'),
  ('aging_critico_dias', '10', 'Aging alerta vermelho'),
  ('auto_rotate_tv_segundos', '20', 'Rotação modo TV')
ON CONFLICT (chave) DO NOTHING;

-- ============================================================
-- 3. Dados operacionais do dia (DO block)
-- ============================================================
DO $$
DECLARE
  v_admin UUID;
  v_hoje DATE := public.today_brt();
  v_now TIMESTAMPTZ := now();

  v_forn1 UUID := 'd3000001-0000-4000-8000-000000000001'::uuid;
  v_forn2 UUID := 'd3000001-0000-4000-8000-000000000002'::uuid;

  v_dest_ca UUID;
  v_dest_and UUID;
  v_dest_ps UUID;
  v_cli_ca UUID;
  v_cli_and UUID;
  v_cli_ps UUID;
  v_mot1 UUID := 'd6000001-0000-4000-8000-000000000001'::uuid;
  v_cam UUID := 'd7000001-0000-4000-8000-000000000001'::uuid;
  v_rota UUID := 'd8000001-0000-4000-8000-000000000001'::uuid;

  v_ped_pend UUID := 'd9000001-0000-4000-8000-000000000001'::uuid;
  v_ped_conf UUID := 'd9000001-0000-4000-8000-000000000002'::uuid;
  v_ped_lib UUID := 'd9000001-0000-4000-8000-000000000003'::uuid;
  v_ped_fila UUID := 'd9000001-0000-4000-8000-000000000004'::uuid;
  v_status_lib public.status_pedido := 'divergencia'::public.status_pedido;

  v_conf_conf UUID := 'da100001-0000-4000-8000-000000000001'::uuid;
  v_conf_lib UUID := 'da100001-0000-4000-8000-000000000002'::uuid;
  v_conf_fila UUID := 'da100001-0000-4000-8000-000000000003'::uuid;

  v_ip1 UUID := 'da200001-0000-4000-8000-000000000001'::uuid;
  v_ip2 UUID := 'da200001-0000-4000-8000-000000000002'::uuid;
  v_ip3 UUID := 'da200001-0000-4000-8000-000000000003'::uuid;

  v_carga1 UUID := 'da300001-0000-4000-8000-000000000001'::uuid;
  v_carga2 UUID := 'da300001-0000-4000-8000-000000000002'::uuid;
  v_carga3 UUID := 'da300001-0000-4000-8000-000000000003'::uuid;

  v_prod_alface UUID := 'd2000001-0000-4000-8000-000000000001'::uuid;
  v_prod_tomate UUID := 'd2000001-0000-4000-8000-000000000002'::uuid;
  v_prod_couve UUID := 'd2000001-0000-4000-8000-000000000003'::uuid;
  v_prod_banana UUID := 'd2000001-0000-4000-8000-000000000004'::uuid;
  v_prod_cenoura UUID := 'd2000001-0000-4000-8000-000000000005'::uuid;
  v_prod_agriao UUID := 'd2000001-0000-4000-8000-000000000006'::uuid;
BEGIN
  SELECT id INTO v_admin FROM public.profiles ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Seed demo: faça login uma vez para criar public.profiles antes de rodar esta seed.';
  END IF;

  SELECT id INTO v_dest_ca FROM public.destinatarios WHERE nome = 'Campo Alegre' LIMIT 1;
  SELECT id INTO v_dest_and FROM public.destinatarios WHERE nome = 'Anderson' LIMIT 1;
  SELECT id INTO v_dest_ps FROM public.destinatarios WHERE nome = 'Parceiro Sul' LIMIT 1;
  SELECT id INTO v_cli_ca FROM public.clientes WHERE nome = 'Campo Alegre' LIMIT 1;
  SELECT id INTO v_cli_and FROM public.clientes WHERE nome = 'Anderson' LIMIT 1;
  SELECT id INTO v_cli_ps FROM public.clientes WHERE nome = 'Parceiro Sul' LIMIT 1;

  SELECT COALESCE(
    (SELECT id FROM public.fornecedores WHERE id = v_forn1),
    (SELECT id FROM public.fornecedores WHERE nome = 'Hortifruti Vale Verde' LIMIT 1)
  ) INTO v_forn1;
  SELECT COALESCE(
    (SELECT id FROM public.fornecedores WHERE id = v_forn2),
    (SELECT id FROM public.fornecedores WHERE nome = 'Cooperativa Sul Mineira' LIMIT 1)
  ) INTO v_forn2;

  SELECT COALESCE(
    (SELECT id FROM public.produtos WHERE id = v_prod_alface),
    (SELECT id FROM public.produtos WHERE upper(trim(nome)) = 'ALFACE CRESPA' LIMIT 1)
  ) INTO v_prod_alface;
  SELECT COALESCE(
    (SELECT id FROM public.produtos WHERE id = v_prod_tomate),
    (SELECT id FROM public.produtos WHERE upper(trim(nome)) = 'TOMATE SALADETE' LIMIT 1)
  ) INTO v_prod_tomate;
  SELECT COALESCE(
    (SELECT id FROM public.produtos WHERE id = v_prod_couve),
    (SELECT id FROM public.produtos WHERE upper(trim(nome)) = 'COUVE MANTEIGA' LIMIT 1)
  ) INTO v_prod_couve;
  SELECT COALESCE(
    (SELECT id FROM public.produtos WHERE id = v_prod_banana),
    (SELECT id FROM public.produtos WHERE upper(trim(nome)) = 'BANANA PRATA' LIMIT 1)
  ) INTO v_prod_banana;
  SELECT COALESCE(
    (SELECT id FROM public.produtos WHERE id = v_prod_cenoura),
    (SELECT id FROM public.produtos WHERE upper(trim(nome)) = 'CENOURA' LIMIT 1)
  ) INTO v_prod_cenoura;
  SELECT COALESCE(
    (SELECT id FROM public.produtos WHERE id = v_prod_agriao),
    (SELECT id FROM public.produtos WHERE upper(trim(nome)) = 'AGRIAO CONVENCIONAL' LIMIT 1)
  ) INTO v_prod_agriao;

  SELECT COALESCE(
    (SELECT id FROM public.motoristas WHERE id = v_mot1),
    (SELECT id FROM public.motoristas WHERE nome = 'João Silva' LIMIT 1)
  ) INTO v_mot1;
  SELECT COALESCE(
    (SELECT id FROM public.caminhoes WHERE id = v_cam),
    (SELECT id FROM public.caminhoes WHERE placa = 'ABC-1D23' LIMIT 1)
  ) INTO v_cam;
  SELECT COALESCE(
    (SELECT id FROM public.rotas WHERE id = v_rota),
    (SELECT id FROM public.rotas WHERE nome = 'Rota Interior' LIMIT 1)
  ) INTO v_rota;

  IF v_forn1 IS NULL OR v_forn2 IS NULL OR v_dest_ca IS NULL OR v_cli_ca IS NULL
     OR v_prod_alface IS NULL OR v_prod_tomate IS NULL THEN
    RAISE EXCEPTION 'Seed demo: cadastros base incompletos (fornecedores, destinatários, clientes ou produtos).';
  END IF;

  BEGIN
    v_status_lib := 'aguardando_liberacao'::public.status_pedido;
  EXCEPTION
    WHEN OTHERS THEN
      v_status_lib := 'divergencia'::public.status_pedido;
  END;

  -- ---- Pedido PENDENTE (conferir agora) ----
  INSERT INTO public.pedidos_recebimento (id, codigo, fornecedor_id, origem, data_pedido, hora_chegada, status, observacoes, created_by)
  VALUES (v_ped_pend, 'DEMO-PED-001', v_forn1, 'manual', v_hoje, v_now - interval '40 minutes', 'pendente', '__demo__', v_admin);

  INSERT INTO public.itens_pedido (id, pedido_id, produto_id, quantidade_pedida) VALUES
    (v_ip1, v_ped_pend, v_prod_alface, 100),
    ('da200001-0000-4000-8000-000000000011'::uuid, v_ped_pend, v_prod_tomate, 80),
    ('da200001-0000-4000-8000-000000000012'::uuid, v_ped_pend, v_prod_couve, 60);

  INSERT INTO public.itens_pedido_rateio (item_pedido_id, destinatario_id, quantidade) VALUES
    (v_ip1, v_dest_ca, 60), (v_ip1, v_dest_and, 40),
    ('da200001-0000-4000-8000-000000000011'::uuid, v_dest_ca, 50), ('da200001-0000-4000-8000-000000000011'::uuid, v_dest_ps, 30),
    ('da200001-0000-4000-8000-000000000012'::uuid, v_dest_ca, 20), ('da200001-0000-4000-8000-000000000012'::uuid, v_dest_and, 20),
    ('da200001-0000-4000-8000-000000000012'::uuid, v_dest_ps, 20);

  -- ---- Pedido CONFERIDO + cargas no painel ----
  INSERT INTO public.pedidos_recebimento (id, codigo, fornecedor_id, origem, data_pedido, hora_chegada, status, observacoes, created_by)
  VALUES (v_ped_conf, 'DEMO-PED-002', v_forn2, 'excel', v_hoje, v_now - interval '3 hours', 'conferido', '__demo__', v_admin);

  INSERT INTO public.itens_pedido (id, pedido_id, produto_id, quantidade_pedida) VALUES
    (v_ip2, v_ped_conf, v_prod_banana, 50),
    ('da200001-0000-4000-8000-000000000021'::uuid, v_ped_conf, v_prod_cenoura, 120);

  INSERT INTO public.itens_pedido_rateio (item_pedido_id, destinatario_id, quantidade) VALUES
    (v_ip2, v_dest_and, 30), (v_ip2, v_dest_ps, 20),
    ('da200001-0000-4000-8000-000000000021'::uuid, v_dest_ca, 70), ('da200001-0000-4000-8000-000000000021'::uuid, v_dest_and, 50);

  INSERT INTO public.conferencias (id, pedido_id, conferente_id, status, iniciada_em, finalizada_em)
  VALUES (v_conf_conf, v_ped_conf, v_admin, 'finalizada', v_now - interval '2 hours 30 minutes', v_now - interval '2 hours');

  INSERT INTO public.itens_conferencia (conferencia_id, item_pedido_id, quantidade_recebida, conferido, divergencia, quantidade_divergencia) VALUES
    (v_conf_conf, v_ip2, 50, TRUE, NULL, 0),
    (v_conf_conf, 'da200001-0000-4000-8000-000000000021'::uuid, 118, TRUE, 'falta', 2);

  INSERT INTO public.cargas (id, codigo, cliente_id, motorista_id, caminhao_id, rota_id, data_carga, hora_inicio, hora_fim, status, progresso, origem, pedido_origem_id, observacoes, created_by) VALUES
    (v_carga1, 'DEMO-CARGA-CA', v_cli_ca, v_mot1, v_cam, v_rota, v_hoje, NULL, NULL, 'aguardando', 0, 'conferencia', v_ped_conf, '__demo__', v_admin),
    (v_carga2, 'DEMO-CARGA-AND', v_cli_and, v_mot1, v_cam, v_rota, v_hoje, v_now - interval '45 minutes', NULL, 'carregando', 55, 'conferencia', v_ped_conf, '__demo__', v_admin),
    (v_carga3, 'DEMO-CARGA-PS', v_cli_ps, NULL, v_cam, v_rota, v_hoje, v_now - interval '2 hours', v_now - interval '30 minutes', 'concluida', 100, 'conferencia', v_ped_conf, '__demo__', v_admin);

  INSERT INTO public.romaneio_itens (carga_id, produto_id, quantidade_romaneio, quantidade_real, caixas_g, caixas_i, caixas_p, status) VALUES
    (v_carga1, v_prod_cenoura, 70, 0, 0, 0, 0, 'pendente'),
    (v_carga2, v_prod_banana, 30, 28, 5, 2, 0, 'corrigido'),
    (v_carga2, v_prod_cenoura, 50, 50, 8, 0, 1, 'ok'),
    (v_carga3, v_prod_banana, 20, 20, 3, 1, 0, 'ok');

  INSERT INTO public.carga_caixas_resumo (carga_id, sugerido_g, sugerido_i, sugerido_p, real_g, real_i, real_p) VALUES
    (v_carga1, 0, 0, 0, 0, 0, 0),
    (v_carga2, 13, 2, 1, 13, 2, 1),
    (v_carga3, 3, 1, 0, 3, 1, 0);

  INSERT INTO public.registros_ciclo (pedido_id, carga_id, hora_chegada_fornecedor, hora_conferencia_ok, hora_inicio_carga, hora_saida_caminhao, data_registro)
  VALUES
    (v_ped_conf, NULL, v_now - interval '3 hours', v_now - interval '2 hours', NULL, NULL, v_hoje),
    (NULL, v_carga3, NULL, NULL, v_now - interval '2 hours', v_now - interval '30 minutes', v_hoje);

  -- ---- Pedido AGUARDANDO LIBERAÇÃO (divergência) ----
  INSERT INTO public.pedidos_recebimento (id, codigo, fornecedor_id, origem, data_pedido, hora_chegada, status, observacoes, created_by)
  VALUES (v_ped_lib, 'DEMO-PED-003', v_forn1, 'wisetec', v_hoje, v_now - interval '5 hours', v_status_lib, '__demo__', v_admin);

  INSERT INTO public.itens_pedido (id, pedido_id, produto_id, quantidade_pedida) VALUES
    (v_ip3, v_ped_lib, v_prod_agriao, 170),
    ('da200001-0000-4000-8000-000000000031'::uuid, v_ped_lib, v_prod_alface, 200);

  INSERT INTO public.itens_pedido_rateio (item_pedido_id, destinatario_id, quantidade) VALUES
    (v_ip3, v_dest_ca, 100), (v_ip3, v_dest_and, 70),
    ('da200001-0000-4000-8000-000000000031'::uuid, v_dest_ca, 120), ('da200001-0000-4000-8000-000000000031'::uuid, v_dest_ps, 80);

  INSERT INTO public.conferencias (id, pedido_id, conferente_id, status, iniciada_em, finalizada_em)
  VALUES (v_conf_lib, v_ped_lib, v_admin, 'finalizada', v_now - interval '4 hours 30 minutes', v_now - interval '4 hours');

  INSERT INTO public.itens_conferencia (conferencia_id, item_pedido_id, quantidade_recebida, conferido, divergencia, quantidade_divergencia) VALUES
    (v_conf_lib, v_ip3, 150, TRUE, 'falta', 20),
    (v_conf_lib, 'da200001-0000-4000-8000-000000000031'::uuid, 210, TRUE, 'sobra', 10);

  -- ---- Pedido CONFERIDO sem carga (fila expedição) ----
  INSERT INTO public.pedidos_recebimento (id, codigo, fornecedor_id, origem, data_pedido, hora_chegada, status, observacoes, created_by)
  VALUES (v_ped_fila, 'DEMO-PED-004', v_forn2, 'manual', v_hoje, v_now - interval '6 hours', 'conferido', '__demo__', v_admin);

  INSERT INTO public.itens_pedido (id, pedido_id, produto_id, quantidade_pedida) VALUES
    ('da200001-0000-4000-8000-000000000041'::uuid, v_ped_fila, v_prod_alface, 90);

  INSERT INTO public.itens_pedido_rateio (item_pedido_id, destinatario_id, quantidade) VALUES
    ('da200001-0000-4000-8000-000000000041'::uuid, v_dest_ca, 50),
    ('da200001-0000-4000-8000-000000000041'::uuid, v_dest_and, 40);

  INSERT INTO public.conferencias (id, pedido_id, conferente_id, status, iniciada_em, finalizada_em)
  VALUES (v_conf_fila, v_ped_fila, v_admin, 'finalizada', v_now - interval '5 hours 30 minutes', v_now - interval '5 hours');

  INSERT INTO public.itens_conferencia (conferencia_id, item_pedido_id, quantidade_recebida, conferido) VALUES
    (v_conf_fila, 'da200001-0000-4000-8000-000000000041'::uuid, 90, TRUE);

  -- ---- Caixas: movimentações + retornos + cobrança ----
  INSERT INTO public.movimentacoes_caixa (cliente_id, tipo, tipo_caixa, quantidade, carga_id, registrado_por, observacoes, data_movimento) VALUES
    (v_cli_ca, 'envio', 'G', 120, v_carga3, v_admin, '__demo__', v_hoje),
    (v_cli_ca, 'envio', 'I', 45, v_carga3, v_admin, '__demo__', v_hoje),
    (v_cli_and, 'envio', 'G', 80, v_carga2, v_admin, '__demo__', v_hoje),
    (v_cli_and, 'envio', 'I', 15, v_carga2, v_admin, '__demo__', v_hoje),
    (v_cli_and, 'envio', 'P', 10, v_carga2, v_admin, '__demo__', v_hoje),
    (v_cli_ps, 'envio', 'P', 30, v_carga3, v_admin, '__demo__', v_hoje),
    (v_cli_ca, 'perda', 'G', 5, NULL, v_admin, '__demo__', v_hoje - 1),
    (v_cli_and, 'ajuste', 'I', 3, NULL, v_admin, '__demo__', v_hoje);

  INSERT INTO public.retornos_caixa (id, cliente_id, motorista_id, registrado_por, caixas_g, caixas_i, caixas_p, data_retorno) VALUES
    ('db000001-0000-4000-8000-000000000001'::uuid, v_cli_ca, v_mot1, v_admin, 95, 40, 0, v_hoje),
    ('db000001-0000-4000-8000-000000000002'::uuid, v_cli_and, v_mot1, v_admin, 70, 10, 5, v_hoje),
    ('db000001-0000-4000-8000-000000000003'::uuid, v_cli_ps, 'd6000001-0000-4000-8000-000000000002'::uuid, v_admin, 0, 0, 25, v_hoje - 1);

  INSERT INTO public.movimentacoes_caixa (cliente_id, tipo, tipo_caixa, quantidade, retorno_id, registrado_por, observacoes, data_movimento) VALUES
    (v_cli_ca, 'retorno', 'G', 95, 'db000001-0000-4000-8000-000000000001'::uuid, v_admin, '__demo__', v_hoje),
    (v_cli_ca, 'retorno', 'I', 40, 'db000001-0000-4000-8000-000000000001'::uuid, v_admin, '__demo__', v_hoje),
    (v_cli_and, 'retorno', 'G', 70, 'db000001-0000-4000-8000-000000000002'::uuid, v_admin, '__demo__', v_hoje);

  INSERT INTO public.cobrancas_caixa (id, cliente_id, tipo_caixa, quantidade, custo_unitario, status, data_cobranca, created_by) VALUES
    ('db000002-0000-4000-8000-000000000001'::uuid, v_cli_ps, 'P', 10, 18.00, 'pendente', v_hoje, v_admin);

  RAISE NOTICE 'Seed demo aplicada para % — pedidos DEMO-PED-001..004, cargas DEMO-CARGA-*', v_hoje;
END $$;
