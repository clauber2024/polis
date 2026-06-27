-- ============================================================================
-- MIGRATION: adiciona colunas da dimensão Infraestrutura Urbana
-- (índice próprio inspirado no IVS/IPEA, construído a partir do Censo 2022)
-- ----------------------------------------------------------------------------
-- Esta é uma migration incremental (ALTER TABLE), não uma recriação. Use esta
-- em bancos que JÁ TÊM a tabela indicadores_sociais criada (ex: o banco do
-- Atlas Solar Justo, que já está rodando com municipios/mmgd_indicadores
-- populados). Rodar via:
--   docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < \
--     backend/src/db/migrations/0002_indicadores_sociais_infraestrutura.sql
-- ============================================================================

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS percentual_populacao_rural double precision,
  ADD COLUMN IF NOT EXISTS percentual_agua_inadequada double precision,
  ADD COLUMN IF NOT EXISTS percentual_esgoto_inadequado double precision,
  ADD COLUMN IF NOT EXISTS percentual_lixo_inadequado double precision,
  ADD COLUMN IF NOT EXISTS densidade_populacional double precision;
