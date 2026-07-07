"""
INVESTIGACAO EXPLORATORIA: chuva/vento (INMET) x ressarcimento por danos
eletricos (ANEEL/INDGER) - hipotese de "queima de equipamentos"
================================================================================
CONTEXTO: ideia levantada em 03/07/2026 ("queima de equipamentos... tende a
concentrar onde a rede tem pouca protecao... combinado com alta incidencia de
raios"). Pesquisa de viabilidade feita em 07/07/2026 (ver ARQUITETURA.md,
secao "Ideias para investigar (nao priorizadas)") encontrou:
  - `indger-dados-comerciais.csv` (ANEEL/INDGER, Portal de Dados Abertos) tem
    `CodMunicipioIBGE` NATIVO e `QtdSolicRessarcimentoDano` (numero de
    solicitacoes de ressarcimento por dano eletrico) - granularidade municipio
    x distribuidora x mes, dados desde dez/2023. NAO tem campo de CAUSA do
    dano (nao distingue raio/sobretensao de outras causas).
  - `basedosdados.br_inmet_bdmep` (Base dos Dados/BigQuery - MESMA fonte/
    mecanismo de acesso ja usado no projeto para RAIS e Mortalidade Infantil)
    tem microdados HORARIOS de precipitacao e vento por ESTACAO, e a tabela
    `estacao` ja resolve `id_municipio` por estacao - so ~400 estacoes
    automaticas para 5.573 municipios (cobertura direta por volta de 7%).
  - Decisao do usuario (07/07/2026): ampliar a hipotese de raios para incluir
    tambem chuva/vento, aceitando que a relacao fica INFERIDA (a fonte de
    ressarcimento nao rotula causa - nunca vamos poder dizer "este dano foi
    causado por esta chuva", so correlacionar volume de solicitacoes com
    intensidade climatica no mesmo periodo).

DESENHO DESTE TESTE EXPLORATORIO (recomendacao dada ao usuario, 07/07/2026):
  1. NAO usar media mensal de clima - usar PICO mensal
     (`precipitacao_max_mes`, `vento_rajada_max_mes`). Dano por sobretensao e
     causado por evento extremo pontual (uma tempestade, uma rajada isolada),
     nao pelo clima medio do mes - media dilui exatamente o sinal que
     interessa.
  2. Restringir a analise aos MUNICIPIOS QUE CONTEM UMA ESTACAO INMET (via
     `id_municipio` ja resolvido pela Base dos Dados) - NAO fazer atribuicao
     por estacao-mais-proxima. Chuva e vento sao fenomenos localizados
     (diferente de irradiacao solar, que e suave no espaco e por isso o INPE
     conseguiu fazer join por nome de municipio sem drama) - atribuir a um
     municipio o dado de uma estacao a 200-300 km de distancia seria ruido,
     nao sinal. Isso restringe a amostra a uma fracao pequena e
     NAO-ALEATORIA dos municipios (estacoes tendem a ficar em cidades
     maiores/capitais) - o resultado deve ser lido como TESTE DE HIPOTESE
     exploratorio, NAO como indicador nacional (mesmo tratamento ja dado a
     ZEIS, que so cobre 4 capitais, ver ARQUITETURA.md).
  3. Unidade de observacao = MUNICIPIO x MES (painel), nao municipio
     agregado - a pergunta e "mes com evento climatico extremo tem mais
     solicitacao de ressarcimento NESSE MES", nao "municipios com clima mais
     severo tem mais ressarcimento no total historico" (que confundiria com
     diferencas estruturais de rede entre municipios, nao com o evento
     climatico em si).
  4. Correlacao de Spearman bruta + parcial controlando renda (REUSA a
     funcao ja validada em analisar_correlacao_mmgd_renda.py, mesmo metodo
     de residuo de postos) - mas SEM efeito fixo de municipio (o projeto nao
     usa modelos de efeito fixo em nenhuma analise ate agora - registrado
     aqui como limitacao explicita, nao pretender ser mais rigoroso do que
     realmente e).

LIMITACOES METODOLOGICAS (documentar sempre que este script for citado):
  - Amostra restrita e enviesada (so municipios com estacao INMET) - NAO
    generalizar o resultado para o Brasil todo.
  - Causalidade NAO identificada: correlacao entre pico climatico do mes e
    volume de ressarcimento no mesmo mes, sem controle de efeito fixo de
    municipio nem de outros choques simultaneos (ex.: campanha de
    divulgacao do direito ao ressarcimento pode gerar pico de solicitacoes
    sem relacao com clima).
  - `QtdSolicRessarcimentoDano` mistura TODAS as causas de dano eletrico
    (nao so sobretensao por clima) - qualquer correlacao encontrada e um
    LIMITE INFERIOR do efeito real do clima (ruido de outras causas dilui o
    sinal, nunca infla).
  - Renda (`renda_media_domiciliar`) e a mesma usada no resto do projeto:
    RAIS, so trabalho formal (ver ressalva em extrair_renda_trabalho_rais.py).

ESTE SCRIPT E SOMENTE LEITURA - nao grava nada no banco, nao e um
extractor/loader (ainda nao existe extractor formal para INDGER nem para
INMET - ver PROXIMO PASSO no ARQUITETURA.md, secao "Queima de equipamentos").
Fontes: download direto do CSV bruto da ANEEL (cacheado localmente,
nao versionado) + BigQuery via Base dos Dados (mesmo mecanismo de
`extrair_renda_trabalho_rais.py`/`extrair_capital_humano_mortalidade_infantil.py`)
+ Postgres local (so para renda/controle, via `vw_indicadores_sociais_consolidado`,
mesma view ja usada nas demais analises desta pasta).

DEPENDENCIA NOVA: google-cloud-bigquery e db-dtypes ja estao listados no
CLAUDE.md (usados pelos extractors de RAIS/Mortalidade Infantil) - requer
`gcloud auth application-default login` ja configurado no ambiente, mesma
credencial reusada aqui.
================================================================================
"""

import os
import sys

import numpy as np
import pandas as pd
import requests
from scipy.stats import spearmanr
from sqlalchemy import create_engine, text

sys.path.insert(0, "backend/src/etl/analises")

from analisar_correlacao_mmgd_renda import (  # noqa: E402
    DATABASE_URL,
    classificar_tercis_urbanizacao,
    correlacao_parcial_spearman,
    correlacao_spearman,
)

# CSV bruto do INDGER - Dados Comerciais (ANEEL/dadosabertos, resource id
# fd10c9d4-cb76-4020-a322-e79afb13eaf7, confirmado via inspecao direta em
# 07/07/2026). ~117 MiB - cacheado localmente para nao rebaixar a cada rodada.
URL_INDGER_DADOS_COMERCIAIS = (
    "https://dadosabertos.aneel.gov.br/dataset/7cacb2c4-b165-4591-a793-9ed20d1f167d/"
    "resource/fd10c9d4-cb76-4020-a322-e79afb13eaf7/download/indger-dados-comerciais.csv"
)
CAMINHO_CACHE_INDGER = os.environ.get(
    "CAMINHO_CACHE_INDGER",
    "backend/src/etl/data/raw/aneel_indger/indger-dados-comerciais.csv",
)

# So as colunas que este script realmente usa - o arquivo completo tem 63
# colunas, ler so as necessarias economiza bastante memoria (~117 MiB brutos).
COLUNAS_INDGER_NECESSARIAS = [
    "CodMunicipioIBGE",
    "SigAgente",
    "DatReferenciaInformada",
    "QtdUCAtiva",
    "QtdSolicRessarcimentoDano",
    "QtdRessarcIndeferido",
]

# Ano minimo a considerar - INDGER so tem dado a partir de dez/2023, e os
# microdados do INMET gratuitos na Base dos Dados vao ate 2025-12-30 (2026 e
# BD Pro/pago) - restringe a janela de sobreposicao das duas fontes.
ANO_MINIMO = int(os.environ.get("ANO_MINIMO", "2024"))
ANO_MAXIMO = int(os.environ.get("ANO_MAXIMO", "2025"))

N_MINIMO_AMOSTRA = int(os.environ.get("N_MINIMO_AMOSTRA", "30"))


# --------------------------------------------------------------------------
# 1. Ressarcimento por danos eletricos (ANEEL/INDGER) - municipio x mes
# --------------------------------------------------------------------------
def baixar_indger_dados_comerciais(caminho_cache: str) -> None:
    if os.path.exists(caminho_cache):
        print(f"      Cache local ja existe em {caminho_cache} - pulando download.")
        return

    print(f"      Baixando {URL_INDGER_DADOS_COMERCIAIS} (~117 MiB, pode demorar)...")
    os.makedirs(os.path.dirname(caminho_cache), exist_ok=True)
    cabecalhos = {"User-Agent": "Mozilla/5.0 (compatible; AtlasSolarJusto/1.0)"}
    with requests.get(URL_INDGER_DADOS_COMERCIAIS, headers=cabecalhos, stream=True, timeout=120) as resposta:
        resposta.raise_for_status()
        with open(caminho_cache, "wb") as arquivo:
            for pedaco in resposta.iter_content(chunk_size=1024 * 1024):
                arquivo.write(pedaco)
    print(f"      Download concluido: {caminho_cache}")


def carregar_ressarcimento_municipio_mes(caminho_cache: str) -> pd.DataFrame:
    """
    Le indger-dados-comerciais.csv (so as colunas necessarias), agrega por
    municipio x mes (somando entre distribuidoras, ja que um municipio pode
    ter mais de uma distribuidora atendendo trechos diferentes do territorio)
    e calcula a taxa de solicitacoes de ressarcimento por 1.000 UCs ativas.
    """
    print("[1/8] Carregando ressarcimento por danos eletricos (ANEEL/INDGER)...")
    baixar_indger_dados_comerciais(caminho_cache)

    # CONFIRMADO por inspecao direta do arquivo (sessao 07/07/2026): delimitador
    # e ';' (nao ','), campos entre aspas duplas, UTF-8, CRLF - padrao comum dos
    # exports do dadosabertos.aneel.gov.br, diferente do que o dicionario de
    # dados (JSON) sozinho deixava claro.
    df = pd.read_csv(
        caminho_cache,
        sep=";",
        usecols=COLUNAS_INDGER_NECESSARIAS,
        dtype={"CodMunicipioIBGE": "string", "SigAgente": "string", "DatReferenciaInformada": "string"},
    )
    print(f"      {len(df)} linha(s) municipio x distribuidora x mes carregada(s) do CSV bruto.")

    n_sem_municipio = df["CodMunicipioIBGE"].isna().sum()
    if n_sem_municipio > 0:
        print(f"      [AVISO] {n_sem_municipio} linha(s) sem CodMunicipioIBGE - DESCARTADAS.")
        df = df[df["CodMunicipioIBGE"].notna()].copy()

    # CONFIRMADO por inspecao direta (sessao 07/07/2026): DatReferenciaInformada
    # vem como data completa "AAAA-MM-DD" (ex.: "2024-02-01"), DIFERENTE do
    # formato "AAAAMM" do AnmCompetenciaBalanco no SAMP-Balanco - cada fonte
    # ANEEL usa sua propria convencao, nao presumir igualdade entre datasets.
    df["ano"] = df["DatReferenciaInformada"].str[:4].astype(int)
    df["mes"] = df["DatReferenciaInformada"].str[5:7].astype(int)

    df = df[(df["ano"] >= ANO_MINIMO) & (df["ano"] <= ANO_MAXIMO)].copy()
    print(f"      {len(df)} linha(s) apos filtrar para {ANO_MINIMO}-{ANO_MAXIMO}.")

    # CONFIRMADO por inspecao direta (sessao 07/07/2026): a esmagadora maioria
    # dos codigos ja vem com 7 digitos, mas uma fracao pequena (~15 linhas em
    # 255 mil na amostra completa 2023-2026) vem com 1 digito (ex.: "0") -
    # placeholder/erro de cadastro, nao codigo IBGE valido. zfill(7) sozinho
    # transformaria "0" em "0000000", um codigo invalido silencioso - descarta
    # explicitamente em vez disso, mesmo padrao de pre-filtro ja usado nos
    # extractors (ver CLAUDE.md, secao ETL).
    tamanho_codigo = df["CodMunicipioIBGE"].str.len()
    n_codigo_invalido = (tamanho_codigo != 7).sum()
    if n_codigo_invalido > 0:
        print(f"      [AVISO] {n_codigo_invalido} linha(s) com CodMunicipioIBGE fora do padrao "
              f"de 7 digitos (provavel erro de cadastro) - DESCARTADAS.")
        df = df[tamanho_codigo == 7].copy()

    df["codigo_ibge"] = df["CodMunicipioIBGE"]

    for coluna in ["QtdUCAtiva", "QtdSolicRessarcimentoDano", "QtdRessarcIndeferido"]:
        df[coluna] = pd.to_numeric(df[coluna], errors="coerce").fillna(0)

    # Agrega por municipio x mes, somando entre distribuidoras.
    agregado = df.groupby(["codigo_ibge", "ano", "mes"], as_index=False).agg(
        qtd_uc_ativa=("QtdUCAtiva", "sum"),
        qtd_solic_ressarcimento=("QtdSolicRessarcimentoDano", "sum"),
        qtd_ressarc_indeferido=("QtdRessarcIndeferido", "sum"),
    )

    populacao_valida = agregado["qtd_uc_ativa"] > 0
    agregado["qtd_solic_ressarc_per_1000_uc"] = np.where(
        populacao_valida,
        agregado["qtd_solic_ressarcimento"] / agregado["qtd_uc_ativa"] * 1000,
        np.nan,
    )

    n_municipios = agregado["codigo_ibge"].nunique()
    print(f"      {len(agregado)} combinacao(oes) municipio x mes, {n_municipios} municipio(s) distinto(s).")
    return agregado


# --------------------------------------------------------------------------
# 2. Pico climatico mensal por municipio (INMET/BDMEP via Base dos Dados)
# --------------------------------------------------------------------------
def carregar_pico_climatico_municipio_mes() -> pd.DataFrame:
    """
    Consulta a Base dos Dados (BigQuery) para o pico mensal de precipitacao e
    rajada de vento, restrito a municipios que CONTEM uma estacao INMET (via
    `id_municipio` ja resolvido pela tabela `estacao` - NAO faz atribuicao por
    estacao-mais-proxima, ver docstring do modulo).

    Requer autenticacao ja configurada (`gcloud auth application-default
    login`), mesma credencial usada por extrair_renda_trabalho_rais.py e
    extrair_capital_humano_mortalidade_infantil.py.
    """
    print("[2/8] Consultando pico climatico mensal por municipio (INMET/BDMEP via BigQuery)...")

    from google.cloud import bigquery  # import tardio - dependencia so usada aqui

    cliente = bigquery.Client()
    consulta = f"""
        SELECT
            e.id_municipio AS codigo_ibge,
            m.ano,
            m.mes,
            MAX(m.precipitacao_total) AS precipitacao_max_mes,
            MAX(m.vento_rajada_max) AS vento_rajada_max_mes,
            COUNT(DISTINCT e.id_estacao) AS n_estacoes_municipio
        FROM `basedosdados.br_inmet_bdmep.microdados` m
        JOIN `basedosdados.br_inmet_bdmep.estacao` e USING (id_estacao)
        WHERE e.id_municipio IS NOT NULL
          AND m.ano BETWEEN {ANO_MINIMO} AND {ANO_MAXIMO}
        GROUP BY codigo_ibge, m.ano, m.mes
    """
    df = cliente.query(consulta).to_dataframe()
    n_municipios = df["codigo_ibge"].nunique()
    print(f"      {len(df)} combinacao(oes) municipio x mes, {n_municipios} municipio(s) com estacao INMET "
          f"(de 5.573 no total - cobertura direta esperada, sem atribuicao por proximidade).")
    return df


# --------------------------------------------------------------------------
# 3. Renda media domiciliar (controle) - Postgres, mesma view do resto do projeto
# --------------------------------------------------------------------------
def carregar_renda_controle(engine) -> pd.DataFrame:
    print("[3/8] Carregando renda media domiciliar (controle, Postgres)...")
    consulta = text("""
        SELECT m.codigo_ibge, m.nome, m.regiao, m.uf, vsc.renda_media_domiciliar,
               vsc.percentual_populacao_rural
        FROM municipios m
        JOIN unidades_espaciais ue
            ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
        LEFT JOIN vw_indicadores_sociais_consolidado vsc ON vsc.unidade_espacial_id = ue.id
    """)
    with engine.connect() as conexao:
        df = pd.read_sql(consulta, conexao)
    print(f"      {len(df)} municipio(s) com renda carregada(s).")
    return df


# --------------------------------------------------------------------------
# 4-5. Merge e correlacao
# --------------------------------------------------------------------------
def montar_painel_e_correlacionar(
    ressarcimento: pd.DataFrame, clima: pd.DataFrame, renda: pd.DataFrame
) -> pd.DataFrame:
    print("[4/8] Montando painel municipio x mes (restrito a municipios com estacao INMET)...")

    painel = clima.merge(ressarcimento, on=["codigo_ibge", "ano", "mes"], how="inner")
    print(f"      {len(painel)} combinacao(oes) municipio x mes com AMBOS clima e ressarcimento "
          f"(intersecao das duas fontes).")

    painel = painel.merge(renda, on="codigo_ibge", how="left")
    n_sem_renda = painel["renda_media_domiciliar"].isna().sum()
    if n_sem_renda > 0:
        print(f"      [AVISO] {n_sem_renda} linha(s) sem renda (controle) - "
              f"ficarao de fora da correlacao parcial, mas entram na bruta.")

    n_municipios_final = painel["codigo_ibge"].nunique()
    print(f"      Painel final: {len(painel)} linha(s), {n_municipios_final} municipio(s) distinto(s) "
          f"(amostra restrita e enviesada para cidades com estacao INMET - ver limitacoes no docstring).")

    print("\n[5/8] Correlacao de Spearman: pico climatico mensal x taxa de ressarcimento (mesmo mes)")
    linhas = []
    for coluna_clima, rotulo in [
        ("precipitacao_max_mes", "Precipitacao maxima do mes (mm)"),
        ("vento_rajada_max_mes", "Rajada de vento maxima do mes (m/s)"),
    ]:
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
        print(f"      [AVISO] pelo menos uma correlacao tem n < {N_MINIMO_AMOSTRA} - "
              f"amostra pequena demais para confiar no resultado.")

    return painel, resultado


# --------------------------------------------------------------------------
# 6-7. Sensibilidade por regiao e por tercil de urbanizacao (a pedido do
#    usuario apos o sinal nacional aparecer, sessao 07/07/2026) - mesma
#    metodologia ja validada em analisar_correlacao_mmgd_renda.py, adaptada
#    para as 2 variaveis climaticas em vez do dicionario fixo de indicadores
#    sociais (essas funcoes la sao hardcoded para VARIAVEIS_X, nao reusaveis
#    diretamente aqui).
# --------------------------------------------------------------------------
VARIAVEIS_CLIMA = [
    ("precipitacao_max_mes", "Precipitacao maxima do mes (mm)"),
    ("vento_rajada_max_mes", "Rajada de vento maxima do mes (m/s)"),
]


def sensibilidade_por_regiao(painel: pd.DataFrame) -> pd.DataFrame:
    print("\n[7/8] Sensibilidade por regiao - parcial controlando renda")
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
        print("\n      n de municipios distintos por regiao (cobertura da amostra restrita a estacoes INMET):")
        print(tabela.pivot_table(index="variavel_climatica", columns="regiao", values="n_municipios").to_string())

    n_insuficiente = tabela["n_municipio_mes"].lt(N_MINIMO_AMOSTRA).sum()
    if n_insuficiente > 0:
        print(f"      [AVISO] {n_insuficiente} combinacao(oes) variavel x regiao com "
              f"n < {N_MINIMO_AMOSTRA} - nao confiar nesses resultados.")

    return tabela


def sensibilidade_por_urbanizacao(painel: pd.DataFrame) -> pd.DataFrame:
    print("\n[8/8] Sensibilidade por tercil de urbanizacao - parcial controlando renda")

    if painel["percentual_populacao_rural"].isna().all():
        print("      [AVISO] percentual_populacao_rural indisponivel para todo o painel - pulando esta secao.")
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

    n_insuficiente = tabela["n_municipio_mes"].lt(N_MINIMO_AMOSTRA).sum()
    if n_insuficiente > 0:
        print(f"      [AVISO] {n_insuficiente} combinacao(oes) variavel x faixa com "
              f"n < {N_MINIMO_AMOSTRA} - nao confiar nesses resultados.")

    return tabela


def resumo_robustez(tabela_nacional: pd.DataFrame, tabela_regiao: pd.DataFrame, tabela_urbanizacao: pd.DataFrame) -> None:
    print("\n" + "=" * 78)
    print("RESUMO DE ROBUSTEZ - sinal (parcial, controlando renda) mantido em "
          "quantas regioes/faixas de urbanizacao")
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
    print("\nLEMBRETE: mesmo com sinal robusto, esta amostra continua restrita a "
          "municipios com estacao INMET propria (~571 de 5.573) - nao promover a "
          "indicador nacional sem antes considerar cobertura gridded (MERGE/CPTEC-INPE).")


# --------------------------------------------------------------------------
# 9. Diagnostico dedicado: por que o Nordeste destoa no vento (a pedido do
#    usuario, sessao 07/07/2026, apos o teste de robustez mostrar Nordeste
#    como a UNICA regiao com sinal negativo para rajada de vento - mesmas 3
#    lentes ja usadas nos diagnosticos regionais anteriores do projeto
#    - diagnosticar_outliers_regionais.py e
#    investigar_precariedade_habitacional_centro_oeste.py.
# --------------------------------------------------------------------------
REGIAO_FOCO_VENTO = "Nordeste"
COLUNA_VENTO = "vento_rajada_max_mes"


def colinearidade_vento_nordeste(painel: pd.DataFrame) -> None:
    print(f"\n=== {REGIAO_FOCO_VENTO}: colinearidade renda x rajada de vento maxima "
          f"(nacional vs. dentro da regiao) ===")
    nacional = painel[["renda_media_domiciliar", COLUNA_VENTO]].dropna()
    subset_regiao = painel[painel["regiao"] == REGIAO_FOCO_VENTO]
    regional = subset_regiao[["renda_media_domiciliar", COLUNA_VENTO]].dropna()

    rho_nacional = (
        spearmanr(nacional["renda_media_domiciliar"], nacional[COLUNA_VENTO])[0]
        if len(nacional) > 2 else np.nan
    )
    rho_regional = (
        spearmanr(regional["renda_media_domiciliar"], regional[COLUNA_VENTO])[0]
        if len(regional) > 2 else np.nan
    )
    print(f"  rho(renda, rajada_max) nacional={rho_nacional:+.3f}  "
          f"{REGIAO_FOCO_VENTO}={rho_regional:+.3f}  (n_{REGIAO_FOCO_VENTO}={len(regional)})")


def heterogeneidade_por_uf_nordeste(painel: pd.DataFrame) -> None:
    print(f"\n=== {REGIAO_FOCO_VENTO}: rajada de vento, ressarcimento e renda por UF ===")
    subset = painel[painel["regiao"] == REGIAO_FOCO_VENTO]

    resumo = subset.groupby("uf").agg(
        n_municipio_mes=("codigo_ibge", "count"),
        n_municipios=("codigo_ibge", "nunique"),
        vento_rajada_max_mediana=(COLUNA_VENTO, "median"),
        ressarc_per_1000_uc_mediana=("qtd_solic_ressarc_per_1000_uc", "median"),
        renda_mediana=("renda_media_domiciliar", "median"),
    ).sort_values("vento_rajada_max_mediana", ascending=False)

    print(resumo.round(2).to_string())


def top_bottom_vento_nordeste(painel: pd.DataFrame, n: int = 10) -> None:
    print(f"\n=== {REGIAO_FOCO_VENTO}: top/bottom {n} municipio-mes por rajada de vento maxima ===")
    colunas_exibir = ["nome", "uf", "ano", "mes", COLUNA_VENTO, "qtd_solic_ressarc_per_1000_uc", "renda_media_domiciliar"]
    subset = painel[painel["regiao"] == REGIAO_FOCO_VENTO][colunas_exibir].dropna()

    print(f"--- TOP {n} (rajada de vento mais forte no mes) ---")
    print(subset.sort_values(COLUNA_VENTO, ascending=False).head(n).round(2).to_string(index=False))

    print(f"--- BOTTOM {n} (rajada de vento mais fraca no mes) ---")
    print(subset.sort_values(COLUNA_VENTO, ascending=True).head(n).round(2).to_string(index=False))


def diagnosticar_nordeste_vento(painel: pd.DataFrame) -> None:
    print("\n" + "#" * 78)
    print(f"# DIAGNOSTICO DEDICADO: por que {REGIAO_FOCO_VENTO} destoa no vento (rho negativo)")
    print("#" * 78)
    colinearidade_vento_nordeste(painel)
    heterogeneidade_por_uf_nordeste(painel)
    top_bottom_vento_nordeste(painel)
    print(f"\n✅ Diagnostico {REGIAO_FOCO_VENTO}/vento concluido (somente leitura).")


# --------------------------------------------------------------------------
# 10. Correcao leve por efeito fixo de municipio (demeaning) - a pedido do
#    usuario, sessao 07/07/2026, apos o diagnostico Nordeste/vento sugerir
#    que municipios com leitura de vento estruturalmente alta (nao evento
#    extremo pontual naquele mes) estavam dominando o topo da distribuicao e
#    possivelmente distorcendo a correlacao regional. Demeaning aproxima um
#    efeito fixo de municipio sem montar um modelo de painel completo:
#    subtrai a media de CADA municipio (ao longo dos meses observados) de
#    cada variavel, isolando so a variacao MES A MES dentro do mesmo
#    municipio - exatamente a pergunta original ("mes com evento extremo tem
#    mais ressarcimento NESSE MES", nao "municipio com vento tipicamente
#    mais forte tem mais ressarcimento no total"). Como o efeito fixo de
#    municipio ja absorve qualquer caracteristica time-invariante (incluindo
#    renda), a correlacao aqui e de ORDEM ZERO sobre os desvios, nao parcial
#    - controlar renda de novo seria redundante.
# --------------------------------------------------------------------------
def aplicar_demeaning_por_municipio(painel: pd.DataFrame, colunas: list) -> pd.DataFrame:
    painel = painel.copy()
    for coluna in colunas:
        media_municipio = painel.groupby("codigo_ibge")[coluna].transform("mean")
        painel[f"{coluna}_desvio"] = painel[coluna] - media_municipio
    return painel


def correlacao_within_municipio(painel: pd.DataFrame) -> None:
    print("\n" + "=" * 78)
    print("CORRECAO LEVE: correlacao WITHIN-MUNICIPIO (demeaning, aproxima efeito fixo)")
    print("=" * 78)
    print("Isola a variacao MES A MES dentro do mesmo municipio - remove diferencas "
          "estruturais entre municipios (ex.: estacao em local tipicamente mais "
          "ventoso), que o diagnostico Nordeste/vento apontou como possivel fonte "
          "de distorcao.")

    colunas_demean = [COLUNA_VENTO, "precipitacao_max_mes", "qtd_solic_ressarc_per_1000_uc"]
    painel_within = aplicar_demeaning_por_municipio(painel, colunas_demean)

    n_municipios_1obs = painel.groupby("codigo_ibge").size().eq(1).sum()
    if n_municipios_1obs > 0:
        print(f"      [AVISO] {n_municipios_1obs} municipio(s) com so 1 mes observado - "
              f"variacao within = 0, nao contribuem informacao (mas nao quebram o calculo).")

    linhas = []
    for coluna_clima, rotulo in VARIAVEIS_CLIMA:
        coluna_desvio = f"{coluna_clima}_desvio"
        nacional = correlacao_spearman(painel_within, coluna_desvio, "qtd_solic_ressarc_per_1000_uc_desvio")
        subset_ne = painel_within[painel_within["regiao"] == REGIAO_FOCO_VENTO]
        nordeste = correlacao_spearman(subset_ne, coluna_desvio, "qtd_solic_ressarc_per_1000_uc_desvio")
        linhas.append({
            "variavel_climatica": rotulo,
            "n_nacional": nacional["n"],
            "rho_within_nacional": nacional["rho"],
            "p_nacional": nacional["p_valor"],
            "n_nordeste": nordeste["n"],
            "rho_within_nordeste": nordeste["rho"],
            "p_nordeste": nordeste["p_valor"],
        })

    resultado = pd.DataFrame(linhas)
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(resultado.round(4).to_string(index=False))

    print("\nLEITURA: se rho_within_nordeste mudar de sinal (negativo -> positivo) em "
          "relacao ao resultado 'entre municipios' (parcial controlando renda, secao "
          "anterior), confirma que a leitura estruturalmente ventosa de alguns "
          "municipios estava distorcendo o resultado regional. Se continuar negativo, "
          "a excecao do Nordeste e mais provavelmente real, nao um artefato de painel.")


def main():
    print("Investigacao exploratoria: clima (chuva/vento, INMET) x ressarcimento por "
          "danos eletricos (ANEEL/INDGER)")
    print("=" * 78)
    print(f"Janela temporal: {ANO_MINIMO}-{ANO_MAXIMO} (sobreposicao INDGER x INMET gratuito).")
    print("LEMBRETE: amostra restrita a municipios com estacao INMET propria - "
          "NAO e um indicador nacional, e teste de hipotese. Ver docstring do modulo.")
    print("=" * 78)

    ressarcimento = carregar_ressarcimento_municipio_mes(CAMINHO_CACHE_INDGER)
    clima = carregar_pico_climatico_municipio_mes()

    engine = create_engine(DATABASE_URL)
    renda = carregar_renda_controle(engine)

    painel, tabela_nacional = montar_painel_e_correlacionar(ressarcimento, clima, renda)

    tabela_regiao = sensibilidade_por_regiao(painel)
    tabela_urbanizacao = sensibilidade_por_urbanizacao(painel)
    resumo_robustez(tabela_nacional, tabela_regiao, tabela_urbanizacao)

    diagnosticar_nordeste_vento(painel)
    correlacao_within_municipio(painel)

    print("\nConcluido (somente leitura, nenhuma escrita no banco).")
    print("Proximo passo se o sinal for robusto: decidir se vale a pena buscar cobertura "
          "nacional real (ex.: MERGE/CPTEC-INPE) antes de tratar isso como indicador - "
          "ver ARQUITETURA.md, secao 'Queima de equipamentos'.")


if __name__ == "__main__":
    main()
