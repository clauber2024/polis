-- ============================================================================
-- MIGRATION: adiciona colunas de Favelas e Comunidades Urbanas
-- (Censo 2022, Resultados do Universo)
-- ----------------------------------------------------------------------------
-- Rodar via:
--   docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < \
--     backend/src/db/migrations/0007_indicadores_sociais_favelas.sql
-- ============================================================================

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS percentual_populacao_favela double precision,
  ADD COLUMN IF NOT EXISTS numero_favelas_comunidades integer;
