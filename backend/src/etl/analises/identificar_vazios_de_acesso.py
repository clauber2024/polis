"""
ANÁLISE: Identificação e ranking de "Vazios de Acesso" (RF-055, RF-056, RF-057)
================================================================================
CONTEXTO: item 1 da fila de trabalho do ARQUITETURA.md ("Cruzamento MMGD x
indicadores sociais - identificar vazios reais de acesso") produziu, até
agora, testes de ROBUSTEZ da correlação (analisar_correlacao_mmgd_renda.py) e
diagnósticos de casos-outlier (Sul, Centro-Oeste) - mas nunca gerou o produto
final que o DRF pede: uma lista/ranking concreto de municípios classificados
como "Vazio de Acesso".

O QUE O DRF EXIGE (docs/DRF.md):
  - RF-055: destacar municípios com ALTO POTENCIAL SOLAR e BAIXO ACESSO A
    MMGD, com badge "Vazio de Acesso".
  - RF-056: ranking de priorização para políticas públicas, ordenável por
    diferentes critérios.
  - RF-057: painel de "vazios de acesso" em visualização tipo heatmap (fora
    do escopo deste script - é exibição, não cálculo).

METODOLOGIA (reaproveita decisões já fechadas em ARQUITETURA.md, seção
"Índices compostos e metodologia de cruzamentos", sessão 04/07/2026- não
inventa critério novo):
  - Eixo X: potencial solar = irradiação média (GHI, INPE/LABREN) - positivo,
    quanto maior, mais potencial.
  - Eixo Y: acesso efetivo = MMGD RESIDENCIAL per capita (não total - mesma
    decisão já validada na análise de correlação, para não misturar
    agronegócio/irrigação).
  - Limiar dos quadrantes: MEDIANA nacional de cada eixo (não média - já
    decidido, distribuições assimétricas).
  - "Vazio de Acesso" = alto potencial (>= mediana) E baixo MMGD residencial
    per capita (< mediana). Os outros 3 quadrantes são rotulados para
    contexto, mas não são o alvo do RF-055.
  - Priorização dentro do Vazio de Acesso (RF-056): ordena por IVS Consolidado
    (indicador NEGATIVO - maior valor = mais vulnerável), critério padrão;
    mas a tabela completa exportada permite reordenar por qualquer outro
    indicador depois (renda, % pobreza CadÚnico etc.) - RF-056 pede "ordenável
    por diferentes critérios", este script não fixa um único critério
    definitivo, só usa IVS como ordenação padrão de exibição.

IMPORTANTE - ESTE SCRIPT É UM PROTÓTIPO DE VALIDAÇÃO, NÃO A IMPLEMENTAÇÃO
FINAL: ARQUITETURA.md já registrou a decisão de que "a lógica de quadrante
(favorável/desfavorável) é calculada no BACKEND considerando a direção,
mantendo os números exibidos idênticos aos armazenados" - ou seja, quando o
backend Node/Express for construído, esta classificação deve ser
reimplementada lá (provavelmente como view SQL ou serviço), não consumida
deste script Python em produção. Este script serve para validar a
metodologia com dado real ANTES de comprometer a lógica no backend.

ESTE SCRIPT É SOMENTE LEITURA (não grava nada no banco) - mesma categoria de
`backend/src/etl/analises/*`.
================================================================================
"""

import os
import sys

import numpy as np
import pandas as pd
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

COLUNA_POTENCIAL = "irradiacao_media_kwh_m2_dia"
COLUNA_PRIORIZACAO_PADRAO = "ivs"  # negativo: maior = mais vulnerável

CAMINHO_SAIDA_CSV = os.environ.get(
    "CAMINHO_SAIDA_CSV_VAZIOS", "vazios_de_acesso_municipios.csv"
)


def preparar_dados() -> pd.DataFrame:
    print("[1/5] Carregando painel município x MMGD x indicadores sociais x irradiação solar...")
    engine = create_engine(DATABASE_URL)
    df_bruto = carregar_dados(engine)

    if os.path.exists(CAMINHO_PARQUET_MMGD):
        classe_consumo = carregar_classe_consumo_mmgd(CAMINHO_PARQUET_MMGD)
        df_bruto = df_bruto.merge(classe_consumo, on="codigo_ibge", how="left")
    else:
        print(f"      [AVISO] Parquet bruto não encontrado em {CAMINHO_PARQUET_MMGD} — "
              f"Y cai para MMGD TOTAL (todas as classes), não só residencial. Isso "
              f"infla o eixo Y em municípios de agronegócio/irrigação (ver ARQUITETURA.md) "
              f"e pode subestimar vazios de acesso reais nesses casos.")

    return calcular_indicadores_per_capita(df_bruto)


def selecionar_coluna_y(df: pd.DataFrame) -> str:
    if "mmgd_potencia_residencial_per_1000_hab" in df.columns:
        return "mmgd_potencia_residencial_per_1000_hab"
    return "mmgd_potencia_per_1000_hab"


def classificar_quadrantes(df: pd.DataFrame, coluna_y: str) -> pd.DataFrame:
    print(f"[2/5] Classificando municípios em quadrantes (mediana nacional) — "
          f"X = {COLUNA_POTENCIAL}, Y = {coluna_y}")

    df = df.copy()
    subset_valido = df[[COLUNA_POTENCIAL, coluna_y]].dropna()
    n_excluidos = len(df) - len(subset_valido)
    if n_excluidos > 0:
        print(f"      [AVISO] {n_excluidos} município(s) sem irradiação e/ou MMGD "
              f"per capita válidos — excluídos da classificação de quadrante.")

    mediana_x = subset_valido[COLUNA_POTENCIAL].median()
    mediana_y = subset_valido[coluna_y].median()
    print(f"      Mediana nacional — potencial solar: {mediana_x:.3f} kWh/m2.dia | "
          f"MMGD per capita: {mediana_y:.3f} kW/1.000 hab")

    def rotular(linha):
        if pd.isna(linha[COLUNA_POTENCIAL]) or pd.isna(linha[coluna_y]):
            return np.nan
        alto_potencial = linha[COLUNA_POTENCIAL] >= mediana_x
        alto_mmgd = linha[coluna_y] >= mediana_y
        if alto_potencial and not alto_mmgd:
            return "VAZIO DE ACESSO (alto potencial, baixo MMGD)"
        if alto_potencial and alto_mmgd:
            return "Acesso pleno (alto potencial, alto MMGD)"
        if not alto_potencial and alto_mmgd:
            return "Adoção acima do potencial (baixo potencial, alto MMGD)"
        return "Baixo potencial, baixa adoção (esperado)"

    df["quadrante"] = df.apply(rotular, axis=1)

    print(f"      Distribuição nacional de quadrantes:\n"
          f"{df['quadrante'].value_counts(dropna=False).to_string()}")

    return df


def priorizar_vazios_de_acesso(df: pd.DataFrame, coluna_y: str, n: int = 20) -> pd.DataFrame:
    print(f"\n[3/5] Priorização dentro do Vazio de Acesso — ordenado por "
          f"{VARIAVEIS_X[COLUNA_PRIORIZACAO_PADRAO][0]} (critério padrão, RF-056 permite "
          f"reordenar por outro indicador na tabela completa exportada)")

    vazios = df[df["quadrante"] == "VAZIO DE ACESSO (alto potencial, baixo MMGD)"].copy()
    print(f"      {len(vazios)} município(s) classificados como Vazio de Acesso "
          f"({len(vazios) / df['quadrante'].notna().sum() * 100:.1f}% dos municípios "
          f"com classificação válida).")

    colunas_exibir = [
        "codigo_ibge", "nome", "uf", "regiao", COLUNA_POTENCIAL, coluna_y,
        COLUNA_PRIORIZACAO_PADRAO, "renda_media_domiciliar", "percentual_pobreza_cadunico",
    ]
    colunas_exibir = [c for c in colunas_exibir if c in vazios.columns]

    # ivs é negativo (maior = pior/mais vulnerável) - ordena decrescente para
    # priorizar os municípios mais vulneráveis no topo do ranking.
    ranking = vazios[colunas_exibir].sort_values(COLUNA_PRIORIZACAO_PADRAO, ascending=False)

    print(f"\n--- TOP {n} Vazios de Acesso, priorizados por vulnerabilidade (IVS) ---")
    print(ranking.head(n).round(3).to_string(index=False))

    return vazios


def resumo_por_regiao(df: pd.DataFrame) -> None:
    print(f"\n[4/5] Distribuição de Vazios de Acesso por região")
    tabela = pd.crosstab(df["regiao"], df["quadrante"])
    with pd.option_context("display.max_columns", None, "display.width", 160):
        print(tabela.to_string())

    if "VAZIO DE ACESSO (alto potencial, baixo MMGD)" in tabela.columns:
        proporcao = (
            tabela["VAZIO DE ACESSO (alto potencial, baixo MMGD)"] / tabela.sum(axis=1) * 100
        ).sort_values(ascending=False)
        print(f"\n      % de municípios em Vazio de Acesso por região (maior para menor):")
        print(proporcao.round(1).to_string())


def main():
    print("Identificação e ranking de Vazios de Acesso (RF-055, RF-056) - PROTÓTIPO "
          "DE VALIDAÇÃO, não a implementação final (ver docstring do módulo)")
    print("=" * 78)

    df = preparar_dados()
    coluna_y = selecionar_coluna_y(df)
    print(f"      Y usado: {coluna_y}")

    df_classificado = classificar_quadrantes(df, coluna_y)
    priorizar_vazios_de_acesso(df_classificado, coluna_y)
    resumo_por_regiao(df_classificado)

    print(f"\n[5/5] Salvando classificação completa (todos os municípios, todos os "
          f"quadrantes) em: {CAMINHO_SAIDA_CSV}")
    colunas_export = [c for c in [
        "codigo_ibge", "nome", "uf", "regiao", COLUNA_POTENCIAL, coluna_y, "quadrante",
        "ivs", "renda_media_domiciliar", "percentual_pobreza_cadunico",
        "percentual_populacao_rural", "indice_seguranca_posse",
    ] if c in df_classificado.columns]
    df_classificado[colunas_export].to_csv(CAMINHO_SAIDA_CSV, index=False)

    print("\n✅ Classificação concluída (somente leitura, nenhuma escrita no banco). "
          "Lembrete: reimplementar esta lógica no backend Node/Express quando ele for "
          "construído (ver ARQUITETURA.md, decisão sobre lógica de quadrante no backend).")


if __name__ == "__main__":
    main()
