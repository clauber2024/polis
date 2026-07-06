-- ============================================================================
-- MIGRATION 0015: cria view vw_ivs_consolidado + popula coluna indicadores_sociais.ivs
-- ----------------------------------------------------------------------------
-- Indice proprio inspirado no IVS/IPEA (NAO e o IVS oficial), composto pela
-- media de 3 blocos oficiais do IVS: Infraestrutura Urbana, Renda e Trabalho,
-- Capital Humano. Cada bloco = media de indicadores normalizados (min-max,
-- mesma metodologia da migration 0014). IVS = media dos 3 blocos.
--
-- Moradia (seguranca da posse, cortico, favela) FICA FORA deste IVS de
-- proposito -- e o eixo separado calculado na migration 0014
-- (vw_indices_compostos_moradia_infraestrutura), mantido a parte para
-- permitir testar a hipotese "MMGD x Seguranca da Posse" isoladamente,
-- sem diluir no IVS geral.
--
-- Densidade populacional foi EXCLUIDA do bloco Infraestrutura Urbana pelo
-- mesmo motivo ja documentado na migration 0014 para o indice de
-- precariedade de infraestrutura: ambiguidade de sinal (baixa E alta
-- densidade podem ambas indicar vulnerabilidade, por motivos opostos).
--
-- Usa vw_indicadores_sociais_consolidado (migration 0014) como fonte, que ja
-- resolve a fragmentacao de indicadores_sociais por periodo_referencia.
-- ============================================================================

DROP VIEW IF EXISTS vw_ivs_consolidado;

CREATE VIEW vw_ivs_consolidado AS
WITH normalizado AS (
    SELECT
        *,
        CASE WHEN max(percentual_populacao_rural) OVER () = min(percentual_populacao_rural) OVER ()
             THEN 0::double precision
             ELSE (percentual_populacao_rural - min(percentual_populacao_rural) OVER ())
                  / (max(percentual_populacao_rural) OVER () - min(percentual_populacao_rural) OVER ())
        END AS rural_norm,
        CASE WHEN max(percentual_agua_inadequada) OVER () = min(percentual_agua_inadequada) OVER ()
             THEN 0::double precision
             ELSE (percentual_agua_inadequada - min(percentual_agua_inadequada) OVER ())
                  / (max(percentual_agua_inadequada) OVER () - min(percentual_agua_inadequada) OVER ())
        END AS agua_norm,
        CASE WHEN max(percentual_esgoto_inadequado) OVER () = min(percentual_esgoto_inadequado) OVER ()
             THEN 0::double precision
             ELSE (percentual_esgoto_inadequado - min(percentual_esgoto_inadequado) OVER ())
                  / (max(percentual_esgoto_inadequado) OVER () - min(percentual_esgoto_inadequado) OVER ())
        END AS esgoto_norm,
        CASE WHEN max(percentual_lixo_inadequado) OVER () = min(percentual_lixo_inadequado) OVER ()
             THEN 0::double precision
             ELSE (percentual_lixo_inadequado - min(percentual_lixo_inadequado) OVER ())
                  / (max(percentual_lixo_inadequado) OVER () - min(percentual_lixo_inadequado) OVER ())
        END AS lixo_norm,
        CASE WHEN max(renda_media_domiciliar) OVER () = min(renda_media_domiciliar) OVER ()
             THEN 0::double precision
             ELSE (max(renda_media_domiciliar) OVER () - renda_media_domiciliar)
                  / (max(renda_media_domiciliar) OVER () - min(renda_media_domiciliar) OVER ())
        END AS renda_norm_inv,
        CASE WHEN max(percentual_vinculos_formais) OVER () = min(percentual_vinculos_formais) OVER ()
             THEN 0::double precision
             ELSE (max(percentual_vinculos_formais) OVER () - percentual_vinculos_formais)
                  / (max(percentual_vinculos_formais) OVER () - min(percentual_vinculos_formais) OVER ())
        END AS vinculos_norm_inv,
        CASE WHEN max(taxa_alfabetizacao) OVER () = min(taxa_alfabetizacao) OVER ()
             THEN 0::double precision
             ELSE (max(taxa_alfabetizacao) OVER () - taxa_alfabetizacao)
                  / (max(taxa_alfabetizacao) OVER () - min(taxa_alfabetizacao) OVER ())
        END AS alfabetizacao_norm_inv,
        CASE WHEN max(taxa_mortalidade_infantil) OVER () = min(taxa_mortalidade_infantil) OVER ()
             THEN 0::double precision
             ELSE (taxa_mortalidade_infantil - min(taxa_mortalidade_infantil) OVER ())
                  / (max(taxa_mortalidade_infantil) OVER () - min(taxa_mortalidade_infantil) OVER ())
        END AS mortalidade_norm
    FROM vw_indicadores_sociais_consolidado
),
blocos AS (
    SELECT
        unidade_espacial_id,
        (COALESCE(rural_norm,0) + COALESCE(agua_norm,0) + COALESCE(esgoto_norm,0) + COALESCE(lixo_norm,0))
          / NULLIF((rural_norm IS NOT NULL)::int + (agua_norm IS NOT NULL)::int + (esgoto_norm IS NOT NULL)::int + (lixo_norm IS NOT NULL)::int, 0)
          AS bloco_infraestrutura_urbana,
        (COALESCE(renda_norm_inv,0) + COALESCE(vinculos_norm_inv,0))
          / NULLIF((renda_norm_inv IS NOT NULL)::int + (vinculos_norm_inv IS NOT NULL)::int, 0)
          AS bloco_renda_trabalho,
        (COALESCE(alfabetizacao_norm_inv,0) + COALESCE(mortalidade_norm,0))
          / NULLIF((alfabetizacao_norm_inv IS NOT NULL)::int + (mortalidade_norm IS NOT NULL)::int, 0)
          AS bloco_capital_humano
    FROM normalizado
)
SELECT
    unidade_espacial_id,
    bloco_infraestrutura_urbana,
    bloco_renda_trabalho,
    bloco_capital_humano,
    (COALESCE(bloco_infraestrutura_urbana,0) + COALESCE(bloco_renda_trabalho,0) + COALESCE(bloco_capital_humano,0))
      / NULLIF((bloco_infraestrutura_urbana IS NOT NULL)::int + (bloco_renda_trabalho IS NOT NULL)::int + (bloco_capital_humano IS NOT NULL)::int, 0)
      AS ivs_calculado
FROM blocos;

-- Popula indicadores_sociais.ivs a partir da view (todas as linhas do mesmo
-- municipio recebem o mesmo valor, ja que os dados estao fragmentados por
-- periodo_referencia -- ver migration 0014 para o "achado arquitetural")
UPDATE indicadores_sociais i
SET ivs = v.ivs_calculado
FROM vw_ivs_consolidado v
WHERE v.unidade_espacial_id = i.unidade_espacial_id
  AND v.ivs_calculado IS NOT NULL;
