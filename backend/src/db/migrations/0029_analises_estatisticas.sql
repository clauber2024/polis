-- Migration 0029: tabela analises_estatisticas
--
-- MOTIVACAO (sessao 18/07/2026): primeira peca de "infraestrutura estatistica
-- integrada" do Atlas - proposta feita em cima da Secao 2.2 de
-- docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md ("ausencia de infraestrutura
-- estatistica no backend hoje") e da Recomendacao Priorizada #3 do mesmo
-- relatorio ("testar formalmente o modelo controlado de MMGD residencial
-- per capita sobre indice_precariedade_moradia, controlando irradiacao e
-- renda"). Decisao de escopo (usuario, ver docs/DECISOES.md, ADR
-- "Infraestrutura estatistica integrada"): motor FIXO, materializado via
-- ETL - nao um microsservico Python sob demanda nem uma reimplementacao em
-- TypeScript. Mesmo padrao ja usado pelo produto "ranking publico de
-- distribuidoras" (migration 0026): um script Python roda a analise ja
-- validada (metodologia de correlacao parcial de Spearman por residuo de
-- postos, mesmo algoritmo de
-- backend/src/etl/analises/analisar_correlacao_mmgd_renda.py) e grava o
-- resultado aqui; o backend Node/Express so le e serve via API.
--
-- Ate esta migration, esse tipo de resultado so existia como saida de
-- terminal de scripts exploratorios SOMENTE LEITURA em
-- backend/src/etl/analises/ - nunca persistido, nunca servido via API.
--
-- Granularidade: uma linha por par (variavel_x, variavel_y) testado - hoje
-- so 2 linhas (indice_precariedade_moradia e indice_seguranca_posse, ambas
-- contra mmgd_potencia_residencial_per_1000_hab), ver
-- backend/src/etl/loaders/calcular_analise_estatistica_moradia_mmgd.py para
-- a metodologia completa. variavel_y e variaveis_controle sao colunas
-- explicitas (nao fixas em codigo) para nao exigir nova migration se um Y
-- ou conjunto de controles novo entrar no futuro - so um novo INSERT.

CREATE TABLE IF NOT EXISTS analises_estatisticas (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  variavel_x varchar(80) NOT NULL,
  rotulo_variavel_x varchar(200) NOT NULL,
  sentido_esperado varchar(20) NOT NULL,

  variavel_y varchar(80) NOT NULL,
  variaveis_controle text[] NOT NULL,

  metodo varchar(60) NOT NULL,

  n integer NOT NULL,
  rho_bruto double precision,
  p_valor_bruto double precision,
  rho_parcial double precision,
  p_valor_parcial double precision,

  n_regioes_testadas integer,
  n_regioes_mesmo_sinal integer,
  veredito_robustez varchar(80),

  calculado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT analises_estatisticas_par_unico UNIQUE (variavel_x, variavel_y)
);

COMMENT ON TABLE analises_estatisticas IS
  'Resultados materializados de analises estatisticas (correlacao parcial de Spearman por residuo de postos) que respondem hipoteses especificas ja formuladas no projeto - hoje, a Recomendacao #3 de docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md. NAO e um motor generico de correlacao/regressao sob demanda - decisao documentada em docs/DECISOES.md, ADR "Infraestrutura estatistica integrada". Ver backend/src/etl/loaders/calcular_analise_estatistica_moradia_mmgd.py para a metodologia completa.';
COMMENT ON COLUMN analises_estatisticas.variaveis_controle IS
  'Nomes das colunas usadas como controle na correlacao parcial (ex.: {renda_media_domiciliar,irradiacao_media_kwh_m2_dia}). Controlar por mais de uma variavel ao mesmo tempo (conjunto), nao uma de cada vez separadamente.';
COMMENT ON COLUMN analises_estatisticas.rho_parcial IS
  'Correlacao parcial de Spearman entre variavel_x e variavel_y, controlando simultaneamente por todas as variaveis_controle. NULL quando a amostra (apos remover linhas com dado faltante) ficou abaixo do minimo confiavel - nunca deve ser lido como zero.';
COMMENT ON COLUMN analises_estatisticas.veredito_robustez IS
  'Leitura qualitativa de n_regioes_mesmo_sinal/n_regioes_testadas (ex.: "robusto - mesmo sinal em 5/5 regioes"). Correlacao (mesmo parcial) NUNCA estabelece causalidade - ver nota metodologica exposta junto com qualquer leitura desta tabela via API.';
