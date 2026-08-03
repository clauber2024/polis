-- Migration 0033: tarifa_energia_residencial_distribuidora
--
-- MOTIVACAO (01/08/2026): usuario pediu que o popup de hover do mapa mostre
-- qual distribuidora atende o municipio, alem do valor da tarifa - hoje o
-- banco so guarda o VALOR (tarifa_energia_residencial) e a flag de
-- aproximacao, nunca o nome de quem forneceu esse valor
-- (extrair_tarifa_distribuidoras.py calcula `distribuidora_unica`
-- internamente mas descartava antes do upsert).
--
-- Valor gravado e o codigo/sigla da distribuidora tal como registrado no
-- INDQUAL da ANEEL (sig_agente, ex.: "RGE", "EQUATORIAL GO", "COOPERSUL") -
-- nao um nome comercial "bonito" traduzido, porque nao existe um dicionario
-- de nomes legiveis confiavel pra todas as ~50 distribuidoras distintas do
-- pais (alguns codigos, como "EMR", so foram identificados manualmente
-- consultando o portal da propria ANEEL - ver docstring do extractor).
-- Mostrar o codigo bruto e honesto e rastreavel ate a fonte.

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS tarifa_energia_residencial_distribuidora varchar(80);

COMMENT ON COLUMN indicadores_sociais.tarifa_energia_residencial_distribuidora IS
  'Sigla da distribuidora (sig_agente do INDQUAL/ANEEL, ex.: "RGE", "COOPERSUL") cuja tarifa foi gravada em tarifa_energia_residencial - ver extrair_tarifa_distribuidoras.py para a metodologia de resolucao quando ha mais de uma distribuidora no municipio.';

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
    MAX(tarifa_energia_residencial) AS tarifa_energia_residencial,
    MAX(numero_contratos_reforma_casa_brasil_solar) AS numero_contratos_reforma_casa_brasil_solar,
    MAX(valor_liberado_reforma_casa_brasil_solar) AS valor_liberado_reforma_casa_brasil_solar,
    bool_or(tarifa_energia_residencial_aproximada) AS tarifa_energia_residencial_aproximada,
    -- Coluna nova sempre no FINAL da lista (ver comentário da migration 0032
    -- sobre CREATE OR REPLACE VIEW não aceitar coluna no meio).
    MAX(tarifa_energia_residencial_distribuidora) AS tarifa_energia_residencial_distribuidora
FROM indicadores_sociais
GROUP BY unidade_espacial_id;
