-- NOP-22 seed: fatores de conversão a partir da planilha referência Campo Alegre
-- Idempotente: reexecuta upserts; evita log duplicado do mesmo arquivo.

DO $$
DECLARE
  v_arquivo            TEXT := 'NOP-22 planilha referencia Campo Alegre';
  v_linhas_lidas       INT;
  v_criadas            INT := 0;
  v_atualizadas        INT := 0;
  v_pendencias         INT;
  v_rejeitadas         INT;
  v_detalhes           JSONB;
BEGIN
  -- 1) Garantir produto código 92 (REPOLHO VERDE)
  INSERT INTO public.produtos (codigo, nome, unidade, ativo)
  SELECT '92', 'REPOLHO VERDE', 'un'::public.unidade_medida, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.produtos p WHERE btrim(p.codigo) = '92'
  );

  -- 2) TEMP com todas as linhas (fator + pendências)
  DROP TABLE IF EXISTS seed_rows;
  CREATE TEMP TABLE seed_rows (
    codigo     TEXT NOT NULL,
    fornecedor TEXT NOT NULL,
    produto    TEXT NOT NULL,
    tipo       TEXT NOT NULL,
    fator      INT
  ) ON COMMIT DROP;

  INSERT INTO seed_rows (codigo, fornecedor, produto, tipo, fator) VALUES
    -- Com fator (87)
    ('25', 'ADEMIR JOSE DOS SANTOS JUNIOR E OUTRA', 'COUVE MANTEIGA', 'Amarela', 18),
    ('25', 'ADEMIR JOSE DOS SANTOS JUNIOR E OUTRA', 'COUVE MANTEIGA', 'Vermelha', 30),
    ('88', 'APARECIDO DONIZETE DOMINGUES DE OLIVEIRA E OUTROS', 'MANDIOCA DESCASCADA', 'Vermelha', 20),
    ('91', 'CAMPO ALEGRE HIDROPONIA', 'SALADA MISTA', 'Vermelha', 20),
    ('31', 'CAMPO ALEGRE LAVOURA', 'MANJERICAO', 'Vermelha', 100),
    ('23', 'CARLOS APARECIDO SOARES DA SILVA', 'CHEIRO VERDE', 'Vermelha', 80),
    ('24', 'CARLOS AUGUSTO NOGUEIRA DA SILVA', 'COENTRO', 'Amarela', 10),
    ('25', 'CASSIO ANTONIO DE OLIVEIRA', 'COUVE MANTEIGA', 'Amarela', 18),
    ('25', 'CASSIO ANTONIO DE OLIVEIRA', 'COUVE MANTEIGA', 'Vermelha', 30),
    ('22', 'DELEON DIAS TENÓRIO', 'CEBOLINHA', 'Vermelha', 80),
    ('23', 'DELEON DIAS TENÓRIO', 'CHEIRO VERDE', 'Vermelha', 80),
    ('38', 'DELEON DIAS TENÓRIO', 'SALSA', 'Vermelha', 80),
    ('25', 'DIRCEU APARECIDO DO NASCIMENTO E OUTRA', 'COUVE MANTEIGA', 'Amarela', 20),
    ('27', 'DIRCEU APARECIDO DO NASCIMENTO E OUTRA', 'ESCAROLA', 'Amarela', 18),
    ('92', 'DIRCEU APARECIDO DO NASCIMENTO E OUTRA', 'REPOLHO VERDE', 'Amarela', 18),
    ('1', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'ACELGA 600g', 'Amarela', 8),
    ('4', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'ALECRIM', 'Vermelha', 100),
    ('994', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'ALHO PORÓ', 'Amarela', 48),
    ('19', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'BROCOLIS COMUM', 'Amarela', 12),
    ('19', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'BROCOLIS COMUM', 'Vermelha', 20),
    ('25', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'COUVE MANTEIGA', 'Amarela', 18),
    ('25', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'COUVE MANTEIGA', 'Vermelha', 30),
    ('28', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'ESPINAFRE', 'Amarela', 12),
    ('28', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'ESPINAFRE', 'Vermelha', 20),
    ('35', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'RABANETE', 'Amarela', 24),
    ('39', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'SALSAO', 'Amarela', 12),
    ('92', 'EDUARDO ROQUE DE MORAES', 'REPOLHO VERDE', 'Amarela', 18),
    ('1220', 'FLOWER AGRONEGOCIOS LTDA', 'ALECRIM EMB', 'Vermelha', 100),
    ('1221', 'FLOWER AGRONEGOCIOS LTDA', 'HORTELÃ EMB', 'Vermelha', 80),
    ('1223', 'FLOWER AGRONEGOCIOS LTDA', 'MANJERICÃO ROXO EMB', 'Vermelha', 100),
    ('1222', 'FLOWER AGRONEGOCIOS LTDA', 'MANJERICÃO VERDE EMB', 'Vermelha', 100),
    ('1224', 'FLOWER AGRONEGOCIOS LTDA', 'TOMILHO EMB', 'Vermelha', 100),
    ('72', 'GABRIEL BONOMI COUTO SILVA', 'MILHO VERDE', 'Vermelha', 30),
    ('8', 'JOAO ANTONIO LANDGRAF', 'ALFACE CRESPA HIDROPONICA', 'Vermelha', 25),
    ('25', 'JOYCE ROSA FERREIRA DOS SANTOS E DANILO CRISTIANO RODRIGUES', 'COUVE MANTEIGA', 'Amarela', 18),
    ('25', 'JOYCE ROSA FERREIRA DOS SANTOS E DANILO CRISTIANO RODRIGUES', 'COUVE MANTEIGA', 'Vermelha', 30),
    ('82', 'LUCAS ANTONIO DE CAMARGO', 'AMERICANA BOLA 250g', 'Amarela', 12),
    ('82', 'LUCAS ANTONIO DE CAMARGO', 'AMERICANA BOLA 250g', 'Vermelha', 30),
    ('4', 'MARCIO HENRIQUE DE OLIVEIRA', 'ALECRIM', 'Vermelha', 100),
    ('23', 'MARCIO HENRIQUE DE OLIVEIRA', 'CHEIRO VERDE', 'Vermelha', 80),
    ('25', 'MARCIO HENRIQUE DE OLIVEIRA', 'COUVE MANTEIGA', 'Amarela', 18),
    ('30', 'MARCIO HENRIQUE DE OLIVEIRA', 'LOURO', 'Vermelha', 100),
    ('19', 'MAURO VIEIRA MACHADO', 'BROCOLIS COMUM', 'Amarela', 12),
    ('19', 'MAURO VIEIRA MACHADO', 'BROCOLIS COMUM', 'Vermelha', 20),
    ('25', 'MAURO VIEIRA MACHADO', 'COUVE MANTEIGA', 'Amarela', 18),
    ('25', 'MAURO VIEIRA MACHADO', 'COUVE MANTEIGA', 'Vermelha', 30),
    ('25', 'MICHEL JONAS MENDES DE OLIVEIRA E OUTRA', 'COUVE MANTEIGA', 'Amarela', 18),
    ('25', 'MICHEL JONAS MENDES DE OLIVEIRA E OUTRA', 'COUVE MANTEIGA', 'Vermelha', 30),
    ('994', 'MOACIR BATISTA DE OLIVEIRA JUNIOR E OUTRA', 'ALHO PORÓ', 'Amarela', 48),
    ('20', 'N. AMADEO FERRARA PRODUTORA E COMERCIAL AGRICOLA LTDA', 'BROCOLIS NINJA 300g', 'Vermelha', 20),
    ('26', 'N. AMADEO FERRARA PRODUTORA E COMERCIAL AGRICOLA LTDA', 'COUVE FLOR 300G', 'Vermelha', 15),
    ('6', 'NILSON APARECIDO GRIPPA E OUTROS', 'ALFACE CRESPA', 'Vermelha', 25),
    ('12', 'NILSON APARECIDO GRIPPA E OUTROS', 'ALFACE MIMOSA HIDROPONICA', 'Vermelha', 25),
    ('15', 'NILSON APARECIDO GRIPPA E OUTROS', 'ALFACE ROXA HIDROPONICA', 'Vermelha', 25),
    ('17', 'NILSON APARECIDO GRIPPA E OUTROS', 'ALMEIRAO', 'Vermelha', 30),
    ('24', 'NILSON APARECIDO GRIPPA E OUTROS', 'COENTRO', 'Vermelha', 80),
    ('27', 'NILSON APARECIDO GRIPPA E OUTROS', 'ESCAROLA', 'Vermelha', 25),
    ('1015', 'NILSON APARECIDO GRIPPA E OUTROS', 'HAIA (FRISE VERDE E ROXA)', 'Vermelha', 20),
    ('29', 'NILSON APARECIDO GRIPPA E OUTROS', 'HORTELA', 'Vermelha', 80),
    ('36', 'NORBERTO KUBAIASSI', 'RUCULA CONVENCIONAL', 'Vermelha', 30),
    ('37', 'NORBERTO KUBAIASSI', 'RUCULA HIDROPONICA', 'Vermelha', 30),
    ('25', 'PAULO DE CAMARGO', 'COUVE MANTEIGA', 'Amarela', 18),
    ('25', 'PAULO DE CAMARGO', 'COUVE MANTEIGA', 'Vermelha', 30),
    ('25', 'PAULO EUGENIO (LAVOURA)', 'COUVE MANTEIGA', 'Amarela', 18),
    ('25', 'PAULO EUGENIO (LAVOURA)', 'COUVE MANTEIGA', 'Vermelha', 30),
    ('31', 'PAULO EUGENIO (LAVOURA)', 'MANJERICAO', 'Vermelha', 100),
    ('6', 'RICARDO ALEXANDRE LANDGRAF', 'ALFACE CRESPA', 'Vermelha', 25),
    ('11', 'RICARDO ALEXANDRE LANDGRAF', 'ALFACE MIMOSA', 'Vermelha', 25),
    ('12', 'RICARDO ALEXANDRE LANDGRAF', 'ALFACE MIMOSA HIDROPONICA', 'Vermelha', 25),
    ('14', 'RICARDO ALEXANDRE LANDGRAF', 'ALFACE ROXA', 'Vermelha', 25),
    ('1015', 'RICARDO ALEXANDRE LANDGRAF', 'HAIA (FRISE VERDE E ROXA)', 'Vermelha', 20),
    ('29', 'RICARDO ALEXANDRE LANDGRAF', 'HORTELA', 'Vermelha', 80),
    ('1017', 'RICARDO ALEXANDRE LANDGRAF', 'SALAD AMSTERDAM (MIMOSA)', 'Vermelha', 20),
    ('1016', 'RICARDO ALEXANDRE LANDGRAF', 'SALAD AMSTERDAM DUAL(MIMOSA VERDE E ROXA)', 'Vermelha', 20),
    ('23', 'RODRIGO TADEU SOARES', 'CHEIRO VERDE', 'Vermelha', 80),
    ('1', 'ROQUE GARCIA JUNIOR', 'ACELGA 600g', 'Amarela', 8),
    ('994', 'ROQUE GARCIA JUNIOR', 'ALHO PORÓ', 'Amarela', 48),
    ('25', 'ROQUE GARCIA JUNIOR', 'COUVE MANTEIGA', 'Amarela', 12),
    ('25', 'ROQUE GARCIA JUNIOR', 'COUVE MANTEIGA', 'Vermelha', 20),
    ('34', 'ROQUE GARCIA JUNIOR', 'NABO', 'Amarela', 5),
    ('35', 'ROQUE GARCIA JUNIOR', 'RABANETE', 'Amarela', 24),
    ('39', 'ROQUE GARCIA JUNIOR', 'SALSAO', 'Amarela', 12),
    ('6', 'SANDRO RODRIGUES PEREIRA E OUTRA', 'ALFACE CRESPA', 'Vermelha', 25),
    ('36', 'SANDRO RODRIGUES PEREIRA E OUTRA', 'RUCULA CONVENCIONAL', 'Vermelha', 30),
    ('37', 'SANDRO RODRIGUES PEREIRA E OUTRA', 'RUCULA HIDROPONICA', 'Vermelha', 30),
    ('23', 'SILVIA PEDROSO', 'CHEIRO VERDE', 'Vermelha', 80),
    ('24', 'WESLEI MOCIARO', 'COENTRO', 'Amarela', 70),
    -- Pendências (fator NULL) — 8
    ('28', 'CASSIO ANTONIO DE OLIVEIRA', 'ESPINAFRE', 'Amarela', NULL),
    ('28', 'CASSIO ANTONIO DE OLIVEIRA', 'ESPINAFRE', 'Vermelha', NULL),
    ('8', 'CLAUDIO APARECIDO OLIVEIRA MARTINS E OUTRA', 'ALFACE CRESPA HIDROPONICA', 'Vermelha', NULL),
    ('5', 'DIRCEU APARECIDO DO NASCIMENTO E OUTRA', 'ALFACE AMERICANA', 'Amarela', NULL),
    ('5', 'E&V FAVORITO COMERCIO DE HORTIFRUTIGRANJEIRO LTDA', 'ALFACE AMERICANA', 'Amarela', NULL),
    ('5', 'FELIPE PAES DE CAMARGO', 'ALFACE AMERICANA', 'Amarela', NULL),
    ('8', 'MARCELO APARECIDO DE OLIVEIRA MARTINS', 'ALFACE CRESPA HIDROPONICA', 'Vermelha', NULL),
    ('8', 'RICARDO ALEXANDRE LANDGRAF', 'ALFACE CRESPA HIDROPONICA', 'Vermelha', NULL);

  SELECT COUNT(*) INTO v_linhas_lidas FROM seed_rows;
  SELECT COUNT(*) INTO v_pendencias FROM seed_rows WHERE fator IS NULL;

  -- Evitar log duplicado do mesmo seed
  DELETE FROM public.importacoes_conversao WHERE arquivo = v_arquivo;

  -- Resolução Amarela→A, Vermelha→V
  CREATE TEMP TABLE seed_resolved ON COMMIT DROP AS
  SELECT
    s.codigo,
    s.fornecedor,
    s.produto,
    s.tipo,
    s.fator,
    p.id  AS produto_id,
    f.id  AS fornecedor_id,
    tc.id AS tipo_caixa_id
  FROM seed_rows s
  LEFT JOIN public.produtos p
    ON btrim(p.codigo) = btrim(s.codigo)
  LEFT JOIN public.fornecedores f
    ON upper(btrim(f.nome)) = upper(btrim(s.fornecedor))
  LEFT JOIN public.tipos_caixa tc
    ON tc.sigla = CASE lower(btrim(s.tipo))
      WHEN 'amarela' THEN 'A'
      WHEN 'vermelha' THEN 'V'
      ELSE NULL
    END;

  -- Rejeitadas: linhas com fator que não resolvem produto/fornecedor/tipo
  SELECT COUNT(*) INTO v_rejeitadas
  FROM seed_resolved
  WHERE fator IS NOT NULL
    AND (produto_id IS NULL OR fornecedor_id IS NULL OR tipo_caixa_id IS NULL);

  -- 3) Upsert conversoes_fornecedor (apenas fator NOT NULL e resolvidas)
  WITH upserted AS (
    INSERT INTO public.conversoes_fornecedor (fornecedor_id, produto_id, tipo_caixa_id, fator, ativo)
    SELECT fornecedor_id, produto_id, tipo_caixa_id, fator, true
    FROM seed_resolved
    WHERE fator IS NOT NULL
      AND produto_id IS NOT NULL
      AND fornecedor_id IS NOT NULL
      AND tipo_caixa_id IS NOT NULL
    ON CONFLICT (fornecedor_id, produto_id, tipo_caixa_id) DO UPDATE
      SET fator = EXCLUDED.fator,
          ativo = true
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE is_insert), 0),
    COALESCE(COUNT(*) FILTER (WHERE NOT is_insert), 0)
  INTO v_criadas, v_atualizadas
  FROM upserted;

  -- 4) Defaults produto×tipo: MODE (empate → MAX fator)
  WITH freq AS (
    SELECT
      produto_id,
      tipo_caixa_id,
      fator,
      COUNT(*) AS cnt
    FROM seed_resolved
    WHERE fator IS NOT NULL
      AND produto_id IS NOT NULL
      AND tipo_caixa_id IS NOT NULL
    GROUP BY produto_id, tipo_caixa_id, fator
  ),
  mode_fator AS (
    SELECT DISTINCT ON (produto_id, tipo_caixa_id)
      produto_id,
      tipo_caixa_id,
      fator
    FROM freq
    ORDER BY produto_id, tipo_caixa_id, cnt DESC, fator DESC
  )
  INSERT INTO public.conversoes_produto_caixa (produto_id, tipo_caixa_id, fator, ativo)
  SELECT produto_id, tipo_caixa_id, fator, true
  FROM mode_fator
  ON CONFLICT (produto_id, tipo_caixa_id) DO UPDATE
    SET fator = EXCLUDED.fator,
        ativo = true;

  -- 5) Detalhes das 8 pendências (não grava fator 0)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'motivo', 'Fator 0 ou vazio',
      'dados', jsonb_build_object(
        'codigo', codigo,
        'fornecedor', fornecedor,
        'produto', produto,
        'tipoCaixa', tipo
      )
    )
    ORDER BY fornecedor, codigo, tipo
  ), '[]'::jsonb)
  INTO v_detalhes
  FROM seed_rows
  WHERE fator IS NULL;

  -- 6) Um registro de importação
  INSERT INTO public.importacoes_conversao (
    arquivo,
    linhas_lidas,
    conversoes_criadas,
    conversoes_atualizadas,
    pendencias,
    rejeitadas,
    detalhes
  ) VALUES (
    v_arquivo,
    v_linhas_lidas,
    v_criadas,
    v_atualizadas,
    v_pendencias,
    v_rejeitadas,
    v_detalhes
  );
END $$;
