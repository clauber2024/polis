"""
DIAGNÓSTICO: por que Sul e Centro-Oeste invertem o sinal da correlação
parcial (MMGD x indicadores sociais, controlando renda) em relação às
demais regiões
================================================================================
CONTEXTO: rodando analisar_correlacao_mmgd_renda.py, o resumo de robustez
mostrou que:
  - Sul inverte o sinal (em relação às outras 4 regiões) em: IVS, Índice de
    Segurança da Posse, Índice de Precariedade de Infraestrutura e Taxa de
    Alfabetização.
  - Centro-Oeste inverte isoladamente em: Taxa de Mortalidade Infantil e
    Irradiação Solar.

Este script NÃO recalcula a correlação de novo — ele reusa os dados já
carregados pelo script principal (mesma função `carregar_dados`) e abre a
caixa-preta dessas duas regiões com três lentes de diagnóstico:

  1. COLINEARIDADE DENTRO DA REGIÃO: correlação de ordem zero entre renda e
     o próprio indicador testado, comparando nacional vs. dentro da região.
     Se a relação renda-indicador for muito mais forte (ou muito mais fraca)
     dentro da região do que no país, o "controle por renda" pode estar
     super-corrigindo (ou sub-corrigindo) num range de renda mais estreito
     — sinal invertido por colinearidade, não por um efeito social real
     diferente.
  2. HETEROGENEIDADE POR UF DENTRO DA REGIÃO: MMGD tem incentivo
     regulatório, tarifário e histórico de instaladoras que variam por
     Estado/distribuidora — não necessariamente por região do IBGE. Um
     estado isolado pode estar puxando toda a média regional.
  3. INSPEÇÃO QUALITATIVA: top/bottom 10 municípios da região por MMGD per
     capita, lado a lado com renda e o indicador em questão — para ver
     concretamente que tipo de município está em cada ponta.

Nenhuma conclusão causal é tirada automaticamente aqui — o script só
organiza os números para leitura humana. Reaproveita `carregar_dados` e
`calcular_indicadores_per_capita` de analisar_correlacao_mmgd_renda.py para
não duplicar a query nem a lógica de população estimada.
================================================================================
"""

import sys

import numpy as np
from scipy.stats import spearmanr
from sqlalchemy import create_engine

sys.path.insert(0, "backend/src/etl/analises")

from analisar_correlacao_mmgd_renda import (  # noqa: E402
    DATABASE_URL,
    VARIAVEIS_X,
    calcular_indicadores_per_capita,
    carregar_dados,
)

COLUNA_Y = "mmgd_potencia_per_1000_hab"

# Regiões e indicadores que o resumo de robustez do script principal
# apontou como "sinal muda" — ajustar esta lista se rodar de novo com outra
# Y ou outro corte de amostra e o resumo mudar.
REGIOES_INDICADORES_FOCO = {
    "Sul": [
        "ivs",
        "indice_seguranca_posse",
        "indice_precariedade_infraestrutura",
        "taxa_alfabetizacao",
    ],
    "Centro-Oeste": [
        "taxa_mortalidade_infantil",
        "irradiacao_media_kwh_m2_dia",
    ],
}


def colinearidade_regional(df, regiao: str, colunas_indicador: list) -> None:
    print(f"\n=== {regiao}: colinearidade renda x indicador (nacional vs. dentro da região) ===")
    subset_regiao = df[df["regiao"] == regiao]

    for coluna in colunas_indicador:
        nacional = df[["renda_media_domiciliar", coluna]].dropna()
        regional = subset_regiao[["renda_media_domiciliar", coluna]].dropna()

        rho_nacional = (
            spearmanr(nacional["renda_media_domiciliar"], nacional[coluna])[0]
            if len(nacional) > 2 else np.nan
        )
        rho_regional = (
            spearmanr(regional["renda_media_domiciliar"], regional[coluna])[0]
            if len(regional) > 2 else np.nan
        )

        rotulo = VARIAVEIS_X[coluna][0]
        print(f"  {rotulo:58s} | rho(renda, indicador) nacional={rho_nacional:+.3f}  "
              f"{regiao}={rho_regional:+.3f}  (n_{regiao}={len(regional)})")


def heterogeneidade_por_uf(df, regiao: str) -> None:
    print(f"\n=== {regiao}: MMGD per capita e renda por UF ===")
    subset = df[df["regiao"] == regiao]

    resumo = subset.groupby("uf").agg(
        n=("codigo_ibge", "count"),
        mmgd_potencia_per_1000_hab_mediana=(COLUNA_Y, "median"),
        renda_media_domiciliar_mediana=("renda_media_domiciliar", "median"),
    ).sort_values("mmgd_potencia_per_1000_hab_mediana", ascending=False)

    print(resumo.round(2).to_string())


def top_bottom_municipios(df, regiao: str, coluna_indicador: str, n: int = 10) -> None:
    rotulo = VARIAVEIS_X[coluna_indicador][0]
    print(f"\n=== {regiao}: top/bottom {n} municípios por MMGD per capita — foco em '{rotulo}' ===")

    colunas_exibir = ["nome", "uf", COLUNA_Y, "renda_media_domiciliar", coluna_indicador]
    subset = df[df["regiao"] == regiao][colunas_exibir].dropna()

    print(f"--- TOP {n} (mais MMGD per capita) ---")
    print(subset.sort_values(COLUNA_Y, ascending=False).head(n).round(2).to_string(index=False))

    print(f"--- BOTTOM {n} (menos MMGD per capita) ---")
    print(subset.sort_values(COLUNA_Y, ascending=True).head(n).round(2).to_string(index=False))


def main():
    print("Diagnóstico de outliers regionais (Sul e Centro-Oeste) — "
          "ver docstring do módulo para o que cada seção mostra.")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    df = calcular_indicadores_per_capita(carregar_dados(engine))

    for regiao, colunas_foco in REGIOES_INDICADORES_FOCO.items():
        print("\n" + "#" * 78)
        print(f"# DIAGNÓSTICO: {regiao}")
        print("#" * 78)

        colinearidade_regional(df, regiao, colunas_foco)
        heterogeneidade_por_uf(df, regiao)
        for coluna in colunas_foco:
            top_bottom_municipios(df, regiao, coluna)

    print("\n✅ Diagnóstico concluído (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
