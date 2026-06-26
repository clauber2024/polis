-- ============================================================================
-- MIGRATION MANUAL: extensão PostGIS + índices espaciais (GiST)
-- ----------------------------------------------------------------------------
-- Executar SEMPRE DEPOIS da migration gerada automaticamente
-- (0000_colossal_invaders.sql), nunca antes.
-- ============================================================================

-- 1) Habilita a extensão PostGIS no banco.
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2) Índice espacial GiST na geometria dos municípios.
CREATE INDEX IF NOT EXISTS idx_municipios_geom
  ON municipios
  USING GIST (geom);

-- 3) Índice espacial GiST na geometria das unidades espaciais (setor
--    censitário, CEP, bairro, ou o próprio município espelhado aqui).
--    Tão importante quanto o índice de municipios, porque é AQUI que vão
--    morar as geometrias finas usadas no drill-down (RF-041 a RF-045).
CREATE INDEX IF NOT EXISTS idx_unidades_espaciais_geom
  ON unidades_espaciais
  USING GIST (geom);

-- 4) Índices auxiliares não-espaciais.
CREATE INDEX IF NOT EXISTS idx_municipios_uf
  ON municipios (uf);

CREATE INDEX IF NOT EXISTS idx_municipios_regiao
  ON municipios (regiao);

-- 5) Índice auxiliar para o drill-down: buscar rapidamente todas as unidades
--    espaciais de um tipo dentro de um município pai (RF-043: "Ver
--    detalhamento interno" -> lista as sub-regiões daquele município).
CREATE INDEX IF NOT EXISTS idx_unidades_espaciais_municipio_pai_tipo
  ON unidades_espaciais (municipio_pai_codigo_ibge, tipo);
