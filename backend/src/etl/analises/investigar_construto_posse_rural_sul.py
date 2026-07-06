"""
INVESTIGAÇÃO: validade de constructo regional do Índice de Segurança da Posse
no Sul — 5ª hipótese para o caso "Sul x Segurança da Posse"
================================================================================
CONTEXTO (ver ARQUITETURA.md, seção "Sul x Segurança da Posse" dentro de
"Analise de correlacao MMGD x Indicadores Sociais"): o caso resistiu a 4
tentativas de explicação, todas de categoria "mecanismo econômico/geográfico"
(colinearidade com renda, agronegócio/irrigação, tipologia habitacional,
distribuidora/concessionária) — nenhuma explicou por que o Sul destoa das
outras 4 regiões no sinal da correlação parcial (controlando renda) entre
Índice de Segurança da Posse e MMGD residencial per capita.

HIPÓTESE (5ª tentativa, levantada pelo usuário, sessão 06/07/2026): categoria
DIFERENTE das 4 anteriores — não é mecanismo, é VALIDADE DE CONSTRUCTO. O
índice pesa 1,0 x %próprio + 0,5 x %alugado + 0,0 x %cedido (ver migration
0014), assumindo que "não próprio" reflete precariedade — premissa pensada
para o padrão urbano (ocupação irregular). No Sul, com forte presença de
arrendamento rural formalizado e cooperativas de crédito rural nascidas na
região (Sicredi/Sicoob), "não próprio" pode capturar uma relação estável e
formalizada, não precariedade. Se isso for verdade, o índice mediria coisas
DIFERENTES em município rural vs. urbano dentro do próprio Sul — quebrando a
comparabilidade regional do indicador, não exigindo controle por um
confundidor (como as 4 tentativas anteriores tentaram).

RESSALVA IMPORTANTE (documentada em ARQUITETURA.md ao propor esta hipótese):
os municípios extremos já identificados no ranking de MMGD para este caso
(Piraquara, Almirante Tamandaré, Itaperuçu, Rio Branco do Sul) são periferia
METROPOLITANA de Curitiba, não rural profundo. Este script por isso testa a
hipótese na composição AGREGADA da correlação regional (Sul inteiro, dividido
em tercis de ruralidade), não assumindo que os outliers pontuais já
conhecidos sejam onde o efeito rural apareceria.

O QUE ESTE SCRIPT FAZ (mesmo padrão de diagnosticar_outliers_regionais.py e
analisar_correlacao_mmgd_renda.py — reaproveita as mesmas funções, não
duplica query nem lógica de população estimada):
  1. Carrega o mesmo painel município x MMGD x indicadores sociais já usado
     no script principal, restrito à região Sul.
  2. Divide os municípios do Sul (só do Sul, não tercis nacionais) em tercis
     de `percentual_populacao_rural` — mais rural vs. intermediário vs. mais
     urbano, DENTRO do Sul.
  3. Para cada tercil, calcula a correlação parcial de Spearman (controlando
     renda) entre Índice de Segurança da Posse e MMGD residencial per capita.
  4. Compara o sinal/magnitude entre os tercis: se o tercil mais rural do Sul
     tiver sinal/magnitude muito diferente do tercil mais urbano, a hipótese
     de validade de constructo regional ganha sustentação; se os 3 tercis se
     comportarem igual (como aconteceu com a hipótese de tipologia
     habitacional), ela cai.
  5. Inspeção qualitativa: lista os municípios mais rurais e mais urbanos do
     Sul nos extremos do ranking de MMGD residencial per capita, para
     conferir se os 4 outliers já conhecidos (periferia de Curitiba) caem no
     tercil urbano — o que reforçaria a ressalva acima.

ESTE SCRIPT É SOMENTE LEITURA (não grava nada no banco) — mesma categoria de
`backend/src/etl/analises/*`, análise exploratória, não extractor/loader.
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
    CONTROLE_RENDA,
    DATABASE_URL,
    VARIAVEIS_X,
    calcular_indicadores_per_capita,
    carregar_classe_consumo_mmgd,
    carregar_dados,
    correlacao_parcial_spearman,
)

REGIAO_FOCO = "Sul"
COLUNA_INDICADOR = "indice_seguranca_posse"
VARIAVEL_RURALIDADE = "percentual_populacao_rural"

# Municípios já identificados em ARQUITETURA.md como os extremos (bottom) do
# ranking de MMGD residencial per capita no Sul, no contexto deste caso —
# todos periferia metropolitana de Curitiba, não rural profundo. Usados aqui
# só para conferência qualitativa (em qual tercil de ruralidade eles caem),
# não para filtrar a análise.
MUNICIPIOS_OUTLIER_CONHECIDOS = [
    "Piraquara", "Almirante Tamandaré", "Itaperuçu", "Rio Branco do Sul",
]

N_MINIMO_AMOSTRA = int(os.environ.get("N_MINIMO_AMOSTRA", "30"))


def preparar_dados() -> pd.DataFrame:
    print("[1/5] Carregando painel município x MMGD x indicadores sociais...")
    engine = create_engine(DATABASE_URL)
    df_bruto = carregar_dados(engine)

    if os.path.exists(CAMINHO_PARQUET_MMGD):
        classe_consumo = carregar_classe_consumo_mmgd(CAMINHO_PARQUET_MMGD)
        df_bruto = df_bruto.merge(classe_consumo, on="codigo_ibge", how="left")
    else:
        print(f"      [AVISO] Parquet bruto não encontrado em {CAMINHO_PARQUET_MMGD} — "
              f"Y cai para MMGD TOTAL (todas as classes), não só residencial.")

    df = calcular_indicadores_per_capita(df_bruto)
    return df


def selecionar_coluna_y(df: pd.DataFrame) -> str:
    if "mmgd_potencia_residencial_per_1000_hab" in df.columns:
        return "mmgd_potencia_residencial_per_1000_hab"
    return "mmgd_potencia_per_1000_hab"


def classificar_tercis_ruralidade_dentro_do_sul(df_sul: pd.DataFrame) -> pd.DataFrame:
    print(f"[2/5] Classificando municípios do {REGIAO_FOCO} em tercis de ruralidade "
          f"(base: {VARIAVEIS_X[VARIAVEL_RURALIDADE][0]}, tercis calculados SÓ dentro do "
          f"{REGIAO_FOCO}, não nacionalmente)...")

    df_sul = df_sul.copy()
    try:
        df_sul["faixa_ruralidade_sul"] = pd.qcut(
            df_sul[VARIAVEL_RURALIDADE],
            q=3,
            labels=["Mais urbano (menor % rural)", "Intermediário", "Mais rural (maior % rural)"],
            duplicates="drop",
        )
    except ValueError as erro:
        print(f"      [AVISO] Não foi possível cortar em 3 tercis exatos ({erro}) — "
              f"prosseguindo com os grupos que o pandas conseguiu formar.")
        df_sul["faixa_ruralidade_sul"] = pd.qcut(
            df_sul[VARIAVEL_RURALIDADE], q=3, duplicates="drop"
        )

    print(f"      Distribuição dos tercis:\n{df_sul['faixa_ruralidade_sul'].value_counts(dropna=False).to_string()}")
    return df_sul


def testar_hipotese_por_tercil(df_sul_com_tercis: pd.DataFrame, coluna_y: str) -> pd.DataFrame:
    print(f"\n[3/5] Correlação parcial (controlando renda) — {VARIAVEIS_X[COLUNA_INDICADOR][0]} "
          f"x {coluna_y}, por tercil de ruralidade DENTRO do {REGIAO_FOCO}")

    linhas = []

    # Referência: Sul inteiro, sem separar por ruralidade (mesmo cálculo já
    # documentado em ARQUITETURA.md, reproduzido aqui para comparação lado a
    # lado com os tercis).
    resultado_sul_inteiro = correlacao_parcial_spearman(
        df_sul_com_tercis, COLUNA_INDICADOR, coluna_y, CONTROLE_RENDA
    )
    linhas.append({
        "grupo": f"{REGIAO_FOCO} (inteiro, referência)",
        "n": resultado_sul_inteiro["n"],
        "rho_parcial_renda": resultado_sul_inteiro["rho_parcial"],
        "p_valor": resultado_sul_inteiro["p_valor"],
    })

    faixas = [f for f in df_sul_com_tercis["faixa_ruralidade_sul"].cat.categories] \
        if hasattr(df_sul_com_tercis["faixa_ruralidade_sul"], "cat") \
        else df_sul_com_tercis["faixa_ruralidade_sul"].dropna().unique()

    for faixa in faixas:
        subset = df_sul_com_tercis[df_sul_com_tercis["faixa_ruralidade_sul"] == faixa]
        resultado = correlacao_parcial_spearman(subset, COLUNA_INDICADOR, coluna_y, CONTROLE_RENDA)
        linhas.append({
            "grupo": str(faixa),
            "n": resultado["n"],
            "rho_parcial_renda": resultado["rho_parcial"],
            "p_valor": resultado["p_valor"],
        })

    tabela = pd.DataFrame(linhas)
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(tabela.round(4).to_string(index=False))

    n_insuficiente = tabela["n"].lt(N_MINIMO_AMOSTRA).sum()
    if n_insuficiente > 0:
        print(f"      [AVISO] {n_insuficiente} grupo(s) com n < {N_MINIMO_AMOSTRA} — "
              f"rho pouco confiável nesses casos.")

    return tabela


def inspecao_qualitativa(df_sul_com_tercis: pd.DataFrame, coluna_y: str, n: int = 10) -> None:
    print(f"\n[4/5] Inspeção qualitativa — top/bottom {n} municípios do {REGIAO_FOCO} por {coluna_y}, "
          f"com tercil de ruralidade e {VARIAVEIS_X[COLUNA_INDICADOR][0]}")

    colunas_exibir = ["nome", "uf", coluna_y, VARIAVEL_RURALIDADE, "faixa_ruralidade_sul", COLUNA_INDICADOR]
    subset = df_sul_com_tercis[colunas_exibir].dropna(subset=[coluna_y])

    print(f"--- TOP {n} (mais MMGD per capita) ---")
    print(subset.sort_values(coluna_y, ascending=False).head(n).round(3).to_string(index=False))

    print(f"--- BOTTOM {n} (menos MMGD per capita) ---")
    bottom = subset.sort_values(coluna_y, ascending=True).head(n)
    print(bottom.round(3).to_string(index=False))

    print(f"\n      Conferência dos outliers já conhecidos (ARQUITETURA.md) — "
          f"em qual tercil de ruralidade eles caem:")
    conhecidos = df_sul_com_tercis[df_sul_com_tercis["nome"].isin(MUNICIPIOS_OUTLIER_CONHECIDOS)]
    if len(conhecidos) > 0:
        print(conhecidos[["nome", "uf", coluna_y, VARIAVEL_RURALIDADE, "faixa_ruralidade_sul"]]
              .round(3).to_string(index=False))
    else:
        print("      [AVISO] Nenhum dos municípios outlier conhecidos foi encontrado pelo nome "
              "exato no painel — checar grafia/acentuação antes de descartar.")


def veredito(tabela: pd.DataFrame) -> None:
    print(f"\n[5/5] Veredito")
    print("=" * 78)

    linha_sul_inteiro = tabela[tabela["grupo"].str.contains("referência")].iloc[0]
    tercis = tabela[~tabela["grupo"].str.contains("referência")].dropna(subset=["rho_parcial_renda"])

    if len(tercis) < 2:
        print("Dados insuficientes para comparar tercis — reveja o corte de tercis ou o n mínimo.")
        return

    sinais = np.sign(tercis["rho_parcial_renda"])
    magnitudes = tercis["rho_parcial_renda"].abs()

    if sinais.nunique() > 1:
        print("Sinal MUDA entre tercis de ruralidade dentro do Sul — CONSISTENTE com a hipótese de "
              "validade de constructo regional (o índice parece capturar coisas diferentes em "
              "contexto rural vs. urbano dentro do Sul).")
    elif magnitudes.max() - magnitudes.min() > 0.15:
        print("Sinal se mantém igual entre tercis, mas a MAGNITUDE varia consideravelmente "
              "(diferença > 0,15) — sustentação PARCIAL da hipótese: o mecanismo pode estar presente "
              "mas não ao ponto de inverter o sinal agregado do Sul.")
    else:
        print("Sinal e magnitude se mantêm essencialmente iguais entre tercis de ruralidade — "
              "hipótese de validade de constructo regional NÃO SUSTENTADA por este teste "
              "(mesmo desfecho já visto com tipologia habitacional: o confundidor testado não "
              "discrimina dentro do Sul).")

    print("\nLembrete metodológico: este teste usa % população rural como PROXY de contexto "
          "rural/urbano do regime de posse — não confirma diretamente que o 'não próprio' seja "
          "arrendamento formalizado via Sicredi/Sicoob (isso exigiria fonte adicional, ver "
          "ARQUITETURA.md passo 2 e 3 desta investigação). Um resultado 'consistente' aqui é "
          "evidência indireta, não confirmação do mecanismo específico.")


def main():
    print(f"Investigação: validade de constructo regional do Índice de Segurança da Posse "
          f"no {REGIAO_FOCO} (5ª hipótese, caso Sul x Segurança da Posse)")
    print("=" * 78)

    df = preparar_dados()
    coluna_y = selecionar_coluna_y(df)
    print(f"      Y usado: {coluna_y}")

    df_sul = df[df["regiao"] == REGIAO_FOCO].copy()
    print(f"      {len(df_sul)} município(s) do {REGIAO_FOCO} no painel.")

    df_sul_com_tercis = classificar_tercis_ruralidade_dentro_do_sul(df_sul)
    tabela = testar_hipotese_por_tercil(df_sul_com_tercis, coluna_y)
    inspecao_qualitativa(df_sul_com_tercis, coluna_y)
    veredito(tabela)

    print(f"\n✅ Investigação concluída (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
