-- ============================================================================
-- MIGRATION: adiciona colunas da dimensão Moradia, Território Popular e
-- Barreiras Habitacionais à MMGD (Eixo 3: regime de ocupação; Eixo 5: cortiço)
-- ----------------------------------------------------------------------------
-- Rodar via:
--   docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < \
--     backend/src/db/migrations/0005_indicadores_sociais_moradia.sql
-- ============================================================================

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS percentual_domicilio_proprio double precision,
  ADD COLUMN IF NOT EXISTS percentual_domicilio_alugado double precision,
  ADD COLUMN IF NOT EXISTS percentual_domicilio_cedido double precision,
  ADD COLUMN IF NOT EXISTS percentual_cortico double precision;
