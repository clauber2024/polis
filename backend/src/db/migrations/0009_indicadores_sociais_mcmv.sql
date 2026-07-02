-- MIGRATION: adiciona coluna de MCMV/FGTS (Eixo 2 - HIS)
ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS unidades_habitacionais_fgts integer;
