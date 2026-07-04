-- Migration 0013: CadUnico - cobertura e pobreza (indicador para Indice de Pobreza Energetica Regional)
-- Fonte: MDS/SAGI, servico Solr publico (aplicacoes.mds.gov.br/sagi/servicos/misocial),
-- referencia 202512 (dez/2025, mes mais recente disponivel na sessao de 04/07/2026).
-- percentual_cadunico (coluna ja existente desde o scaffold original) = cobertura:
--   pessoas cadastradas no CadUnico / populacao total (Censo 2022) x 100
-- percentual_pobreza_cadunico (nova coluna) = das familias cadastradas, quantas estao
--   em situacao de pobreza ou extrema pobreza:
--   (familias em pobreza + familias em extrema pobreza) / familias cadastradas x 100

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS percentual_pobreza_cadunico double precision;

COMMENT ON COLUMN indicadores_sociais.percentual_cadunico IS
  'Cobertura: % da populacao total cadastrada no CadUnico. Fonte: MDS/SAGI (misocial), ref. 202512.';
COMMENT ON COLUMN indicadores_sociais.percentual_pobreza_cadunico IS
  '% das familias cadastradas no CadUnico em situacao de pobreza ou extrema pobreza. Fonte: MDS/SAGI (misocial), ref. 202512.';
