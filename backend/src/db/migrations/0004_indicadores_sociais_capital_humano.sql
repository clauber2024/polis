-- ============================================================================
-- MIGRATION: adiciona coluna da dimensão Capital Humano (parcial: alfabetização)
-- ----------------------------------------------------------------------------
-- Rodar via:
--   docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < \
--     backend/src/db/migrations/0004_indicadores_sociais_capital_humano.sql
-- ============================================================================

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS taxa_alfabetizacao double precision;
