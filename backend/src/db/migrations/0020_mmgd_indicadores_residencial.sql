-- Migration 0020: potencia_residencial_kw e numero_ucs_residencial em mmgd_indicadores
--
-- MOTIVACAO (sessao 07/07/2026, construcao do primeiro endpoint do backend
-- Node/Express - RF-055/056/057, "Vazios de Acesso"): a metodologia ja
-- validada em ARQUITETURA.md ("Identificacao e ranking de Vazios de Acesso",
-- item 3 da fila de trabalho) usa MMGD RESIDENCIAL per capita como eixo Y
-- (nao o total, que mistura agronegocio/irrigacao - ver mesma secao e
-- "Analise de correlacao MMGD x Indicadores Sociais"). Ate esta migration,
-- essa quebra por classe de consumo so existia em memoria, dentro dos
-- scripts de analise Python (analisar_correlacao_mmgd_renda.py,
-- carregar_classe_consumo_mmgd), lida direto do Parquet bruto da ANEEL
-- (backend/src/etl/data/raw/aneel_mmgd/*.parquet - nao versionado) a cada
-- execucao. `mmgd_indicadores` (tabela que o backend Node vai consultar)
-- so guardava o TOTAL agregado.
--
-- Isso e um bloqueio real para reimplementar a classificacao de "Vazio de
-- Acesso" no backend: o Node nao tem motivo/ferramental para ler Parquet
-- bruto (isso e responsabilidade do ETL Python, nao da API) e o dado nao
-- versionado nao pode ser dependencia de um endpoint de producao. Decisao
-- (usuario, sessao 07/07/2026): expandir o escopo do extractor canonico
-- (extrair_mmgd_aneel.py) para persistir a quebra RESIDENCIAL no banco, em
-- vez do endpoint usar MMGD TOTAL com nota de divergencia. Ver
-- extrair_mmgd_aneel.py para a logica de classificacao (reaproveita a mesma
-- regra ja validada em carregar_classe_consumo_mmgd, incluindo o tratamento
-- do valor espurio 'REBR'/'RE' em DscClasseConsumo).
--
-- Rural/Outras/Nao_classificado NAO foram trazidos para o banco nesta
-- migration - fora do escopo aprovado (so "MMGD residencial"). Se algum
-- RF futuro precisar da quebra completa, adicionar em migration propria,
-- reaproveitando a mesma leitura do Parquet (ver TODO no extractor).

ALTER TABLE mmgd_indicadores
  ADD COLUMN IF NOT EXISTS potencia_residencial_kw double precision,
  ADD COLUMN IF NOT EXISTS numero_ucs_residencial integer;

COMMENT ON COLUMN mmgd_indicadores.potencia_residencial_kw IS
  'Potencia instalada (kW) somada apenas dos empreendimentos com DscClasseConsumo = ''Residencial'' (ANEEL). Subconjunto de potencia_instalada_kw (TOTAL, todas as classes). NULL para snapshots carregados antes da migration 0020 (extrator precisa rodar novamente).';
COMMENT ON COLUMN mmgd_indicadores.numero_ucs_residencial IS
  'Numero de UCs com MMGD (QtdUCRecebeCredito somado) apenas da classe Residencial. Subconjunto de numero_ucs_com_mmgd (TOTAL). NULL para snapshots carregados antes da migration 0020.';
