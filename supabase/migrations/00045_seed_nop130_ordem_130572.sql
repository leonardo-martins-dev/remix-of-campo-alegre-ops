-- ============================================================
-- NOP-130 — fixture da Ordem de Separação 130572 (papel de referência)
--   Carrefour Presidente Prudente · 129 itens · 4 caixas (Wise)
--   Itens nas famílias 1, 2, 4 e 5.
--
-- Idempotente: remove a ordem demo anterior (observacoes = '__demo_nop130__')
-- antes de recriar. A ordem nasce em "importada" para que a separação, a saída
-- e a entrega possam ser demonstradas na tela.
--
-- data_carga = hoje (BRT) de propósito: as telas de expedição são do dia.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Famílias do papel
-- ------------------------------------------------------------
INSERT INTO public.familias_produto (nome, ordem) VALUES
  ('Família 1 · Folhosas', 1),
  ('Família 2 · Legumes', 2),
  ('Família 4 · Cogumelos', 4),
  ('Família 5 · Higienizados', 5)
ON CONFLICT (nome) DO UPDATE SET ordem = EXCLUDED.ordem;

-- ------------------------------------------------------------
-- 2. Produtos do catálogo usados na ordem (cria só o que faltar)
-- ------------------------------------------------------------
INSERT INTO public.produtos (codigo, nome, unidade, ativo)
SELECT c.codigo, c.nome, c.unidade::public.unidade_medida, TRUE
FROM (VALUES
  ('6',    'ALFACE CRESPA – UND', 'un'),
  ('25',   'COUVE MANTEIGA – UND', 'un'),
  ('2',    'AGRIÃO CONVENCIONAL – UND', 'un'),
  ('1130', 'CENOURA 500gr', 'un'),
  ('1138', 'BETERRABA 500gr', 'un'),
  ('972',  'PARIS', 'un'),
  ('1088', 'SHIMEJI BRANCO', 'un'),
  ('995',  'SALADA CAMPESTRE 200G', 'un'),
  ('960',  'MIX DE LEGUMES HIG 300G', 'un')
) AS c(codigo, nome, unidade)
WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.codigo = c.codigo);

-- Liga cada produto da ordem à família do papel.
UPDATE public.produtos p
SET familia_id = f.id, updated_at = now()
FROM (VALUES
  ('6',    'Família 1 · Folhosas'),
  ('25',   'Família 1 · Folhosas'),
  ('2',    'Família 1 · Folhosas'),
  ('1130', 'Família 2 · Legumes'),
  ('1138', 'Família 2 · Legumes'),
  ('972',  'Família 4 · Cogumelos'),
  ('1088', 'Família 4 · Cogumelos'),
  ('995',  'Família 5 · Higienizados'),
  ('960',  'Família 5 · Higienizados')
) AS m(codigo, familia)
JOIN public.familias_produto f ON f.nome = m.familia
WHERE p.codigo = m.codigo
  AND p.familia_id IS DISTINCT FROM f.id;

-- ------------------------------------------------------------
-- 3. Supermercado do papel
-- ------------------------------------------------------------
INSERT INTO public.clientes (nome, cnpj, ativo)
SELECT 'CARREFOUR PRESIDENTE PRUDENTE', '45.543.915/0654-90', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes c WHERE c.nome = 'CARREFOUR PRESIDENTE PRUDENTE'
);

UPDATE public.clientes
SET cnpj = COALESCE(NULLIF(btrim(cnpj), ''), '45.543.915/0654-90'), ativo = TRUE
WHERE nome = 'CARREFOUR PRESIDENTE PRUDENTE';

-- ------------------------------------------------------------
-- 4. Ordem 130572
-- ------------------------------------------------------------
DELETE FROM public.cargas WHERE observacoes = '__demo_nop130__';

DO $$
DECLARE
  v_cliente UUID;
  v_carga UUID;
  v_cnpj TEXT;
BEGIN
  SELECT id, cnpj INTO v_cliente, v_cnpj
  FROM public.clientes
  WHERE nome = 'CARREFOUR PRESIDENTE PRUDENTE'
  LIMIT 1;

  IF v_cliente IS NULL THEN
    RAISE NOTICE 'NOP-130: cliente demo não encontrado, seed ignorado';
    RETURN;
  END IF;

  -- Código é único: se já existir uma PV-130572 real, não mexe nela.
  IF EXISTS (SELECT 1 FROM public.cargas WHERE codigo = 'PV-130572') THEN
    RAISE NOTICE 'NOP-130: PV-130572 já existe, seed ignorado';
    RETURN;
  END IF;

  INSERT INTO public.cargas (
    codigo, cliente_id, data_carga, status, status_separacao, status_ordem,
    numero_ordem, cliente_cnpj, qtde_itens_wise, qtde_caixas_wise, observacoes
  ) VALUES (
    'PV-130572', v_cliente, public.today_brt(), 'aguardando'::public.status_carga,
    'pendente'::public.status_separacao_loja, 'importada',
    '130572', v_cnpj, 129, 4, '__demo_nop130__'
  )
  RETURNING id INTO v_carga;

  INSERT INTO public.romaneio_itens (carga_id, produto_id, quantidade_romaneio, quantidade_real, status)
  SELECT v_carga, p.id, i.qtd, 0, 'pendente'::public.status_romaneio
  FROM (VALUES
    ('6',    24::numeric),
    ('25',   18),
    ('2',    12),
    ('1130', 20),
    ('1138', 15),
    ('972',  10),
    ('1088', 8),
    ('995',  12),
    ('960',  10)
  ) AS i(codigo, qtd)
  JOIN public.produtos p ON p.codigo = i.codigo;

  INSERT INTO public.carga_caixas_resumo (carga_id) VALUES (v_carga)
  ON CONFLICT DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';
