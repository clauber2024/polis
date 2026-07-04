"""
EXTRACTOR: indicadores_sociais - CadUnico (cobertura e pobreza)
(insumo para o Indice de Pobreza Energetica Regional, RF-080 do DRF)
================================================================================
NOTA METODOLOGICA - LEIA ANTES DE USAR ESTE EXTRACTOR:
--------------------------------------------------------------------------
Fonte: MDS/SAGI (Secretaria de Avaliacao e Gestao da Informacao), servico Solr
publico "MI Social / VIS DATA" (aplicacoes.mds.gov.br/sagi/servicos/misocial).
Nao e um arquivo estatico - e uma consulta HTTP direta que retorna CSV. Achado
e validado na sessao de 04/07/2026: o dataset antigo documentado no Portal de
Dados Abertos (2021) tinha nomes de campo diferentes dos atuais (ex:
"cadunico_tot_fam" nao existe mais - o campo real e "cadun_qtd_familias_
cadastradas_i"). NAO confiar em documentacao antiga de nomes de campo desta
fonte - sempre confirmar via fl=* antes de escrever/alterar queries.

CODIGO IBGE DESTA FONTE TEM 6 DIGITOS (sem digito verificador):
--------------------------------------------------------------------------
Validado empiricamente: Sao Paulo aparece como codigo_ibge=355030 nesta fonte,
nao 3550308. Mesmo padrao ja visto em fontes do Ministerio das Cidades (MCMV).
O join com nossa base territorial (codigo_ibge de 7 digitos) e feito comparando
os 6 primeiros digitos do nosso codigo (codigo_ibge[:6]) com o codigo desta fonte.

DUAS METRICAS GRAVADAS (decisao de escopo, sessao 04/07/2026):
--------------------------------------------------------------------------
1. percentual_cadunico (COBERTURA) - coluna ja existente desde o scaffold
   original do schema:
       pessoas cadastradas no CadUnico / populacao total (Censo 2022) x 100
   Mede o alcance administrativo do CadUnico na populacao total do municipio -
   proxy de vulnerabilidade social ampla (nem toda pessoa cadastrada e pobre,
   mas a cobertura correlaciona com necessidade de assistencia social).

2. percentual_pobreza_cadunico (NOVA, migration 0013) - das familias JA
   CADASTRADAS no CadUnico, qual fracao esta classificada em situacao de
   pobreza ou extrema pobreza pelos criterios do proprio CadUnico:
       (familias em pobreza + familias em extrema pobreza) / familias
       cadastradas x 100
   Mede a severidade da vulnerabilidade DENTRO do universo ja cadastrado -
   diferente da metrica 1, que mede alcance/cobertura.
Os campos de pobreza retornam com sufixo "_s" no nome (convencao Solr para
STRING), mas os VALORES sao numericos normalmente (confirmado empiricamente
com Sao Paulo: 203.469 familias em pobreza, 469.245 em extrema pobreza,
1.718.774 familias cadastradas, 3.747.054 pessoas cadastradas, populacao
11.451.245 - proporcoes plausiveis, ~32,7% cobertura e ~39% das familias
cadastradas em pobreza/extrema pobreza).

CONTEXTO DE USO (RF-080 do DRF):
--------------------------------------------------------------------------
Este indicador e um dos quatro insumos previstos para o futuro "Indice de
Pobreza Energetica Regional" (RF-080: IBGE, CadUnico, TSEE, IVS/IPEA). TSEE
continua bloqueado (ver ARQUITETURA.md) - o indice completo NAO pode ser
construido enquanto isso, mas o CadUnico em si ja e um indicador valido e
utilizavel isoladamente (cruzamento de vulnerabilidade social).

PERIODO DE REFERENCIA: 202512 (dezembro/2025), mes mais recente disponivel
no momento desta extracao (04/07/2026). API e atualizada mensalmente -
revisitar se for necessario um periodo mais recente no futuro.
================================================================================
"""

import os

import pandas as pd
import requests
from sqlalchemy import create_engine, text


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

ANOMES_REFERENCIA = "202512"
PERIODO_REFERENCIA = "2025-12-01"

URL_MISOCIAL = "https://aplicacoes.mds.gov.br/sagi/servicos/misocial"

CAMPOS = (
    "codigo_ibge,municipio,anomes,"
    "cadun_qtd_pessoas_cadastradas_i,cadun_qtd_familias_cadastradas_i,"
    "cadun_qtde_fam_sit_pobreza_s,cadun_qtde_fam_sit_extrema_pobreza_s,"
    "populacao_censo_2022_i"
)


def consultar_misocial() -> pd.DataFrame:
    """Consulta o servico Solr do MDS, trazendo todos os municipios (~5.571)
    para o anomes de referencia em uma unica chamada (rows alto o suficiente
    para cobrir todo o Brasil de uma vez, evitando paginacao)."""
    print(f"[1/3] Consultando MI Social/MDS (anomes={ANOMES_REFERENCIA}) via HTTP...")

    parametros = {
        "q": "*",
        "fq": [f"anomes_s:{ANOMES_REFERENCIA}", "tipo_s:mes_mu"],
        "rows": 10000,
        "wt": "csv",
        "fl": CAMPOS,
    }

    resposta = requests.get(URL_MISOCIAL, params=parametros, timeout=60)
    resposta.raise_for_status()

    from io import StringIO
    df = pd.read_csv(StringIO(resposta.text))
    print(f"      {len(df)} municipios retornados.")

    df["codigo_ibge"] = df["codigo_ibge"].astype(str).str.zfill(6)
    return df


def calcular_percentuais(df: pd.DataFrame) -> pd.DataFrame:
    """Calcula as duas metricas (cobertura e pobreza) a partir dos totais
    brutos retornados pela API."""
    print("[2/3] Calculando percentuais de cobertura e pobreza...")

    df["percentual_cadunico"] = (
        df["cadun_qtd_pessoas_cadastradas_i"] / df["populacao_censo_2022_i"] * 100
    )

    familias_pobreza_total = (
        df["cadun_qtde_fam_sit_pobreza_s"].fillna(0)
        + df["cadun_qtde_fam_sit_extrema_pobreza_s"].fillna(0)
    )
    df["percentual_pobreza_cadunico"] = (
        familias_pobreza_total / df["cadun_qtd_familias_cadastradas_i"] * 100
    )

    return df


def casar_com_municipios(engine, df: pd.DataFrame) -> pd.DataFrame:
    """Junta pelo codigo IBGE de 6 digitos (esta fonte) contra os 6 primeiros
    digitos do codigo_ibge de 7 digitos da nossa base territorial."""
    print("[3/3] Casando com a base territorial (codigo IBGE de 6 digitos)...")

    with engine.connect() as conexao:
        query = text("SELECT codigo_ibge FROM municipios")
        df_municipios = pd.read_sql(query, conexao)

    df_municipios["codigo_ibge_6"] = df_municipios["codigo_ibge"].str[:6]

    combinado = df_municipios.merge(
        df[["codigo_ibge", "percentual_cadunico", "percentual_pobreza_cadunico"]],
        left_on="codigo_ibge_6",
        right_on="codigo_ibge",
        how="left",
        suffixes=("", "_fonte"),
    )

    sem_match = combinado["percentual_cadunico"].isna().sum()
    if sem_match > 0:
        print(f"      [AVISO] {sem_match} municipio(s) da base territorial SEM "
              f"correspondencia na fonte MDS (ficarao sem estes indicadores).")

    return combinado[combinado["percentual_cadunico"].notna()].copy()


def executar_upsert(engine, df: pd.DataFrame):
    """Upsert com transacao individual por municipio (mesmo padrao de
    robustez dos demais extractors)."""
    print(f"\nInserindo/atualizando indicadores_sociais para periodo {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, percentual_cadunico, percentual_pobreza_cadunico)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :percentual_cadunico, :percentual_pobreza_cadunico)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            percentual_cadunico = EXCLUDED.percentual_cadunico,
            percentual_pobreza_cadunico = EXCLUDED.percentual_pobreza_cadunico;
    """)

    total = len(df)
    inseridos = 0
    falhas = []

    def valor_ou_none(x):
        return None if pd.isna(x) else float(x)

    for i, linha in df.iterrows():
        codigo_ibge = linha["codigo_ibge"]
        unidade_espacial_id = f"municipio:{codigo_ibge}"
        try:
            with engine.begin() as conexao:
                conexao.execute(sql_upsert, {
                    "unidade_espacial_id": unidade_espacial_id,
                    "periodo_referencia": PERIODO_REFERENCIA,
                    "percentual_cadunico": valor_ou_none(linha.get("percentual_cadunico")),
                    "percentual_pobreza_cadunico": valor_ou_none(linha.get("percentual_pobreza_cadunico")),
                })
            inseridos += 1
        except Exception as e:
            falhas.append((codigo_ibge, str(e)))

        if (i + 1) % 1000 == 0 or (i + 1) == total:
            print(f"      ... {i + 1}/{total} municipios processados")

    print(f"      {inseridos} municipio(s) inseridos/atualizados com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} municipio(s) falharam:")
        for codigo, erro in falhas[:10]:
            print(f"        - {codigo}: {erro[:120]}")


def main():
    print(f"Carregando CadUnico (cobertura e pobreza) - MDS/SAGI, ref. {ANOMES_REFERENCIA}")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)

    df = consultar_misocial()
    df = calcular_percentuais(df)
    df_combinado = casar_com_municipios(engine, df)

    print()
    print("Resumo dos percentuais:")
    print(df_combinado[["percentual_cadunico", "percentual_pobreza_cadunico"]].describe())

    executar_upsert(engine, df_combinado)

    print("\nExtracao de CadUnico concluida.")


if __name__ == "__main__":
    main()
