-- Migration 0030: tabela indicadores_energia_nacional
--
-- MOTIVACAO (sessao 21/07/2026): RF-005 (Landing Page) lista "participacao da
-- solar distribuida na matriz eletrica nacional" em indicadoresIndisponiveis,
-- citando so um numero estatico da EPE (7,0% em 2025) direto no codigo do
-- frontend. Usuario pediu para integrar essa fonte de verdade e passar a
-- tirar snapshots periodicos. Ver docs/DECISOES.md, ADR "Integracao da
-- participacao da MMGD na matriz eletrica nacional (EPE/PDGD)", para as
-- alternativas consideradas e por que a captacao continua manual (PDGD e uma
-- app Shiny sem API/URL de download estavel; BEN nao tem API REST).
--
-- Granularidade: NACIONAL por ano (periodo_referencia), nao municipal - por
-- isso NAO referencia unidades_espaciais, diferente de todo o resto do
-- schema (Secao 5 do CLAUDE.md). Forcar um valor escalar unico do pais no
-- padrao espacial do restante do banco seria over-engineering.
--
-- Duas fontes distintas alimentam colunas distintas da MESMA linha (mesmo
-- periodo_referencia), em momentos diferentes:
--   - geracao_eletrica_nacional_gwh: BEN (Balanco Energetico Nacional),
--     Anexo X "Unidades Comerciais", grupo='Total Transformacao',
--     fonte='Eletricidade - GWh' - geracao eletrica bruta total do Brasil
--     (publica + autoprodutores), TODAS as fontes de energia somadas. NAO e
--     "Oferta Interna Bruta" nem "Consumo Final" (linhas diferentes da mesma
--     tabela, ja inspecionadas e descartadas - ver conversa desta sessao).
--   - geracao_mmgd_gwh / percentual_consumo_cativo_atendido_mmgd: PDGD
--     (Painel de Dados de MMGD da EPE), aba "Geracao de Eletricidade' - AINDA
--     NAO CARREGADO nesta migration (extractor pendente, arquivo do PDGD
--     ainda nao obtido do usuario) - colunas ja criadas para nao exigir nova
--     migration quando o extractor de MMGD for escrito, mesmo padrao ja
--     usado em analises_estatisticas (migration 0029).
--
-- IMPORTANTE: percentual_consumo_cativo_atendido_mmgd NAO e a mesma metrica
-- que "participacao na geracao nacional" (que se calcula, no backend, como
-- geracao_mmgd_gwh / geracao_eletrica_nacional_gwh) - o PDGD documenta essa
-- metrica como "% do consumo dos consumidores cativos atendido por MMGD"
-- (denominador = consumo medido SAMP/ANEEL + geracao autoconsumida de MMGD,
-- ou seja, demanda, nao oferta). Guardar as duas, sempre rotuladas
-- corretamente, decisao explicita do usuario (mesmo principio ja usado na
-- correcao de rotulo do RF-005/numero_ucs_com_mmgd).

CREATE TABLE IF NOT EXISTS indicadores_energia_nacional (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  periodo_referencia date NOT NULL,

  geracao_eletrica_nacional_gwh double precision,
  fonte_geracao_nacional varchar(300),

  geracao_mmgd_gwh double precision,
  percentual_consumo_cativo_atendido_mmgd double precision,
  fonte_mmgd varchar(300),

  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT indicadores_energia_nacional_periodo_unico UNIQUE (periodo_referencia)
);

COMMENT ON TABLE indicadores_energia_nacional IS
  'Serie NACIONAL (nao municipal) por ano de geracao eletrica total do Brasil (EPE/BEN) e geracao/participacao de MMGD (EPE/PDGD). Ver docs/DECISOES.md, ADR "Integracao da participacao da MMGD na matriz eletrica nacional (EPE/PDGD)". Captacao manual (nenhuma das duas fontes tem API/URL de download estavel) - snapshot repetivel sob demanda, nao agendado.';
COMMENT ON COLUMN indicadores_energia_nacional.geracao_eletrica_nacional_gwh IS
  'Geracao eletrica bruta total do Brasil em GWh (publica + autoprodutores, todas as fontes). BEN, Anexo X, grupo=Total Transformacao, fonte=Eletricidade - GWh.';
COMMENT ON COLUMN indicadores_energia_nacional.geracao_mmgd_gwh IS
  'Geracao estimada de MMGD em GWh (estimativa da EPE, nao medida pelas distribuidoras - ver PDGD, aba Geracao de Eletricidade). NULL ate o extractor de MMGD ser executado.';
COMMENT ON COLUMN indicadores_energia_nacional.percentual_consumo_cativo_atendido_mmgd IS
  'Percentual do CONSUMO dos consumidores cativos atendido por MMGD (demanda) - NAO e o mesmo que participacao na geracao nacional (oferta, calculada como geracao_mmgd_gwh/geracao_eletrica_nacional_gwh). Denominador = consumo medido SAMP/ANEEL + geracao autoconsumida de MMGD. Metrica ja calculada pela EPE, PDGD aba Geracao de Eletricidade.';
