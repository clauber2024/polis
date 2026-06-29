"""
EXTRACTOR: indicadores_sociais — dimensão Renda e Trabalho
(índice próprio inspirado no IVS/IPEA, construído a partir da RAIS)
================================================================================
NOTA METODOLÓGICA — LEIA ANTES DE USAR ESTE EXTRACTOR:
--------------------------------------------------------------------------
Assim como a dimensão "Infraestrutura Urbana" (ver extrair_infraestrutura_censo.py),
este NÃO é o IVS oficial do IPEA — é um índice próprio inspirado na mesma dimensão
conceitual "Renda e Trabalho", construído a partir de uma fonte primária real e
atual: a RAIS (Relação Anual de Informações Sociais), acessada via BigQuery
público da Base dos Dados (basedosdados.br_me_rais.microdados_vinculos).

LIMITAÇÃO IMPORTANTE DESTA FONTE (documentar no CLAUDE.md/DRF):
--------------------------------------------------------------------------
A RAIS capta APENAS o mercado de trabalho FORMAL (vínculos CLT, estatutários,
etc.). Trabalho informal — uma parcela muito significativa da força de trabalho
no Brasil, especialmente em municípios pequenos e regiões de menor renda — não
aparece aqui. Isso significa que "% vínculos formais / população" tende a
SUBESTIMAR a real situação de emprego/renda em municípios com alta informalidade,
e os indicadores desta dimensão devem ser lidos com essa ressalva.

A partir do ano-base 2023, a RAIS passou a ser extraída automaticamente do
eSocial (não mais declarada manualmente via GDRAIS pelas empresas) — isso
aumentou a cobertura de captação real, o que explica o salto de volume de
registros observado entre 2022 e 2023/2024 nesta fonte. Por essa transição,
e por 2025 ainda poder estar em consolidação no momento da extração, este
extractor usa 2024 como ano de referência padrão (configurável via variável
de ambiente ANO_REFERENCIA).

INDICADORES CALCULADOS:
--------------------------------------------------------------------------
1. Renda média (R$) — média de valor_remuneracao_media dos vínculos ativos
   em 31/12, por município (campo: renda_media_domiciliar — reaproveitando
   a coluna já existente no schema, embora seja renda do TRABALHO FORMAL,
   não renda domiciliar total; ver ressalva acima)
2. % vínculos formais / população — número de vínculos ativos dividido pela
   população do município (já presente em municipios, do Censo 2022)
================================================================================
"""

import os
import sys

import pandas as pd
from google.cloud import bigquery
from sqlalchemy import create_engine, text


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "project-550dc7a0-a1f2-45b6-9fc")

ANO_REFERENCIA = int(os.environ.get("ANO_REFERENCIA", "2024"))
PERIODO_REFERENCIA = f"{ANO_REFERENCIA}-01-01"


def consultar_rais(ano: int) -> pd.DataFrame:
    """
    Consulta a RAIS (microdados_vinculos) via BigQuery, agregando por
    município JÁ NO SQL (GROUP BY) — evita trazer decenas de milhões de
    linhas individuais de vínculos para o Python; o BigQuery faz a soma e
    a média no lado do servidor, e só o resultado agregado (~5.570 linhas)
    é transferido.
    """
    print(f"[1/2] Consultando RAIS (ano {ano}) via BigQuery...")
    cliente = bigquery.Client(project=GCP_PROJECT_ID)

    query = f"""
        SELECT
            id_municipio AS codigo_ibge,
            AVG(valor_remuneracao_media) AS renda_media,
            COUNT(*) AS numero_vinculos_formais
        FROM `basedosdados.br_me_rais.microdados_vinculos`
        WHERE ano = {ano}
          AND vinculo_ativo_3112 = '1'
          AND valor_remuneracao_media IS NOT NULL
          AND valor_remuneracao_media > 0
        GROUP BY id_municipio
    """

    df = cliente.query(query).to_dataframe()
    print(f"      {len(df)} municípios retornados.")
    print(f"      Renda média nacional (não ponderada por município): "
          f"R$ {df['renda_media'].mean():.2f}")
    print(f"      Total de vínculos formais: {df['numero_vinculos_formais'].sum():,}")

    df["codigo_ibge"] = df["codigo_ibge"].astype(str).str.zfill(7)
    return df


def calcular_percentual_vinculos(engine, df: pd.DataFrame) -> pd.DataFrame:
    """
    % vínculos formais / população = numero_vinculos_formais / população do
    município (Censo 2022, já presente em municipios.area_km2... na verdade
    precisamos da POPULAÇÃO, não da área — buscamos via indicadores_sociais,
    onde a densidade populacional já foi calculada a partir da população real).
    """
    print("[2/2] Calculando % vínculos formais / população...")

    with engine.connect() as conexao:
        # Reconstituímos a população a partir de densidade_populacional * area_km2,
        # já que gravamos densidade mas não a população absoluta diretamente.
        # Alternativa mais direta seria re-consultar a tabela 9923 do SIDRA, mas
        # evitamos uma nova chamada de API externa reaproveitando o que já temos.
        query = text("""
            SELECT m.codigo_ibge, isoc.densidade_populacional * m.area_km2 AS populacao_estimada
            FROM municipios m
            JOIN unidades_espaciais ue ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
            JOIN indicadores_sociais isoc ON isoc.unidade_espacial_id = ue.id
            WHERE isoc.densidade_populacional IS NOT NULL
        """)
        populacao = pd.read_sql(query, conexao)

    combinado = df.merge(populacao, on="codigo_ibge", how="left")
    combinado["percentual_vinculos_formais"] = (
        combinado["numero_vinculos_formais"] / combinado["populacao_estimada"] * 100
    )

    sem_populacao = combinado["populacao_estimada"].isna().sum()
    if sem_populacao > 0:
        print(f"      [AVISO] {sem_populacao} município(s) sem população estimada "
              f"(provavelmente sem indicador de Infraestrutura Urbana calculado ainda) — "
              f"percentual ficará NULL para esses, mas renda média ainda será gravada.")

    return combinado


def filtrar_municipios_existentes(engine, df: pd.DataFrame) -> pd.DataFrame:
    """Mesma proteção usada nos extractors anteriores: só grava códigos IBGE
    que de fato existem na base territorial."""
    with engine.connect() as conexao:
        resultado = conexao.execute(text("SELECT codigo_ibge FROM municipios"))
        codigos_validos = {linha[0] for linha in resultado}

    mascara_valida = df["codigo_ibge"].isin(codigos_validos)
    invalidos = df[~mascara_valida]
    if len(invalidos) > 0:
        print(f"      [AVISO] {len(invalidos)} código(s) IBGE não existem na base territorial — IGNORADOS:")
        for codigo in invalidos["codigo_ibge"].tolist()[:10]:
            print(f"        - {codigo}")

    return df[mascara_valida].copy()


def executar_upsert(engine, df: pd.DataFrame):
    """
    Upsert com transação individual por município (mesma correção de
    robustez aplicada aos extractors de MMGD e Infraestrutura — evita que
    um erro isolado cancele todos os upserts em cascata).
    """
    print(f"\nInserindo/atualizando `indicadores_sociais` para período {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, renda_media_domiciliar,
             percentual_vinculos_formais)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :renda_media_domiciliar,
             :percentual_vinculos_formais)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            renda_media_domiciliar = EXCLUDED.renda_media_domiciliar,
            percentual_vinculos_formais = EXCLUDED.percentual_vinculos_formais;
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
                    "renda_media_domiciliar": valor_ou_none(linha.get("renda_media")),
                    "percentual_vinculos_formais": valor_ou_none(linha.get("percentual_vinculos_formais")),
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
    print(f"Construindo índice próprio de Renda e Trabalho (RAIS {ANO_REFERENCIA} via BigQuery)")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)

    df = consultar_rais(ANO_REFERENCIA)
    df_com_percentual = calcular_percentual_vinculos(engine, df)

    print()
    print("Resumo do percentual de vínculos formais / população:")
    print(df_com_percentual[["codigo_ibge", "percentual_vinculos_formais"]].describe())

    df_valido = filtrar_municipios_existentes(engine, df_com_percentual)
    executar_upsert(engine, df_valido)

    print("\n✅ Extração de Renda e Trabalho (RAIS) concluída.")


if __name__ == "__main__":
    main()
