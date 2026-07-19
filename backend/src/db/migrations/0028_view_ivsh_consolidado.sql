-- Migration 0028: IVSH — Índice de Vulnerabilidade Socio-Habitacional-Energética
--
-- MOTIVAÇÃO (auditoria de 18/07/2026, ver docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md,
-- secoes 2.5 e 3.3): o IVS geral (vw_ivs_consolidado, migration 0015) EXCLUI moradia
-- de proposito, para nao diluir a hipotese "MMGD x moradia" com endogeneidade. Essa
-- decisao continua correta para quem quer TESTAR a hipotese, mas deixa uma lacuna de
-- priorizacao: nao existe hoje uma view que combine vulnerabilidade geral (IVS) com
-- precariedade habitacional para uso direto em ranking.
--
-- Consultas analiticas rodadas nesta mesma sessao confirmaram que precariedade
-- habitacional e a classificacao de Vazio de Acesso (irradiacao x MMGD residencial
-- per capita) sao dimensoes PARCIALMENTE INDEPENDENTES: municipios com contrato
-- Reforma Casa Brasil Solar tem indice_precariedade_moradia ~51 a 70% maior que os
-- sem contrato, mas isso nao se traduz em maior presenca no quadrante Vazio de
-- Acesso (que e sobre potencial solar desperdicado, nao sobre moradia). Ou seja,
-- um indicador que so olha IVS (sem moradia) ou so vazio de acesso (sem moradia)
-- deixa passar parte real da vulnerabilidade territorial.
--
-- Esta view NAO substitui vw_ivs_consolidado nem vw_indices_compostos_moradia_
-- infraestrutura -- ambas continuam existindo intocadas, para quem precisar
-- testar cada dimensao isoladamente (mesmo motivo pelo qual a migration 0015
-- manteve moradia fora do IVS). O IVSH e uma TERCEIRA view, de uso exclusivo
-- para PRIORIZACAO (ex: RF-056, ordenarPor=ivsh em GET /api/vazios-de-acesso),
-- que funde as duas:
--
--   IVSH = media( ivs_calculado,
--                 indice_precariedade_moradia,
--                 indice_inseguranca_posse )
--
-- indice_inseguranca_posse = 1 - (indice_seguranca_posse / 100), para que os 3
-- componentes fiquem na mesma direcao (0 = melhor, 1 = pior) antes da media --
-- indice_seguranca_posse (migration 0014) e POSITIVO (0 a 100, maior = melhor),
-- diferente dos outros dois.
--
-- Mesma regra de nulos ja usada nas migrations 0014/0015: media dos componentes
-- REALMENTE disponiveis (COALESCE + NULLIF da contagem), nunca trata ausencia de
-- dado como "melhor caso" (zero).

CREATE OR REPLACE VIEW vw_ivsh_consolidado AS
WITH moradia AS (
    SELECT
        codigo_ibge,
        indice_precariedade_moradia,
        indice_seguranca_posse,
        CASE WHEN indice_seguranca_posse IS NULL
             THEN NULL
             ELSE 1.0 - (indice_seguranca_posse / 100.0)
        END AS indice_inseguranca_posse
    FROM vw_indices_compostos_moradia_infraestrutura
),
ivs AS (
    SELECT
        ue.municipio_pai_codigo_ibge AS codigo_ibge,
        v.ivs_calculado
    FROM vw_ivs_consolidado v
    JOIN unidades_espaciais ue ON ue.id = v.unidade_espacial_id AND ue.tipo = 'municipio'
)
SELECT
    m.codigo_ibge,
    ivs.ivs_calculado,
    moradia.indice_precariedade_moradia,
    moradia.indice_inseguranca_posse,
    (
        COALESCE(ivs.ivs_calculado, 0)
        + COALESCE(moradia.indice_precariedade_moradia, 0)
        + COALESCE(moradia.indice_inseguranca_posse, 0)
    ) / NULLIF(
        (ivs.ivs_calculado IS NOT NULL)::int
        + (moradia.indice_precariedade_moradia IS NOT NULL)::int
        + (moradia.indice_inseguranca_posse IS NOT NULL)::int,
        0
    ) AS ivsh
FROM municipios m
LEFT JOIN ivs ON ivs.codigo_ibge = m.codigo_ibge
LEFT JOIN moradia ON moradia.codigo_ibge = m.codigo_ibge;
