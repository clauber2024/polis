"""
DIAGNÓSTICO: por que a Taxa de Alfabetização inverte o sinal da correlação
parcial (MMGD residencial x indicadores sociais, controlando renda) no tercil
"Mais urbanizados" em relação aos outros 2 tercis de urbanização
================================================================================
CONTEXTO: mesma pendência do script
investigar_precariedade_habitacional_centro_oeste.py (item 1 da fila de
trabalho do ARQUITETURA.md, registrada em 06/07/2026: "Índice de Precariedade
Habitacional e Taxa de Alfabetização NUNCA tiveram esse mesmo tratamento [de
diagnóstico dedicado]"). Diferença importante: para Taxa de Alfabetização,
quem diverge NÃO é uma região — as 5 regiões concordam em sinal com o
nacional (5/5, ver tabela [5/8] de analisar_correlacao_mmgd_renda.py, sessão
07/07/2026) — é o tercil de urbanização "Mais urbanizados (menor % rural)"
que inverte (rho parcial = -0,076 contra +0,35/+0,41 nos outros 2 tercis, ver
tabela [7/8], Y = mmgd_potencia_residencial_per_1000_hab).

Por isso este script NÃO reaproveita diagnosticar_outliers_regionais.py nem
investigar_precariedade_habitacional_centro_oeste.py (que agrupam por
`regiao`) — copia a mesma lógica de 3 lentes já usada nos casos anteriores,
mas trocando o recorte de "região" por "tercil de urbanização":

  1. COLINEARIDADE DENTRO DO TERCIL: rho(renda, taxa_alfabetizacao), nacional
     vs. dentro do tercil "Mais urbanizados".
  2. HETEROGENEIDADE POR REGIÃO DENTRO DO TERCIL: municípios "mais
     urbanizados" existem nas 5 regiões — uma região isolada (ex.: Sudeste,
     com muitas capitais/metrópoles) pode estar puxando o tercil inteiro,
     mesmo raciocínio já usado para heterogeneidade por UF dentro de região
     nos scripts anteriores, só que um nível de recorte diferente.
  3. INSPEÇÃO QUALITATIVA: top/bottom 10 municípios do tercil por MMGD
     residencial per capita, lado a lado com renda, região e taxa de
     alfabetização.

Nenhuma conclusão causal é tirada automaticamente aqui — o script só organiza
os números para leitura humana, mesmo espírito dos scripts anteriores desta
linha de investigação.

TESTE ADICIONAL (4a seção, incluído após 1a rodada de diagnóstico, mesma
sessão 07/07/2026): a lente 2 (heterogeneidade por região) mostrou dois
candidatos concorrentes dentro do tercil "Mais urbanizados" — colinearidade
mais forte com renda (+0,496 vs. +0,344 nacional) E composição regional
desbalanceada (Sudeste é 49% do tercil, com alfabetização alta mas MMGD
moderado/baixo; os piores municípios do tercil são metrópole densa do ABC
paulista — Diadema, Taboão da Serra, Santos, Cubatão, Mauá — o mesmo perfil
de moradia densa/sem telhado próprio já testado noutro caso do projeto via
`percentual_apartamento`, ver ARQUITETURA.md "Teste da hipótese de tipologia
habitacional"). `teste_apartamento_no_tercil` reaproveita esse mecanismo já
validado: controla renda + percentual_apartamento (em vez de só renda) e
compara o sinal nacional com o sinal dentro do tercil — se a tipologia
habitacional explicar o desvio, o sinal deve deixar de destoar.
================================================================================
"""

import os
import sys

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sqlalchemy import create_engine

sys.path.insert(0, "backend/src/etl/analises")

from analisar_correlacao_mmgd_renda import (  # noqa: E402
    CAMINHO_PARQUET_MMGD,
    CONTROLE_RENDA,
    DATABASE_URL,
    VARIAVEIS_X,
    VARIAVEL_TIPOLOGIA_HABITACIONAL,
    calcular_indicadores_per_capita,
    carregar_classe_consumo_mmgd,
    carregar_dados,
    classificar_tercis_urbanizacao,
    correlacao_parcial_spearman,
)

COLUNA_Y = "mmgd_potencia_residencial_per_1000_hab"
TERCIL_FOCO = "Mais urbanizados (menor % rural)"
INDICADOR_FOCO = "taxa_alfabetizacao"


def colinearidade_no_tercil(df) -> None:
    print(f"\n=== Tercil '{TERCIL_FOCO}': colinearidade renda x {INDICADOR_FOCO} "
          f"(nacional vs. dentro do tercil) ===")
    subset_tercil = df[df["faixa_urbanizacao"] == TERCIL_FOCO]

    nacional = df[["renda_media_domiciliar", INDICADOR_FOCO]].dropna()
    tercil = subset_tercil[["renda_media_domiciliar", INDICADOR_FOCO]].dropna()

    rho_nacional = (
        spearmanr(nacional["renda_media_domiciliar"], nacional[INDICADOR_FOCO])[0]
        if len(nacional) > 2 else np.nan
    )
    rho_tercil = (
        spearmanr(tercil["renda_media_domiciliar"], tercil[INDICADOR_FOCO])[0]
        if len(tercil) > 2 else np.nan
    )

    rotulo = VARIAVEIS_X[INDICADOR_FOCO][0]
    print(f"  {rotulo:58s} | rho(renda, indicador) nacional={rho_nacional:+.3f}  "
          f"tercil={rho_tercil:+.3f}  (n_tercil={len(tercil)})")


def heterogeneidade_por_regiao(df) -> None:
    print(f"\n=== Tercil '{TERCIL_FOCO}': MMGD residencial per capita, renda e "
          f"{INDICADOR_FOCO} por região ===")
    subset = df[df["faixa_urbanizacao"] == TERCIL_FOCO]

    resumo = subset.groupby("regiao").agg(
        n=("codigo_ibge", "count"),
        mmgd_residencial_per_1000_hab_mediana=(COLUNA_Y, "median"),
        renda_media_domiciliar_mediana=("renda_media_domiciliar", "median"),
        taxa_alfabetizacao_mediana=(INDICADOR_FOCO, "median"),
    ).sort_values("mmgd_residencial_per_1000_hab_mediana", ascending=False)

    print(resumo.round(2).to_string())


def top_bottom_municipios(df, n: int = 10) -> None:
    rotulo = VARIAVEIS_X[INDICADOR_FOCO][0]
    print(f"\n=== Tercil '{TERCIL_FOCO}': top/bottom {n} municípios por MMGD "
          f"residencial per capita — foco em '{rotulo}' ===")

    colunas_exibir = ["nome", "uf", "regiao", COLUNA_Y, "renda_media_domiciliar", INDICADOR_FOCO]
    subset = df[df["faixa_urbanizacao"] == TERCIL_FOCO][colunas_exibir].dropna()

    print(f"--- TOP {n} (mais MMGD residencial per capita) ---")
    print(subset.sort_values(COLUNA_Y, ascending=False).head(n).round(2).to_string(index=False))

    print(f"--- BOTTOM {n} (menos MMGD residencial per capita) ---")
    print(subset.sort_values(COLUNA_Y, ascending=True).head(n).round(2).to_string(index=False))


def teste_apartamento_no_tercil(df) -> None:
    """
    Controla renda + percentual_apartamento (em vez de só renda) e compara o
    sinal nacional com o sinal dentro do tercil 'Mais urbanizados' — mesma
    lógica de `teste_hipotese_regioes_problema` em
    analisar_correlacao_mmgd_renda.py, mas aplicada a um tercil de
    urbanização em vez de uma região. Só roda se percentual_apartamento
    estiver disponível (migration 0016 aplicada).
    """
    if VARIAVEL_TIPOLOGIA_HABITACIONAL not in df.columns or df[VARIAVEL_TIPOLOGIA_HABITACIONAL].isna().all():
        print("\n[INFO] percentual_apartamento indisponível — pulando o teste de tipologia habitacional.")
        return

    print(f"\n=== Teste direcionado: renda+apartamento explica o sinal de "
          f"{INDICADOR_FOCO} no tercil '{TERCIL_FOCO}'? ===")

    controles = CONTROLE_RENDA + [VARIAVEL_TIPOLOGIA_HABITACIONAL]
    rotulo = VARIAVEIS_X[INDICADOR_FOCO][0]

    nacional = correlacao_parcial_spearman(df, INDICADOR_FOCO, COLUNA_Y, controles)
    subset_tercil = df[df["faixa_urbanizacao"] == TERCIL_FOCO]
    tercil = correlacao_parcial_spearman(subset_tercil, INDICADOR_FOCO, COLUNA_Y, controles)
    # Valor de referência: mesmo par, mas com o controle antigo (só renda),
    # para comparar contra o resultado já visto em analisar_correlacao_mmgd_renda.py.
    tercil_antigo = correlacao_parcial_spearman(subset_tercil, INDICADOR_FOCO, COLUNA_Y, CONTROLE_RENDA)

    print(f"  {rotulo}:")
    print(f"    parcial (renda+apartamento) nacional      = {nacional['rho_parcial']:+.4f} (n={nacional['n']})")
    print(f"    parcial (renda+apartamento) tercil         = {tercil['rho_parcial']:+.4f} (n={tercil['n']})")
    print(f"    parcial (só renda) tercil                  = {tercil_antigo['rho_parcial']:+.4f} "
          f"(n={tercil_antigo['n']}) [valor de referência, controle antigo]")
    if pd.notna(nacional["rho_parcial"]) and pd.notna(tercil["rho_parcial"]):
        if np.sign(nacional["rho_parcial"]) == np.sign(tercil["rho_parcial"]):
            print("    -> sinal PASSA A CONCORDAR com o nacional controlando apartamento "
                  "(consistente com a hipótese de tipologia habitacional).")
        else:
            print("    -> sinal AINDA DESTOA mesmo controlando apartamento "
                  "(hipótese não explica sozinha este caso).")


def main():
    print(f"Diagnóstico de outlier por urbanização: tercil '{TERCIL_FOCO}' x "
          f"{INDICADOR_FOCO} (Y residencial) — ver docstring do módulo para o "
          f"que cada seção mostra.")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    df_bruto = carregar_dados(engine)

    if os.path.exists(CAMINHO_PARQUET_MMGD):
        classe_consumo = carregar_classe_consumo_mmgd(CAMINHO_PARQUET_MMGD)
        df_bruto = df_bruto.merge(classe_consumo, on="codigo_ibge", how="left")
    else:
        raise SystemExit(
            f"[ERRO] Parquet bruto não encontrado em {CAMINHO_PARQUET_MMGD} — "
            f"necessário para calcular a Y residencial. Abortando."
        )

    df = calcular_indicadores_per_capita(df_bruto)
    df_com_tercis = classificar_tercis_urbanizacao(df)

    colinearidade_no_tercil(df_com_tercis)
    heterogeneidade_por_regiao(df_com_tercis)
    top_bottom_municipios(df_com_tercis)
    teste_apartamento_no_tercil(df_com_tercis)

    print("\n✅ Diagnóstico concluído (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
