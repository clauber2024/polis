"""
EXTRACTOR: indicadores_sociais - dimensao Capital Humano
(taxa de mortalidade infantil, media poolada 2022-2024)
================================================================================
NOTA METODOLOGICA - LEIA ANTES DE USAR ESTE EXTRACTOR:
--------------------------------------------------------------------------
Taxa de mortalidade infantil = obitos infantis (< 1 ano de idade, nao-fetais)
por 1.000 nascidos vivos, calculada por municipio de RESIDENCIA (da mae, no
caso de nascimento; do falecido, no caso de obito) via SIM (Sistema de
Informacoes sobre Mortalidade) e SINASC (Sistema de Informacoes sobre
Nascidos Vivos), ambos do DATASUS, acessados via BigQuery publico da Base
dos Dados (basedosdados.br_ms_sim.microdados e basedosdados.br_ms_sinasc.microdados).

MEDIA POOLADA DE 3 ANOS (2022-2024) - POR QUE:
--------------------------------------------------------------------------
Taxa de mortalidade infantil calculada com dado de UM UNICO ANO e muito
instavel em municipios pequenos: uma cidade com 50 nascimentos/ano e apenas
1 obito ja produz uma taxa de 20 por mil, um numero enorme que nao reflete
necessariamente nenhum problema estrutural, apenas o acaso de uma amostra
pequena. A abordagem padrao em epidemiologia para isso e agregar (pool) os
casos de varios anos ANTES de calcular a taxa - ou seja:

    taxa = SUM(obitos_infantis, 2022 a 2024) / SUM(nascidos_vivos, 2022 a 2024) * 1000

Isso e diferente de calcular a taxa de cada ano e tirar a media das 3 taxas
(esse segundo metodo daria peso igual a anos com poucos nascimentos, o que
nao corrige o problema). A soma agregada antes da divisao pondera
corretamente pelo volume real de nascimentos de cada municipio em cada ano.

FILTRO DE IDADE - VALIDADO EMPIRICAMENTE (sessao 04/07/2026):
--------------------------------------------------------------------------
O campo `idade` em br_ms_sim.microdados ja vem limpo em ANOS DECIMAIS pela
Base dos Dados (ex: 0.01 = poucos dias de vida), NAO e o codigo bruto do
DATASUS (que usa digito de unidade hora/dia/mes/ano). Confirmado cruzando
com DATE_DIFF(data_obito, data_nascimento). Filtrar idade < 1 ja isola
exclusivamente obitos tipo_obito = "nao-fetal" (obitos fetais nao tem esse
campo preenchido nesta fonte) - nao precisa filtro adicional de tipo_obito.
Validado contra numero nacional conhecido: 27.517 obitos infantis em 2024
/ 2.389.325 nascidos vivos = 11.5 por mil, compativel com a taxa nacional
oficial do Brasil.

ANO DE REFERENCIA:
--------------------------------------------------------------------------
Ambas as fontes (SIM e SINASC) tem dados ate 2024 no momento desta extracao.
Volume de 2024 e compativel com anos anteriores (nao ha sinal de dado
incompleto por defasagem de consolidacao). Periodo poolado: 2022-2024.
Gravado com periodo_referencia = "2024-01-01" (ano final da janela), mas
o valor representa a media poolada dos 3 anos, nao so 2024 - documentar
isso claramente se cruzar com outras colunas de indicadores_sociais que
usem periodo_referencia para representar um unico ano.
================================================================================
"""

import os

import pandas as pd
from google.cloud import bigquery
from sqlalchemy import create_engine, text


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "project-550dc7a0-a1f2-45b6-9fc")

ANOS_JANELA = [2022, 2023, 2024]
PERIODO_REFERENCIA = f"{max(ANOS_JANELA)}-01-01"


def consultar_obitos_infantis(cliente: bigquery.Client) -> pd.DataFrame:
    """Soma obitos infantis (idade < 1 ano) por municipio de residencia,
    agregando os 3 anos da janela ja no SQL."""
    print(f"[1/3] Consultando obitos infantis (SIM) para {ANOS_JANELA} via BigQuery...")

    anos_str = ", ".join(str(a) for a in ANOS_JANELA)
    query = f"""
        SELECT
            id_municipio_residencia AS codigo_ibge,
            COUNT(*) AS obitos_infantis
        FROM `basedosdados.br_ms_sim.microdados`
        WHERE ano IN ({anos_str})
          AND idade < 1
          AND id_municipio_residencia IS NOT NULL
        GROUP BY id_municipio_residencia
    """

    df = cliente.query(query).to_dataframe()
    total_municipios = len(df)
    total_obitos = df["obitos_infantis"].sum()
    print(f"      {total_municipios} municipios com obito infantil registrado no periodo.")
    print(f"      Total de obitos infantis no periodo: {total_obitos:,}")

    df["codigo_ibge"] = df["codigo_ibge"].astype(str).str.zfill(7)
    return df


def consultar_nascidos_vivos(cliente: bigquery.Client) -> pd.DataFrame:
    """Soma nascidos vivos por municipio de residencia da mae, agregando
    os 3 anos da janela ja no SQL."""
    print(f"[2/3] Consultando nascidos vivos (SINASC) para {ANOS_JANELA} via BigQuery...")

    anos_str = ", ".join(str(a) for a in ANOS_JANELA)
    query = f"""
        SELECT
            id_municipio_residencia AS codigo_ibge,
            COUNT(*) AS nascidos_vivos
        FROM `basedosdados.br_ms_sinasc.microdados`
        WHERE ano IN ({anos_str})
          AND id_municipio_residencia IS NOT NULL
        GROUP BY id_municipio_residencia
    """

    df = cliente.query(query).to_dataframe()
    total_municipios = len(df)
    total_nascimentos = df["nascidos_vivos"].sum()
    print(f"      {total_municipios} municipios com nascido vivo registrado no periodo.")
    print(f"      Total de nascidos vivos no periodo: {total_nascimentos:,}")

    df["codigo_ibge"] = df["codigo_ibge"].astype(str).str.zfill(7)
    return df


def calcular_taxa(obitos: pd.DataFrame, nascimentos: pd.DataFrame) -> pd.DataFrame:
    """Junta obitos e nascimentos por municipio (LEFT JOIN a partir de
    nascimentos, ja que todo municipio com populacao deveria ter nascido
    vivo registrado; municipio sem obito no periodo recebe 0, nao NULL -
    ausencia de obito e um dado real e valido, nao um dado faltante)."""
    print("[3/3] Calculando taxa de mortalidade infantil (por 1.000 nascidos vivos)...")

    combinado = nascimentos.merge(obitos, on="codigo_ibge", how="left")
    combinado["obitos_infantis"] = combinado["obitos_infantis"].fillna(0)

    combinado["taxa_mortalidade_infantil"] = (
        combinado["obitos_infantis"] / combinado["nascidos_vivos"] * 1000
    )

    return combinado


def filtrar_municipios_existentes(engine, df: pd.DataFrame) -> pd.DataFrame:
    """Mesma protecao usada nos extractors anteriores: so grava codigos IBGE
    que de fato existem na base territorial."""
    with engine.connect() as conexao:
        resultado = conexao.execute(text("SELECT codigo_ibge FROM municipios"))
        codigos_validos = {linha[0] for linha in resultado}

    mascara_valida = df["codigo_ibge"].isin(codigos_validos)
    invalidos = df[~mascara_valida]
    if len(invalidos) > 0:
        print(f"      [AVISO] {len(invalidos)} codigo(s) IBGE nao existem na base territorial - IGNORADOS:")
        for codigo in invalidos["codigo_ibge"].tolist()[:10]:
            print(f"        - {codigo}")

    return df[mascara_valida].copy()


def executar_upsert(engine, df: pd.DataFrame):
    """Upsert com transacao individual por municipio (mesmo padrao de
    robustez dos extractors de MMGD, Infraestrutura e RAIS)."""
    print(f"\nInserindo/atualizando indicadores_sociais para periodo {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, taxa_mortalidade_infantil)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :taxa_mortalidade_infantil)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            taxa_mortalidade_infantil = EXCLUDED.taxa_mortalidade_infantil;
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
                    "taxa_mortalidade_infantil": valor_ou_none(linha.get("taxa_mortalidade_infantil")),
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
    print(f"Calculando taxa de mortalidade infantil (SIM+SINASC via BigQuery, media poolada {ANOS_JANELA})")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)
    cliente = bigquery.Client(project=GCP_PROJECT_ID)

    obitos = consultar_obitos_infantis(cliente)
    nascimentos = consultar_nascidos_vivos(cliente)
    combinado = calcular_taxa(obitos, nascimentos)

    print()
    print("Resumo da taxa de mortalidade infantil (por 1.000 nascidos vivos):")
    print(combinado[["codigo_ibge", "taxa_mortalidade_infantil"]].describe())

    df_valido = filtrar_municipios_existentes(engine, combinado)
    executar_upsert(engine, df_valido)

    print("\nExtracao de Capital Humano (mortalidade infantil, SIM+SINASC) concluida.")


if __name__ == "__main__":
    main()
