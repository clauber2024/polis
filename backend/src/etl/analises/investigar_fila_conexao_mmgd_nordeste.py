"""
DIAGNÓSTICO: EQUATORIAL MA/PI/AL têm desempenho pior que as demais
distribuidoras do Nordeste no atendimento a pedidos de conexão de MMGD?
(último mecanismo cotado, ainda não testado, para o item 4/5 da fila de
trabalho - ver ARQUITETURA.md)
================================================================================
CONTEXTO: `investigar_distribuidora_vazios_nordeste.py` (item 4) confirmou que
o Grupo Equatorial (MA+PI+AL) tem MMGD residencial mediano PIOR e % Vazio de
Acesso PIOR que as demais distribuidoras do Nordeste, apesar de potencial
solar quase idêntico e renda mediana MAIOR. `investigar_tarifa_nordeste_
equatorial.py` (item 5) TESTOU e REJEITOU tarifa como mecanismo - na
verdade, EQUATORIAL MA/PI/AL têm as tarifas MAIS ALTAS das 10 distribuidoras
comparadas 2010-2024 (direção OPOSTA à do Centro-Oeste, onde tarifa mais
baixa explicou a adoção mais baixa). Isso deixa fila/capacidade de conexão
como o único mecanismo já cotado (ver "Hipótese de distribuidora/
concessionária") ainda sem teste quantitativo para esta região.

MESMO RACIONAL do Centro-Oeste (`investigar_fila_conexao_mmgd_centro_oeste.py`,
onde o mecanismo de fila NÃO se confirmou - Enel GO/Equatorial GO teve
desempenho igual ou melhor que Energisa MT/MS 2021-2024): compara, dentro do
Nordeste, % de pedidos conectados e % dentro do prazo regulatório entre
EQUATORIAL MA/PI/AL e as demais distribuidoras da região (COSERN, COELBA,
EPB, ENEL CE, Neoenergia PE, ESE, SULGIPE).

FONTE: mesmo dataset ANEEL do Centro-Oeste ("Atendimento a pedidos de
conexões MMGD - pós Lei 14300"), mas o recurso especifico da REGIÃO NORDESTE
(arquivo separado por região no portal, confirmado via
dadosabertos.aneel.gov.br/dataset/atendimento-mmgd-mini-e-micro-geracao-distribuida):
  https://dadosabertos.aneel.gov.br/dataset/f0773920-9847-46cb-9bc0-dde68761c573/
  resource/9f2e7e25-fc53-4e99-8362-f9f5c8d4c04c/download/
  pedidos-de-conexao-mmgd-regiao-nordeste.parquet

RESSALVA DE NOME DE AGENTE: no dataset de tarifas (histórico desde 2010),
EQUATORIAL MA/PI/AL já apareceram com o nome ATUAL (Equatorial adquiriu essas
distribuidoras antes de 2020 - diferente de Goiás, vendida pela Enel só em
2022, o que fez o dataset de fila do Centro-Oeste usar o nome antigo "Enel
GO"). Como este dataset de fila cobre só 2022-2024 (bem depois das
aquisições no Nordeste), o esperado é já aparecer como "EQUATORIAL MA/PI/AL"
- mas este script IMPRIME as siglas reais antes de filtrar, mesmo cuidado de
sempre, para não presumir.

RESSALVA JÁ CONHECIDA DO CENTRO-OESTE: a "Visão Geral" do dataset descreve
cobertura 7/jan/2022 a 7/jan/2023, mas o intervalo REAL de DatSolicitacao
encontrado no arquivo do Centro-Oeste foi mais amplo (14/06/2021 a
31/12/2024) - este script confirma o intervalo real também para o Nordeste,
não confia na descrição.

Este script é SOMENTE LEITURA (não grava nada no banco).
================================================================================
"""

import os
import time

import pandas as pd
import requests

URL_PARQUET_NORDESTE = (
    "https://dadosabertos.aneel.gov.br/dataset/f0773920-9847-46cb-9bc0-dde68761c573/"
    "resource/9f2e7e25-fc53-4e99-8362-f9f5c8d4c04c/download/"
    "pedidos-de-conexao-mmgd-regiao-nordeste.parquet"
)

CAMINHO_LOCAL = os.environ.get(
    "CAMINHO_PARQUET_FILA_NORDESTE",
    "backend/src/etl/data/raw/aneel_fila_conexao_mmgd/pedidos-de-conexao-mmgd-regiao-nordeste.parquet",
)

# ACHADO (sessao 06/07/2026): o arquivo do Nordeste tem 12,8M linhas x 21
# colunas - carregar todas as colunas como object (comportamento padrao do
# pandas para string) estourou a memoria disponivel (processo morto pelo
# OOM killer do Linux, sem traceback Python). Diferente do Centro-Oeste (bem
# menor), aqui e necessario: (1) carregar so as colunas realmente usadas por
# este script, (2) converter as colunas de texto de baixa cardinalidade para
# `category` logo apos a leitura, antes de qualquer outra operacao.
COLUNAS_NECESSARIAS = [
    "SigAgenteDistribuicao", "DatSolicitacao", "DatInj", "DatLim",
    "DscSituacaoConexao", "DscStatusConexao", "DscMotivoSituacao",
]
COLUNAS_CATEGORICAS = [
    "SigAgenteDistribuicao", "DscSituacaoConexao", "DscStatusConexao", "DscMotivoSituacao",
]

# ACHADO (rodada anterior, antes de otimizar memória - a execução chegou a
# imprimir a lista real de SigAgenteDistribuicao antes de ser morta pelo OOM):
# este dataset usa nomes DIFERENTES dos do INDQUAL/tarifas, mesmo padrão do
# caso "Enel GO" = "Equatorial GO" no Centro-Oeste - aqui NÃO são os nomes
# antigos pré-aquisição (CEMAR/CEPISA/CEAL não apareceram), são só grafias/
# marcas comerciais diferentes usadas por ESTE dataset especificamente:
#   Equatorial MA/PI/AL (mesma raiz, só maiúscula/minúscula diferente),
#   Neoenergia Coelba (= COELBA), Neoenergia Cosern (= COSERN),
#   Neoenergia Pernambuco (= Neoenergia PE), Enel CE (= ENEL CE, igual),
#   Energisa PB (= EPB?), Energisa SE (= ESE?), Sulgipe (= SULGIPE).
# Energisa Borborema aparece como distribuidora ADICIONAL/separada dentro da
# Paraíba (não mapeada no INDQUAL usado nas análises anteriores) - mantida
# de fora do foco por ora, mas visível na tabela completa impressa abaixo.
DISTRIBUIDORAS_FOCO = [
    "Equatorial MA", "Equatorial PI", "Equatorial AL",
    "Neoenergia Cosern", "Neoenergia Coelba", "Energisa PB", "Enel CE",
    "Neoenergia Pernambuco", "Energisa SE", "Sulgipe",
]
GRUPO_EQUATORIAL = ["Equatorial MA", "Equatorial PI", "Equatorial AL"]


def baixar_se_necessario() -> None:
    if os.path.exists(CAMINHO_LOCAL):
        print(f"[1/6] Arquivo já existe localmente em {CAMINHO_LOCAL} — pulando download.")
        return

    print(f"[1/6] Baixando Parquet da ANEEL (Nordeste): {URL_PARQUET_NORDESTE}")
    os.makedirs(os.path.dirname(CAMINHO_LOCAL), exist_ok=True)

    max_tentativas = 4
    resposta = None
    ultimo_erro = None
    for tentativa in range(1, max_tentativas + 1):
        try:
            resposta = requests.get(URL_PARQUET_NORDESTE, timeout=180)
            resposta.raise_for_status()
            ultimo_erro = None
            break
        except requests.exceptions.RequestException as erro:
            ultimo_erro = erro
            print(f"      [AVISO] Tentativa {tentativa}/{max_tentativas} falhou ({erro.__class__.__name__}: "
                  f"{str(erro)[:150]}).")
            if tentativa < max_tentativas:
                espera = 5 * tentativa
                print(f"      Aguardando {espera}s antes de tentar de novo...")
                time.sleep(espera)

    if ultimo_erro is not None:
        print(f"\n[ERRO] Não foi possível baixar o arquivo após {max_tentativas} tentativas: {ultimo_erro}")
        print("       Pode ser instabilidade pontual do portal da ANEEL (já visto antes neste "
              "projeto, ver ARQUITETURA.md) — tente rodar de novo em alguns minutos, ou baixar "
              "manualmente pelo navegador e salvar em:")
        print(f"       {CAMINHO_LOCAL}")
        raise SystemExit(1)

    with open(CAMINHO_LOCAL, "wb") as f:
        f.write(resposta.content)
    print(f"      {len(resposta.content) / 1_048_576:.1f} MB baixado(s).")


def converter_tipos(df: pd.DataFrame) -> pd.DataFrame:
    """Converte em memoria (sem .copy() do frame inteiro - o dado ja e novo
    aqui, foi acabado de ler do Parquet). Datas viram datetime64 (8 bytes),
    colunas de texto de baixa cardinalidade viram category (evita repetir a
    mesma string milhoes de vezes como object solto)."""
    for coluna in ["DatSolicitacao", "DatInj", "DatLim"]:
        if coluna in df.columns:
            df[coluna] = pd.to_datetime(df[coluna], errors="coerce")
    for coluna in COLUNAS_CATEGORICAS:
        if coluna in df.columns:
            df[coluna] = df[coluna].astype("category")
    return df


def inspecionar_valores_reais(df: pd.DataFrame) -> None:
    print("\n[2/6] Inspecionando valores reais (não confiar no dicionário sem checar)...")

    print(f"      Intervalo real de DatSolicitacao: {df['DatSolicitacao'].min()} a {df['DatSolicitacao'].max()}")
    print(f"      Intervalo real de DatInj (quando presente): "
          f"{df['DatInj'].min()} a {df['DatInj'].max()}")

    print("\n      Distribuidoras presentes no arquivo (SigAgenteDistribuicao), contagem de linhas:")
    print(df["SigAgenteDistribuicao"].value_counts().to_string())

    print("\n      Valores distintos de DscSituacaoConexao:")
    print(df["DscSituacaoConexao"].value_counts(dropna=False).to_string())

    print("\n      Valores distintos de DscStatusConexao:")
    print(df["DscStatusConexao"].value_counts(dropna=False).to_string())


def calcular_desempenho_por_distribuidora(df: pd.DataFrame) -> pd.DataFrame:
    print("\n[3/6] Calculando % de pedidos conectados (DatInj preenchida) e cumprimento do prazo "
          "(DatInj <= DatLim) por distribuidora...")

    # Mesmo achado do Centro-Oeste: DatInj tem valores sentinela implausíveis
    # (ex.: 2099-12-31) - tratados como não conectado. Modifica in-place (sem
    # copiar o frame de 12,8M linhas de novo) - já é seguro, df é de uso
    # exclusivo deste script a partir daqui.
    limite_futuro_plausivel = pd.Timestamp.today() + pd.Timedelta(days=365)
    sentinela = df["DatInj"].notna() & (df["DatInj"] > limite_futuro_plausivel)
    n_sentinela = int(sentinela.sum())
    if n_sentinela > 0:
        print(f"      [AVISO] {n_sentinela} registro(s) com DatInj implausível (> 1 ano no futuro, "
              f"ex.: sentinela 2099-12-31) — tratados como NÃO conectados neste cálculo.")
        df.loc[sentinela, "DatInj"] = pd.NaT

    df["conectado"] = df["DatInj"].notna()
    df["datlim_presente"] = df["DatLim"].notna()
    df["dentro_do_prazo"] = df["conectado"] & df["DatLim"].notna() & (df["DatInj"] <= df["DatLim"])
    df["dias_atraso_vs_prazo"] = (df["DatInj"] - df["DatLim"]).dt.days

    # Agregação vetorizada (sem groupby().apply() com função Python por grupo -
    # mais leve em memória e mais rápido para 12,8M linhas): calcula n_pedidos
    # e pct_conectado sobre TODO o frame, depois recorta só os conectados para
    # as métricas que só fazem sentido entre eles (prazo, atraso).
    n_pedidos = df.groupby("SigAgenteDistribuicao", observed=True).size()
    pct_conectado = (df.groupby("SigAgenteDistribuicao", observed=True)["conectado"].mean() * 100).round(1)

    conectados = df.loc[
        df["conectado"],
        ["SigAgenteDistribuicao", "datlim_presente", "dentro_do_prazo", "dias_atraso_vs_prazo"],
    ]
    grp_conectados = conectados.groupby("SigAgenteDistribuicao", observed=True)
    # CHECAGEM DE QUALIDADE DE DADO (adicionada após 1a rodada mostrar 0,0%/0,1%
    # de "dentro do prazo" para Equatorial MA/PI/AL, contra 81-100% em todo o
    # resto - achado extremo demais para ser confiável sem checar se é
    # desempenho real ou campo DatLim simplesmente ausente para essas
    # distribuidoras): % de conectados com DatLim de fato preenchida.
    pct_datlim_presente = (grp_conectados["datlim_presente"].mean() * 100).round(1)
    pct_dentro_do_prazo = (grp_conectados["dentro_do_prazo"].mean() * 100).round(1)
    mediana_atraso = grp_conectados["dias_atraso_vs_prazo"].median()

    resumo = pd.DataFrame({
        "n_pedidos": n_pedidos,
        "pct_conectado": pct_conectado,
        "pct_datlim_presente_entre_conectados": pct_datlim_presente,
        "pct_dentro_do_prazo_entre_conectados": pct_dentro_do_prazo,
        "mediana_dias_atraso_vs_prazo": mediana_atraso,
    }).sort_values("n_pedidos", ascending=False)

    print(resumo.to_string())

    print("\n      [AVISO] Se 'pct_datlim_presente_entre_conectados' for muito baixo para alguma "
          "distribuidora, os números de 'pct_dentro_do_prazo' e mediana de atraso NÃO refletem "
          "desempenho real — refletem ausência do campo DatLim no dado, e devem ser descartados "
          "para essa distribuidora até achar outra fonte/campo de prazo.")

    print("\n      --- Foco nas distribuidoras comparadas na análise anterior (item 4/5) ---")
    foco = resumo[resumo.index.isin(DISTRIBUIDORAS_FOCO)]
    if len(foco) == 0:
        print("      [AVISO] Nenhuma das siglas esperadas foi encontrada exatamente como esperado "
              "no arquivo — conferir a lista completa de siglas acima (pode haver variação de "
              "grafia/nome antigo, ex.: CEMAR/CEPISA/CEAL em vez de EQUATORIAL MA/PI/AL).")
    else:
        print(foco.to_string())

    return resumo


def comparar_grupo_equatorial(resumo: pd.DataFrame) -> None:
    print("\n[4/6] Grupo Equatorial (MA+PI+AL) vs. demais distribuidoras do Nordeste "
          "(agregado ponderado por n_pedidos)...")

    presentes_equatorial = [d for d in GRUPO_EQUATORIAL if d in resumo.index]
    if not presentes_equatorial:
        print("      [AVISO] Nenhuma sigla do Grupo Equatorial (EQUATORIAL MA/PI/AL) encontrada "
              "exatamente como esperado — conferir siglas reais impressas acima (pode ser nome "
              "antigo pré-aquisição, ex.: CEMAR/CEPISA/CEAL).")
        return

    equatorial = resumo.loc[presentes_equatorial]
    demais = resumo.loc[resumo.index.isin(DISTRIBUIDORAS_FOCO) & ~resumo.index.isin(GRUPO_EQUATORIAL)]

    def agregado_ponderado(sub: pd.DataFrame) -> pd.Series:
        n_total = sub["n_pedidos"].sum()
        return pd.Series({
            "n_pedidos": n_total,
            "pct_conectado_ponderado": round((sub["pct_conectado"] * sub["n_pedidos"]).sum() / n_total, 1),
            "pct_dentro_do_prazo_ponderado": round(
                (sub["pct_dentro_do_prazo_entre_conectados"] * sub["n_pedidos"]).sum() / n_total, 1
            ),
            "mediana_dias_atraso_media_simples": sub["mediana_dias_atraso_vs_prazo"].mean(),
        })

    comparacao = pd.DataFrame({
        "Grupo Equatorial (MA+PI+AL)": agregado_ponderado(equatorial),
        "Demais distribuidoras (foco)": agregado_ponderado(demais) if len(demais) > 0 else pd.Series(dtype=float),
    }).T

    print(comparacao.to_string())


def inspecionar_motivos_nao_conectado(df: pd.DataFrame) -> None:
    print("\n[5/6] Para pedidos NÃO conectados (DatInj vazia), motivos mais comuns por distribuidora "
          "(DscMotivoSituacao)...")

    df_pendente = df[df["DatInj"].isna()]
    if len(df_pendente) == 0:
        print("      Nenhum pedido pendente encontrado no arquivo.")
        return

    for distribuidora in DISTRIBUIDORAS_FOCO:
        subset = df_pendente[df_pendente["SigAgenteDistribuicao"] == distribuidora]
        if len(subset) == 0:
            continue
        print(f"\n      {distribuidora} ({len(subset)} pedido(s) sem DatInj):")
        print(subset["DscMotivoSituacao"].value_counts(dropna=False).head(10).to_string())


def main():
    print("Investigação: EQUATORIAL MA/PI/AL têm desempenho pior que demais distribuidoras do "
          "Nordeste no atendimento a pedidos de conexão de MMGD? (ANEEL 'Atendimento a pedidos "
          "de conexões MMGD', recurso regional Nordeste)")
    print("=" * 78)

    baixar_se_necessario()

    print(f"\n[2/6] Lendo Parquet local (só as {len(COLUNAS_NECESSARIAS)} colunas usadas neste "
          f"script, de 21 no arquivo original — arquivo é grande demais para carregar tudo "
          f"como object sem estourar memória, achado real desta sessão)...")
    df = pd.read_parquet(CAMINHO_LOCAL, columns=COLUNAS_NECESSARIAS)
    print(f"      {len(df)} linha(s) lida(s). Colunas: {list(df.columns)}")
    df = converter_tipos(df)

    inspecionar_valores_reais(df)
    resumo = calcular_desempenho_por_distribuidora(df)
    comparar_grupo_equatorial(resumo)
    inspecionar_motivos_nao_conectado(df)

    print("\n✅ Investigação concluída (somente leitura, nenhuma escrita no banco).")
    print("[6/6] Leitura sugerida: se o Grupo Equatorial (MA+PI+AL) tiver % dentro do prazo MENOR "
          "e/ou mediana de atraso MAIOR que as demais distribuidoras do Nordeste, é evidência "
          "quantitativa a favor de fila/capacidade de conexão como mecanismo - diferente do "
          "Centro-Oeste, onde este mesmo mecanismo NÃO se confirmou (Enel GO/Equatorial GO teve "
          "desempenho igual ou melhor que Energisa MT/MS). LEMBRETE: a descrição do dataset cita "
          "jan/2022 a jan/2023, mas o intervalo REAL (impresso acima) costuma ser mais amplo - "
          "confiar no dado, não na descrição. Se este teste também vier negativo, os 3 mecanismos "
          "já cotados (renda, tarifa, fila de conexão) terão sido descartados para o Nordeste, e "
          "o caso deveria seguir o mesmo caminho do 'Sul x Segurança da Posse' - registrar como "
          "encerrado sem mecanismo identificado, não continuar testando hipóteses ad-hoc "
          "indefinidamente.")


if __name__ == "__main__":
    main()
