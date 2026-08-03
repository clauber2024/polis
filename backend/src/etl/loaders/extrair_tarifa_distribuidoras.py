"""
EXTRACTOR: indicadores_sociais — tarifa_energia_residencial
================================================================================
POR QUE ESTE EXTRACTOR EXISTE:
--------------------------------------------------------------------------
Generaliza para TODAS as distribuidoras do Brasil um achado da sessão
06/07/2026 (ver ARQUITETURA.md, "Teste do mecanismo tarifa"): testando a
5ª hipótese para o caso Centro-Oeste x Irradiação Solar da análise de
correlação MMGD x indicadores sociais, EQUATORIAL GO (Goiás) teve a tarifa
residencial mais baixa entre EMS/EMT/EQUATORIAL GO em TODOS os anos de 2010
a 2024 — retorno financeiro mais fraco de instalar MMGD residencial é
explicação econômica plausível para adoção mais baixa. Esta coluna existe
para testar essa hipótese NACIONALMENTE (correlação com MMGD residencial
per capita em todos os municípios, não só nos 3 do Centro-Oeste) — ver
`backend/src/etl/analises/analisar_correlacao_mmgd_renda.py`.

FONTE: ANEEL Dados Abertos, dataset "Tarifas de aplicação das distribuidoras
de energia elétrica" (atualizado semanalmente, histórico 2010 em diante).
Campos reais do CSV DIVERGEM do dicionário oficial (mesmo cuidado do caso
TSEE — confirmado via inspeção do dado real em
backend/src/etl/analises/investigar_tarifa_centro_oeste.py):
  - DscBaseTarifaria (não DscBaseTarifa), DscSubGrupo (não DscSubgrupo),
    VlrTUSD/VlrTE (não VlrTusd/VlrTe), DscUnidadeTerciaria (não DscUnidade).
Arquivo NÃO é UTF-8 — é latin-1/cp1252 (mesmo achado do INDQUAL).

RESOLUÇÃO MUNICÍPIO -> DISTRIBUIDORA: reaproveita o schema já carregado do
INDQUAL (qualidade_conjuntos.sig_agente + qualidade_conjunto_municipio),
mesmo padrão de investigar_distribuidora_regioes_problema.py — nenhuma fonte
nova necessária. Municípios com MÚLTIPLAS distribuidoras (área de concessão
dividida entre agentes) ficam SEM tarifa (não é possível atribuir um valor
único) — reportados separadamente, não é erro.

CROSSWALK_SIG_AGENTE_INDQUAL_PARA_TARIFA (30/07/2026, correção de bug real —
usuário perguntou por que Amazonas/Roraima ficavam 100% sem tarifa apesar de
serem estados de distribuidora única, o que descartava a causa "múltiplas
distribuidoras"): o `sig_agente` do INDQUAL e o `SigAgente` do dataset de
tarifas são DOIS CAMPOS DE DOIS DATASETS DIFERENTES da própria ANEEL, sem
garantia de baterem — mesma classe de problema já resolvida para "Enel GO" =
"EQUATORIAL GO" no crosswalk de `extrair_desempenho_conexao_mmgd.py`, mas
aqui entre INDQUAL e Tarifas Homologadas, não entre a fila de conexão e o
INDQUAL. Investigação registrada em
`backend/src/etl/analises/investigar_cobertura_tarifa_distribuidoras.py`
confirmou que "AME" (Amazonas Energia) e "BOA VISTA" (Roraima Energia) são
os ÚNICOS dois sig_agente do INDQUAL, entre distribuidoras de área de
concessão única (sem ambiguidade), sem nenhuma tarifa homologada batendo —
CONFIRMADO via CNPJ IDÊNTICO entre os dois datasets (não por semelhança de
nome): AME = CNPJ 02341467000120 = "Âmbar Amazonas" no dataset de tarifas;
BOA VISTA = CNPJ 02341470000144 = "ÂMBAR ENERGIA RR". As duas distribuidoras
foram adquiridas pelo grupo Âmbar Energia — o dataset de tarifas (mais
recente) já reflete o nome novo, o INDQUAL ainda não.

VALOR GRAVADO: tarifa vigente MAIS RECENTE (TUSD+TE somadas, R$/MWh),
subgrupo B1, modalidade Convencional, Tarifa de Aplicação (o que o
consumidor de fato paga, não a Base Econômica). Não é uma média histórica —
é um snapshot do estado atual, mesma convenção de renda_media_domiciliar e
outros indicadores de "estado atual" deste projeto. A relevância para
adoção ACUMULADA de MMGD (que reflete anos de decisões) é uma limitação
conhecida, documentada em ARQUITETURA.md.

MÚLTIPLAS DISTRIBUIDORAS POR MUNICÍPIO — resolução em 2 camadas (01/08/2026,
migration 0032, tarifa_energia_residencial_aproximada). Motivação: usuário
apontou um agrupamento de municípios em Goiás (microrregião Ceres/São
Patrício) sem tarifa gravada — investigado e CONFIRMADO como área de
concessão dividida legítima entre CHESP (cooperativa ativa, CNPJ
01377555000110, homologando tarifa até 2026) e EQUATORIAL GO. Usuário: "mas
não pode existir municípios sem tarifa" + pedido explícito para generalizar
a solução para o resto do país (não só Goiás), incluindo Roraima como
exemplo. Investigação nacional (query agregada em qualidade_conjuntos)
revelou 158 combinações de distribuidoras conflitantes em todo o país — a
maioria (RS/SC/PR) é o mesmo padrão CHESP: 1 concessionária estadual real +
1 cooperativa rural pequena genuinamente distinta. MAS Roraima revelou um
padrão DIFERENTE: "CERR" aparece junto de "BOA VISTA" em 14 dos 15
municípios de Roraima no INDQUAL, mas seu CNPJ (05938444000196) para de
homologar tarifa em 2014-11-01 e nunca mais volta — não é uma segunda
empresa ativa (como CHESP), é um registro de conjunto morto no INDQUAL
nunca consolidado (mesma classe de bug já corrigida manualmente para
RGE/RGE SUL e o grupo CPFL Santa Cruz, aqui detectado por INATIVIDADE em
vez de evidência manual de fusão).

Por isso a resolução usa 3 regras, todas calculadas a partir do dado real
(nunca uma lista de nomes decorados — princípio já usado nos crosswalks
acima, "nunca por semelhança de nome"):
  1) OBSOLESCÊNCIA (sem aproximação): entre as distribuidoras registradas
     de um município, descarta qualquer uma que não homologou NENHUMA
     tarifa (qualquer subgrupo/classe) nos últimos
     ANOS_LIMIAR_DISTRIBUIDORA_ATIVA anos — se sobrar exatamente uma, essa
     é a distribuidora real hoje, sem flag de aproximação (resolve
     Roraima/CERR e qualquer caso análogo em outros estados, automaticamente).
  2) DISTRIBUIDORA PRINCIPAL (com aproximação): revisão de 01/08/2026 —
     desenho original só aplicava isto quando EXATAMENTE UMA distribuidora
     cruzava um limiar fixo de "grande" (>= 10 municípios sozinha), deixando
     casos como {ENEL RJ, LIGHT SESA} sem tarifa por serem as duas
     "grandes". Usuário: "não pode existir municípios sem tarifa" — regra
     revisada para SEMPRE escolher, entre as distribuidoras ativas (ou as
     originais, se nenhuma estiver ativa), alguma candidata. Critério de
     desempate em 2 níveis, do mais específico ao mais geral: (a)
     contagem_conjuntos_local — quantos CONJUNTOS (circuitos) distintos
     cada distribuidora tem DENTRO deste município específico (usuário
     confirmou ao vivo no painel "Desempenho das Distribuidoras por
     Município" da própria ANEEL que municípios ambíguos de fato têm
     conjuntos internos atendidos por distribuidoras diferentes — não é
     ambiguidade artificial); (b) contagem_solo — cobertura nacional,
     usada só se empatar em (a). Sempre resolve, sempre marca a flag de
     aproximação — mesmo com o desempate local, ainda ignora o(s)
     conjunto(s) da distribuidora minoritária, então nunca é o valor
     exato de uma distribuidora única.
  3) ADJACÊNCIA GEOGRÁFICA (com aproximação): município SEM NENHUM
     registro de distribuidora no INDQUAL (não é ambiguidade, é ausência
     total de dado na fonte — 33 casos, 01/08/2026) herda a distribuidora
     mais comum entre os municípios VIZINHOS (ST_DWithin, não ST_Touches
     exato — a malha simplificada pode ter microfrestas entre polígonos
     administrativamente vizinhos) que já foram resolvidos pelas regras
     1-2 acima. Único caso que ainda pode ficar sem tarifa: município
     isolado sem nenhum vizinho resolvido (ex.: ilha) — aí não há dado
     real nenhum, nem do próprio município nem de vizinho, pra basear
     qualquer aproximação.

Este valor é APROXIMADO por design sempre que a flag é true (ignora a(s)
outra(s) distribuidora(s)/vizinho que também atende(m) o município ou a
região) — por isso a flag: o frontend deve sempre rotular visivelmente,
nunca apresentar como tarifa exata de distribuidora única.
================================================================================
"""

import os
import time

import pandas as pd
import requests
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

URL_CSV_TARIFAS = (
    "https://dadosabertos.aneel.gov.br/dataset/5a583f3e-1646-4f67-bf0f-69db4203e89e/"
    "resource/fcf2906c-7c32-4b9b-a637-054e7a5234f4/download/"
    "tarifas-homologadas-distribuidoras-energia-eletrica.csv"
)

CAMINHO_LOCAL = os.environ.get(
    "CAMINHO_CSV_TARIFAS",
    "backend/src/etl/data/raw/aneel_tarifas/tarifas-homologadas-distribuidoras-energia-eletrica.csv",
)

# Período de referência = data da extração (não é um Censo/coleta pontual —
# tarifas têm vigências distintas por distribuidora; este é um snapshot do
# "estado atual" no momento em que o extractor rodou).
PERIODO_REFERENCIA = os.environ.get("PERIODO_REFERENCIA_TARIFA", "2026-07-06")

# Crosswalk sig_agente (INDQUAL) -> SigAgente (dataset de tarifas) — ver
# docstring do módulo para o achado completo (evidência de CNPJ). Só entram
# aqui casos CONFIRMADOS manualmente, nunca candidatos automáticos por
# substring (mesmo princípio do MAPEAMENTO_MANUAL_CONFIRMADO em
# extrair_desempenho_conexao_mmgd.py).
CROSSWALK_SIG_AGENTE_INDQUAL_PARA_TARIFA = {
    "AME": "Âmbar Amazonas",
    "BOA VISTA": "ÂMBAR ENERGIA RR",
}

# Normalização DENTRO do próprio INDQUAL — casos em que dois sig_agente
# distintos em `qualidade_conjuntos` (CNPJs diferentes) não são duas
# distribuidoras reais hoje, e sim a MESMA empresa em épocas diferentes,
# por fusão/incorporação nunca refletida nos registros de conjunto antigos.
# Sem isso, `resolver_municipio_distribuidora` conta essas duas entradas
# como "múltiplas distribuidoras" e exclui o município da tarifa por engano.
# Confirmado para RGE/RGE SUL (30/07/2026), via evidência temporal no
# próprio dataset de tarifas homologadas da ANEEL: até 2018-06-19 existiam
# duas empresas com tarifas homologadas separadamente — "RGE" (CNPJ
# 02016439000138) e "RGE SUL" (CNPJ 02016440000162); a partir de
# 2019-06-19 só o CNPJ 02016440000162 continua homologando tarifa, agora
# sob o rótulo "RGE" — rastro de incorporação da antiga RGE pela RGE Sul,
# com a sobrevivente adotando o nome "RGE". O INDQUAL nunca consolidou os
# dois registros de conjunto antigos. Município cujos únicos sig_agente
# distintos sejam os dois lados dessa fusão não tem, de fato, mais de uma
# distribuidora hoje — mapeados ao nome atual ("RGE") antes de contar
# distribuidora única. Mesma classe de problema do CROSSWALK acima
# (naming divergente entre registros ANEEL), aqui dentro de um único
# dataset em vez de entre dois. Aplicar o mesmo tratamento a outros pares
# recorrentes só depois de confirmação individual via CNPJ/histórico —
# nunca por semelhança de nome.
#
# Segundo caso confirmado (30/07/2026): CPFL Jaguari, CPFL Mococa, CPFL
# Leste Paulista, CPFL Sul Paulista e CPFL Santa Cruz — 5 concessionárias
# do Grupo CPFL no interior de SP — agrupadas numa só por decisão
# regulatória explícita, não achado indireto: Resolução Autorizativa
# ANEEL nº 6.723/2017 (21/11/2017) aprovou a incorporação das outras 4 na
# Jaguari (CNPJ 53859112000169), efetiva em 01/01/2018, com a empresa
# resultante renomeada "CPFL Santa Cruz S.A.". Bate com a evidência
# temporal do dataset de tarifas: as 5 param de homologar com nome/CNPJ
# originais em 2017-03-22/2018-03-22, e só o CNPJ 53859112000169 segue
# homologando a partir de 2018-03-22, sob o rótulo "CPFL Santa Cruz"
# (grafia mista — é a chave usada por
# `carregar_tarifa_mais_recente_por_distribuidora`, case sensitive, para
# achar a tarifa vigente mais recente).
#
# Terceiro caso confirmado (30/07/2026), padrão diferente dos dois
# anteriores: EDEVP, EEB e CNEE eram 3 concessionárias do "Grupo Rede"
# (adquirido pela Energisa em 2014) que homologavam tarifa
# SEPARADAMENTE até 2017-04-01, quando as três param ao mesmo tempo — não
# uma renomeação de CNPJ (como RGE/CPFL), e sim unificação formal das
# áreas de concessão na "Energisa Sul-Sudeste" (sig_agente "ESS", CNPJ
# 07282377000120, PRÓPRIO — já homologava tarifa em paralelo desde 2010,
# não é o CNPJ de nenhuma das três), confirmado via busca (EDEVP
# oficialmente renomeada "Energisa Sul-Sudeste") + notícia de unificação
# de áreas de concessão pela Energisa. Município cujos únicos sig_agente
# distintos sejam ESS + um desses três nomes antigos tem, de fato, uma
# única distribuidora hoje.
NORMALIZACAO_SIG_AGENTE_MESMA_EMPRESA_INDQUAL = {
    "RGE": "RGE",
    "RGE SUL": "RGE",
    "CPFL JAGUARI": "CPFL Santa Cruz",
    "CPFL SANTA CRUZ": "CPFL Santa Cruz",
    "CPFL LESTE PAULI": "CPFL Santa Cruz",
    "CPFL SUL PAULIST": "CPFL Santa Cruz",
    "CPFL MOCOCA": "CPFL Santa Cruz",
    "EDEVP": "ESS",
    "EEB": "ESS",
    "CNEE": "ESS",
}

TAMANHO_CHUNK = 200_000

# Ver docstring do módulo, seção "MÚLTIPLAS DISTRIBUIDORAS POR MUNICÍPIO",
# para o achado completo que fundamenta este limiar (01/08/2026).

# Uma distribuidora só entra na regra de "obsolescência" como candidata a
# ser descartada se NENHUMA tarifa dela (qualquer subgrupo/classe) tiver
# vigência iniciada nos últimos N anos, contados a partir da data mais
# recente do PRÓPRIO dataset (não datetime.now() — mantém o script correto
# mesmo rodando anos depois sobre um CSV baixado antigo).
ANOS_LIMIAR_DISTRIBUIDORA_ATIVA = 3


# Achado 01/08/2026: baixar sem headers a partir do datacenter do Railway
# derrubava a conexão logo no handshake TLS (SSLZeroReturnError, "connection
# closed (EOF)") em todas as 4 tentativas — assinatura de bloqueio de WAF a
# clientes sem User-Agent de navegador, não instabilidade de rede (o mesmo
# download funciona normalmente de uma máquina de desenvolvimento comum).
CABECALHOS_DOWNLOAD = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}


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
            resposta = requests.get(
                URL_CSV_TARIFAS, timeout=300, stream=True, headers=CABECALHOS_DOWNLOAD
            )
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
    with open(CAMINHO_LOCAL, "rb") as f:
        amostra = f.read(1_000_000)
    try:
        amostra.decode("utf-8-sig")
        return "utf-8-sig"
    except UnicodeDecodeError:
        return "latin-1"


def carregar_situacao_distribuidoras(codificacao: str):
    """Lê o CSV inteiro em chunks (UMA ÚNICA passada) e retorna:
    - tarifa_por_distribuidora: tarifa B1/Residencial/Convencional/Tarifa de
      Aplicação (TUSD+TE) mais recente por SigAgente — mesmo cálculo de
      sempre, usado para o VALOR da tarifa gravada.
    - ultima_vigencia_por_distribuidora: data de início de vigência mais
      recente homologada por SigAgente, em QUALQUER subgrupo/classe/base
      tarifária (não só B1/Residencial) — sinal de "esta empresa ainda
      homologa tarifa hoje", usado só para decidir se um registro do
      INDQUAL é uma distribuidora que ainda opera de fato ou um registro
      obsoleto nunca limpo (ver docstring do módulo, achado Roraima/CERR).
    - data_mais_recente: a maior DatInicioVigencia do dataset inteiro,
      usada como referência de "hoje" no lugar de datetime.now() (mantém o
      corte de atividade correto mesmo rodando anos depois sobre um CSV
      baixado antigo)."""
    print("\n[2/6] Lendo CSV completo em chunks (tarifa B1/Residencial + situação de "
          "atividade de todas as distribuidoras, todos os subgrupos/classes)...")

    pedacos_b1_residencial = []
    ultima_vigencia_geral: dict[str, pd.Timestamp] = {}
    total_linhas_lidas = 0
    for chunk in pd.read_csv(
        CAMINHO_LOCAL, sep=";", encoding=codificacao,
        chunksize=TAMANHO_CHUNK, dtype=str, on_bad_lines="skip",
    ):
        total_linhas_lidas += len(chunk)

        vigencia_chunk = pd.to_datetime(chunk["DatInicioVigencia"], errors="coerce")
        vigencia_por_agente_no_chunk = (
            pd.DataFrame({"SigAgente": chunk["SigAgente"], "vigencia": vigencia_chunk})
            .dropna(subset=["SigAgente", "vigencia"])
            .groupby("SigAgente")["vigencia"].max()
        )
        for agente, data in vigencia_por_agente_no_chunk.items():
            if agente not in ultima_vigencia_geral or data > ultima_vigencia_geral[agente]:
                ultima_vigencia_geral[agente] = data

        filtro = (
            (chunk["DscSubGrupo"] == "B1")
            & (chunk["DscBaseTarifaria"] == "Tarifa de Aplicação")
            & (chunk["DscModalidadeTarifaria"] == "Convencional")
            & (chunk["DscClasse"] == "Residencial")
        )
        if filtro.any():
            pedacos_b1_residencial.append(chunk[filtro].copy())

    print(f"      {total_linhas_lidas} linha(s) lidas no total do arquivo.")

    df = pd.concat(pedacos_b1_residencial, ignore_index=True)
    print(f"      {len(df)} linha(s) após filtro B1/Residencial/Convencional/Tarifa de Aplicação.")

    df["DatInicioVigencia"] = pd.to_datetime(df["DatInicioVigencia"], errors="coerce")
    df["VlrTUSD"] = pd.to_numeric(df["VlrTUSD"].str.replace(",", "."), errors="coerce")
    df["VlrTE"] = pd.to_numeric(df["VlrTE"].str.replace(",", "."), errors="coerce")
    df["tarifa_total"] = df["VlrTUSD"] + df["VlrTE"]

    n_distribuidoras = df["SigAgente"].nunique()
    print(f"      {n_distribuidoras} distribuidora(s) distinta(s) com tarifa residencial "
          f"convencional homologada.")

    tarifa_por_distribuidora = (
        df.dropna(subset=["DatInicioVigencia", "tarifa_total"])
        .sort_values("DatInicioVigencia")
        .groupby("SigAgente")
        .tail(1)
        .set_index("SigAgente")["tarifa_total"]
    )

    ultima_vigencia_por_distribuidora = pd.Series(ultima_vigencia_geral)
    data_mais_recente = ultima_vigencia_por_distribuidora.max()
    print(f"      Data de homologação mais recente do dataset (todas as distribuidoras/"
          f"subgrupos, referência de \"hoje\" para o corte de atividade): "
          f"{data_mais_recente.date()}.")

    return tarifa_por_distribuidora, ultima_vigencia_por_distribuidora, data_mais_recente


def resolver_municipio_distribuidora(
    engine,
    ultima_vigencia_por_distribuidora: pd.Series,
    data_mais_recente: pd.Timestamp,
) -> pd.DataFrame:
    """Reaproveita o schema já carregado do INDQUAL — nenhuma fonte nova
    necessária (mesmo padrão de investigar_distribuidora_regioes_problema.py).
    Para município com múltiplas distribuidoras registradas, tenta resolver
    em 2 camadas antes de desistir — ver docstring do módulo, seção
    "MÚLTIPLAS DISTRIBUIDORAS POR MUNICÍPIO", para o raciocínio completo."""
    print("\n[3/6] Resolvendo município -> distribuidora via schema já carregado do INDQUAL...")

    query = text("""
        SELECT qcm.codigo_ibge, qc.sig_agente, qc.ide_conjunto
        FROM qualidade_conjunto_municipio qcm
        JOIN qualidade_conjuntos qc ON qc.ide_conjunto = qcm.ide_conjunto
        WHERE qc.sig_agente IS NOT NULL
    """)
    with engine.connect() as conexao:
        pares = pd.read_sql(query, conexao)

    pares["sig_agente"] = pares["sig_agente"].replace(
        NORMALIZACAO_SIG_AGENTE_MESMA_EMPRESA_INDQUAL
    )

    agrupado = pares.groupby("codigo_ibge")["sig_agente"].agg(lambda s: sorted(set(s)))
    resultado = agrupado.reset_index()
    resultado.columns = ["codigo_ibge", "distribuidoras"]

    # contagem_conjuntos_local = quantos CONJUNTOS (circuitos) distintos cada
    # distribuidora tem DENTRO de cada município — sugestão do usuário
    # (01/08/2026), confirmando ao vivo no painel "Desempenho das
    # Distribuidoras por Município" da própria ANEEL (mesma base INDQUAL que
    # já carregamos) que municípios ambíguos de fato têm conjuntos distintos
    # atendidos por distribuidoras diferentes — não é ambiguidade artificial,
    # é o próprio município tendo mais de uma área de atendimento real.
    # Evidência LOCAL (quantos circuitos dentro DESTE município) é mais
    # direta que escala NACIONAL — vira o critério PRIMÁRIO de desempate;
    # contagem_solo (nacional) passa a desempate SECUNDÁRIO, só para o caso
    # raro de empate no número de conjuntos locais.
    contagem_conjuntos_local = (
        pares.drop_duplicates(subset=["codigo_ibge", "sig_agente", "ide_conjunto"])
        .groupby(["codigo_ibge", "sig_agente"])
        .size()
    )

    # contagem_solo = quantos municípios cada distribuidora atende SOZINHA
    # (sem ambiguidade) em todo o país — desempate SECUNDÁRIO (ver acima).
    # Decisão do usuário (01/08/2026): "não pode existir municípios sem
    # tarifa" — SEMPRE escolhe, entre as candidatas, alguma distribuidora;
    # nunca deixa em aberto por ambiguidade.
    solo = resultado[resultado["distribuidoras"].apply(len) == 1]
    contagem_solo = solo["distribuidoras"].apply(lambda lst: lst[0]).value_counts()

    data_corte_atividade = data_mais_recente - pd.DateOffset(years=ANOS_LIMIAR_DISTRIBUIDORA_ATIVA)

    def esta_ativa(sig_agente: str) -> bool:
        nome_no_dataset_tarifas = CROSSWALK_SIG_AGENTE_INDQUAL_PARA_TARIFA.get(
            sig_agente, sig_agente
        )
        ultima = ultima_vigencia_por_distribuidora.get(nome_no_dataset_tarifas)
        return ultima is not None and pd.notna(ultima) and ultima >= data_corte_atividade

    def resolver(codigo_ibge: str, lst: list[str]):
        if len(lst) == 1:
            return lst[0], False

        ativas = [d for d in lst if esta_ativa(d)]
        if len(ativas) == 1:
            # só uma das distribuidoras registradas ainda homologa tarifa —
            # as demais são registros obsoletos do INDQUAL nunca limpos
            # (mesma classe de bug já corrigida manualmente para RGE/CPFL/
            # EDEVP, aqui detectada por inatividade — caso Roraima/CERR)
            return ativas[0], False

        # ambíguo mesmo entre ativas (ou nenhuma ativa — último recurso usa
        # as registradas originais): nunca desiste, sempre escolhe a com
        # mais conjuntos DENTRO deste município; empate no local cai pra
        # cobertura nacional; empate exato nos dois cai no primeiro em
        # ordem alfabética (lst já vem ordenado).
        candidatas = ativas if ativas else lst
        escolhida = max(
            candidatas,
            key=lambda d: (contagem_conjuntos_local.get((codigo_ibge, d), 0), contagem_solo.get(d, 0)),
        )
        return escolhida, True

    resolvido = resultado.apply(
        lambda linha: resolver(linha["codigo_ibge"], linha["distribuidoras"]), axis=1
    )
    resultado["distribuidora_unica"] = resolvido.apply(lambda t: t[0])
    resultado["distribuidora_aproximada"] = resolvido.apply(lambda t: t[1])

    tem_multipla = resultado["distribuidoras"].apply(len) > 1
    n_unica_direta = int((~tem_multipla).sum())
    n_obsolescencia = int(
        (tem_multipla & resultado["distribuidora_unica"].notna() & ~resultado["distribuidora_aproximada"]).sum()
    )
    n_aproximada = int(resultado["distribuidora_aproximada"].sum())
    print(f"      {n_unica_direta} município(s) com distribuidora única direta | "
          f"{n_obsolescencia} resolvido(s) por obsolescência de registro (outra "
          f"distribuidora do conjunto sem tarifa homologada há mais de "
          f"{ANOS_LIMIAR_DISTRIBUIDORA_ATIVA} anos) | "
          f"{n_aproximada} aproximado(s) (distribuidora escolhida por maior "
          f"cobertura nacional entre as candidatas).")

    # Municípios SEM NENHUM registro no INDQUAL (nem ambíguo: zero linhas em
    # `pares`) — não há distribuidora nenhuma pra escolher a partir do
    # próprio município. Único jeito de não deixar em branco sem inventar
    # valor: geografia real. Herda a distribuidora mais comum entre os
    # municípios VIZINHOS (ST_DWithin com folga pequena, não ST_Touches
    # exato — a malha municipal usada no seed é simplificada a ~10m, o que
    # pode abrir microfrestas entre polígonos administrativamente
    # vizinhos; mesmo tipo de ajuste já necessário para o contorno de
    # estado, ver ST_MakeValid em estados.service.ts) que JÁ foram
    # resolvidos acima. Decisão do usuário (01/08/2026). Município isolado
    # sem nenhum vizinho resolvido (ilha, ex. Fernando de Noronha) continua
    # sem tarifa — não há nenhum dado real, nem vizinho, pra basear uma
    # aproximação.
    query_todos_municipios = text("SELECT codigo_ibge FROM municipios")
    with engine.connect() as conexao:
        todos_municipios = pd.read_sql(query_todos_municipios, conexao)["codigo_ibge"]

    sem_registro = sorted(set(todos_municipios) - set(resultado["codigo_ibge"]))
    print(f"      {len(sem_registro)} município(s) sem NENHUM registro de distribuidora no "
          f"INDQUAL — resolvendo por adjacência geográfica com municípios vizinhos...")

    linhas_vizinhanca = []
    if sem_registro:
        distribuidora_por_municipio = dict(
            zip(resultado["codigo_ibge"], resultado["distribuidora_unica"])
        )

        # Busca vizinhos de TODOS os municípios sem registro — inclusive uns
        # dos outros (m2 não é filtrado a "já resolvidos"), porque um
        # município sem registro pode ter como vizinho OUTRO município
        # também sem registro, que só fica resolvido numa rodada seguinte
        # (ver resolução iterativa abaixo).
        query_vizinhos = text("""
            SELECT m1.codigo_ibge AS municipio, m2.codigo_ibge AS vizinho
            FROM municipios m1
            JOIN municipios m2
              ON m2.codigo_ibge <> m1.codigo_ibge
             AND ST_DWithin(m1.geom, m2.geom, 0.005)
            WHERE m1.codigo_ibge = ANY(:lista)
        """)
        with engine.connect() as conexao:
            vizinhos = pd.read_sql(query_vizinhos, conexao, params={"lista": list(sem_registro)})
        vizinhos_por_municipio = vizinhos.groupby("municipio")["vizinho"].apply(list).to_dict()

        # Resolução ITERATIVA (por rodadas): achado real (01/08/2026) — bolsa
        # de 4 municípios contíguos sem NENHUM registro no INDQUAL na Zona da
        # Mata mineira (Muriaé e entorno), cada um só com vizinhos que
        # TAMBÉM não tinham registro — uma única rodada não resolvia nenhum
        # dos 4. A cada rodada, um município recém-resolvido por vizinhança
        # passa a valer como fonte pros seus próprios vizinhos ainda
        # pendentes, até estabilizar (ou esgotar o limite de rodadas).
        pendentes = set(sem_registro)
        resolvidos_por_vizinhanca: dict[str, str] = {}
        for _rodada in range(5):
            if not pendentes:
                break
            progrediu = False
            ainda_pendentes = set()
            for codigo in pendentes:
                candidatos = [
                    distribuidora_por_municipio.get(v) or resolvidos_por_vizinhanca.get(v)
                    for v in vizinhos_por_municipio.get(codigo, [])
                ]
                candidatos = [c for c in candidatos if c is not None]
                if not candidatos:
                    ainda_pendentes.add(codigo)
                    continue
                contagem_vizinhos = pd.Series(candidatos).value_counts()
                maior_contagem = contagem_vizinhos.max()
                empatados = sorted(contagem_vizinhos[contagem_vizinhos == maior_contagem].index)
                resolvidos_por_vizinhanca[codigo] = max(empatados, key=lambda d: contagem_solo.get(d, 0))
                progrediu = True
            pendentes = ainda_pendentes
            if not progrediu:
                break

        for codigo in sem_registro:
            escolhida = resolvidos_por_vizinhanca.get(codigo)
            linhas_vizinhanca.append({
                "codigo_ibge": codigo,
                "distribuidora_unica": escolhida,
                "distribuidora_aproximada": escolhida is not None,
            })

        print(f"      {len(resolvidos_por_vizinhanca)}/{len(sem_registro)} resolvido(s) por "
              f"adjacência geográfica (iterativo).")

        resultado = pd.concat(
            [resultado[["codigo_ibge", "distribuidora_unica", "distribuidora_aproximada"]],
             pd.DataFrame(linhas_vizinhanca)],
            ignore_index=True,
        )

    n_sem_solucao = int(resultado["distribuidora_unica"].isna().sum())
    print(f"      {n_sem_solucao} município(s) permanecem sem solução (nenhum registro E "
          f"nenhum vizinho resolvido — ficarão SEM tarifa).")

    return resultado[["codigo_ibge", "distribuidora_unica", "distribuidora_aproximada"]]


def montar_tarifa_por_municipio(
    tarifa_por_distribuidora: pd.Series, municipio_distribuidora: pd.DataFrame
) -> pd.DataFrame:
    print("\n[4/6] Cruzando tarifa por distribuidora com o mapeamento município -> distribuidora...")

    df = municipio_distribuidora.copy()
    sig_agente_para_busca = df["distribuidora_unica"].replace(
        CROSSWALK_SIG_AGENTE_INDQUAL_PARA_TARIFA
    )
    df["tarifa_energia_residencial"] = sig_agente_para_busca.map(tarifa_por_distribuidora)

    # aproximada só faz sentido quando a tarifa foi de fato encontrada — se
    # a distribuidora "principal" escolhida não tiver tarifa B1/Residencial
    # homologada, o município fica sem tarifa (mesmo tratamento de sempre),
    # não com a flag ligada à toa.
    df["tarifa_energia_residencial_aproximada"] = (
        df["distribuidora_aproximada"] & df["tarifa_energia_residencial"].notna()
    )

    sem_distribuidora_unica = df["distribuidora_unica"].isna().sum()
    tem_distribuidora_sem_tarifa = (
        df["distribuidora_unica"].notna() & df["tarifa_energia_residencial"].isna()
    ).sum()

    if tem_distribuidora_sem_tarifa > 0:
        distribuidoras_sem_match = sorted(
            df[df["distribuidora_unica"].notna() & df["tarifa_energia_residencial"].isna()]
            ["distribuidora_unica"].unique().tolist()
        )
        print(f"      [AVISO] {tem_distribuidora_sem_tarifa} município(s) têm distribuidora única, "
              f"mas essa distribuidora NÃO tem tarifa B1/Residencial/Convencional homologada "
              f"encontrada no dataset ({len(distribuidoras_sem_match)} distribuidora(s) distinta(s), "
              f"provavelmente cooperativas de eletrificação rural pequenas sem homologação "
              f"nesse formato específico). Primeiras 10: {distribuidoras_sem_match[:10]}")

    n_com_tarifa = df["tarifa_energia_residencial"].notna().sum()
    n_aproximada = int(df["tarifa_energia_residencial_aproximada"].sum())
    print(f"      {n_com_tarifa} município(s) terão tarifa gravada "
          f"({sem_distribuidora_unica} sem distribuidora única, {tem_distribuidora_sem_tarifa} "
          f"com distribuidora sem tarifa homologada encontrada) — {n_aproximada} deles com "
          f"tarifa APROXIMADA (distribuidora principal, rotulado no frontend).")

    return df[[
        "codigo_ibge", "tarifa_energia_residencial", "tarifa_energia_residencial_aproximada",
        "distribuidora_unica",
    ]]


def executar_upsert(engine, df: pd.DataFrame):
    print(f"\n[5/6] Inserindo/atualizando `indicadores_sociais` para período {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, tarifa_energia_residencial,
             tarifa_energia_residencial_aproximada, tarifa_energia_residencial_distribuidora)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :tarifa_energia_residencial,
             :tarifa_energia_residencial_aproximada, :tarifa_energia_residencial_distribuidora)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            tarifa_energia_residencial = EXCLUDED.tarifa_energia_residencial,
            tarifa_energia_residencial_aproximada = EXCLUDED.tarifa_energia_residencial_aproximada,
            tarifa_energia_residencial_distribuidora = EXCLUDED.tarifa_energia_residencial_distribuidora;
    """)

    total = len(df)
    inseridos = 0
    falhas = []

    def valor_ou_none(x):
        return None if pd.isna(x) else float(x)

    def texto_ou_none(x):
        return None if pd.isna(x) else str(x)

    for i, linha in df.iterrows():
        unidade_espacial_id = f"municipio:{linha['codigo_ibge']}"
        try:
            with engine.begin() as conexao:
                conexao.execute(sql_upsert, {
                    "unidade_espacial_id": unidade_espacial_id,
                    "periodo_referencia": PERIODO_REFERENCIA,
                    "tarifa_energia_residencial": valor_ou_none(linha.get("tarifa_energia_residencial")),
                    "tarifa_energia_residencial_distribuidora": texto_ou_none(
                        linha.get("distribuidora_unica")
                    ),
                    "tarifa_energia_residencial_aproximada": bool(
                        linha.get("tarifa_energia_residencial_aproximada", False)
                    ),
                })
            inseridos += 1
        except Exception as e:
            falhas.append((linha["codigo_ibge"], str(e)))

        if (i + 1) % 1000 == 0 or (i + 1) == total:
            print(f"      ... {i + 1}/{total} municípios processados")

    print(f"      {inseridos} município(s) inseridos/atualizados com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} município(s) falharam:")
        for codigo, erro in falhas[:10]:
            print(f"        - {codigo}: {erro[:120]}")


def main():
    print("Construindo indicador de Tarifa Residencial (TUSD+TE) — ANEEL, todas as distribuidoras")
    print("=" * 70)
    print("ATENÇÃO: requer as migrations 0018_indicadores_sociais_tarifa_residencial.sql e "
          "0032_indicadores_sociais_tarifa_aproximada.sql já aplicadas.")
    print()

    engine = create_engine(DATABASE_URL)

    baixar_se_necessario()
    codificacao = detectar_codificacao()
    tarifa_por_distribuidora, ultima_vigencia_por_distribuidora, data_mais_recente = (
        carregar_situacao_distribuidoras(codificacao)
    )
    municipio_distribuidora = resolver_municipio_distribuidora(
        engine, ultima_vigencia_por_distribuidora, data_mais_recente
    )
    df_final = montar_tarifa_por_municipio(tarifa_por_distribuidora, municipio_distribuidora)

    print("\n[6/6] Resumo da tarifa residencial (R$/MWh):")
    print(df_final["tarifa_energia_residencial"].describe().to_string())

    executar_upsert(engine, df_final)

    print("\nExtração de Tarifa Residencial concluída.")


if __name__ == "__main__":
    main()
