-- ============================================================================
-- MIGRATION: amplia a coluna tipo em unidades_espaciais de VARCHAR(20) para
-- VARCHAR(40), necessário para acomodar o valor 'favela_comunidade_urbana'
-- (26 caracteres, maior que o limite original de 20).
-- ----------------------------------------------------------------------------
-- Rodar via:
--   docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < \
--     backend/src/db/migrations/0008_unidades_espaciais_tipo_varchar40.sql
-- ============================================================================

ALTER TABLE unidades_espaciais
  ALTER COLUMN tipo TYPE character varying(40);
