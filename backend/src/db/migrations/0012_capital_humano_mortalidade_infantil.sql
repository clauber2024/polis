-- Migration 0012: Capital Humano - taxa de mortalidade infantil (DATASUS)
-- Taxa calculada como media poolada de 3 anos (2022-2024): soma de obitos
-- infantis (SIM, idade < 1 ano, nao-fetal) dividido pela soma de nascidos
-- vivos (SINASC) no periodo, x 1000. Media de 3 anos escolhida para reduzir
-- ruido estatistico em municipios pequenos (poucos nascimentos/ano faz a
-- taxa anual isolada oscilar muito).

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS taxa_mortalidade_infantil double precision;

COMMENT ON COLUMN indicadores_sociais.taxa_mortalidade_infantil IS
  'Obitos infantis (< 1 ano) por 1000 nascidos vivos. Media poolada 2022-2024. Fonte: SIM + SINASC (DATASUS) via Base dos Dados/BigQuery.';
