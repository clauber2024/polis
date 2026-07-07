"""
INVESTIGAÇÃO EXPLORATÓRIA (cobertura nacional): chuva/vento (MERGE/ERA5,
zonal statistics, ~5.573 municípios) x ressarcimento por danos elétricos
================================================================================
CONTEXTO: repete a mesma análise de investigar_clima_ressarcimento_danos_
eletricos.py (que usava só os ~571 municípios com estação INMET própria -
amostra restrita e enviesada para cidades maiores), agora usando cobertura
NACIONAL real via zonal statistics (MERGE para chuva, ERA5 para vento),
depois de todo o trabalho de viabilidade e validação técnica desta sessão
(07/07/2026) - ver ARQUITETURA.md, seção "PESQUISA DE VIABILIDADE -
cobertura nacional (MERGE/ERA5)".

PRÉ-REQUISITO: rodar ANTES `escalar_merge_precipitacao_nacional.py` e
`escalar_era5_vento_nacional.py` (cada um gera 1 Parquet local, município x
mês x variável climática, para 2024-2025, todos os municípios). Este script
só LÊ esses 2 Parquets - não baixa nem processa GRIB de novo.

DIFERENÇA METODOLÓGICA IMPORTANTE em relação à versão INMET (documentar
sempre que este script for citado, mesmo espírito do aviso já presente em
investigar_clima_ressarcimento_danos_eletricos.py): o "pico climático" aqui é
um MÁXIMO ESPACIAL (zonal, sobre todo o território do município) E TEMPORAL
(sobre o mês), enquanto a versão INMET era um máximo só TEMPORAL (1 estação
pontual). Isso NÃO invalida a comparação com ressarcimento - na verdade é
CONCEITUALMENTE MAIS CORRETO para essa pergunta especificamente (queremos
saber se ALGUM lugar do município teve evento extremo, não só onde por acaso
havia uma estação) - mas significa que os valores em mm/m-s NÃO são
diretamente comparáveis aos da versão INMET (ver ARQUITETURA.md, seção
"Zonal statistics... Implicação prática importante" - zonal tende a ser
sistematicamente MAIOR que o pico de 1 estação, mecanicamente, por ser
o máximo sobre uma área e não um ponto).

REUSA sem modificação a lógica de ressarcimento (ANEEL/INDGER) e renda
(controle) já validada em investigar_clima_ressarcimento_danos_eletricos.py
- só troca a FONTE do clima (parquets nacionais em vez de BigQuery/INMET).

ESTE SCRIPT É SOMENTE LEITURA - não grava nada no banco.
================================================================================
"""

import os
import sys

import numpy as np
import pandas as pd
from sqlalchemy import create_engine

sys.path.insert(0, "backend/src/etl/analises")

from analisar_correlacao_mmgd_renda import (  # noqa: E402
    DATABASE_URL,
    classificar_tercis_urbanizacao,
    correlacao_parcial_spearman,
    correlacao_spearman,
)
from investigar_clima_ressarcimento_danos_eletricos import (  # noqa: E402
    ANO_MAXIMO,
    ANO_MINIMO,
    CAMINHO_CACHE_INDGER,
    N_MINIMO_AMOSTRA,
    carregar_renda_controle,
    carregar_ressarcimento_municipio_mes,
)

CAMINHO_PARQUET_PRECIPITACAO = os.environ.get(
    "CAMINHO_PARQUET_PRECIPITACAO",
    "backend/src/etl/data/raw/clima_nacional/precipitacao_max_mes_municipio.parquet",
)
CAMINHO_PARQUET_VENTO = os.environ.get(
    "CAMINHO_PARQUET_VENTO",
    "backend/src/etl/data/raw/clima_nacional/vento_rajada_max_mes_municipio.parquet",
)

VARIAVEIS_CLIMA = [
    ("precipitacao_max_mes", "Precipitação máxima do mês (mm, zonal MERGE)"),
    ("vento_rajada_max_mes", "Rajada de vento máxima do mês (m/s, zonal ERA5)"),
]


# --------------------------------------------------------------------------
# 1. Carregar os 2 parquets de clima nacional e juntar
# --------------------------------------------------------------------------
def carregar_clima_nacional() -> pd.DataFrame:
    print("[1/6] Carregando clima nacional (parquets de MERGE + ERA5, zonal statistics)...")

    for caminho, rotulo in [
        (CAMINHO_PARQUET_PRECIPITACAO, "precipitação (MERGE)"),
        (CAMINHO_PARQUET_VENTO, "vento (ERA5)"),
    ]:
        if not os.path.exists(caminho):
            raise SystemExit(
                f"[ERRO] Parquet de {rotulo} não encontrado em {caminho}. Rode antes "
                f"escalar_merge_precipitacao_nacional.py / escalar_era5_vento_nacional.py."
            )

    precipitacao = pd.read_parquet(CAMINHO_PARQUET_PRECIPITACAO)
    vento = pd.read_parquet(CAMINHO_PARQUET_VENTO)

    clima = precipitacao.merge(vento, on=["codigo_ibge", "ano", "mes"], how="outer")
    n_municipios = clima["codigo_ibge"].nunique()
    print(f"      {len(clima)} combinação(ões) município x mês, {n_municipios} município(s) "
          f"distinto(s) (cobertura nacional - todos os ~5.573, não só os com estação INMET).")
    return clima


# --------------------------------------------------------------------------
# 2-5. Painel, correlação nacional, sensibilidade por região/urbanização
#    (REUSA a mesma estrutura de investigar_clima_ressarcimento_danos_
#    eletricos.py - só a fonte do clima muda)
# --------------------------------------------------------------------------
def montar_painel_e_correlacionar(
    ressarcimento: pd.DataFrame, clima: pd.DataFrame, renda: pd.DataFrame
) -> tuple:
    print("[2/6] Montando painel município x mês (cobertura NACIONAL)...")

    painel = clima.merge(ressarcimento, on=["codigo_ibge", "ano", "mes"], how="inner")
    print(f"      {len(painel)} combinação(ões) município x mês com AMBOS clima e ressarcimento.")

    painel = painel.merge(renda, on="codigo_ibge", how="left")
    n_sem_renda = painel["renda_media_domiciliar"].isna().sum()
    if n_sem_renda > 0:
        print(f"      [AVISO] {n_sem_renda} linha(s) sem renda (controle).")

    n_municipios_final = painel["codigo_ibge"].nunique()
    print(f"      Painel final: {len(painel)} linha(s), {n_municipios_final} município(s) "
          f"distinto(s) - cobertura NACIONAL, não mais restrita a estação INMET própria.")

    print("\n[3/6] Correlação de Spearman: pico climático mensal (zonal, nacional) x taxa de "
          "ressarcimento (mesmo mês)")
    linhas = []
    for coluna_clima, rotulo in VARIAVEIS_CLIMA:
        bruta = correlacao_spearman(painel, coluna_clima, "qtd_solic_ressarc_per_1000_uc")
        parcial = correlacao_parcial_spearman(
            painel, coluna_clima, "qtd_solic_ressarc_per_1000_uc", ["renda_media_domiciliar"]
        )
        linhas.append({
            "variavel_climatica": rotulo,
            "n_bruto": bruta["n"],
            "rho_bruto": bruta["rho"],
            "p_bruto": bruta["p_valor"],
            "n_parcial": parcial["n"],
            "rho_parcial_renda": parcial["rho_parcial"],
            "p_parcial_renda": parcial["p_valor"],
        })

    resultado = pd.DataFrame(linhas)
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(resultado.round(4).to_string(index=False))

    if (resultado["n_bruto"] < N_MINIMO_AMOSTRA).any():
        print(f"      [AVISO] pelo menos uma correlação tem n < {N_MINIMO_AMOSTRA}.")

    return painel, resultado


def sensibilidade_por_regiao(painel: pd.DataFrame) -> pd.DataFrame:
    print("\n[4/6] Sensibilidade por região - parcial controlando renda (cobertura nacional)")
    regioes = sorted(painel["regiao"].dropna().unique())
    linhas = []
    for coluna_clima, rotulo in VARIAVEIS_CLIMA:
        for regiao in regioes:
            subset = painel[painel["regiao"] == regiao]
            resultado = correlacao_parcial_spearman(
                subset, coluna_clima, "qtd_solic_ressarc_per_1000_uc", ["renda_media_domiciliar"]
            )
            linhas.append({
                "variavel_climatica": rotulo,
                "regiao": regiao,
                "n_municipio_mes": resultado["n"],
                "n_municipios": subset["codigo_ibge"].nunique(),
                "rho_parcial_renda": resultado["rho_parcial"],
                "p_valor": resultado["p_valor"],
            })

    tabela = pd.DataFrame(linhas)
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(tabela.pivot_table(index="variavel_climatica", columns="regiao", values="rho_parcial_renda").round(3).to_string())
        print("\n      n de municípios distintos por região (cobertura nacional):")
        print(tabela.pivot_table(index="variavel_climatica", columns="regiao", values="n_municipios").to_string())

    return tabela


def sensibilidade_por_urbanizacao(painel: pd.DataFrame) -> pd.DataFrame:
    print("\n[5/6] Sensibilidade por tercil de urbanização - parcial controlando renda")

    if painel["percentual_populacao_rural"].isna().all():
        print("      [AVISO] percentual_populacao_rural indisponível - pulando esta seção.")
        return pd.DataFrame()

    painel_com_tercis = classificar_tercis_urbanizacao(painel)
    faixas = (
        list(painel_com_tercis["faixa_urbanizacao"].cat.categories)
        if hasattr(painel_com_tercis["faixa_urbanizacao"], "cat")
        else painel_com_tercis["faixa_urbanizacao"].dropna().unique()
    )

    linhas = []
    for coluna_clima, rotulo in VARIAVEIS_CLIMA:
        for faixa in faixas:
            subset = painel_com_tercis[painel_com_tercis["faixa_urbanizacao"] == faixa]
            resultado = correlacao_parcial_spearman(
                subset, coluna_clima, "qtd_solic_ressarc_per_1000_uc", ["renda_media_domiciliar"]
            )
            linhas.append({
                "variavel_climatica": rotulo,
                "faixa_urbanizacao": faixa,
                "n_municipio_mes": resultado["n"],
                "n_municipios": subset["codigo_ibge"].nunique(),
                "rho_parcial_renda": resultado["rho_parcial"],
                "p_valor": resultado["p_valor"],
            })

    tabela = pd.DataFrame(linhas)
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(tabela.pivot_table(index="variavel_climatica", columns="faixa_urbanizacao", values="rho_parcial_renda").round(3).to_string())

    return tabela


def resumo_robustez(tabela_nacional: pd.DataFrame, tabela_regiao: pd.DataFrame, tabela_urbanizacao: pd.DataFrame) -> None:
    print("\n" + "=" * 78)
    print("RESUMO DE ROBUSTEZ (COBERTURA NACIONAL) - sinal mantido em quantas "
          "regiões/faixas de urbanização")
    print("=" * 78)

    linhas_resumo = []
    for _, linha in tabela_nacional.iterrows():
        rotulo = linha["variavel_climatica"]
        rho_nacional = linha["rho_parcial_renda"]
        sinal_nacional = np.sign(rho_nacional)

        subset_regiao = tabela_regiao[
            (tabela_regiao["variavel_climatica"] == rotulo) & tabela_regiao["rho_parcial_renda"].notna()
            & (tabela_regiao["n_municipio_mes"] >= N_MINIMO_AMOSTRA)
        ]
        regioes_mesmo_sinal = int((np.sign(subset_regiao["rho_parcial_renda"]) == sinal_nacional).sum())
        total_regioes = len(subset_regiao)

        if len(tabela_urbanizacao):
            subset_urb = tabela_urbanizacao[
                (tabela_urbanizacao["variavel_climatica"] == rotulo) & tabela_urbanizacao["rho_parcial_renda"].notna()
                & (tabela_urbanizacao["n_municipio_mes"] >= N_MINIMO_AMOSTRA)
            ]
            faixas_mesmo_sinal = int((np.sign(subset_urb["rho_parcial_renda"]) == sinal_nacional).sum())
            total_faixas = len(subset_urb)
            faixas_str = f"{faixas_mesmo_sinal}/{total_faixas}"
        else:
            faixas_str = "N/A"

        linhas_resumo.append({
            "variavel_climatica": rotulo,
            "rho_parcial_nacional": round(rho_nacional, 4),
            "regioes_mesmo_sinal": f"{regioes_mesmo_sinal}/{total_regioes}",
            "faixas_mesmo_sinal": faixas_str,
        })

    print(pd.DataFrame(linhas_resumo).to_string(index=False))
    print("\nCOMPARAR este resultado com o da versão INMET "
          "(investigar_clima_ressarcimento_danos_eletricos.py) - se o sinal e a direção "
          "se mantiverem parecidos, é evidência de que o viés de amostra (só municípios "
          "com estação própria) não estava distorcendo a conclusão. Se mudar muito, o viés "
          "de amostra da versão INMET era relevante.")


def main():
    print("Investigação exploratória (COBERTURA NACIONAL): clima (MERGE/ERA5, zonal) x "
          "ressarcimento por danos elétricos (ANEEL/INDGER)")
    print("=" * 78)
    print(f"Janela temporal: {ANO_MINIMO}-{ANO_MAXIMO}.")
    print("=" * 78)

    ressarcimento = carregar_ressarcimento_municipio_mes(CAMINHO_CACHE_INDGER)
    clima = carregar_clima_nacional()

    engine = create_engine(DATABASE_URL)
    renda = carregar_renda_controle(engine)

    painel, tabela_nacional = montar_painel_e_correlacionar(ressarcimento, clima, renda)

    tabela_regiao = sensibilidade_por_regiao(painel)
    tabela_urbanizacao = sensibilidade_por_urbanizacao(painel)
    resumo_robustez(tabela_nacional, tabela_regiao, tabela_urbanizacao)

    print("\n[6/6] Concluído (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
