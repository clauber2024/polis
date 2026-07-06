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

VALOR GRAVADO: tarifa vigente MAIS RECENTE (TUSD+TE somadas, R$/MWh),
subgrupo B1, modalidade Convencional, Tarifa de Aplicação (o que o
consumidor de fato paga, não a Base Econômica). Não é uma média histórica —
é um snapshot do estado atual, mesma convenção de renda_media_domiciliar e
outros indicadores de "estado atual" deste projeto. A relevância para
adoção ACUMULADA de MMGD (que reflete anos de decisões) é uma limitação
conhecida, documentada em ARQUITETURA.md.
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
    with open(CAMINHO_LOCAL, "rb") as f:
        amostra = f.read(1_000_000)
    try:
        amostra.decode("utf-8-sig")
        return "utf-8-sig"
    except UnicodeDecodeError:
        return "latin-1"


def carregar_tarifa_mais_recente_por_distribuidora(codificacao: str) -> pd.DataFrame:
    """Lê o CSV inteiro em chunks (todas as distribuidoras, não só 3),
    filtra B1/Residencial/Convencional/Tarifa de Aplicação, e retorna a
    tarifa (TUSD+TE) da vigência mais recente por SigAgente."""
    print("\n[2/6] Lendo CSV completo em chunks, filtrando B1/Residencial/Convencional/"
          "Tarifa de Aplicação (todas as distribuidoras)...")

    pedacos_filtrados = []
    total_linhas_lidas = 0
    for chunk in pd.read_csv(
        CAMINHO_LOCAL, sep=";", encoding=codificacao,
        chunksize=TAMANHO_CHUNK, dtype=str, on_bad_lines="skip",
    ):
        total_linhas_lidas += len(chunk)
        filtro = (
            (chunk["DscSubGrupo"] == "B1")
            & (chunk["DscBaseTarifaria"] == "Tarifa de Aplicação")
            & (chunk["DscModalidadeTarifaria"] == "Convencional")
            & (chunk["DscClasse"] == "Residencial")
        )
        if filtro.any():
            pedacos_filtrados.append(chunk[filtro].copy())

    print(f"      {total_linhas_lidas} linha(s) lidas no total do arquivo.")
    df = pd.concat(pedacos_filtrados, ignore_index=True)
    print(f"      {len(df)} linha(s) após filtro (todas as distribuidoras).")

    df["DatInicioVigencia"] = pd.to_datetime(df["DatInicioVigencia"], errors="coerce")
    df["VlrTUSD"] = pd.to_numeric(df["VlrTUSD"].str.replace(",", "."), errors="coerce")
    df["VlrTE"] = pd.to_numeric(df["VlrTE"].str.replace(",", "."), errors="coerce")
    df["tarifa_total"] = df["VlrTUSD"] + df["VlrTE"]

    n_distribuidoras = df["SigAgente"].nunique()
    print(f"      {n_distribuidoras} distribuidora(s) distinta(s) com tarifa residencial "
          f"convencional homologada.")

    mais_recente = (
        df.dropna(subset=["DatInicioVigencia", "tarifa_total"])
        .sort_values("DatInicioVigencia")
        .groupby("SigAgente")
        .tail(1)
        .set_index("SigAgente")["tarifa_total"]
    )
    return mais_recente


def resolver_municipio_distribuidora(engine) -> pd.DataFrame:
    """Reaproveita o schema já carregado do INDQUAL — nenhuma fonte nova
    necessária (mesmo padrão de investigar_distribuidora_regioes_problema.py)."""
    print("\n[3/6] Resolvendo município -> distribuidora via schema já carregado do INDQUAL...")

    query = text("""
        SELECT qcm.codigo_ibge, qc.sig_agente
        FROM qualidade_conjunto_municipio qcm
        JOIN qualidade_conjuntos qc ON qc.ide_conjunto = qcm.ide_conjunto
        WHERE qc.sig_agente IS NOT NULL
    """)
    with engine.connect() as conexao:
        pares = pd.read_sql(query, conexao)

    agrupado = pares.groupby("codigo_ibge")["sig_agente"].agg(lambda s: sorted(set(s)))
    n_unica = int((agrupado.apply(len) == 1).sum())
    n_multipla = int((agrupado.apply(len) > 1).sum())
    print(f"      {n_unica} município(s) com distribuidora única | "
          f"{n_multipla} município(s) com múltiplas distribuidoras (ficarão SEM tarifa).")

    resultado = agrupado.reset_index()
    resultado["distribuidora_unica"] = resultado["sig_agente"].apply(
        lambda lst: lst[0] if len(lst) == 1 else None
    )
    return resultado[["codigo_ibge", "distribuidora_unica"]]


def montar_tarifa_por_municipio(
    tarifa_por_distribuidora: pd.Series, municipio_distribuidora: pd.DataFrame
) -> pd.DataFrame:
    print("\n[4/6] Cruzando tarifa por distribuidora com o mapeamento município -> distribuidora...")

    df = municipio_distribuidora.copy()
    df["tarifa_energia_residencial"] = df["distribuidora_unica"].map(tarifa_por_distribuidora)

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
    print(f"      {n_com_tarifa} município(s) terão tarifa gravada "
          f"({sem_distribuidora_unica} sem distribuidora única, {tem_distribuidora_sem_tarifa} "
          f"com distribuidora sem tarifa homologada encontrada).")

    return df[["codigo_ibge", "tarifa_energia_residencial"]]


def executar_upsert(engine, df: pd.DataFrame):
    print(f"\n[5/6] Inserindo/atualizando `indicadores_sociais` para período {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, tarifa_energia_residencial)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :tarifa_energia_residencial)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            tarifa_energia_residencial = EXCLUDED.tarifa_energia_residencial;
    """)

    total = len(df)
    inseridos = 0
    falhas = []

    def valor_ou_none(x):
        return None if pd.isna(x) else float(x)

    for i, linha in df.iterrows():
        unidade_espacial_id = f"municipio:{linha['codigo_ibge']}"
        try:
            with engine.begin() as conexao:
                conexao.execute(sql_upsert, {
                    "unidade_espacial_id": unidade_espacial_id,
                    "periodo_referencia": PERIODO_REFERENCIA,
                    "tarifa_energia_residencial": valor_ou_none(linha.get("tarifa_energia_residencial")),
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
    print("ATENÇÃO: requer a migration 0018_indicadores_sociais_tarifa_residencial.sql já aplicada.")
    print()

    engine = create_engine(DATABASE_URL)

    baixar_se_necessario()
    codificacao = detectar_codificacao()
    tarifa_por_distribuidora = carregar_tarifa_mais_recente_por_distribuidora(codificacao)
    municipio_distribuidora = resolver_municipio_distribuidora(engine)
    df_final = montar_tarifa_por_municipio(tarifa_por_distribuidora, municipio_distribuidora)

    print("\n[6/6] Resumo da tarifa residencial (R$/MWh):")
    print(df_final["tarifa_energia_residencial"].describe().to_string())

    executar_upsert(engine, df_final)

    print("\nExtração de Tarifa Residencial concluída.")


if __name__ == "__main__":
    main()
