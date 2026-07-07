"""
DIAGNÓSTICO: a tarifa de energia (TUSD+TE) explica o padrão "Grupo Equatorial
pior" encontrado no Nordeste (ver ARQUITETURA.md, item 4 da fila de trabalho,
sessão 06/07/2026)?
================================================================================
CONTEXTO: `investigar_distribuidora_vazios_nordeste.py` confirmou que, dentro
do Nordeste, o Grupo Equatorial (MA+PI+AL) tem MMGD residencial mediano PIOR
(69,86 vs. 79,14 kW/1.000 hab) e % Vazio de Acesso PIOR (70,2% vs. 59,3%) que
as demais distribuidoras, apesar de potencial solar mediano quase idêntico e
renda mediana MAIOR no grupo Equatorial — mas o padrão NÃO é uniforme (as duas
piores distribuidoras isoladas, SULGIPE e EPB, não são Equatorial; a melhor,
COSERN, também não é).

Este script repete para o Nordeste o MESMO teste que confirmou tarifa como
mecanismo regional no Centro-Oeste (ver `investigar_tarifa_centro_oeste.py` e
ARQUITETURA.md, seção "Teste do mecanismo tarifa - TUSD+TE"): compara a série
histórica de tarifa total (TUSD+TE, Residencial/Convencional/Tarifa de
Aplicação) entre as distribuidoras Equatorial do Nordeste (MA, PI, AL) e as
demais distribuidoras relevantes da região (COSERN, COELBA, EPB, ENEL CE,
Neoenergia PE, ESE, SULGIPE).

SINAL DE ALERTA JÁ EXISTENTE ANTES DE RODAR ESTE SCRIPT (ver ARQUITETURA.md,
seção "Extensão do teste de tarifa para todas as distribuidoras + correlação
nacional"): no teste NACIONAL por região, o Nordeste teve rho parcial
(controlando renda) de tarifa x MMGD residencial per capita de **-0,018**
(praticamente nulo, sinal errado) — bem diferente do Centro-Oeste (+0,466,
onde a hipótese SE confirmou). Isso já é evidência de que tarifa
provavelmente NÃO é o mecanismo do Nordeste. Este script testa a versão mais
específica/descritiva da hipótese (mediana histórica Equatorial vs. resto,
não correlação com MMGD per capita em si) para não descartar por analogia sem
checar o dado equivalente ao que foi checado no Centro-Oeste.

RESSALVA DE NOME DE AGENTE (mesmo padrão já visto no dataset de conexões MMGD
do Centro-Oeste, onde "Enel GO" = "Equatorial GO"): a Equatorial Energia
adquiriu essas distribuidoras nordestinas com nomes ANTERIORES — CEMAR
(Maranhão), CEPISA (Piauí), CEAL (Alagoas). Como o arquivo de tarifas é
histórico desde 2010, é provável que apareçam sob o nome ANTIGO nos anos
anteriores à aquisição/rebranding. Este script IMPRIME as siglas reais
encontradas no arquivo antes de filtrar, para não repetir suposição errada.

FONTE: mesmo dataset ANEEL "Tarifas de aplicação das distribuidoras de energia
elétrica" já baixado por `investigar_tarifa_centro_oeste.py` (reaproveita o
arquivo local se já existir).

Este script é SOMENTE LEITURA (não grava nada no banco).
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

# Candidatos de sigla a testar — inclui as siglas atuais confirmadas no INDQUAL
# (EQUATORIAL MA/PI/AL, COSERN, COELBA, EPB, ENEL CE, ESE, SULGIPE, Neoenergia
# PE) E os nomes ANTIGOS pré-aquisição pela Equatorial (CEMAR/MA, CEPISA/PI,
# CEAL/AL), já que o arquivo de tarifas é histórico desde 2010.
PALAVRAS_CHAVE_SIGLA = [
    "EQUATORIAL", "CEMAR", "CEPISA", "CEAL", "COSERN", "COELBA", "EPB",
    "ENEL CE", "NEOENERGIA PE", "ESE", "SULGIPE",
]

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
    """Mesmo achado do script do Centro-Oeste: o arquivo NÃO é UTF-8."""
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
    colunas = [c.strip().strip('"') for c in primeira_linha.strip().split(separador)]
    print(f"      Codificação: {codificacao} | Separador detectado: '{separador}'")
    print(f"      Colunas: {colunas}")
    return separador


def inspecionar_siglas_reais(separador: str, codificacao: str) -> None:
    print("\n[3/6] Lendo só a coluna SigAgente (em chunks) para listar siglas reais "
          "relacionadas às distribuidoras do Nordeste em teste...")

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
    print("      Candidatas relacionadas às distribuidoras do Nordeste em teste:")
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


def comparar_tarifa_historica(df: pd.DataFrame) -> None:
    print("\n[6/6] Comparando tarifa (Residencial, Convencional, Tarifa de Aplicação) "
          "por distribuidora — vigência mais recente e série histórica...")

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

    print("\n      --- Média histórica 2010-2024 por distribuidora (mesma janela usada no "
          "veredito do Centro-Oeste) ---")
    janela = subset[(subset["ano"] >= 2010) & (subset["ano"] <= 2024)]
    print(janela.groupby("SigAgente")["tarifa_total_r_por_mwh"].mean().round(1).sort_values().to_string())


def main():
    print("Investigação: tarifa (TUSD+TE) explica o padrão 'Grupo Equatorial pior' no "
          "Nordeste (item 4 da fila de trabalho)?")
    print("=" * 78)

    baixar_se_necessario()
    codificacao = detectar_codificacao()
    separador = descobrir_separador_e_colunas(codificacao)
    inspecionar_siglas_reais(separador, codificacao)

    print("\n[AVISO MANUAL] Confira a lista de siglas impressa acima e ajuste SIGLAS_ALVO "
          "abaixo antes de prosseguir, se necessário — a lista padrão cobre as siglas atuais "
          "confirmadas no INDQUAL e os nomes antigos pré-aquisição pela Equatorial (CEMAR/"
          "CEPISA/CEAL), mas o dado real do arquivo é quem manda.")
    siglas_alvo = [
        "EQUATORIAL MA", "CEMAR",
        "EQUATORIAL PI", "CEPISA",
        "EQUATORIAL AL", "CEAL",
        "COSERN", "COELBA", "EPB", "ENEL CE", "Neoenergia PE", "ESE", "SULGIPE",
    ]

    df = carregar_filtrado(separador, codificacao, siglas_alvo)
    if len(df) == 0:
        print("\n[ERRO] Nenhum dado carregado — não é possível prosseguir. Ajuste SIGLAS_ALVO "
              "com base na lista impressa no passo [3/6] e rode de novo.")
        return

    inspecionar_categorias(df)
    comparar_tarifa_historica(df)

    print("\n✅ Investigação concluída (somente leitura, nenhuma escrita no banco).")
    print("Leitura sugerida: se EQUATORIAL MA/PI/AL (ou seus nomes antigos CEMAR/CEPISA/CEAL) "
          "tiverem tarifa total (TUSD+TE) sistematicamente MENOR que COSERN/COELBA/demais no "
          "período 2010-2024, é evidência a favor do mesmo mecanismo de tarifa já confirmado "
          "no Centro-Oeste. LEMBRETE: o teste nacional por região já encontrou rho parcial "
          "(renda) de -0,018 para o Nordeste (praticamente nulo, sinal errado) — bem diferente "
          "do +0,466 do Centro-Oeste. Um resultado negativo aqui (tarifa Equatorial "
          "SEMELHANTE ou MAIOR que o resto) seria consistente com essa evidência nacional e "
          "reforçaria que o mecanismo do Nordeste é outro, não tarifa.")


if __name__ == "__main__":
    main()
