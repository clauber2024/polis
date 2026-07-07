"""
DIAGNÓSTICO: por que o Índice de Precariedade Habitacional inverte o sinal da
correlação parcial (MMGD residencial x indicadores sociais, controlando
renda) no Centro-Oeste em relação às demais regiões
================================================================================
CONTEXTO: rodando analisar_correlacao_mmgd_renda.py em 07/07/2026 (Y =
mmgd_potencia_residencial_per_1000_hab, a Y PRINCIPAL usada para "vazios de
acesso"), o resumo de robustez [5/8] mostrou que o Índice de Precariedade
Habitacional (indice_precariedade_moradia) inverte o sinal isoladamente no
Centro-Oeste (rho parcial = +0,006, praticamente zero) em relação às outras
4 regiões (-0,15 a -0,28) — item 1 da fila de trabalho do ARQUITETURA.md,
pendência registrada em 06/07/2026: "Índice de Precariedade Habitacional e
Taxa de Alfabetização NUNCA tiveram esse mesmo tratamento [de diagnóstico
dedicado]".

Diferente da rodada anterior (diagnosticar_outliers_regionais.py, sessão
06/07/2026, feita com Y = TOTAL/todas as classes e focada em Sul/Centro-Oeste
para outros 4 indicadores — ver RESSALVA no ARQUITETURA.md sobre esse script
estar hardcoded para a análise antiga), este script:
  (a) usa a Y RESIDENCIAL (mmgd_potencia_residencial_per_1000_hab, a correta
      para "vazios de acesso");
  (b) foca só no par Centro-Oeste x Precariedade Habitacional, identificado
      nesta sessão (07/07/2026), em vez de copiar a lista antiga.

Este script NÃO recalcula a correlação nacional do zero — reusa
`carregar_dados`, `carregar_classe_consumo_mmgd` e
`calcular_indicadores_per_capita` de analisar_correlacao_mmgd_renda.py, e
abre a caixa-preta do Centro-Oeste com as mesmas 3 lentes já usadas nos casos
Sul/Centro-Oeste anteriores:

  1. COLINEARIDADE DENTRO DA REGIÃO: rho(renda, indicador), nacional vs.
     dentro do Centro-Oeste. Se a relação renda-indicador for muito mais
     forte (ou mais fraca) dentro da região do que no país, o "controle por
     renda" pode estar super/sub-corrigindo num range de renda mais estreito
     — sinal invertido por colinearidade, não por um efeito social diferente.
  2. HETEROGENEIDADE POR UF DENTRO DA REGIÃO: MG/MT/MS/GO/DF podem não se
     comportar igual — um estado isolado pode estar puxando a média regional
     inteira (mesmo raciocínio já usado para EQUATORIAL GO no Centro-Oeste,
     ver ARQUITETURA.md, "Hipótese de distribuidora/concessionária").
  3. INSPEÇÃO QUALITATIVA: top/bottom 10 municípios do Centro-Oeste por MMGD
     residencial per capita, lado a lado com renda e o indicador em questão.

Nenhuma conclusão causal é tirada automaticamente aqui — o script só organiza
os números para leitura humana, mesmo espírito dos scripts anteriores desta
linha de investigação.
================================================================================
"""

import os
import sys

import numpy as np
from scipy.stats import spearmanr
from sqlalchemy import create_engine

sys.path.insert(0, "backend/src/etl/analises")

from analisar_correlacao_mmgd_renda import (  # noqa: E402
    CAMINHO_PARQUET_MMGD,
    DATABASE_URL,
    VARIAVEIS_X,
    calcular_indicadores_per_capita,
    carregar_classe_consumo_mmgd,
    carregar_dados,
)

COLUNA_Y = "mmgd_potencia_residencial_per_1000_hab"
REGIAO_FOCO = "Centro-Oeste"
INDICADOR_FOCO = "indice_precariedade_moradia"


def colinearidade_regional(df) -> None:
    print(f"\n=== {REGIAO_FOCO}: colinearidade renda x {INDICADOR_FOCO} "
          f"(nacional vs. dentro da região) ===")
    subset_regiao = df[df["regiao"] == REGIAO_FOCO]

    nacional = df[["renda_media_domiciliar", INDICADOR_FOCO]].dropna()
    regional = subset_regiao[["renda_media_domiciliar", INDICADOR_FOCO]].dropna()

    rho_nacional = (
        spearmanr(nacional["renda_media_domiciliar"], nacional[INDICADOR_FOCO])[0]
        if len(nacional) > 2 else np.nan
    )
    rho_regional = (
        spearmanr(regional["renda_media_domiciliar"], regional[INDICADOR_FOCO])[0]
        if len(regional) > 2 else np.nan
    )

    rotulo = VARIAVEIS_X[INDICADOR_FOCO][0]
    print(f"  {rotulo:58s} | rho(renda, indicador) nacional={rho_nacional:+.3f}  "
          f"{REGIAO_FOCO}={rho_regional:+.3f}  (n_{REGIAO_FOCO}={len(regional)})")


def heterogeneidade_por_uf(df) -> None:
    print(f"\n=== {REGIAO_FOCO}: MMGD residencial per capita, renda e "
          f"{INDICADOR_FOCO} por UF ===")
    subset = df[df["regiao"] == REGIAO_FOCO]

    resumo = subset.groupby("uf").agg(
        n=("codigo_ibge", "count"),
        mmgd_residencial_per_1000_hab_mediana=(COLUNA_Y, "median"),
        renda_media_domiciliar_mediana=("renda_media_domiciliar", "median"),
        indice_precariedade_moradia_mediana=(INDICADOR_FOCO, "median"),
    ).sort_values("mmgd_residencial_per_1000_hab_mediana", ascending=False)

    print(resumo.round(2).to_string())


def top_bottom_municipios(df, n: int = 10) -> None:
    rotulo = VARIAVEIS_X[INDICADOR_FOCO][0]
    print(f"\n=== {REGIAO_FOCO}: top/bottom {n} municípios por MMGD residencial "
          f"per capita — foco em '{rotulo}' ===")

    colunas_exibir = ["nome", "uf", COLUNA_Y, "renda_media_domiciliar", INDICADOR_FOCO]
    subset = df[df["regiao"] == REGIAO_FOCO][colunas_exibir].dropna()

    print(f"--- TOP {n} (mais MMGD residencial per capita) ---")
    print(subset.sort_values(COLUNA_Y, ascending=False).head(n).round(2).to_string(index=False))

    print(f"--- BOTTOM {n} (menos MMGD residencial per capita) ---")
    print(subset.sort_values(COLUNA_Y, ascending=True).head(n).round(2).to_string(index=False))


def main():
    print(f"Diagnóstico de outlier regional: {REGIAO_FOCO} x {INDICADOR_FOCO} "
          f"(Y residencial) — ver docstring do módulo para o que cada seção mostra.")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    df_bruto = carregar_dados(engine)

    if os.path.exists(CAMINHO_PARQUET_MMGD):
        classe_consumo = carregar_classe_consumo_mmgd(CAMINHO_PARQUET_MMGD)
        df_bruto = df_bruto.merge(classe_consumo, on="codigo_ibge", how="left")
    else:
        raise SystemExit(
            f"[ERRO] Parquet bruto não encontrado em {CAMINHO_PARQUET_MMGD} — "
            f"necessário para calcular a Y residencial. Abortando (sem ele, este "
            f"diagnóstico não reproduziria a mesma Y usada na análise principal)."
        )

    df = calcular_indicadores_per_capita(df_bruto)

    colinearidade_regional(df)
    heterogeneidade_por_uf(df)
    top_bottom_municipios(df)

    print("\n✅ Diagnóstico concluído (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
