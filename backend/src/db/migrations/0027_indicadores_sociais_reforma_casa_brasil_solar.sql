-- Migration 0027: numero_contratos_reforma_casa_brasil_solar e
-- valor_liberado_reforma_casa_brasil_solar em indicadores_sociais
--
-- MOTIVACAO (sessao 17/07/2026): capitulo "Atlas das experiencias de MMGD
-- solar" (Instituto Polis, relatorio em elaboracao pelo usuario como
-- consultor) levanta a pergunta "quem tem acesso a tecnologia solar?" e cita
-- explicitamente o programa Reforma Casa Brasil (Caixa Economica
-- Federal/Ministerio das Cidades) como fonte a checar. O usuario forneceu um
-- extrato do sistema interno da Caixa (SIC) ja filtrado para a modalidade
-- SOLAR do programa, cobrindo 6 meses (nov/2025 a abr/2026): 3.253 contratos,
-- R$ 61.377.571,09 liberados, em 1.093 municipios.
--
-- FONTE NAO E PUBLICA/AUTOMATIZAVEL: diferente dos demais extractors deste
-- projeto (que baixam de uma URL publica), este dado veio de um PDF extraido
-- pontualmente do SIC da Caixa e fornecido manualmente pelo usuario. Nao ha
-- endpoint publico conhecido para reproduzir/atualizar esta carga - uma nova
-- atualizacao exige um novo extrato manual. Ver
-- backend/src/etl/loaders/extrair_reforma_casa_brasil_solar.py para a fonte
-- exata e o metodo de leitura.
--
-- GRANULARIDADE: agregado unico por municipio, somando os 6 meses e as duas
-- faixas de renda (FAIXA 1 e FAIXA 2, renda familiar bruta mensal ate
-- R$9.600) - mesma decisao de "snapshot mais recente, sem serie temporal" ja
-- usada em unidades_habitacionais_fgts/empreendimentos_ogu (migrations
-- 0009/0010). periodo_referencia = 2026-04-30 (fim do ultimo mes coberto).
--
-- valor_liberado (VR_LIBERADO na fonte) foi escolhido em vez de VF_TOTAL
-- (valor de financiamento contratado) por ser o valor efetivamente
-- desembolsado - mais proximo de "acesso real", nao so contratado.
--
-- Municipios sem contrato no periodo ficam com estas colunas NULL (nao
-- existiam no extrato) - NAO e o mesmo que "documentado como zero", e
-- ausencia de registro na fonte, mesmo tratamento ja dado a
-- unidades_habitacionais_fgts para municipios sem MCMV/FGTS.

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS numero_contratos_reforma_casa_brasil_solar integer,
  ADD COLUMN IF NOT EXISTS valor_liberado_reforma_casa_brasil_solar double precision;

COMMENT ON COLUMN indicadores_sociais.numero_contratos_reforma_casa_brasil_solar IS
  'Numero de contratos da modalidade SOLAR do programa Reforma Casa Brasil (Caixa/Ministerio das Cidades), somado nov/2025-abr/2026 (FAIXA 1 + FAIXA 2). Fonte: extrato pontual do SIC/Caixa, NAO publica/automatizavel - ver extrair_reforma_casa_brasil_solar.py. NULL = sem contrato registrado no periodo, nao e zero documentado.';
COMMENT ON COLUMN indicadores_sociais.valor_liberado_reforma_casa_brasil_solar IS
  'Valor efetivamente liberado (R$, VR_LIBERADO) dos contratos SOLAR do Reforma Casa Brasil, somado nov/2025-abr/2026. Mesma fonte/limitacoes de numero_contratos_reforma_casa_brasil_solar.';

-- Atualiza a view consolidada (migration 0014, ultima alteracao na 0018) para
-- expor as duas novas colunas - mesmo padrao MAX(...) ja usado.
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
    MAX(valor_liberado_reforma_casa_brasil_solar) AS valor_liberado_reforma_casa_brasil_solar
FROM indicadores_sociais
GROUP BY unidade_espacial_id;
