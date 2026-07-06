-- Migration 0016: percentual_apartamento (Tabela SIDRA 9928, classificacao 125
-- "Tipo de domicilio", categoria 3247 "Apartamento" sobre total 2932).
--
-- MOTIVACAO: a analise de correlacao MMGD x indicadores sociais (ver
-- backend/src/etl/analises/analisar_correlacao_mmgd_renda.py e
-- diagnosticar_outliers_regionais.py) encontrou dois casos em que nem renda
-- nem urbanizacao (percentual_populacao_rural) explicavam uma inversao de
-- sinal regional: Indice de Seguranca da Posse no Sul e Irradiacao Solar no
-- Centro-Oeste. Hipotese testada: tipologia habitacional (apartamento = sem
-- telhado proprio individual) e uma barreira fisica ao net metering
-- independente de renda/vulnerabilidade/rural-urbano, e pode explicar o que
-- sobrou. Esta coluna existe para testar essa hipotese, nao para confirma-la
-- de antemao.
--
-- NAO inclui "Casa de vila ou em condominio" (categoria 121264) - mantido
-- fora de proposito: e um tipo distinto de apartamento propriamente dito.

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS percentual_apartamento double precision;

COMMENT ON COLUMN indicadores_sociais.percentual_apartamento IS
  '% de domicilios do tipo Apartamento (categoria 3247 / total 2932, classificacao 125, Tabela SIDRA 9928, Censo 2022). Proxy de tipologia habitacional densa / sem telhado proprio individual.';

-- Atualiza a view consolidada (migration 0014) para expor a nova coluna -
-- mesmo padrao MAX(...) ja usado, seguro porque cada coluna so tem valor
-- em UM periodo_referencia por municipio (ver nota da migration 0014 sobre
-- a fragmentacao de indicadores_sociais por periodo).
CREATE OR REPLACE VIEW vw_indicadores_sociais_consolidado AS
SELECT
    unidade_espacial_id,
    MAX(ivs) AS ivs,
    MAX(renda_media_domiciliar) AS renda_media_domiciliar,
    MAX(percentual_cadunico) AS percentual_cadunico,
    MAX(percentual_pobreza_cadunico) AS percentual_pobreza_cadunico,
    MAX(percentual_tarifa_social) AS percentual_tarifa_social,
    MAX(percentual_populacao_rural) AS percentual_populacao_rural,
    MAX(percentual_agua_inadequada) AS percentual_agua_inadequada,
    MAX(percentual_esgoto_inadequado) AS percentual_esgoto_inadequado,
    MAX(percentual_lixo_inadequado) AS percentual_lixo_inadequado,
    MAX(densidade_populacional) AS densidade_populacional,
    MAX(percentual_vinculos_formais) AS percentual_vinculos_formais,
    MAX(taxa_alfabetizacao) AS taxa_alfabetizacao,
    MAX(percentual_domicilio_proprio) AS percentual_domicilio_proprio,
    MAX(percentual_domicilio_alugado) AS percentual_domicilio_alugado,
    MAX(percentual_domicilio_cedido) AS percentual_domicilio_cedido,
    MAX(percentual_cortico) AS percentual_cortico,
    MAX(percentual_parede_inadequada) AS percentual_parede_inadequada,
    MAX(percentual_populacao_favela) AS percentual_populacao_favela,
    MAX(numero_favelas_comunidades) AS numero_favelas_comunidades,
    MAX(unidades_habitacionais_fgts) AS unidades_habitacionais_fgts,
    MAX(empreendimentos_ogu) AS empreendimentos_ogu,
    MAX(unidades_ogu_previstas) AS unidades_ogu_previstas,
    MAX(unidades_ogu_entregues) AS unidades_ogu_entregues,
    MAX(taxa_mortalidade_infantil) AS taxa_mortalidade_infantil,
    MAX(percentual_apartamento) AS percentual_apartamento
FROM indicadores_sociais
GROUP BY unidade_espacial_id;
