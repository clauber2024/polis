"""
INVESTIGAÇÃO: o grupo Equatorial explica a concentração de Vazios de Acesso
no Nordeste?
================================================================================
CONTEXTO: `identificar_vazios_de_acesso.py` (sessão 06/07/2026) encontrou que
77,4% dos Vazios de Acesso do país (alto potencial solar, baixo MMGD
residencial per capita) estão no Nordeste, e 62,6% dos municípios da região
se qualificam como Vazio de Acesso - de longe a maior concentração regional
(ver ARQUITETURA.md, item 3 da fila de trabalho).

MOTIVAÇÃO DESTA HIPÓTESE: a "Hipótese de distribuidora/concessionária"
(ARQUITETURA.md, sessão 06/07/2026) já confirmou que EQUATORIAL GO tem MMGD
residencial per capita menos da metade de EMS/EMT no Centro-Oeste, apesar de
irradiação semelhante. O grupo Equatorial Energia também opera distribuidoras
em vários estados do Nordeste que aparecem fortemente no topo do ranking de
Vazio de Acesso (Maranhão, Piauí, Alagoas - além de Pará, no Norte). Se o
mesmo padrão de Goiás se repetir nesses estados, a concentração regional do
Vazio de Acesso no Nordeste teria um mecanismo concreto e acionável
(distribuidora), não só "a região é mais pobre".

RESSALVA JÁ DOCUMENTADA (ver "Teste quantitativo do mecanismo 'fila de
conexão'", ARQUITETURA.md): para Centro-Oeste, o mecanismo de "fila de
conexão lenta" da Equatorial NÃO se sustentou nos dados históricos 2021-2024
(Enel GO/Equatorial GO teve desempenho IGUAL OU MELHOR que Energisa MT/MS
nesse período) - o que se sustentou foi tarifa historicamente mais baixa.
Este script não repete o teste de fila de conexão - só verifica se o PADRÃO
GEOGRÁFICO (distribuidora com MMGD sistematicamente mais baixo apesar de
potencial solar semelhante) se repete no Nordeste. O mecanismo causal (fila,
tarifa, outro) precisaria de teste à parte, como foi feito para Centro-Oeste.

MÉTODO: reaproveita `carregar_municipio_distribuidora` (mesmo schema do
INDQUAL, mesma lógica já validada em investigar_distribuidora_regioes_
problema.py) e a classificação de quadrante de identificar_vazios_de_acesso.py
- não duplica nenhuma das duas. Compara, dentro do Nordeste: (1) taxa de
Vazio de Acesso por distribuidora; (2) MMGD residencial per capita mediano
por distribuidora, controlando visualmente por irradiação mediana (não é
correlação parcial formal - é comparação de medianas, mesmo espírito do
diagnóstico já feito para Centro-Oeste). Destaca separadamente as
distribuidoras cujo nome contém "EQUATORIAL" (grupo a testar).

ESTE SCRIPT É SOMENTE LEITURA (não grava nada no banco).
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
    calcular_indicadores_per_capita,
    carregar_classe_consumo_mmgd,
    carregar_dados,
)
from identificar_vazios_de_acesso import (  # noqa: E402
    COLUNA_POTENCIAL,
    classificar_quadrantes,
    selecionar_coluna_y,
)
from investigar_distribuidora_regioes_problema import (  # noqa: E402
    carregar_municipio_distribuidora,
)

REGIAO_FOCO = "Nordeste"
N_MINIMO_AMOSTRA_DISTRIBUIDORA = 5


def preparar_dados() -> pd.DataFrame:
    print("[1/4] Carregando painel + mapeamento município->distribuidora...")
    engine = create_engine(DATABASE_URL)
    df_bruto = carregar_dados(engine)

    if os.path.exists(CAMINHO_PARQUET_MMGD):
        classe_consumo = carregar_classe_consumo_mmgd(CAMINHO_PARQUET_MMGD)
        df_bruto = df_bruto.merge(classe_consumo, on="codigo_ibge", how="left")
    else:
        print(f"      [AVISO] Parquet bruto não encontrado em {CAMINHO_PARQUET_MMGD} — "
              f"Y cai para MMGD TOTAL, não só residencial.")

    df = calcular_indicadores_per_capita(df_bruto)

    df_distribuidora = carregar_municipio_distribuidora(engine)
    df = df.merge(df_distribuidora, on="codigo_ibge", how="left")

    return df


def resumo_por_distribuidora_nordeste(df_classificado: pd.DataFrame, coluna_y: str) -> pd.DataFrame:
    print(f"\n[3/4] Resumo por distribuidora dentro do {REGIAO_FOCO} — "
          f"taxa de Vazio de Acesso, MMGD e potencial solar medianos")

    subset = df_classificado[df_classificado["regiao"] == REGIAO_FOCO].copy()
    sem_distribuidora = subset["distribuidora"].isna().sum()
    if sem_distribuidora > 0:
        print(f"      [AVISO] {sem_distribuidora} município(s) do {REGIAO_FOCO} sem "
              f"distribuidora mapeada (fora da cobertura do INDQUAL) — excluídos deste resumo.")
    subset = subset.dropna(subset=["distribuidora"])

    subset["eh_vazio_de_acesso"] = subset["quadrante"] == "VAZIO DE ACESSO (alto potencial, baixo MMGD)"
    subset["grupo_equatorial"] = subset["distribuidora"].str.contains(
        "EQUATORIAL", case=False, na=False
    )

    resumo = subset.groupby("distribuidora").agg(
        n=("nome", "count"),
        pct_vazio_de_acesso=("eh_vazio_de_acesso", "mean"),
        mmgd_residencial_mediana=(coluna_y, "median"),
        potencial_solar_mediano=(COLUNA_POTENCIAL, "median"),
        renda_mediana=("renda_media_domiciliar", "median"),
        grupo_equatorial=("grupo_equatorial", "first"),
    ).sort_values("mmgd_residencial_mediana", ascending=True)
    resumo["pct_vazio_de_acesso"] = (resumo["pct_vazio_de_acesso"] * 100).round(1)

    resumo_relevante = resumo[resumo["n"] >= N_MINIMO_AMOSTRA_DISTRIBUIDORA]
    n_pequenas = len(resumo) - len(resumo_relevante)
    if n_pequenas > 0:
        print(f"      [AVISO] {n_pequenas} distribuidora(s) com n < "
              f"{N_MINIMO_AMOSTRA_DISTRIBUIDORA} município(s) excluída(s) da tabela abaixo "
              f"(amostra pequena demais para comparar).")

    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(resumo_relevante.round(3).to_string())

    return subset


def comparar_grupo_equatorial(subset: pd.DataFrame, coluna_y: str) -> None:
    print(f"\n[4/4] Grupo Equatorial vs. demais distribuidoras dentro do {REGIAO_FOCO}")

    if not subset["grupo_equatorial"].any():
        print(f"      Nenhuma distribuidora com 'EQUATORIAL' no nome encontrada no "
              f"{REGIAO_FOCO} pelos dados do INDQUAL carregados — não é possível comparar. "
              f"Confirme manualmente se CEMAR (MA), CEPISA (PI), CEAL (AL) aparecem sob outro "
              f"nome no campo sig_agente antes de descartar esta hipótese.")
        return

    comparacao = subset.groupby("grupo_equatorial").agg(
        n=("nome", "count"),
        pct_vazio_de_acesso=("eh_vazio_de_acesso", "mean"),
        mmgd_residencial_mediana=(coluna_y, "median"),
        potencial_solar_mediano=(COLUNA_POTENCIAL, "median"),
        renda_mediana=("renda_media_domiciliar", "median"),
    ).rename(index={True: "Grupo Equatorial", False: "Demais distribuidoras"})
    comparacao["pct_vazio_de_acesso"] = (comparacao["pct_vazio_de_acesso"] * 100).round(1)

    print(comparacao.round(3).to_string())

    print(f"\n      UFs cobertas pelas distribuidoras do grupo Equatorial no "
          f"{REGIAO_FOCO} (conferir se bate com Maranhão/Piauí/Alagoas esperados):")
    print(subset[subset["grupo_equatorial"]]["uf"].value_counts().to_string())

    print("\nLeitura sugerida: se o grupo Equatorial tiver potencial solar mediano "
          "SEMELHANTE às demais distribuidoras mas MMGD residencial e/ou % Vazio de Acesso "
          "PIOR, é evidência a favor de um mecanismo especifico da distribuidora (mesmo "
          "padrão já confirmado para EQUATORIAL GO no Centro-Oeste) - mas lembrar que, para "
          "Centro-Oeste, o mecanismo de 'fila de conexão' especificamente NÃO se sustentou "
          "nos dados 2021-2024 (ver ARQUITETURA.md) - tarifa histórica foi o que explicou. "
          "Um resultado positivo aqui pede o MESMO teste de mecanismo (tarifa e/ou fila de "
          "conexão) antes de declarar causa, não só correlação geográfica.")


def main():
    print(f"Investigação: grupo Equatorial explica a concentração de Vazios de Acesso "
          f"no {REGIAO_FOCO}?")
    print("=" * 78)

    df = preparar_dados()
    coluna_y = selecionar_coluna_y(df)
    print(f"      Y usado: {coluna_y}")

    df_classificado = classificar_quadrantes(df, coluna_y)
    subset = resumo_por_distribuidora_nordeste(df_classificado, coluna_y)
    comparar_grupo_equatorial(subset, coluna_y)

    print("\n✅ Investigação concluída (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
