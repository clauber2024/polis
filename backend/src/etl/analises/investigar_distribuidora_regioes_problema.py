"""
DIAGNÓSTICO: a distribuidora/concessionária de energia explica os 2 casos
residuais da análise de correlação MMGD x indicadores sociais?
================================================================================
CONTEXTO: após testar 3 hipóteses (colinearidade com renda, agronegócio/
irrigação, tipologia habitacional — ver ARQUITETURA.md, seção "Análise de
correlação MMGD x Indicadores Sociais"), 2 casos continuam sem explicação:
  - Sul x Índice de Segurança da Posse
  - Centro-Oeste x Irradiação Solar
Próximo candidato levantado em ARQUITETURA.md ("Ideias para investigar"):
distribuidora/concessionária — prazo de adesão ao net metering, incentivo
comercial ou postura regulatória local pode variar por concessionária,
independente de renda/urbanização/tipologia habitacional.

ACHADO METODOLÓGICO DESTE SCRIPT: não foi preciso buscar uma fonte NOVA para
município -> distribuidora. O schema do INDQUAL (`qualidade_conjuntos`,
carregado por `etl_indqual.py`) já grava `sig_agente` (sigla da distribuidora,
ex.: "COPEL-DIS", "CEMIG-D") por conjunto elétrico, e `qualidade_conjunto_
municipio` já resolve conjunto <-> município (N:N). Ou seja, o mapeamento
município -> distribuidora já existe no banco como subproduto da carga de
Qualidade de Fornecimento — só nunca tinha sido usado para esse propósito.

RESSALVA: a relação conjunto<->município é N:N (ver ARQUITETURA.md, nota
INDQUAL) — um município pode, em tese, ter conjuntos de mais de uma
distribuidora (município cortado por área de concessão). Este script reporta
quantos municípios caem nesse caso (esperado ser pequena minoria) e os marca
como "MULTIPLA(...)" em vez de forçar uma única distribuidora arbitrária.

Este script é SOMENTE LEITURA (não grava nada) — reaproveita `carregar_dados`
e `calcular_indicadores_per_capita` de analisar_correlacao_mmgd_renda.py para
não duplicar a query nem a lógica de população estimada, mesmo padrão já
usado em diagnosticar_outliers_regionais.py.
================================================================================
"""

import os
import sys

import pandas as pd
from sqlalchemy import create_engine, text

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

CASOS = [
    ("Sul", "indice_seguranca_posse"),
    ("Centro-Oeste", "irradiacao_media_kwh_m2_dia"),
]


def carregar_municipio_distribuidora(engine) -> pd.DataFrame:
    """Reaproveita o schema do INDQUAL (já carregado por etl_indqual.py) para
    montar município -> distribuidora, sem precisar de nova fonte externa."""
    print("[D1] Carregando mapeamento município -> distribuidora (sig_agente) "
          "a partir do schema já existente do INDQUAL...")

    query = text("""
        SELECT qcm.codigo_ibge, qc.sig_agente
        FROM qualidade_conjunto_municipio qcm
        JOIN qualidade_conjuntos qc ON qc.ide_conjunto = qcm.ide_conjunto
        WHERE qc.sig_agente IS NOT NULL
    """)
    with engine.connect() as conexao:
        pares = pd.read_sql(query, conexao)

    print(f"      {len(pares)} par(es) conjunto-município com sig_agente não nulo.")

    agrupado = pares.groupby("codigo_ibge")["sig_agente"].agg(lambda s: sorted(set(s)))
    n_distintos = agrupado.apply(len)

    n_unica = int((n_distintos == 1).sum())
    n_multipla = int((n_distintos > 1).sum())
    print(f"      {n_unica} município(s) com distribuidora única | "
          f"{n_multipla} município(s) com múltiplas distribuidoras (área de concessão dividida).")

    resultado = agrupado.reset_index()
    resultado["distribuidora"] = resultado["sig_agente"].apply(
        lambda lst: lst[0] if len(lst) == 1 else "MULTIPLA(" + "+".join(lst) + ")"
    )
    return resultado[["codigo_ibge", "distribuidora"]]


def resumo_por_distribuidora(df: pd.DataFrame, regiao: str, coluna_indicador: str) -> None:
    rotulo = VARIAVEIS_X[coluna_indicador][0]
    print(f"\n=== {regiao} x {rotulo}: resumo por distribuidora ===")

    subset = df[df["regiao"] == regiao][
        ["nome", "uf", "distribuidora", COLUNA_Y, "renda_media_domiciliar", coluna_indicador]
    ].dropna(subset=[COLUNA_Y, coluna_indicador])

    sem_distribuidora = subset["distribuidora"].isna().sum()
    if sem_distribuidora > 0:
        print(f"  [AVISO] {sem_distribuidora} município(s) da região sem distribuidora mapeada "
              f"(fora da cobertura do INDQUAL) — excluídos deste resumo.")
    subset = subset.dropna(subset=["distribuidora"])

    resumo = subset.groupby("distribuidora").agg(
        n=("nome", "count"),
        mmgd_residencial_mediana=(COLUNA_Y, "median"),
        renda_mediana=("renda_media_domiciliar", "median"),
        indicador_mediano=(coluna_indicador, "median"),
    ).sort_values("mmgd_residencial_mediana", ascending=False)

    print(resumo.round(3).to_string())

    n_pequenos = (resumo["n"] < 5).sum()
    if n_pequenos > 0:
        print(f"  [AVISO] {n_pequenos} distribuidora(s) com n < 5 município(s) na região — "
              f"mediana pouco confiável para esses grupos, ler com cautela.")


def top_bottom_com_distribuidora(df: pd.DataFrame, regiao: str, coluna_indicador: str, n: int = 10) -> None:
    rotulo = VARIAVEIS_X[coluna_indicador][0]
    print(f"\n=== {regiao} x {rotulo}: top/bottom {n} municípios por MMGD residencial per capita, "
          f"com distribuidora ===")

    colunas_exibir = ["nome", "uf", "distribuidora", COLUNA_Y, "renda_media_domiciliar", coluna_indicador]
    subset = df[df["regiao"] == regiao][colunas_exibir].dropna(subset=[COLUNA_Y, coluna_indicador])

    print(f"--- TOP {n} (mais MMGD residencial per capita) ---")
    print(subset.sort_values(COLUNA_Y, ascending=False).head(n).round(3).to_string(index=False))

    print(f"--- BOTTOM {n} (menos MMGD residencial per capita) ---")
    print(subset.sort_values(COLUNA_Y, ascending=True).head(n).round(3).to_string(index=False))


def main():
    print("Investigação: distribuidora/concessionária explica os 2 casos residuais "
          "(Sul x Segurança da Posse, Centro-Oeste x Irradiação Solar)?")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    df_bruto = carregar_dados(engine)

    # Mesma etapa do script principal: a quebra Residencial x Rural só existe
    # se o Parquet bruto da ANEEL estiver disponível localmente (não vem do
    # banco — ver docstring de carregar_classe_consumo_mmgd).
    if os.path.exists(CAMINHO_PARQUET_MMGD):
        classe_consumo = carregar_classe_consumo_mmgd(CAMINHO_PARQUET_MMGD)
        df_bruto = df_bruto.merge(classe_consumo, on="codigo_ibge", how="left")
    else:
        print(f"\n[AVISO] Parquet bruto não encontrado em {CAMINHO_PARQUET_MMGD} — "
              f"não é possível calcular {COLUNA_Y}. Abortando.")
        return

    df = calcular_indicadores_per_capita(df_bruto)

    if COLUNA_Y not in df.columns:
        print(f"\n[AVISO] {COLUNA_Y} não disponível mesmo após tentar carregar o Parquet — "
              f"algo deu errado na quebra por classe de consumo. Abortando.")
        return

    df_distribuidora = carregar_municipio_distribuidora(engine)
    df = df.merge(df_distribuidora, on="codigo_ibge", how="left")

    sem_distribuidora_total = df["distribuidora"].isna().sum()
    if sem_distribuidora_total > 0:
        print(f"\n[AVISO] {sem_distribuidora_total} município(s) do país inteiro sem distribuidora "
              f"mapeada (fora da cobertura do INDQUAL, ver ARQUITETURA.md nota sobre 6 códigos IBGE "
              f"da fonte não existirem em `municipios` — não afeta os 2 casos analisados se forem "
              f"poucos e fora de Sul/Centro-Oeste).")

    for regiao, coluna_indicador in CASOS:
        print("\n" + "#" * 78)
        print(f"# {regiao} x {VARIAVEIS_X[coluna_indicador][0]}")
        print("#" * 78)
        resumo_por_distribuidora(df, regiao, coluna_indicador)
        top_bottom_com_distribuidora(df, regiao, coluna_indicador)

    print("\n✅ Investigação concluída (somente leitura, nenhuma escrita no banco).")
    print("Leitura sugerida: se os municípios do fundo do ranking (BOTTOM) numa região se "
          "concentrarem numa única distribuidora (ou pequeno grupo delas), é evidência a favor "
          "da hipótese. Se estiverem espalhados entre várias distribuidoras sem padrão, a "
          "hipótese não se sustenta e o caso continua não explicado.")


if __name__ == "__main__":
    main()
