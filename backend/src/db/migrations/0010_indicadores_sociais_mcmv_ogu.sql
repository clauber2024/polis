-- MIGRATION: adiciona colunas MCMV/OGU (subsidiado)
ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS empreendimentos_ogu integer,
  ADD COLUMN IF NOT EXISTS unidades_ogu_previstas integer,
  ADD COLUMN IF NOT EXISTS unidades_ogu_entregues integer;
