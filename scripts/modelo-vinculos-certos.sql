-- Modelo de vínculos CERTOS (Packing House / Wise)
-- Artefato tabular: scripts/modelo-vinculos-certos.csv
-- Função (aplicar só quando pedir): public.resolver_pendencias_certas()
--   migration: supabase/migrations/00023_resolver_pendencias_certas.sql

-- REGRAS (somente certeza)
-- 1. produto:    codigo_externo (Wise) = produtos.codigo
-- 2. fornecedor: upper(btrim(nome_externo)) = upper(btrim(fornecedores.nome))
-- 3. NÃO cria cadastro novo
-- 4. NÃO faz fuzzy (ex.: MARCELO DONIZETTI ≠ MARCELO APARECIDO)

-- FORA DO MODELO (manual)
-- produtos: 92 REPOLHO VERDE, 93 REPOLHO ROXO, 1141 RADICHIO
-- fornecedores sem nome idêntico no cadastro:
--   EZIQUIEL AYRES DE OLIVEIRA (PIEDADE)
--   MARCELO DONIZETTI DE OLIVEIRA MARTINS E OUTRO
--   MATHEUS OLIVEIRA SANTOS
--   OLAVO DE OLANDA CAVALCANTE JUNIOR E OUTRA
--   RENAN DE CAMARGO SANTOS
--   RUDSON ALVES DE PAZ E OUTRO

-- Volume coberto pelas regras (sobre as pendências da lista):
--   ~204 pendências de produto por código
--   ~84  pendências de fornecedor por nome exato
--   ~55  aliases de produto distintos + ~31 aliases de fornecedor distintos
