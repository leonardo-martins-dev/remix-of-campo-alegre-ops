-- Catálogo-base Campo Alegre (códigos Wise).
-- Idempotente: atualiza nome/unidade pelo código; não apaga produtos extras.
-- Não aplicar 00015.

CREATE OR REPLACE FUNCTION public._tmp_norm_prod(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        upper(translate(
          coalesce(p, ''),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUcaaaaaeeeeiiiiooooouuuuc'
        )),
        '\s*[-–—]?\s*UND\s*$',
        ''
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

-- 1) Liga o código Wise em cadastros antigos sem código, quando o nome bate (único no catálogo).
WITH catalogo(codigo, nome, unidade) AS (
VALUES
  ('1', 'ACELGA 600G', 'un'),
  ('6', 'ALFACE CRESPA – UND', 'un'),
  ('25', 'COUVE MANTEIGA – UND', 'un'),
  ('2', 'AGRIÃO CONVENCIONAL – UND', 'un')
)
UPDATE public.produtos p
SET
  codigo = c.codigo,
  nome = c.nome,
  unidade = c.unidade::public.unidade_medida,
  ativo = true,
  updated_at = now()
FROM catalogo c
WHERE coalesce(btrim(p.codigo), '') = ''
  AND public._tmp_norm_prod(p.nome) = public._tmp_norm_prod(c.nome)
  AND NOT EXISTS (
    SELECT 1 FROM public.produtos y WHERE y.codigo = c.codigo
  );

-- 2) Insere o catálogo completo / atualiza nome pelo código.
INSERT INTO public.produtos (codigo, nome, unidade, ativo)
SELECT c.codigo, c.nome, c.unidade::public.unidade_medida, true
FROM (
VALUES
  ('1', 'ACELGA 600G', 'un'),
  ('2', 'AGRIÃO CONVENCIONAL – UND', 'un'),
  ('3', 'AGRIÃO HIDROPÔNICO – UND', 'un'),
  ('4', 'ALECRIM – UND', 'un'),
  ('5', 'ALFACE AMERICANA -UND', 'un'),
  ('6', 'ALFACE CRESPA – UND', 'un'),
  ('7', 'ALFACE CROCANTE -UND', 'un'),
  ('8', 'ALFACE CRESPA HIDROPÔNICO -UND', 'un'),
  ('9', 'ALFACE LISA – UND', 'un'),
  ('10', 'ALFACE LISA HIDROPÔNICA - UND', 'un'),
  ('11', 'ALFACE MIMOSA -UND', 'un'),
  ('12', 'ALFACE MIMOSA HIDROPÔNICO - UND', 'un'),
  ('14', 'ALFACE ROXA -UND', 'un'),
  ('15', 'ALFACE ROXA HIDROPÔNICA -UND', 'un'),
  ('16', 'ALHO PORÓ – UND', 'un'),
  ('17', 'ALMEIRÃO -UND', 'un'),
  ('19', 'BROCOLIS COMUM -UND', 'un'),
  ('20', 'BROCOLIS NINJA 300G', 'un'),
  ('22', 'CEBOLINHA – UND', 'un'),
  ('23', 'CHEIRO VERDE – UND', 'un'),
  ('24', 'COENTRO – UND', 'un'),
  ('25', 'COUVE MANTEIGA – UND', 'un'),
  ('26', 'COUVE FLOR 300G', 'un'),
  ('27', 'ESCAROLA – UND', 'un'),
  ('28', 'ESPINAFRE – UND', 'un'),
  ('29', 'HORTELÃ – UND', 'un'),
  ('30', 'LOURO – UND', 'un'),
  ('31', 'MANJERICÃO – UND', 'un'),
  ('32', 'MANJERONA – UND', 'un'),
  ('34', 'NABO – UND', 'un'),
  ('35', 'RABANETE – UND', 'un'),
  ('36', 'RÚCULA CONVENCIONAL – UND', 'un'),
  ('37', 'RÚCULA HIDROPÔNICA – UND', 'un'),
  ('38', 'SALSA – UND', 'un'),
  ('39', 'SALSÃO – UND', 'un'),
  ('41', 'SALSA INDUSTRIAL', 'un'),
  ('42', 'CEBOLINHA INDUSTRIAL', 'un'),
  ('49', 'COUVE PICADA HIG 200G', 'un'),
  ('72', 'MILHO VERDE', 'un'),
  ('82', 'AMERICANA BOLA 250g', 'un'),
  ('88', 'MANDIOCA DESCASCADA 1KG', 'kg'),
  ('91', 'SALADA MISTA -UND', 'un'),
  ('933', 'ABOBORA MADURA HIG 500G', 'un'),
  ('937', 'CENOURA HIG 300G', 'un'),
  ('938', 'CHEIRO VERDE HIG 80G', 'un'),
  ('943', 'RUCULA HIG 150G', 'un'),
  ('950', 'ALFACE AMERICANA HIG 250G', 'un'),
  ('951', 'ALFACE CRESPA HIG 200G', 'un'),
  ('952', 'SALSINHA HIG 80G', 'un'),
  ('953', 'CEBOLINHA HIG 80G', 'un'),
  ('954', 'REPOLHO HIG 300G', 'un'),
  ('955', 'SALADA TRIO HIG 300G', 'un'),
  ('956', 'SALADA TROPICAL HIG 200G', 'un'),
  ('957', 'MIX DE FOLHAS HIG 180G', 'un'),
  ('958', 'ABOBORA CABOTIA HIG 500G', 'un'),
  ('960', 'MIX DE LEGUMES HIG 300G', 'un'),
  ('961', 'KIT YAKISSOBA HIG 400G', 'un'),
  ('970', 'SHIITAKE', 'un'),
  ('972', 'PARIS', 'un'),
  ('973', 'PORTOBELLO', 'un'),
  ('979', 'COENTRO INDUSTRIAL', 'un'),
  ('994', 'ALHO PORÓ – UND', 'un'),
  ('995', 'SALADA CAMPESTRE 200G', 'un'),
  ('996', 'SALADA SILVESTRE 200G', 'un'),
  ('997', 'SALADA NATIVA 200G', 'un'),
  ('1015', 'HAIA (FRISE VERDE E ROXA )', 'un'),
  ('1016', 'SALAD AMSTERDAM DUAL(MIMOSA VERDE E ROXA)', 'un'),
  ('1017', 'SALAD AMSTERDAM (MIMOSA)', 'un'),
  ('1063', 'DUAL MIX BROCOLIS E COUVE FLOR', 'un'),
  ('1064', 'COUVE KALE', 'un'),
  ('1087', 'SHIMEJI PRETO', 'un'),
  ('1088', 'SHIMEJI BRANCO', 'un'),
  ('1089', 'ERYNGUI', 'un'),
  ('1090', 'PARIS FATIADO', 'un'),
  ('1091', 'SALMÃO', 'un'),
  ('1092', 'MIX COGUMELOS', 'un'),
  ('1117', 'REPOLHO VERDE EMBALADO', 'un'),
  ('1118', 'REPOLHO ROXO EMBALADO', 'un'),
  ('1129', 'TOMATE GRAPE 180gr', 'un'),
  ('1130', 'CENOURA 500gr', 'un'),
  ('1131', 'JILÓ 350gr', 'un'),
  ('1132', 'PIMENTÃO VERDE 300gr', 'un'),
  ('1133', 'PIMENTÃO COLORIDO 300gr', 'un'),
  ('1134', 'QUIABO 300gr', 'un'),
  ('1135', 'PIMENTA DEDO DE MOÇA 200gr', 'un'),
  ('1136', 'ABOBRINHA ITALIA 500gr', 'un'),
  ('1137', 'VAGEM 300gr', 'un'),
  ('1138', 'BETERRABA 500gr', 'un'),
  ('1139', 'PIMENTA CAMBUCI 300gr', 'un'),
  ('1140', 'TOMATE ITALIANO 700gr', 'un'),
  ('1156', 'MANDIOQUINHA 500g', 'un'),
  ('1157', 'TOMATE GRAPE 500g', 'un'),
  ('1173', 'COUVE MANTEIGA ORG 250G', 'un'),
  ('1174', 'ALFACE CRESPA ORG 200G', 'un'),
  ('1175', 'TOMATE ITALIANO ORG 500G', 'un'),
  ('1176', 'TOMATE GRAPE ORG 250G', 'un'),
  ('1177', 'TOMATE GRAPE ORG 180G', 'un'),
  ('1178', 'ALFACE AMERICANA ORG 250G', 'un'),
  ('1179', 'ESPINAFRE ORG 200G', 'un'),
  ('1180', 'CENOURA ORG 600G', 'un'),
  ('1181', 'ALFACE LISA ORG 200G', 'un'),
  ('1182', 'ESCAROLA ORG 200G', 'un'),
  ('1183', 'AGRIAO ORG 150G', 'un'),
  ('1184', 'MANJERICAO VERDE ORG 80G', 'un'),
  ('1185', 'HORTELA ORG 80G', 'un'),
  ('1186', 'RUCULA ORG 200G', 'un'),
  ('1187', 'PEPINO JAPONES ORG 400G', 'un'),
  ('1188', 'COENTRO ORG 80G', 'un'),
  ('1189', 'ALFACE MIMOSA ORG 200G', 'un'),
  ('1190', 'CHEIRO VERDE ORG 80G', 'un'),
  ('1191', 'TOMATE SALADA ORG 500G', 'un'),
  ('1192', 'ALFACE CRESPA ROXA ORG 200G', 'un'),
  ('1193', 'ALHO PORO ORG 250G SP', 'un'),
  ('1194', 'ALMEIRAO ORG 200G', 'un'),
  ('1195', 'BATATA DOCE ROSADA ORG 600G', 'un'),
  ('1196', 'BATATA INGLESA ORG 600G', 'un'),
  ('1197', 'BROCOLIS RAMOSO ORG 200G', 'un'),
  ('1198', 'BROCOLIS NINJA ORG 300G', 'un'),
  ('1199', 'CATALONIA ORG 200G', 'un'),
  ('1200', 'CEBOLA ORG 500G', 'un'),
  ('1201', 'CEBOLA ROXA ORG 500G', 'un'),
  ('1202', 'CEBOLINHA ORG 80G', 'un'),
  ('1203', 'CHUCHU ORG 600G', 'un'),
  ('1204', 'COUVE FLOR ORG 350G', 'un'),
  ('1205', 'COUVE KALE ORG 200G', 'un'),
  ('1206', 'ERVA-DOCE ORG 300G', 'un'),
  ('1207', 'GENGIBRE ORG 150G', 'un'),
  ('1208', 'INHAME ORG 500G', 'un'),
  ('1209', 'JILO ORG 400G', 'un'),
  ('1210', 'LIMAO TAHITI ORG 500G', 'un'),
  ('1211', 'MANDIOQUINHA ORG 400G', 'un'),
  ('1212', 'MILHO VERDE ORG 500G', 'un'),
  ('1213', 'PIMENTAO COLORIDO ORG 400G', 'un'),
  ('1214', 'QUIABO ORG 300G', 'un'),
  ('1215', 'RABANETE ORG 300G', 'un'),
  ('1216', 'REPOLHO VERDE ORG 400G', 'un'),
  ('1217', 'SALSINHA ORG 80G', 'un'),
  ('1218', 'VAGEM EXTRA FINA ORG 300G', 'un'),
  ('1219', 'VAGEM MACARRAO ORG 300G', 'un'),
  ('1220', 'ALECRIM EMB', 'un'),
  ('1221', 'HORTELÃ EMB', 'un'),
  ('1222', 'MANJERICÃO VERDE EMB', 'un'),
  ('1223', 'MANJERICÃO ROXO EMB', 'un'),
  ('1224', 'TOMILHO EMB', 'un')
) AS c(codigo, nome, unidade)
ON CONFLICT (codigo) WHERE codigo IS NOT NULL AND btrim(codigo) <> ''
DO UPDATE SET
  nome = EXCLUDED.nome,
  unidade = EXCLUDED.unidade,
  ativo = true,
  updated_at = now();

DROP FUNCTION public._tmp_norm_prod(text);
