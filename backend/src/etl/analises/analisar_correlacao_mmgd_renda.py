"""
ANÁLISE: Correlação MMGD x Indicadores Sociais, controlando por Renda
(com testes de sensibilidade por Região e por Grau de Urbanização)
================================================================================
O QUE ESTE SCRIPT FAZ:
  1. Lê, do banco do Atlas, um painel município a município cruzando MMGD
     (adoção de geração distribuída solar) com os indicadores sociais já
     consolidados (IVS, renda, precariedade de infraestrutura/moradia,
     CadÚnico, Tarifa Social, alfabetização, mortalidade infantil, vínculos
     formais) e com o potencial de irradiação solar (INPE).
  2. Calcula MMGD em termos PER CAPITA (kW/1.000 hab e UCs/1.000 hab) — nunca
     em valor absoluto, seguindo a decisão já registrada em ARQUITETURA.md
     ("Eixo MMGD (Y): usar valor per capita, contagem absoluta favorece
     cidades grandes independente da taxa real de adoção").
  3. Para cada indicador social, calcula:
       a) Correlação de Spearman de ordem zero (bruta) com MMGD per capita;
       b) Correlação parcial de Spearman controlando por renda média
          domiciliar (a pergunta central: o indicador ainda se associa a
          MMGD depois de tirar o efeito de renda, ou a correlação bruta era
          só reflexo de "lugares ricos tem mais renda E mais MMGD"?);
       c) Testes de sensibilidade da correlação parcial (b): estratificando
          por região E por tercil de grau de urbanização, e também
          controlando renda+urbanização em conjunto — para checar se o
          resultado nacional é estável ou é artefato de heterogeneidade
          regional/urbana escondida na média nacional.
  4. Imprime um resumo final de robustez por indicador (sinal/magnitude se
     mantém em quantas das 5 regiões e das 3 faixas de urbanização).

ESTE SCRIPT É SOMENTE LEITURA (não grava nada no banco) — é uma análise
exploratória para apoiar o item 1 da fila de trabalho do ARQUITETURA.md
("Cruzamento MMGD x indicadores sociais — identificar vazios reais de
acesso"), não um extractor/loader.

QUAIS REGRAS DO etl-atlas SKILL.md SE APLICAM AQUI E QUAIS NÃO:
--------------------------------------------------------------------------
Aplicam-se (mesmo padrão dos extractors):
  - DATABASE_URL via variável de ambiente, mesmo default de dev local;
  - Nunca Anaconda — rodar com o venv do projeto (backend/src/etl/venv/);
  - Formato de saída: etapas numeradas [N/M], avisos explícitos [AVISO],
    contagem final (aqui: contagem de indicadores testados / com dado
    suficiente / robustos na sensibilidade, em vez de sucesso/falha de
    upsert, porque este script não escreve no banco).
NÃO se aplicam (específicas de carga/gravação, este script não grava nada):
  - Transação por linha no upsert, idempotência via ON CONFLICT, WKB/SRID,
    pré-filtro de código IBGE (já resolvido nas views/tabelas consultadas).

NOVA DEPENDÊNCIA (ainda não listada no CLAUDE.md "Bibliotecas em uso"):
--------------------------------------------------------------------------
scipy (rankdata, spearmanr, pearsonr). Instalar no venv do projeto:
    backend/src/etl/venv/bin/pip install scipy
Vale atualizar a lista de bibliotecas do CLAUDE.md/ARQUITETURA.md quando
este script for consolidado.

MÉTODO DE CORRELAÇÃO PARCIAL DE SPEARMAN (não existe pronto no scipy):
--------------------------------------------------------------------------
scipy só tem Spearman de ordem zero. A correlação parcial de Spearman é
calculada aqui pelo método padrão "resíduo de postos": (1) converte X, Y e
cada variável de controle para postos (ranks); (2) regride (OLS) os postos
de X contra os postos dos controles e toma o resíduo; (3) faz o mesmo para
Y; (4) a correlação parcial de Spearman é a correlação de Pearson entre os
dois resíduos. É o mesmo algoritmo usado por bibliotecas dedicadas (ex.:
pingouin.partial_corr(method='spearman')) — reimplementado aqui só com
numpy/scipy para não adicionar uma dependência maior.

LIMITAÇÕES METODOLÓGICAS (documentar sempre que este script for citado):
--------------------------------------------------------------------------
  - Correlação (mesmo parcial) não estabelece causalidade — MMGD depende de
    fatores não observados aqui (tarifa da distribuidora local, marco legal
    da geração distribuída à época da conexão, disponibilidade de crédito/
    financiamento, iniciativa de instaladoras na região).
  - `renda_media_domiciliar` é renda do trabalho FORMAL (RAIS), não renda
    domiciliar total — ver ressalva em extrair_renda_trabalho_rais.py.
  - Direção dos indicadores NUNCA é invertida aqui (mesma regra do resto do
    Atlas — ARQUITETURA.md, seção "Indices compostos... Direção dos
    indicadores"): o sinal do rho deve ser lido junto com a coluna "sentido"
    de cada indicador (positivo = quanto maior, melhor; negativo = quanto
    maior, pior/mais vulnerável).
================================================================================
"""

import os

import numpy as np
import pandas as pd
from scipy.stats import pearsonr, rankdata, spearmanr
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

# Parquet bruto da ANEEL (mesmo arquivo usado por extrair_mmgd_aneel.py) —
# necessário aqui porque `mmgd_indicadores` no banco só guarda o TOTAL
# agregado por município; a quebra por classe de consumo (Residencial x
# Rural x outras) não é persistida no schema atual, só existe na fonte bruta.
CAMINHO_PARQUET_MMGD = os.environ.get(
    "CAMINHO_PARQUET_MMGD",
    "backend/src/etl/data/raw/aneel_mmgd/empreendimento-geracao-distribuida.parquet",
)

# Amostra mínima para reportar uma correlação (nacional ou de subgrupo) —
# abaixo disso, rho é estatisticamente instável e enganoso reportar como
# se fosse comparável às demais linhas da tabela.
N_MINIMO_AMOSTRA = int(os.environ.get("N_MINIMO_AMOSTRA", "30"))

# Caminho opcional para salvar os resultados em CSV (além do print no
# terminal). Se não definido, o script só imprime.
CAMINHO_SAIDA_CSV = os.environ.get("CAMINHO_SAIDA_CSV")

CONTROLE_RENDA = ["renda_media_domiciliar"]

# Variável usada como proxy de urbanização para a estratificação de
# sensibilidade (tercis) — % da população residente em domicílios rurais,
# já carregada via Censo 2022/SIDRA (tabela 9923). Maior valor = menos
# urbanizado. Não é invertida; os rótulos dos tercis é que descrevem o
# sentido.
VARIAVEL_URBANIZACAO = "percentual_populacao_rural"

# Variável usada para testar a hipótese de tipologia habitacional (moradia
# densa/sem telhado próprio) como confundidor residual — % de domicílios do
# tipo Apartamento (Tabela SIDRA 9928, migration 0016). Só existe no df se
# o banco já tiver essa coluna carregada (extrair_tipo_domicilio_censo.py) —
# ver checagem em calcular_indicadores_per_capita/main().
VARIAVEL_TIPOLOGIA_HABITACIONAL = "percentual_apartamento"

# Indicadores sociais/físicos testados contra MMGD per capita. Cada entrada:
# rótulo legível + sentido (conforme convenção já fixada em ARQUITETURA.md,
# seção "Direção dos indicadores" — positivo = quanto maior, melhor;
# negativo = quanto maior, pior/mais vulnerável).
VARIAVEIS_X = {
    "renda_media_domiciliar": ("Renda média domiciliar (RAIS, trabalho formal)", "positivo"),
    "ivs": ("IVS Consolidado (índice próprio, insp. IVS/IPEA)", "negativo"),
    "indice_precariedade_infraestrutura": ("Índice de Precariedade de Infraestrutura", "negativo"),
    "indice_precariedade_moradia": ("Índice de Precariedade Habitacional", "negativo"),
    "indice_seguranca_posse": ("Índice de Segurança da Posse", "positivo"),
    "cobertura_investimento_habitacional": ("Cobertura de Investimento Habitacional (MCMV/1.000 hab)", "positivo"),
    "percentual_cadunico": ("% Cobertura CadÚnico", "ambíguo (cobertura, não vulnerabilidade em si)"),
    "percentual_pobreza_cadunico": ("% Pobreza entre cadastrados no CadÚnico", "negativo"),
    "percentual_tarifa_social": ("% Beneficiários da Tarifa Social", "negativo (proxy de vulnerabilidade energética)"),
    "taxa_alfabetizacao": ("Taxa de Alfabetização", "positivo"),
    "taxa_mortalidade_infantil": ("Taxa de Mortalidade Infantil", "negativo"),
    "percentual_vinculos_formais": ("% Vínculos Formais (RAIS)", "positivo"),
    "percentual_populacao_rural": ("% População Rural", "negativo (proxy vulnerabilidade infra.; também usada como moderador de urbanização, ver abaixo)"),
    "irradiacao_media_kwh_m2_dia": ("Irradiação Solar Média (potencial físico, INPE/LABREN)", "positivo"),
    "percentual_apartamento": ("% Domicílios tipo Apartamento (Censo 2022)", "negativo p/ MMGD residencial (barreira física — sem telhado próprio; também usada como moderador de tipologia habitacional, ver abaixo). Requer migration 0016."),
}

# Variáveis-alvo (Y): adoção de MMGD, sempre per capita.
# As variantes "_residencial" e "_rural" exigem a quebra por classe de
# consumo carregada do Parquet bruto (carregar_classe_consumo_mmgd) — só
# existem no df se essa etapa rodar antes de calcular_indicadores_per_capita.
VARIAVEIS_Y = {
    "mmgd_potencia_per_1000_hab": "Potência MMGD instalada (TOTAL, todas as classes) por 1.000 hab (kW)",
    "mmgd_ucs_per_1000_hab": "Nº de UCs com MMGD (TOTAL, todas as classes) por 1.000 hab",
    "mmgd_potencia_residencial_per_1000_hab": "Potência MMGD RESIDENCIAL por 1.000 hab (kW) — a variável relevante para 'vazios de acesso'",
    "mmgd_potencia_rural_per_1000_hab": "Potência MMGD RURAL (proxy agropecuária/irrigação) por 1.000 hab (kW)",
}


# --------------------------------------------------------------------------
# 1. Carga dos dados
# --------------------------------------------------------------------------
def carregar_dados(engine) -> pd.DataFrame:
    """
    Monta o painel município a município cruzando MMGD, indicadores sociais
    consolidados e irradiação solar.

    Por quê filtrar `ue.tipo = 'municipio'`: `unidades_espaciais` também
    guarda Favelas/Comunidades Urbanas e ZEIS/AEIS como registros próprios,
    todos apontando para o mesmo `municipio_pai_codigo_ibge` do município que
    os contém (ver ARQUITETURA.md — 12.348 FCUs + 3.696 ZEIS/AEIS). Sem esse
    filtro, o JOIN a partir de `municipios` faria fan-out: um município com
    FCUs cadastradas apareceria duplicado, inflando artificialmente o n e
    distorcendo qualquer correlação calculada depois.

    Por quê `DISTINCT ON` em MMGD e irradiação: ambas as fontes são
    documentadas como snapshot único por município (ver
    extrair_mmgd_aneel.py e extrair_irradiacao_solar_inpe.py), mas o schema
    permite, em tese, mais de um `periodo_referencia` por unidade — o
    `DISTINCT ON ... ORDER BY periodo_referencia DESC` garante 1 linha por
    município mesmo que isso mude no futuro, sem depender de essa suposição.
    """
    print("[1/8] Carregando painel município x MMGD x indicadores sociais x irradiação solar...")

    cte_comum = """
        WITH mmgd_latest AS (
            SELECT DISTINCT ON (unidade_espacial_id)
                unidade_espacial_id, potencia_instalada_kw, numero_ucs_com_mmgd, periodo_referencia
            FROM mmgd_indicadores
            ORDER BY unidade_espacial_id, periodo_referencia DESC
        ),
        irr_latest AS (
            SELECT DISTINCT ON (codigo_ibge)
                codigo_ibge, irradiacao_media_kwh_m2_dia, periodo_referencia
            FROM irradiacao_solar
            ORDER BY codigo_ibge, periodo_referencia DESC
        )
    """
    colunas_base = """
            m.codigo_ibge,
            m.nome,
            m.uf,
            m.regiao,
            m.area_km2,
            mmgd.potencia_instalada_kw,
            mmgd.numero_ucs_com_mmgd,
            vsc.densidade_populacional,
            vsc.renda_media_domiciliar,
            vsc.ivs,
            vsc.percentual_populacao_rural,
            vsc.percentual_cadunico,
            vsc.percentual_pobreza_cadunico,
            vsc.percentual_tarifa_social,
            vsc.taxa_alfabetizacao,
            vsc.taxa_mortalidade_infantil,
            vsc.percentual_vinculos_formais,
            vim.indice_precariedade_infraestrutura,
            vim.indice_precariedade_moradia,
            vim.indice_seguranca_posse,
            vim.cobertura_investimento_habitacional,
            irr.irradiacao_media_kwh_m2_dia
    """
    joins_comuns = """
        FROM municipios m
        JOIN unidades_espaciais ue
            ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
        LEFT JOIN mmgd_latest mmgd ON mmgd.unidade_espacial_id = ue.id
        LEFT JOIN vw_indicadores_sociais_consolidado vsc ON vsc.unidade_espacial_id = ue.id
        LEFT JOIN vw_indices_compostos_moradia_infraestrutura vim ON vim.codigo_ibge = m.codigo_ibge
        LEFT JOIN irr_latest irr ON irr.codigo_ibge = m.codigo_ibge;
    """

    # Tenta com percentual_apartamento (migration 0016) primeiro. Se a
    # migration ainda não foi aplicada, a coluna/view não existe e o SELECT
    # falha com "column does not exist" — cai para a versão sem essa coluna
    # em vez de travar a análise inteira, mas avisa explicitamente (ver
    # main() / VARIAVEL_TIPOLOGIA_HABITACIONAL).
    query_com_apartamento = text(
        cte_comum + "SELECT" + colunas_base + ", vsc.percentual_apartamento" + joins_comuns
    )
    query_sem_apartamento = text(cte_comum + "SELECT" + colunas_base + joins_comuns)

    try:
        with engine.connect() as conexao:
            df = pd.read_sql(query_com_apartamento, conexao)
        print("      Coluna percentual_apartamento (migration 0016) encontrada.")
    except Exception as erro:
        print(f"      [AVISO] percentual_apartamento indisponível ({erro.__class__.__name__}) — "
              f"provavelmente a migration 0016_indicadores_sociais_tipo_domicilio.sql ainda não foi "
              f"aplicada, ou extrair_tipo_domicilio_censo.py ainda não rodou. Prosseguindo SEM o teste "
              f"de tipologia habitacional (hipótese Sul/Segurança da Posse e Centro-Oeste/Irradiação).")
        with engine.connect() as conexao:
            df = pd.read_sql(query_sem_apartamento, conexao)
        df["percentual_apartamento"] = np.nan

    print(f"      {len(df)} município(s) carregado(s).")
    sem_mmgd = df["potencia_instalada_kw"].isna().sum()
    if sem_mmgd > 0:
        print(f"      [AVISO] {sem_mmgd} município(s) sem registro de MMGD — "
              f"tratados como MMGD = 0 no per capita (ausência de instalação, não dado faltante).")

    return df


# --------------------------------------------------------------------------
# 1b. Quebra de MMGD por classe de consumo (Residencial x Rural x outras)
# --------------------------------------------------------------------------
def carregar_classe_consumo_mmgd(caminho_parquet: str) -> pd.DataFrame:
    """
    Lê o Parquet BRUTO da ANEEL (não o banco — `mmgd_indicadores` só guarda o
    total agregado, sem classe de consumo) e agrega potência instalada e nº
    de UCs por município, separando 3 grupos:

      - RESIDENCIAL (DscClasseConsumo == 'Residencial'): o uso que de fato
        interessa para a pergunta de "vazios de acesso" do DRF — geração
        própria em domicílios.
      - RURAL (DscClasseConsumo == 'Rural'): proxy de uso agropecuário/
        irrigação — é a classificação mais fina que a ANEEL disponibiliza
        neste arquivo; não existe uma subclasse "Irrigação" separada (não
        confundir com o nível de subgrupo tarifário B2, que também não traz
        essa granularidade aqui — confirmado ao inspecionar o Parquet real,
        coluna CodSubGrupoTarifario vem inteiramente vazia nesta fonte).
      - OUTRAS (Comercial, Industrial, Poder Público, Serviço Público,
        Iluminação Pública, Consumo Próprio): mantidas somadas à parte, não
        descartadas, mas também não misturadas com Residencial/Rural.

    ACHADO DE QUALIDADE DE DADO (mesmo espírito do caso TSEE em
    ARQUITETURA.md — nunca deixar um valor suspeito entrar silenciosamente
    numa categoria real): a coluna DscClasseConsumo tem 24.757 linhas com o
    valor 'REBR' (mais 2 linhas residuais 'RE '/'REBR ' com espaço, sinal de
    um código de classe vazando para o campo de descrição) — não é uma
    classe de consumo real da ANEEL. Essas linhas são isoladas num grupo
    'NAO_CLASSIFICADO' próprio, reportadas com [AVISO], e EXCLUÍDAS dos 3
    grupos acima — no per capita elas ficam de fora tanto do numerador
    residencial quanto do rural/outras, para não distorcer nenhum dos dois.
    """
    print(f"\n[1b/8] Lendo Parquet bruto da ANEEL para separar classe de consumo: {caminho_parquet}")

    colunas_necessarias = [
        "CodMunicipioIbge", "MdaPotenciaInstaladaKW", "QtdUCRecebeCredito", "DscClasseConsumo",
    ]
    df = pd.read_parquet(caminho_parquet, columns=colunas_necessarias)
    print(f"       {len(df)} empreendimento(s) lido(s) do Parquet.")

    # Mesma limpeza do extractor canônico (extrair_mmgd_aneel.py): descarta
    # potência <= 0 (sem sentido físico) e linhas sem código de município.
    n_potencia_invalida = (df["MdaPotenciaInstaladaKW"] <= 0).sum()
    if n_potencia_invalida > 0:
        print(f"       [AVISO] {n_potencia_invalida} linha(s) com potência <= 0 — DESCARTADAS "
              f"(mesma regra do extractor canônico de MMGD).")
        df = df[df["MdaPotenciaInstaladaKW"] > 0].copy()

    n_sem_municipio = df["CodMunicipioIbge"].isna().sum()
    if n_sem_municipio > 0:
        print(f"       [AVISO] {n_sem_municipio} linha(s) sem código de município — DESCARTADAS.")
        df = df[df["CodMunicipioIbge"].notna()].copy()

    df["codigo_ibge"] = df["CodMunicipioIbge"].astype(int).astype(str).str.zfill(7)

    # Normaliza espaços em branco antes de classificar — a inspeção do
    # Parquet real mostrou variantes com espaço sobrando ('REBR ', 'RE ').
    df["classe_normalizada"] = df["DscClasseConsumo"].str.strip()

    n_nao_classificado = (df["classe_normalizada"] == "REBR").sum() + \
        df["classe_normalizada"].isin(["RE", ""]).sum()
    if n_nao_classificado > 0:
        print(f"       [AVISO] {n_nao_classificado} linha(s) com DscClasseConsumo suspeito "
              f"('REBR'/'RE' — não é classe real da ANEEL, provável erro de cadastro) — "
              f"isoladas em grupo NAO_CLASSIFICADO, fora dos totais Residencial/Rural/Outras.")

    # Vetorizado (não .apply linha a linha) — o arquivo tem ~4,5M linhas,
    # .apply com função Python seria bem mais lento que necessário aqui.
    df["grupo"] = "outras"  # Comercial, Industrial, Poder Público, Serviço Público, Iluminação Pública, Consumo Próprio
    df.loc[df["classe_normalizada"] == "Residencial", "grupo"] = "residencial"
    df.loc[df["classe_normalizada"] == "Rural", "grupo"] = "rural"
    df.loc[df["classe_normalizada"].isin(["REBR", "RE", ""]), "grupo"] = "nao_classificado"

    print("       Distribuição de potência instalada (MW) por grupo:")
    print((df.groupby("grupo")["MdaPotenciaInstaladaKW"].sum() / 1000).round(1).to_string())

    agregado = df.pivot_table(
        index="codigo_ibge",
        columns="grupo",
        values=["MdaPotenciaInstaladaKW", "QtdUCRecebeCredito"],
        aggfunc="sum",
        fill_value=0,
    )
    agregado.columns = [f"{metrica}_{grupo}" for metrica, grupo in agregado.columns]
    agregado = agregado.reset_index().rename(columns={
        "MdaPotenciaInstaladaKW_residencial": "potencia_residencial_kw",
        "MdaPotenciaInstaladaKW_rural": "potencia_rural_kw",
        "MdaPotenciaInstaladaKW_outras": "potencia_outras_classes_kw",
        "MdaPotenciaInstaladaKW_nao_classificado": "potencia_nao_classificada_kw",
        "QtdUCRecebeCredito_residencial": "ucs_residencial",
        "QtdUCRecebeCredito_rural": "ucs_rural",
        "QtdUCRecebeCredito_outras": "ucs_outras_classes",
        "QtdUCRecebeCredito_nao_classificado": "ucs_nao_classificada",
    })

    # Garante que todas as colunas esperadas existam mesmo se algum grupo
    # não aparecer no arquivo (ex.: rodando com uma amostra filtrada).
    for coluna in [
        "potencia_residencial_kw", "potencia_rural_kw", "potencia_outras_classes_kw",
        "potencia_nao_classificada_kw", "ucs_residencial", "ucs_rural",
        "ucs_outras_classes", "ucs_nao_classificada",
    ]:
        if coluna not in agregado.columns:
            agregado[coluna] = 0.0

    print(f"       {len(agregado)} município(s) com quebra por classe de consumo calculada.")
    return agregado


# --------------------------------------------------------------------------
# 2. Indicadores per capita e variável de urbanização
# --------------------------------------------------------------------------
def calcular_indicadores_per_capita(df: pd.DataFrame) -> pd.DataFrame:
    """
    População reconstituída via densidade_populacional x area_km2 — MESMO
    método já usado no extractor de Renda e Trabalho/RAIS e na migration
    0014 (não temos população absoluta gravada diretamente em nenhuma tabela).

    MMGD ausente (sem registro em mmgd_indicadores) é tratado como 0, não
    como NULL: significa "nenhuma instalação registrada até o snapshot
    atual", que é informação válida para a análise (é justamente o
    fenômeno de "vazio de acesso" que o Atlas quer identificar) — diferente
    de um indicador social faltante por falha de cobertura da fonte, que
    permanece NULL e é excluído caso a caso pelo `dropna` de cada teste.
    """
    print("[2/8] Calculando população estimada e MMGD per capita...")

    df = df.copy()
    df["populacao_estimada"] = df["densidade_populacional"] * df["area_km2"]

    sem_populacao = df["populacao_estimada"].isna().sum()
    if sem_populacao > 0:
        print(f"      [AVISO] {sem_populacao} município(s) sem população estimada "
              f"(sem densidade_populacional calculada) — ficarão de fora de todas as "
              f"correlações que envolvem MMGD per capita.")

    df["potencia_instalada_kw"] = df["potencia_instalada_kw"].fillna(0.0)
    df["numero_ucs_com_mmgd"] = df["numero_ucs_com_mmgd"].fillna(0)

    populacao_valida = df["populacao_estimada"] > 0
    df["mmgd_potencia_per_1000_hab"] = np.where(
        populacao_valida,
        df["potencia_instalada_kw"] / df["populacao_estimada"] * 1000,
        np.nan,
    )
    df["mmgd_ucs_per_1000_hab"] = np.where(
        populacao_valida,
        df["numero_ucs_com_mmgd"] / df["populacao_estimada"] * 1000,
        np.nan,
    )

    # Per capita por classe de consumo (Residencial x Rural), só calculado
    # se a quebra por classe (carregar_classe_consumo_mmgd) já foi mesclada
    # no df antes desta função ser chamada — ver main().
    if "potencia_residencial_kw" in df.columns:
        for coluna_kw, coluna_ucs, sufixo in [
            ("potencia_residencial_kw", "ucs_residencial", "residencial"),
            ("potencia_rural_kw", "ucs_rural", "rural"),
        ]:
            df[coluna_kw] = df[coluna_kw].fillna(0.0)
            df[coluna_ucs] = df[coluna_ucs].fillna(0.0)
            df[f"mmgd_potencia_{sufixo}_per_1000_hab"] = np.where(
                populacao_valida, df[coluna_kw] / df["populacao_estimada"] * 1000, np.nan,
            )
            df[f"mmgd_ucs_{sufixo}_per_1000_hab"] = np.where(
                populacao_valida, df[coluna_ucs] / df["populacao_estimada"] * 1000, np.nan,
            )

        print(f"      MMGD potência RESIDENCIAL per capita — mediana nacional: "
              f"{df['mmgd_potencia_residencial_per_1000_hab'].median():.4f} kW/1.000 hab")
        print(f"      MMGD potência RURAL per capita — mediana nacional: "
              f"{df['mmgd_potencia_rural_per_1000_hab'].median():.4f} kW/1.000 hab")

        # Quanto da potência total (já carregada do banco) a quebra por
        # classe (vinda do Parquet bruto) efetivamente cobre — divergência
        # grande aqui sinalizaria dessincronia entre o snapshot do banco e
        # o Parquet local (ex.: banco carregado de um arquivo mais antigo).
        total_banco = df["potencia_instalada_kw"].sum()
        total_classes = (df["potencia_residencial_kw"] + df["potencia_rural_kw"]
                          + df.get("potencia_outras_classes_kw", 0)
                          + df.get("potencia_nao_classificada_kw", 0)).sum()
        if total_banco > 0:
            cobertura = total_classes / total_banco * 100
            print(f"      Cobertura da quebra por classe vs. total já no banco: {cobertura:.1f}% "
                  f"(divergência grande = banco e Parquet local de snapshots diferentes).")

    print(f"      MMGD potência per capita — mediana nacional: "
          f"{df['mmgd_potencia_per_1000_hab'].median():.4f} kW/1.000 hab")
    print(f"      MMGD UCs per capita — mediana nacional: "
          f"{df['mmgd_ucs_per_1000_hab'].median():.4f} UCs/1.000 hab")

    return df


# --------------------------------------------------------------------------
# 3. Correlação de Spearman (ordem zero) e correlação parcial de Spearman
# --------------------------------------------------------------------------
def correlacao_spearman(df: pd.DataFrame, coluna_x: str, coluna_y: str) -> dict:
    subset = df[[coluna_x, coluna_y]].dropna()
    n = len(subset)
    if n < N_MINIMO_AMOSTRA:
        return {"rho": np.nan, "p_valor": np.nan, "n": n}
    rho, p_valor = spearmanr(subset[coluna_x], subset[coluna_y])
    return {"rho": rho, "p_valor": p_valor, "n": n}


def _residuo_de_postos(postos_alvo: np.ndarray, postos_controles: np.ndarray) -> np.ndarray:
    """Regride (OLS) os postos de uma variável contra os postos de um ou mais
    controles e retorna o resíduo — passo central do método de correlação
    parcial de Spearman (ver docstring do módulo)."""
    design = np.column_stack([np.ones(len(postos_controles)), postos_controles])
    coeficientes, _, _, _ = np.linalg.lstsq(design, postos_alvo, rcond=None)
    preditos = design @ coeficientes
    return postos_alvo - preditos


def correlacao_parcial_spearman(
    df: pd.DataFrame, coluna_x: str, coluna_y: str, colunas_controle: list
) -> dict:
    """
    Correlação parcial de Spearman entre coluna_x e coluna_y, controlando
    por uma ou mais colunas_controle (ex.: renda; ou renda + urbanização).
    Ver docstring do módulo para o método (resíduo de postos + Pearson).
    """
    colunas = [coluna_x, coluna_y] + colunas_controle
    subset = df[colunas].dropna()
    n = len(subset)
    if n < N_MINIMO_AMOSTRA:
        return {"rho_parcial": np.nan, "p_valor": np.nan, "n": n}

    postos_x = rankdata(subset[coluna_x].to_numpy())
    postos_y = rankdata(subset[coluna_y].to_numpy())
    postos_controles = np.column_stack(
        [rankdata(subset[c].to_numpy()) for c in colunas_controle]
    )

    residuo_x = _residuo_de_postos(postos_x, postos_controles)
    residuo_y = _residuo_de_postos(postos_y, postos_controles)

    # variância zero nos resíduos (controle explica 100% da variável) tornaria
    # o Pearson indefinido — reportar como NaN em vez de deixar estourar.
    if np.std(residuo_x) == 0 or np.std(residuo_y) == 0:
        return {"rho_parcial": np.nan, "p_valor": np.nan, "n": n}

    rho_parcial, p_valor = pearsonr(residuo_x, residuo_y)
    return {"rho_parcial": rho_parcial, "p_valor": p_valor, "n": n}


# --------------------------------------------------------------------------
# 4. Tabela nacional: ordem zero x parcial (controlando renda)
# --------------------------------------------------------------------------
def montar_tabela_nacional(df: pd.DataFrame, coluna_y: str) -> pd.DataFrame:
    print(f"\n[3/8] e [4/8] Correlação de ordem zero vs. parcial (controlando renda) — Y = {coluna_y}")
    linhas = []
    for coluna_x, (rotulo, sentido) in VARIAVEIS_X.items():
        if coluna_x == coluna_y:
            continue

        bruta = correlacao_spearman(df, coluna_x, coluna_y)

        # Para a própria renda, "controlar por renda" não faz sentido —
        # reportamos só a correlação de ordem zero.
        if coluna_x in CONTROLE_RENDA:
            parcial = {"rho_parcial": np.nan, "p_valor": np.nan, "n": bruta["n"]}
        else:
            parcial = correlacao_parcial_spearman(df, coluna_x, coluna_y, CONTROLE_RENDA)

        linhas.append({
            "indicador": rotulo,
            "coluna": coluna_x,
            "sentido": sentido,
            "n": bruta["n"],
            "rho_bruto": bruta["rho"],
            "p_bruto": bruta["p_valor"],
            "rho_parcial_renda": parcial["rho_parcial"],
            "p_parcial_renda": parcial["p_valor"],
        })

    tabela = pd.DataFrame(linhas)
    tabela["diferenca_bruto_menos_parcial"] = tabela["rho_bruto"] - tabela["rho_parcial_renda"]

    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(tabela.round(4).to_string(index=False))

    n_amostra_insuficiente = tabela["n"].lt(N_MINIMO_AMOSTRA).sum()
    if n_amostra_insuficiente > 0:
        print(f"      [AVISO] {n_amostra_insuficiente} indicador(es) com n < {N_MINIMO_AMOSTRA} "
              f"(rho reportado como NaN, amostra pequena demais para confiar no resultado).")

    return tabela


# --------------------------------------------------------------------------
# 5. Sensibilidade por região
# --------------------------------------------------------------------------
def sensibilidade_por_regiao(df: pd.DataFrame, coluna_y: str) -> pd.DataFrame:
    print(f"\n[5/8] Sensibilidade por região — parcial controlando renda, Y = {coluna_y}")
    regioes = sorted(df["regiao"].dropna().unique())
    linhas = []

    for coluna_x, (rotulo, _sentido) in VARIAVEIS_X.items():
        if coluna_x in CONTROLE_RENDA:
            continue
        for regiao in regioes:
            subset_regiao = df[df["regiao"] == regiao]
            resultado = correlacao_parcial_spearman(subset_regiao, coluna_x, coluna_y, CONTROLE_RENDA)
            linhas.append({
                "indicador": rotulo,
                "coluna": coluna_x,
                "regiao": regiao,
                "n": resultado["n"],
                "rho_parcial_renda": resultado["rho_parcial"],
                "p_valor": resultado["p_valor"],
            })

    tabela = pd.DataFrame(linhas)

    tabela_pivot = tabela.pivot_table(
        index=["indicador", "coluna"], columns="regiao", values="rho_parcial_renda"
    )
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(tabela_pivot.round(3).to_string())

    n_insuficiente = tabela["n"].lt(N_MINIMO_AMOSTRA).sum()
    if n_insuficiente > 0:
        print(f"      [AVISO] {n_insuficiente} combinação(ões) indicador x região com "
              f"n < {N_MINIMO_AMOSTRA} — não usadas no veredito de robustez (passo 8).")

    return tabela


# --------------------------------------------------------------------------
# 6. Sensibilidade por tercil de urbanização
# --------------------------------------------------------------------------
def classificar_tercis_urbanizacao(df: pd.DataFrame) -> pd.DataFrame:
    print("[6/8] Classificando municípios em tercis de urbanização "
          f"(base: {VARIAVEIS_X[VARIAVEL_URBANIZACAO][0]})...")

    df = df.copy()
    try:
        df["faixa_urbanizacao"] = pd.qcut(
            df[VARIAVEL_URBANIZACAO],
            q=3,
            labels=["Mais urbanizados (menor % rural)", "Urbanização intermediária", "Menos urbanizados (maior % rural)"],
            duplicates="drop",
        )
    except ValueError as erro:
        print(f"      [AVISO] Não foi possível cortar em 3 tercis exatos ({erro}) — "
              f"prosseguindo com os grupos que o pandas conseguiu formar.")
        df["faixa_urbanizacao"] = pd.qcut(
            df[VARIAVEL_URBANIZACAO], q=3, duplicates="drop"
        )

    contagens = df["faixa_urbanizacao"].value_counts(dropna=False)
    print(f"      Distribuição dos tercis:\n{contagens.to_string()}")

    return df


def sensibilidade_por_urbanizacao(df_com_tercis: pd.DataFrame, coluna_y: str) -> pd.DataFrame:
    print(f"\n[7/8] Sensibilidade por faixa de urbanização — parcial controlando renda, Y = {coluna_y}")
    faixas = [f for f in df_com_tercis["faixa_urbanizacao"].cat.categories] \
        if hasattr(df_com_tercis["faixa_urbanizacao"], "cat") \
        else df_com_tercis["faixa_urbanizacao"].dropna().unique()

    linhas = []
    for coluna_x, (rotulo, _sentido) in VARIAVEIS_X.items():
        if coluna_x in CONTROLE_RENDA or coluna_x == VARIAVEL_URBANIZACAO:
            continue
        for faixa in faixas:
            subset_faixa = df_com_tercis[df_com_tercis["faixa_urbanizacao"] == faixa]
            resultado = correlacao_parcial_spearman(subset_faixa, coluna_x, coluna_y, CONTROLE_RENDA)
            linhas.append({
                "indicador": rotulo,
                "coluna": coluna_x,
                "faixa_urbanizacao": faixa,
                "n": resultado["n"],
                "rho_parcial_renda": resultado["rho_parcial"],
                "p_valor": resultado["p_valor"],
            })

    tabela = pd.DataFrame(linhas)
    tabela_pivot = tabela.pivot_table(
        index=["indicador", "coluna"], columns="faixa_urbanizacao", values="rho_parcial_renda"
    )
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(tabela_pivot.round(3).to_string())

    return tabela


def controle_conjunto_renda_urbanizacao(df: pd.DataFrame, coluna_y: str) -> pd.DataFrame:
    """
    Variante extra de robustez: em vez de estratificar por faixa de
    urbanização, controla renda E urbanização (percentual_populacao_rural)
    AO MESMO TEMPO numa única correlação parcial nacional — checa se o
    resultado do passo 4 sobrevive quando urbanização entra como covariável
    adicional, em vez de subgrupo.
    """
    print(f"\n[8/8] Controle conjunto (renda + urbanização) — parcial nacional, Y = {coluna_y}")
    linhas = []
    controles_conjuntos = CONTROLE_RENDA + [VARIAVEL_URBANIZACAO]

    for coluna_x, (rotulo, _sentido) in VARIAVEIS_X.items():
        if coluna_x in controles_conjuntos:
            continue
        resultado = correlacao_parcial_spearman(df, coluna_x, coluna_y, controles_conjuntos)
        linhas.append({
            "indicador": rotulo,
            "coluna": coluna_x,
            "n": resultado["n"],
            "rho_parcial_renda_urbanizacao": resultado["rho_parcial"],
            "p_valor": resultado["p_valor"],
        })

    tabela = pd.DataFrame(linhas)
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(tabela.round(4).to_string(index=False))

    return tabela


# --------------------------------------------------------------------------
# 8b. Teste da hipótese de tipologia habitacional (% Apartamento) — só roda
# se percentual_apartamento estiver disponível (migration 0016 aplicada)
# --------------------------------------------------------------------------
def classificar_tercis_tipologia_habitacional(df: pd.DataFrame) -> pd.DataFrame:
    print(f"[6b/8] Classificando municípios em tercis de tipologia habitacional "
          f"(base: {VARIAVEIS_X[VARIAVEL_TIPOLOGIA_HABITACIONAL][0]})...")

    df = df.copy()
    try:
        df["faixa_apartamento"] = pd.qcut(
            df[VARIAVEL_TIPOLOGIA_HABITACIONAL],
            q=3,
            labels=["Menos apartamento (mais casa)", "Intermediário", "Mais apartamento"],
            duplicates="drop",
        )
    except ValueError as erro:
        print(f"       [AVISO] Não foi possível cortar em 3 tercis exatos ({erro}) — "
              f"prosseguindo com os grupos que o pandas conseguiu formar.")
        df["faixa_apartamento"] = pd.qcut(
            df[VARIAVEL_TIPOLOGIA_HABITACIONAL], q=3, duplicates="drop"
        )

    contagens = df["faixa_apartamento"].value_counts(dropna=False)
    print(f"       Distribuição dos tercis:\n{contagens.to_string()}")
    return df


def sensibilidade_por_tipologia_habitacional(df_com_tercis: pd.DataFrame, coluna_y: str) -> pd.DataFrame:
    print(f"\n[7b/8] Sensibilidade por tipologia habitacional (% apartamento) — "
          f"parcial controlando renda, Y = {coluna_y}")
    faixas = [f for f in df_com_tercis["faixa_apartamento"].cat.categories] \
        if hasattr(df_com_tercis["faixa_apartamento"], "cat") \
        else df_com_tercis["faixa_apartamento"].dropna().unique()

    linhas = []
    for coluna_x, (rotulo, _sentido) in VARIAVEIS_X.items():
        if coluna_x in CONTROLE_RENDA or coluna_x == VARIAVEL_TIPOLOGIA_HABITACIONAL:
            continue
        for faixa in faixas:
            subset_faixa = df_com_tercis[df_com_tercis["faixa_apartamento"] == faixa]
            resultado = correlacao_parcial_spearman(subset_faixa, coluna_x, coluna_y, CONTROLE_RENDA)
            linhas.append({
                "indicador": rotulo,
                "coluna": coluna_x,
                "faixa_apartamento": faixa,
                "n": resultado["n"],
                "rho_parcial_renda": resultado["rho_parcial"],
                "p_valor": resultado["p_valor"],
            })

    tabela = pd.DataFrame(linhas)
    tabela_pivot = tabela.pivot_table(
        index=["indicador", "coluna"], columns="faixa_apartamento", values="rho_parcial_renda"
    )
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(tabela_pivot.round(3).to_string())

    return tabela


def teste_hipotese_regioes_problema(df: pd.DataFrame, coluna_y: str) -> None:
    """
    Teste direcionado: refaz especificamente as duas correlações que
    motivaram a coluna percentual_apartamento (Segurança da Posse no Sul,
    Irradiação Solar no Centro-Oeste), controlando renda + % apartamento
    (em vez de renda + urbanização) — se a hipótese estiver certa, o sinal
    deveria deixar de destoar das outras regiões.
    """
    print(f"\n[8b/8] Teste direcionado — os 2 casos que motivaram este teste, "
          f"controlando renda + % apartamento (em vez de renda + urbanização):")

    casos = [
        ("Sul", "indice_seguranca_posse"),
        ("Centro-Oeste", "irradiacao_media_kwh_m2_dia"),
    ]
    controles = CONTROLE_RENDA + [VARIAVEL_TIPOLOGIA_HABITACIONAL]

    for regiao, coluna_x in casos:
        rotulo = VARIAVEIS_X[coluna_x][0]
        nacional = correlacao_parcial_spearman(df, coluna_x, coluna_y, controles)
        subset_regiao = df[df["regiao"] == regiao]
        regional = correlacao_parcial_spearman(subset_regiao, coluna_x, coluna_y, controles)
        # Para comparação, o mesmo par mas com o controle antigo (renda + urbanização)
        regional_antigo = correlacao_parcial_spearman(
            subset_regiao, coluna_x, coluna_y, CONTROLE_RENDA + [VARIAVEL_URBANIZACAO]
        )
        print(f"  {regiao} x {rotulo}:")
        print(f"    parcial (renda+apartamento) nacional = {nacional['rho_parcial']:+.4f} (n={nacional['n']})")
        print(f"    parcial (renda+apartamento) {regiao:14s} = {regional['rho_parcial']:+.4f} (n={regional['n']})")
        print(f"    parcial (renda+urbanização) {regiao:14s} = {regional_antigo['rho_parcial']:+.4f} "
              f"(n={regional_antigo['n']}) [valor de referência, controle antigo]")
        if pd.notna(nacional["rho_parcial"]) and pd.notna(regional["rho_parcial"]):
            if np.sign(nacional["rho_parcial"]) == np.sign(regional["rho_parcial"]):
                print("    -> sinal PASSA A CONCORDAR com o nacional controlando apartamento "
                      "(consistente com a hipótese de tipologia habitacional).")
            else:
                print("    -> sinal AINDA DESTOA mesmo controlando apartamento "
                      "(hipótese não explica sozinha este caso).")


# --------------------------------------------------------------------------
# 9. Resumo de robustez (encerramento — equivalente à "contagem final" dos extractors)
# --------------------------------------------------------------------------
def resumo_robustez(
    tabela_nacional: pd.DataFrame,
    tabela_regiao: pd.DataFrame,
    tabela_urbanizacao: pd.DataFrame,
    tabela_conjunta: pd.DataFrame,
) -> None:
    print("\n" + "=" * 78)
    print("RESUMO DE ROBUSTEZ — sinal da correlação parcial (controlando renda) "
          "mantido em quantas regiões/faixas de urbanização")
    print("=" * 78)

    linhas_resumo = []
    for _, linha_nacional in tabela_nacional.iterrows():
        coluna = linha_nacional["coluna"]
        if coluna in CONTROLE_RENDA:
            continue

        rho_nacional = linha_nacional["rho_parcial_renda"]
        if pd.isna(rho_nacional):
            veredito = "amostra nacional insuficiente"
            linhas_resumo.append({"indicador": linha_nacional["indicador"], "coluna": coluna,
                                   "rho_parcial_nacional": np.nan, "regioes_mesmo_sinal": np.nan,
                                   "faixas_mesmo_sinal": np.nan, "rho_controle_conjunto": np.nan,
                                   "veredito": veredito})
            continue

        sinal_nacional = np.sign(rho_nacional)

        subset_regiao = tabela_regiao[
            (tabela_regiao["coluna"] == coluna) & tabela_regiao["rho_parcial_renda"].notna()
            & (tabela_regiao["n"] >= N_MINIMO_AMOSTRA)
        ]
        regioes_mesmo_sinal = int((np.sign(subset_regiao["rho_parcial_renda"]) == sinal_nacional).sum())
        total_regioes_validas = len(subset_regiao)

        # A própria variável de urbanização não é testada dentro dos tercis
        # que ela mesma define (ver sensibilidade_por_urbanizacao) — não é
        # "sensível", é apenas não-aplicável, então trata-se à parte para não
        # contaminar o veredito com uma ausência de dado que é intencional.
        eh_variavel_urbanizacao = coluna == VARIAVEL_URBANIZACAO

        if eh_variavel_urbanizacao:
            faixas_mesmo_sinal = None
            total_faixas_validas = None
            robusto_urbanizacao = True  # não entra no critério — não aplicável
        else:
            subset_urb = tabela_urbanizacao[
                (tabela_urbanizacao["coluna"] == coluna) & tabela_urbanizacao["rho_parcial_renda"].notna()
                & (tabela_urbanizacao["n"] >= N_MINIMO_AMOSTRA)
            ]
            faixas_mesmo_sinal = int((np.sign(subset_urb["rho_parcial_renda"]) == sinal_nacional).sum())
            total_faixas_validas = len(subset_urb)
            robusto_urbanizacao = total_faixas_validas > 0 and faixas_mesmo_sinal == total_faixas_validas

        linha_conjunta = tabela_conjunta[tabela_conjunta["coluna"] == coluna]
        rho_conjunto = linha_conjunta["rho_parcial_renda_urbanizacao"].iloc[0] if len(linha_conjunta) else np.nan

        robusto_regiao = total_regioes_validas > 0 and regioes_mesmo_sinal == total_regioes_validas
        # Controle conjunto (renda + urbanização) também não se aplica à
        # própria variável de urbanização (estaria controlando por ela mesma).
        robusto_conjunto = True if eh_variavel_urbanizacao else (
            pd.notna(rho_conjunto) and np.sign(rho_conjunto) == sinal_nacional
        )

        if robusto_regiao and robusto_urbanizacao and robusto_conjunto:
            veredito = "robusto"
        elif not robusto_conjunto:
            veredito = "sensível — some/inverte controlando renda+urbanização juntas"
        elif not robusto_regiao or not robusto_urbanizacao:
            veredito = "sensível — sinal muda em ao menos uma região ou faixa de urbanização"
        else:
            veredito = "inconclusivo"

        linhas_resumo.append({
            "indicador": linha_nacional["indicador"],
            "coluna": coluna,
            "rho_parcial_nacional": round(rho_nacional, 4),
            "regioes_mesmo_sinal": f"{regioes_mesmo_sinal}/{total_regioes_validas}",
            "faixas_mesmo_sinal": ("N/A (moderador)" if eh_variavel_urbanizacao
                                   else f"{faixas_mesmo_sinal}/{total_faixas_validas}"),
            "rho_controle_conjunto": ("N/A (moderador)" if eh_variavel_urbanizacao
                                      else (round(rho_conjunto, 4) if pd.notna(rho_conjunto) else np.nan)),
            "veredito": veredito,
        })

    resumo = pd.DataFrame(linhas_resumo)
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(resumo.to_string(index=False))

    n_robustos = (resumo["veredito"] == "robusto").sum()
    n_sensiveis = resumo["veredito"].str.startswith("sensível", na=False).sum()
    n_insuficientes = (resumo["veredito"] == "amostra nacional insuficiente").sum()
    print(f"\nContagem final: {len(resumo)} indicador(es) testado(s) — "
          f"{n_robustos} robusto(s), {n_sensiveis} sensível(is) à estratificação, "
          f"{n_insuficientes} com amostra nacional insuficiente.")


# --------------------------------------------------------------------------
def main():
    print("Análise de correlação MMGD x Indicadores Sociais (Spearman + parcial "
          "controlando renda, com sensibilidade por região/urbanização)")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)

    df_bruto = carregar_dados(engine)

    # Quebra por classe de consumo (Residencial x Rural) — vem do Parquet
    # bruto, não do banco (ver docstring de carregar_classe_consumo_mmgd).
    # Se o arquivo não existir localmente (ex.: rodando num ambiente sem os
    # dados brutos baixados), cai para o comportamento anterior — só MMGD
    # total — em vez de travar a análise inteira por causa disso.
    if os.path.exists(CAMINHO_PARQUET_MMGD):
        classe_consumo = carregar_classe_consumo_mmgd(CAMINHO_PARQUET_MMGD)
        df_bruto = df_bruto.merge(classe_consumo, on="codigo_ibge", how="left")
    else:
        print(f"\n[1b/8] [AVISO] Parquet bruto não encontrado em {CAMINHO_PARQUET_MMGD} — "
              f"pulando a quebra por classe de consumo (residencial x rural). "
              f"Y principal cai de volta para o TOTAL (todas as classes).")

    df = calcular_indicadores_per_capita(df_bruto)
    df_com_tercis = classificar_tercis_urbanizacao(df)

    if CAMINHO_SAIDA_CSV:
        print(f"\n[INFO] Salvando painel completo em: {CAMINHO_SAIDA_CSV}")
        df_com_tercis.to_csv(CAMINHO_SAIDA_CSV, index=False)

    tem_quebra_por_classe = "mmgd_potencia_residencial_per_1000_hab" in df_com_tercis.columns

    # Quando a quebra por classe está disponível, a Y PRINCIPAL passa a ser
    # a potência RESIDENCIAL per capita — é essa a variável que corresponde
    # à pergunta de "vazios de acesso" do DRF (acesso residencial à MMGD),
    # não o total (que mistura instalações de agronegócio/irrigação,
    # tipicamente muito maiores em kW e concentradas em poucos municípios
    # rurais — foi essa mistura que motivou a checagem de robustez que
    # revelou os outliers de Sul/Centro-Oeste na sessão anterior).
    # Total e Rural continuam sendo reportados, mas só na tabela nacional
    # (ordem zero x parcial), como comparação — sem repetir toda a bateria
    # de sensibilidade para eles, para não multiplicar ~15 tabelas por Y.
    coluna_y_principal = (
        "mmgd_potencia_residencial_per_1000_hab" if tem_quebra_por_classe
        else "mmgd_potencia_per_1000_hab"
    )

    print("\n--- Y de comparação (checagem de consistência): nº de UCs com MMGD (TOTAL) per capita ---")
    montar_tabela_nacional(df_com_tercis, "mmgd_ucs_per_1000_hab")

    print("\n--- Y de comparação: potência MMGD TOTAL (todas as classes) per capita ---")
    montar_tabela_nacional(df_com_tercis, "mmgd_potencia_per_1000_hab")

    if tem_quebra_por_classe:
        print("\n--- Y de comparação: potência MMGD RURAL (proxy agropecuária/irrigação) per capita ---")
        montar_tabela_nacional(df_com_tercis, "mmgd_potencia_rural_per_1000_hab")

    print(f"\n--- Y PRINCIPAL (bateria completa de sensibilidade): {VARIAVEIS_Y.get(coluna_y_principal, coluna_y_principal)} ---")
    tabela_nacional = montar_tabela_nacional(df_com_tercis, coluna_y_principal)
    tabela_regiao = sensibilidade_por_regiao(df_com_tercis, coluna_y_principal)
    tabela_urbanizacao = sensibilidade_por_urbanizacao(df_com_tercis, coluna_y_principal)
    tabela_conjunta = controle_conjunto_renda_urbanizacao(df_com_tercis, coluna_y_principal)

    resumo_robustez(tabela_nacional, tabela_regiao, tabela_urbanizacao, tabela_conjunta)

    # Teste da hipótese de tipologia habitacional (% Apartamento) — só roda
    # se a coluna existir e tiver pelo menos um valor não nulo (migration
    # 0016 aplicada + extrair_tipo_domicilio_censo.py já rodou). Ver
    # VARIAVEL_TIPOLOGIA_HABITACIONAL e teste_hipotese_regioes_problema.
    tem_tipologia_habitacional = (
        VARIAVEL_TIPOLOGIA_HABITACIONAL in df_com_tercis.columns
        and df_com_tercis[VARIAVEL_TIPOLOGIA_HABITACIONAL].notna().any()
    )
    if tem_tipologia_habitacional:
        print("\n" + "=" * 78)
        print("TESTE DA HIPÓTESE DE TIPOLOGIA HABITACIONAL (% Apartamento, migration 0016)")
        print("=" * 78)
        df_com_tercis_apto = classificar_tercis_tipologia_habitacional(df_com_tercis)
        sensibilidade_por_tipologia_habitacional(df_com_tercis_apto, coluna_y_principal)
        teste_hipotese_regioes_problema(df_com_tercis, coluna_y_principal)
    else:
        print("\n[INFO] percentual_apartamento indisponível — pulando o teste de tipologia "
              "habitacional. Rode a migration 0016_indicadores_sociais_tipo_domicilio.sql e "
              "backend/src/etl/loaders/extrair_tipo_domicilio_censo.py para habilitar.")

    print("\n✅ Análise de correlação concluída (nenhuma escrita foi feita no banco).")


if __name__ == "__main__":
    main()
