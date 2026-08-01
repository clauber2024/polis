-- Migration 0032: tarifa_energia_residencial_aproximada
--
-- MOTIVACAO (31/07/2026): usuario apontou, navegando o mapa, um agrupamento
-- de municipios na microrregiao de Ceres/Sao Patricio (GO) sem tarifa
-- gravada - investigado e CONFIRMADO como caso legitimo de area de
-- concessao dividida (CHESP, cooperativa rural real e ativa, + EQUATORIAL
-- GO), nao um bug de cadastro como os corrigidos antes (RGE/CPFL/EDEVP).
-- Reacao do usuario: "mas nao pode existir municipios sem tarifa" - decisao
-- (usuario, entre 3 alternativas apresentadas): quando um municipio tem
-- multiplas distribuidoras mas EXATAMENTE UMA delas e uma concessionaria
-- grande conhecida (lista curada em extrair_tarifa_distribuidoras.py,
-- GRANDES_CONCESSIONARIAS_CONHECIDAS), usa a tarifa dela como aproximacao
-- em vez de deixar NULL - e marca explicitamente como aproximada.
--
-- Este e um valor APROXIMADO por design (ignora a(s) cooperativa(s) menor(es)
-- que tambem atendem o municipio) - por isso a flag, para o frontend nunca
-- exibir como se fosse tarifa exata de distribuidora unica. Quando NENHUMA
-- ou MAIS DE UMA das distribuidoras do municipio esta na lista de grandes
-- concessionarias conhecidas (ex.: Enel RJ + Light SESA, ambas grandes),
-- o municipio continua SEM tarifa - nao ha base para escolher uma sobre a
-- outra.

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS tarifa_energia_residencial_aproximada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN indicadores_sociais.tarifa_energia_residencial_aproximada IS
  'true quando tarifa_energia_residencial veio da distribuidora principal conhecida de um municipio com area de concessao dividida (ignora cooperativa(s) menor(es) que tambem atendem o municipio) - ver GRANDES_CONCESSIONARIAS_CONHECIDAS em extrair_tarifa_distribuidoras.py. false para os demais casos (distribuidora unica sem ambiguidade, ou municipio sem tarifa nenhuma).';

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
    -- Coluna nova precisa ficar no FINAL da lista: CREATE OR REPLACE VIEW no
    -- Postgres não aceita inserir coluna no meio (desloca a posição das
    -- colunas seguintes, que o Postgres trata como tentativa de renomear —
    -- erro real encontrado ao aplicar esta migration em produção, 01/08/2026).
    bool_or(tarifa_energia_residencial_aproximada) AS tarifa_energia_residencial_aproximada
FROM indicadores_sociais
GROUP BY unidade_espacial_id;
