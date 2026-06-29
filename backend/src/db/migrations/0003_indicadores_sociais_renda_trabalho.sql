-- ============================================================================
-- MIGRATION: adiciona coluna da dimensão Renda e Trabalho (RAIS)
-- ----------------------------------------------------------------------------
-- Rodar via:
--   docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < \
--     backend/src/db/migrations/0003_indicadores_sociais_renda_trabalho.sql
-- ============================================================================

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS percentual_vinculos_formais double precision;
