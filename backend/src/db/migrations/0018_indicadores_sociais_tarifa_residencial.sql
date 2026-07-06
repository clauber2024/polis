-- Migration 0018: tarifa_energia_residencial (TUSD+TE, R$/MWh, subgrupo B1,
-- Convencional, Tarifa de Aplicacao) - Dataset ANEEL "Tarifas de aplicacao
-- das distribuidoras de energia eletrica".
--
-- MOTIVACAO: sessao 06/07/2026, 5a hipotese testada para o caso Centro-Oeste
-- x Irradiacao Solar (ver ARQUITETURA.md, secao "Teste do mecanismo tarifa").
-- Achado: EQUATORIAL GO (Goias) teve a tarifa residencial mais baixa entre
-- EMS/EMT/EQUATORIAL GO em TODOS os anos de 2010 a 2024 - retorno financeiro
-- mais fraco de MMGD residencial e explicacao economica plausivel para a
-- adocao mais baixa em Goias. Esta coluna generaliza o teste para TODAS as
-- distribuidoras do Brasil, nao so as 3 do Centro-Oeste.
--
-- Resolvida por municipio via a mesma sig_agente ja carregada pelo INDQUAL
-- (qualidade_conjuntos/qualidade_conjunto_municipio) - municipios com
-- MULTIPLAS distribuidoras (area de concessao dividida) ficam NULL.
--
-- SENTIDO AMBIGUO: nao e indicador de vulnerabilidade como os demais desta
-- tabela - tarifa mais alta e ruim para o consumidor em geral, mas e o
-- incentivo esperado POSITIVO para adocao de MMGD. Nao inverter o valor
-- armazenado.

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS tarifa_energia_residencial double precision;

COMMENT ON COLUMN indicadores_sociais.tarifa_energia_residencial IS
  'Tarifa residencial (TUSD+TE, R$/MWh, subgrupo B1, Convencional, Tarifa de Aplicacao) vigente mais recente, resolvida por municipio via distribuidora (INDQUAL). NULL quando o municipio tem multiplas distribuidoras. Sentido ambiguo: incentivo economico para MMGD, nao vulnerabilidade.';

-- Atualiza a view consolidada (migration 0014) para expor a nova coluna -
-- mesmo padrao MAX(...) ja usado (seguro porque cada coluna so tem valor em
-- UM periodo_referencia por municipio, ver nota da migration 0014).
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
    MAX(percentual_apartamento) AS percentual_apartamento,
    MAX(renda_per_capita_rdpc) AS renda_per_capita_rdpc,
    MAX(percentual_baixa_renda_rdpc) AS percentual_baixa_renda_rdpc,
    MAX(tarifa_energia_residencial) AS tarifa_energia_residencial
FROM indicadores_sociais
GROUP BY unidade_espacial_id;
