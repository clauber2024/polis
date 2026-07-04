-- Migration 0014: indices compostos de Moradia e Infraestrutura Urbana
-- (metodologia inspirada no IVS/IPEA: normalizacao min-max + media simples)
--
-- ACHADO ARQUITETURAL IMPORTANTE (sessao 04/07/2026): a chave unica
-- (unidade_espacial_id, periodo_referencia) de indicadores_sociais fragmentou
-- os dados de um mesmo municipio em ate 4 linhas diferentes (uma por extractor/
-- data de execucao: 2022-01-01, 2024-01-01, 2025-12-01, 2025-12-31), cada uma
-- preenchida so parcialmente. Por isso, a vw_indicadores_sociais_consolidado
-- abaixo agrega por municipio pegando o valor nao-nulo de cada coluna (MAX
-- funciona aqui porque cada coluna so tem valor em UM periodo por municipio -
-- nao ha serie temporal real intencional, apenas fragmentacao de carga).

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
    MAX(taxa_mortalidade_infantil) AS taxa_mortalidade_infantil
FROM indicadores_sociais
GROUP BY unidade_espacial_id;

-- View de indices compostos: normalizacao min-max (0=melhor, 1=pior, exceto
-- onde indicado o contrario) calculada sobre a distribuicao NACIONAL atual
-- (MIN/MAX como window function sobre toda a base consolidada).
--
-- INDICE DE PRECARIEDADE DE INFRAESTRUTURA (negativo, 0 a 1):
--   media da normalizacao min-max de agua/esgoto/lixo inadequados.
--   Exclui percentual_populacao_rural e densidade_populacional (caracteristicas
--   demograficas, nao sao "boas ou ruins" por si so).
--
-- INDICE DE PRECARIEDADE HABITACIONAL (negativo, 0 a 1):
--   media da normalizacao min-max de cortico/parede inadequada/populacao favela.
--   Exclui regime de posse (conceito diferente, ver indice de seguranca da posse
--   abaixo) e contagens absolutas/investimento (numero_favelas_comunidades,
--   unidades MCMV/OGU - viesadas por tamanho ou medem intervencao, nao vulnerabilidade).
--
-- INDICE DE SEGURANCA DA POSSE (positivo, 0 a 100):
--   1,0 x %proprio + 0,5 x %alugado + 0,0 x %cedido - pesos refletem seguranca
--   de posse decrescente (proprio = maxima seguranca; alugado = protegido por
--   contrato mas sem propriedade; cedido = tipicamente informal/precario).
--   CORRIGIDO (sessao 04/07/2026): retorna NULL (nao 0) quando os 3 campos de
--   origem sao nulos - 3 municipios nao tem nenhum dado de regime de posse;
--   sem essa guarda apareceriam com "seguranca zero" (pior caso), quando na
--   verdade e ausencia de dado, nao um valor medido.
--
-- COBERTURA DE INVESTIMENTO PUBLICO HABITACIONAL (positivo, unidades por 1.000 hab):
--   (unidades FGTS + unidades OGU entregues) / populacao x 1000. Populacao
--   reconstituida via densidade_populacional x area_km2 (mesmo metodo ja usado
--   no extractor de Renda e Trabalho/RAIS, ja que nao armazenamos populacao
--   absoluta diretamente).

CREATE OR REPLACE VIEW vw_indices_compostos_moradia_infraestrutura AS
WITH base AS (
    SELECT
        vsc.*,
        ue.municipio_pai_codigo_ibge AS codigo_ibge,
        m.area_km2,
        vsc.densidade_populacional * m.area_km2 AS populacao_estimada
    FROM vw_indicadores_sociais_consolidado vsc
    JOIN unidades_espaciais ue ON ue.id = vsc.unidade_espacial_id AND ue.tipo = 'municipio'
    JOIN municipios m ON m.codigo_ibge = ue.municipio_pai_codigo_ibge
),
normalizado AS (
    SELECT
        *,
        CASE WHEN MAX(percentual_agua_inadequada) OVER () = MIN(percentual_agua_inadequada) OVER ()
             THEN 0
             ELSE (percentual_agua_inadequada - MIN(percentual_agua_inadequada) OVER ())
                  / (MAX(percentual_agua_inadequada) OVER () - MIN(percentual_agua_inadequada) OVER ())
        END AS agua_norm,
        CASE WHEN MAX(percentual_esgoto_inadequado) OVER () = MIN(percentual_esgoto_inadequado) OVER ()
             THEN 0
             ELSE (percentual_esgoto_inadequado - MIN(percentual_esgoto_inadequado) OVER ())
                  / (MAX(percentual_esgoto_inadequado) OVER () - MIN(percentual_esgoto_inadequado) OVER ())
        END AS esgoto_norm,
        CASE WHEN MAX(percentual_lixo_inadequado) OVER () = MIN(percentual_lixo_inadequado) OVER ()
             THEN 0
             ELSE (percentual_lixo_inadequado - MIN(percentual_lixo_inadequado) OVER ())
                  / (MAX(percentual_lixo_inadequado) OVER () - MIN(percentual_lixo_inadequado) OVER ())
        END AS lixo_norm,
        CASE WHEN MAX(percentual_cortico) OVER () = MIN(percentual_cortico) OVER ()
             THEN 0
             ELSE (percentual_cortico - MIN(percentual_cortico) OVER ())
                  / (MAX(percentual_cortico) OVER () - MIN(percentual_cortico) OVER ())
        END AS cortico_norm,
        CASE WHEN MAX(percentual_parede_inadequada) OVER () = MIN(percentual_parede_inadequada) OVER ()
             THEN 0
             ELSE (percentual_parede_inadequada - MIN(percentual_parede_inadequada) OVER ())
                  / (MAX(percentual_parede_inadequada) OVER () - MIN(percentual_parede_inadequada) OVER ())
        END AS parede_norm,
        CASE WHEN MAX(percentual_populacao_favela) OVER () = MIN(percentual_populacao_favela) OVER ()
             THEN 0
             ELSE (percentual_populacao_favela - MIN(percentual_populacao_favela) OVER ())
                  / (MAX(percentual_populacao_favela) OVER () - MIN(percentual_populacao_favela) OVER ())
        END AS favela_norm
    FROM base
)
SELECT
    codigo_ibge,
    (COALESCE(agua_norm, 0) + COALESCE(esgoto_norm, 0) + COALESCE(lixo_norm, 0))
        / NULLIF((agua_norm IS NOT NULL)::int + (esgoto_norm IS NOT NULL)::int + (lixo_norm IS NOT NULL)::int, 0)
        AS indice_precariedade_infraestrutura,
    (COALESCE(cortico_norm, 0) + COALESCE(parede_norm, 0) + COALESCE(favela_norm, 0))
        / NULLIF((cortico_norm IS NOT NULL)::int + (parede_norm IS NOT NULL)::int + (favela_norm IS NOT NULL)::int, 0)
        AS indice_precariedade_moradia,
    CASE WHEN percentual_domicilio_proprio IS NULL AND percentual_domicilio_alugado IS NULL AND percentual_domicilio_cedido IS NULL
         THEN NULL
         ELSE (1.0 * COALESCE(percentual_domicilio_proprio, 0)
               + 0.5 * COALESCE(percentual_domicilio_alugado, 0)
               + 0.0 * COALESCE(percentual_domicilio_cedido, 0))
    END AS indice_seguranca_posse,
    CASE WHEN populacao_estimada > 0
         THEN (COALESCE(unidades_habitacionais_fgts, 0) + COALESCE(unidades_ogu_entregues, 0))
              / populacao_estimada * 1000
         ELSE NULL
    END AS cobertura_investimento_habitacional
FROM normalizado;
