-- ============================================================================
-- MIGRATION: adiciona coluna da dimensão Moradia - Eixo 4
-- (inadequação habitacional, baseada em material das paredes externas)
-- ----------------------------------------------------------------------------
-- Rodar via:
--   docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < \
--     backend/src/db/migrations/0006_indicadores_sociais_inadequacao_habitacional.sql
-- ============================================================================

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS percentual_parede_inadequada double precision;
