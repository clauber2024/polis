-- Migration 0017: RDPC (Rendimento Domiciliar Per Capita), Tabelas SIDRA
-- 10295 e 10296, Censo 2022.
--
-- MOTIVACAO: achado colateral da investigacao de "onus excessivo com
-- aluguel" (sessao 06/07/2026, ver ARQUITETURA.md secao "Decisoes de
-- fontes"). O indicador de aluguel em si foi descartado (Censo 2022 nao
-- coletou valor de aluguel; PNAD/POF sem granularidade municipal; CECAD tem
-- o dado mas acesso restrito por perfil) - mas essa investigacao encontrou
-- que o RDPC e uma melhoria real e viavel para a dimensao Renda e Trabalho,
-- independente da questao do aluguel: e renda de TODAS as fontes (trabalho
-- formal e informal, aposentadoria, beneficios, aluguel recebido etc.), mais
-- completa que `renda_media_domiciliar` atual (RAIS, so trabalho formal).
--
-- Metadados confirmados via API real (nao via documentacao/busca - mesmo
-- cuidado ja registrado para os casos TSEE e percentual_apartamento):
--   Tabela 10295, variavel 13431 (valor medio, R$), classificacoes Sexo (2),
--     Cor ou raca (86), Grupo de idade (58) fixadas em "Total" (6794/95251/95253).
--   Tabela 10296, variavel 1013604 (percentual do total geral, %),
--     classificacao 386 (Classes de rendimento), categorias 9681 ("Ate 1/4
--     de salario minimo") + 9682 ("Mais de 1/4 a 1/2 salario minimo") somadas
--     = % de moradores com RDPC ate 1/2 salario minimo.
-- Ambas tabelas confirmadas nivel municipal (N6) e periodo unico 2022.

ALTER TABLE indicadores_sociais
  ADD COLUMN IF NOT EXISTS renda_per_capita_rdpc double precision,
  ADD COLUMN IF NOT EXISTS percentual_baixa_renda_rdpc double precision;

COMMENT ON COLUMN indicadores_sociais.renda_per_capita_rdpc IS
  'RDPC medio mensal (R$), variavel 13431 da Tabela SIDRA 10295, Censo 2022 - renda de todas as fontes, nao so trabalho formal.';

COMMENT ON COLUMN indicadores_sociais.percentual_baixa_renda_rdpc IS
  '% de moradores com RDPC ate 1/2 salario minimo (categorias 9681+9682, classificacao 386, Tabela SIDRA 10296, Censo 2022).';

-- Atualiza a view consolidada (migration 0014) para expor as novas colunas -
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
    MAX(percentual_baixa_renda_rdpc) AS percentual_baixa_renda_rdpc
FROM indicadores_sociais
GROUP BY unidade_espacial_id;
