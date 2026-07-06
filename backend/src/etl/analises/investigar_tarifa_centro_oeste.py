"""
DIAGNÓSTICO: a tarifa de energia (TUSD+TE) explica a MMGD residencial baixa
em Goiás (EQUATORIAL GO) apesar de irradiação similar a MT/MS?
================================================================================
CONTEXTO: 5a hipótese testada para o caso Centro-Oeste x Irradiação Solar (ver
ARQUITETURA.md, seção "Análise de correlação MMGD x Indicadores Sociais").
Já testadas e não confirmadas: colinearidade com renda, agronegócio/irrigação,
tipologia habitacional, fila de conexão MMGD (dados 2021-2024 mostraram
Enel GO/Equatorial GO com desempenho IGUAL OU MELHOR que Energisa MT/MS).

RACIONAL DESTA HIPÓTESE: a economia de instalar geração solar residencial
depende do quanto ela "economiza na conta de luz" — isso é proporcional à
tarifa total (TUSD + TE) que o consumidor paga por kWh. Se a tarifa em Goiás
for sistematicamente MENOR que em MT/MS, o retorno financeiro do investimento
em MMGD residencial é menor, o que poderia explicar parte da adoção mais
baixa independente de renda, urbanização, tipologia habitacional ou fila de
conexão.

FONTE: ANEEL Dados Abertos, dataset "Tarifas de aplicação das distribuidoras
de energia elétrica"
(https://dadosabertos.aneel.gov.br/dataset/tarifas-distribuidoras-energia-eletrica).
Campos confirmados via dicionário de metadados real (versão 1.0, 15/03/2022
— não confiar em nome de campo sem checar, mesmo cuidado do caso TSEE):
  - SigAgente: sigla da distribuidora (dicionário cita "EMT" como exemplo —
    mesma convenção do INDQUAL, mas este script confirma isso no dado real,
    não assume)
  - DscSubgrupo: "B1" = residencial
  - DscClasse: "Residencial"
  - DscBaseTarifa: "Tarifa de Aplicação" (o que o consumidor de fato paga,
    != "Base Econômica", que é só para cálculo interno)
  - DscModalidadeTarifaria: "Convencional", "Branca", "Horária (Verde/Azul)"
    etc. — filtra Convencional por ser a modalidade padrão/majoritária
  - DatInicioVigencia / DatFimVigencia: vigência de cada reajuste
  - VlrTusd, VlrTe: valores em R$/MWh (para TE) e R$/MWh ou R$/kW (TUSD,
    conforme DscUnidade — confirmar unidade real antes de somar)

RESSALVA: o arquivo é histórico completo desde 2010, todas as distribuidoras
do Brasil, todos os subgrupos/modalidades — pode ser grande. Filtra por
SigAgente de interesse e por DscSubgrupo='B1' no momento da leitura (chunks),
para não estourar memória.

Este script é SOMENTE LEITURA (não grava nada no banco) — baixa o CSV público
da ANEEL para a pasta local de dados brutos e analisa com pandas.
================================================================================
"""

import os
import time

import pandas as pd
import requests

URL_CSV_TARIFAS = (
    "https://dadosabertos.aneel.gov.br/dataset/5a583f3e-1646-4f67-bf0f-69db4203e89e/"
    "resource/fcf2906c-7c32-4b9b-a637-054e7a5234f4/download/"
    "tarifas-homologadas-distribuidoras-energia-eletrica.csv"
)

CAMINHO_LOCAL = os.environ.get(
    "CAMINHO_CSV_TARIFAS",
    "backend/src/etl/data/raw/aneel_tarifas/tarifas-homologadas-distribuidoras-energia-eletrica.csv",
)

# Candidatos de sigla a testar — inclui variantes já vistas em outros datasets
# ANEEL nesta mesma investigação (INDQUAL usa "EQUATORIAL GO"/"EMT"/"EMS"; o
# dataset de conexões MMGD usa "Enel GO"/"Energisa MT"/"Energisa MS" para as
# MESMAS empresas). Este script primeiro IMPRIME as siglas reais encontradas
# no arquivo antes de filtrar, para não repetir o mesmo erro de suposição.
PALAVRAS_CHAVE_SIGLA = ["GO", "MT", "MS", "EQUATORIAL", "ENEL", "ENERGISA"]

TAMANHO_CHUNK = 200_000


def baixar_se_necessario() -> None:
    if os.path.exists(CAMINHO_LOCAL):
        print(f"[1/6] Arquivo já existe localmente em {CAMINHO_LOCAL} — pulando download.")
        return

    print(f"[1/6] Baixando CSV da ANEEL (tarifas homologadas): {URL_CSV_TARIFAS}")
    os.makedirs(os.path.dirname(CAMINHO_LOCAL), exist_ok=True)

    max_tentativas = 4
    resposta = None
    ultimo_erro = None
    for tentativa in range(1, max_tentativas + 1):
        try:
            resposta = requests.get(URL_CSV_TARIFAS, timeout=300, stream=True)
            resposta.raise_for_status()
            ultimo_erro = None
            break
        except requests.exceptions.RequestException as erro:
            ultimo_erro = erro
            print(f"      [AVISO] Tentativa {tentativa}/{max_tentativas} falhou "
                  f"({erro.__class__.__name__}: {str(erro)[:150]}).")
            if tentativa < max_tentativas:
                espera = 5 * tentativa
                print(f"      Aguardando {espera}s antes de tentar de novo...")
                time.sleep(espera)

    if ultimo_erro is not None:
        print(f"\n[ERRO] Não foi possível baixar o arquivo após {max_tentativas} tentativas: {ultimo_erro}")
        raise SystemExit(1)

    total_bytes = 0
    with open(CAMINHO_LOCAL, "wb") as f:
        for pedaco in resposta.iter_content(chunk_size=8192):
            f.write(pedaco)
            total_bytes += len(pedaco)
    print(f"      {total_bytes / 1_048_576:.1f} MB baixado(s).")


def detectar_codificacao() -> str:
    """O arquivo NÃO é UTF-8 (achado real, não suposição — a primeira tentativa
    quebrou com UnicodeDecodeError no byte 0xc7, típico de 'Ç' em latin-1/
    cp1252). Mesmo padrão de fallback já usado em etl_indqual.py
    (fetch_csv_rows): tenta utf-8-sig, cai para latin-1 se falhar."""
    with open(CAMINHO_LOCAL, "rb") as f:
        amostra = f.read(1_000_000)
    try:
        amostra.decode("utf-8-sig")
        return "utf-8-sig"
    except UnicodeDecodeError:
        return "latin-1"


def descobrir_separador_e_colunas(codificacao: str) -> str:
    print("\n[2/6] Detectando separador e colunas reais do CSV...")
    with open(CAMINHO_LOCAL, "r", encoding=codificacao, errors="replace") as f:
        primeira_linha = f.readline()

    separador = ";" if primeira_linha.count(";") > primeira_linha.count(",") else ","
    # As colunas vêm entre aspas duplas no arquivo real — remove para exibição limpa
    # (o pandas já trata isso sozinho ao ler de verdade, isto é só para o print).
    colunas = [c.strip().strip('"') for c in primeira_linha.strip().split(separador)]
    print(f"      Codificação: {codificacao} | Separador detectado: '{separador}'")
    print(f"      Colunas: {colunas}")
    return separador


def inspecionar_siglas_reais(separador: str, codificacao: str) -> None:
    print("\n[3/6] Lendo só a coluna SigAgente (em chunks) para listar siglas reais "
          "relacionadas a Goiás/MT/MS...")

    siglas_encontradas = set()
    for chunk in pd.read_csv(
        CAMINHO_LOCAL, sep=separador, usecols=["SigAgente"], encoding=codificacao,
        chunksize=TAMANHO_CHUNK, dtype=str, on_bad_lines="skip",
    ):
        siglas_encontradas.update(chunk["SigAgente"].dropna().unique().tolist())

    candidatos = sorted(
        s for s in siglas_encontradas
        if any(palavra.upper() in s.upper() for palavra in PALAVRAS_CHAVE_SIGLA)
    )
    print(f"      {len(siglas_encontradas)} sigla(s) distintas no arquivo inteiro.")
    print("      Candidatas relacionadas a Goiás/MT/MS/Equatorial/Enel/Energisa:")
    for sigla in candidatos:
        print(f"        - {sigla}")


def carregar_filtrado(separador: str, codificacao: str, siglas_alvo: list) -> pd.DataFrame:
    print(f"\n[4/6] Carregando linhas filtradas (SigAgente in {siglas_alvo}, "
          f"DscSubGrupo == 'B1') em chunks...")

    pedacos_filtrados = []
    total_linhas_lidas = 0
    for chunk in pd.read_csv(
        CAMINHO_LOCAL, sep=separador, encoding=codificacao,
        chunksize=TAMANHO_CHUNK, dtype=str, on_bad_lines="skip",
    ):
        total_linhas_lidas += len(chunk)
        filtro = chunk["SigAgente"].isin(siglas_alvo) & (chunk["DscSubGrupo"] == "B1")
        if filtro.any():
            pedacos_filtrados.append(chunk[filtro].copy())

    print(f"      {total_linhas_lidas} linha(s) lidas no total do arquivo.")
    if not pedacos_filtrados:
        print("      [AVISO] Nenhuma linha encontrada para as siglas/subgrupo pedidos.")
        return pd.DataFrame()

    df = pd.concat(pedacos_filtrados, ignore_index=True)
    print(f"      {len(df)} linha(s) após filtro.")
    return df


def inspecionar_categorias(df: pd.DataFrame) -> None:
    print("\n[5/6] Inspecionando valores reais de campos categóricos (não confiar no "
          "dicionário sem checar)...")
    for coluna in ["DscBaseTarifaria", "DscModalidadeTarifaria", "DscClasse", "NomPostoTarifario", "DscUnidadeTerciaria"]:
        print(f"\n      Valores distintos de {coluna}:")
        print(df[coluna].value_counts(dropna=False).to_string())


def comparar_tarifa_mais_recente(df: pd.DataFrame) -> None:
    print("\n[6/6] Comparando tarifa vigente mais recente (Residencial, Convencional, "
          "Tarifa de Aplicação) por distribuidora...")

    df = df.copy()
    df["DatInicioVigencia"] = pd.to_datetime(df["DatInicioVigencia"], errors="coerce")
    df["VlrTUSD"] = pd.to_numeric(df["VlrTUSD"].str.replace(",", "."), errors="coerce")
    df["VlrTE"] = pd.to_numeric(df["VlrTE"].str.replace(",", "."), errors="coerce")

    filtro = (
        (df["DscBaseTarifaria"] == "Tarifa de Aplicação")
        & (df["DscModalidadeTarifaria"] == "Convencional")
        & (df["DscClasse"] == "Residencial")
    )
    subset = df[filtro].copy()
    print(f"      {len(subset)} linha(s) após filtro Residencial/Convencional/Tarifa de Aplicação.")

    if len(subset) == 0:
        print("      [AVISO] Nenhuma linha bateu com os 3 filtros — conferir os valores reais "
              "impressos no passo [5/6] (pode haver variação de grafia/acentuação).")
        return

    mais_recente = (
        subset.sort_values("DatInicioVigencia")
        .groupby("SigAgente")
        .tail(1)
        .copy()
    )
    mais_recente["tarifa_total_r_por_mwh"] = mais_recente["VlrTUSD"] + mais_recente["VlrTE"]

    colunas_exibir = ["SigAgente", "DatInicioVigencia", "VlrTUSD", "VlrTE",
                       "tarifa_total_r_por_mwh", "DscUnidadeTerciaria"]
    print(mais_recente[colunas_exibir].sort_values("tarifa_total_r_por_mwh", ascending=False).to_string(index=False))

    print("\n      --- Série histórica (média anual de tarifa_total) por distribuidora ---")
    subset["ano"] = subset["DatInicioVigencia"].dt.year
    subset["tarifa_total_r_por_mwh"] = subset["VlrTUSD"] + subset["VlrTE"]
    serie = subset.groupby(["SigAgente", "ano"])["tarifa_total_r_por_mwh"].mean().unstack("SigAgente")
    print(serie.round(1).to_string())


def main():
    print("Investigação: tarifa (TUSD+TE) explica MMGD residencial baixa em Goiás "
          "(EQUATORIAL GO) vs MT/MS? (5a hipótese, ANEEL 'Tarifas homologadas')")
    print("=" * 78)

    baixar_se_necessario()
    codificacao = detectar_codificacao()
    separador = descobrir_separador_e_colunas(codificacao)
    inspecionar_siglas_reais(separador, codificacao)

    print("\n[AVISO MANUAL] Confira a lista de siglas impressa acima e ajuste SIGLAS_ALVO "
          "abaixo antes de prosseguir, se necessário — usando por padrão o que já foi "
          "confirmado no INDQUAL/dataset de conexões MMGD (EQUATORIAL GO, Enel GO, EMT, "
          "Energisa MT, EMS, Energisa MS — cobre as duas convenções de nome já vistas).")
    siglas_alvo = [
        "EQUATORIAL GO", "Enel GO", "EMT", "Energisa MT", "EMS", "Energisa MS",
    ]

    df = carregar_filtrado(separador, codificacao, siglas_alvo)
    if len(df) == 0:
        print("\n[ERRO] Nenhum dado carregado — não é possível prosseguir. Ajuste SIGLAS_ALVO "
              "com base na lista impressa no passo [3/6] e rode de novo.")
        return

    inspecionar_categorias(df)
    comparar_tarifa_mais_recente(df)

    print("\n✅ Investigação concluída (somente leitura, nenhuma escrita no banco).")
    print("Leitura sugerida: se EQUATORIAL GO/Enel GO tiver tarifa total (TUSD+TE) "
          "sistematicamente MENOR que EMT/EMS, é evidência a favor da hipótese de retorno "
          "financeiro mais fraco explicando parte da adoção residencial mais baixa em Goiás.")


if __name__ == "__main__":
    main()
