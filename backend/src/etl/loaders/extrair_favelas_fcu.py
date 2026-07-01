"""
EXTRACTOR: indicadores_sociais — Favelas e Comunidades Urbanas
(indicador agregado por município: % população em FCU e número de FCUs)
================================================================================
NOTA METODOLÓGICA:
--------------------------------------------------------------------------
Este extractor calcula INDICADORES AGREGADOS por município — ou seja,
para cada município, qual % da sua população total mora em Favelas e
Comunidades Urbanas (FCUs), e quantas FCUs existem.

Isso é DIFERENTE de tratar cada FCU como uma unidade espacial própria
(para o qual seriam necessários: o shapefile de polígonos de FCU do IBGE
e uma nova fase de seed em `unidades_espaciais` com
tipo='favela_comunidade_urbana'). Essa segunda frente (FCU como unidade
espacial) está planejada mas não implementada aqui — ver
docs/PLANO_MORADIA_TERRITORIO_POPULAR.md.

FONTES (ambas Censo 2022, nível municipal N6, Resultados do Universo):
- Tabela SIDRA 9888, variável 9612: População residente em FCUs, por município
- Tabela SIDRA 9883, variável 9910: Número de FCUs, por município

CÁLCULO:
- percentual_populacao_favela = pop_em_fcu / pop_total_municipio × 100
  (pop_total_municipio reconstruída a partir de:
   densidade_populacional × area_km2, já gravadas em sessões anteriores)
- numero_favelas_comunidades = contagem direta da tabela 9883

IMPORTANTE — MUNICÍPIOS SEM FCUs:
O IBGE só publica dados para municípios QUE TÊM FCUs. Municípios sem
nenhuma FCU simplesmente não aparecem nas respostas dessas tabelas. Isso
significa que:
- A ausência de registro = percentual_populacao_favela de 0%,
  numero_favelas_comunidades de 0
- Gravamos explicitamente o zero para esses municípios (não deixamos NULL),
  para que a interpretação analítica seja inequívoca: NULL = dado ausente;
  0 = não tem favela registrada.
================================================================================
"""

import os
import sys
import time

import pandas as pd
import requests
from sqlalchemy import create_engine, text


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

PERIODO_REFERENCIA = "2022-01-01"
BASE_URL = "https://servicodados.ibge.gov.br/api/v3/agregados"


def consultar_sidra_simples(tabela: str, variavel: str) -> pd.DataFrame:
    """
    Consulta uma tabela SIDRA sem classificações — só tabela + variável + N6.
    Mais simples que as consultas de Infraestrutura/Moradia (sem filtro de
    categoria), porque essas tabelas não têm classificações adicionais.
    """
    url = f"{BASE_URL}/{tabela}/periodos/2022/variaveis/{variavel}?localidades=N6[all]"
    print(f"      Consultando Tabela {tabela} (variável {variavel})...")

    max_tentativas = 3
    resposta = None
    for tentativa in range(1, max_tentativas + 1):
        resposta = requests.get(url, timeout=90)
        if resposta.status_code == 200:
            break
        print(f"      [AVISO] Tentativa {tentativa}/{max_tentativas} falhou com status {resposta.status_code}.")
        if tentativa < max_tentativas:
            time.sleep(5 * tentativa)

    if resposta.status_code != 200:
        print(f"      [ERRO] Status {resposta.status_code} após {max_tentativas} tentativas.")
        sys.exit(1)

    dados = resposta.json()
    linhas = []
    for bloco_variavel in dados:
        for resultado in bloco_variavel.get("resultados", []):
            for serie in resultado.get("series", []):
                codigo_ibge = str(serie["localidade"]["id"]).zfill(7)
                for periodo_valor, valor in serie["serie"].items():
                    if valor in ("-", "...", "X", None):
                        continue
                    linhas.append({
                        "codigo_ibge": codigo_ibge,
                        "valor": float(valor),
                    })

    df = pd.DataFrame(linhas)
    print(f"      {len(df)} municípios com dado retornado.")
    return df


def calcular_percentual_populacao_favela(engine, df_pop_fcu: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula % população em FCU = pop_em_fcu / pop_total_municipio × 100.
    pop_total_municipio é reconstruída a partir de densidade × area_km2
    (já gravadas em indicadores_sociais e municipios respectivamente).
    """
    print("[2/3] Calculando % população em FCU...")

    with engine.connect() as conexao:
        pop_total = pd.read_sql(text("""
            SELECT m.codigo_ibge,
                   isoc.densidade_populacional * m.area_km2 AS populacao_total
            FROM municipios m
            JOIN unidades_espaciais ue
                ON ue.municipio_pai_codigo_ibge = m.codigo_ibge
                AND ue.tipo = 'municipio'
            JOIN indicadores_sociais isoc
                ON isoc.unidade_espacial_id = ue.id
            WHERE isoc.densidade_populacional IS NOT NULL
              AND isoc.periodo_referencia = '2022-01-01'
        """), conexao)

    combinado = df_pop_fcu.merge(pop_total, on="codigo_ibge", how="left")
    combinado["percentual_populacao_favela"] = (
        combinado["pop_em_fcu"] / combinado["populacao_total"] * 100
    )

    sem_pop = combinado["populacao_total"].isna().sum()
    if sem_pop > 0:
        print(f"      [AVISO] {sem_pop} município(s) sem população total calculada — "
              f"percentual ficará NULL para esses.")

    return combinado[["codigo_ibge", "percentual_populacao_favela"]]


def montar_tabela_final(engine) -> pd.DataFrame:
    """Combina os dois indicadores (% FCU e número de FCUs) num único DataFrame."""
    print("[1/3] Consultando população em FCUs (Tabela 9888)...")
    df_pop = consultar_sidra_simples(tabela="9888", variavel="9612")
    df_pop = df_pop.rename(columns={"valor": "pop_em_fcu"})

    print("[3/3] Consultando número de FCUs por município (Tabela 9883)...")
    df_num = consultar_sidra_simples(tabela="9883", variavel="9910")
    df_num = df_num.rename(columns={"valor": "numero_favelas_comunidades"})

    df_percentual = calcular_percentual_populacao_favela(engine, df_pop)

    combinado = df_percentual.merge(
        df_num[["codigo_ibge", "numero_favelas_comunidades"]],
        on="codigo_ibge",
        how="outer"
    )

    print(f"\n      {len(combinado)} municípios com ao menos um indicador de FCU.")
    municipios_com_fcu = (~combinado["percentual_populacao_favela"].isna()).sum()
    print(f"      {municipios_com_fcu} municípios com FCUs registradas pelo IBGE.")

    return combinado


def popular_zeros_para_municipios_sem_fcu(engine, df_com_fcu: pd.DataFrame) -> pd.DataFrame:
    """
    Busca todos os municípios na base territorial e adiciona linhas com
    valor 0 para os que não aparecem na resposta do SIDRA (= sem FCU).
    """
    with engine.connect() as conexao:
        todos = pd.read_sql(
            text("SELECT codigo_ibge FROM municipios"),
            conexao
        )

    municipios_sem_fcu = todos[~todos["codigo_ibge"].isin(df_com_fcu["codigo_ibge"])]
    if len(municipios_sem_fcu) > 0:
        print(f"      {len(municipios_sem_fcu)} municípios sem FCU registrada — "
              f"gravando explicitamente como 0.")
        zeros = pd.DataFrame({
            "codigo_ibge": municipios_sem_fcu["codigo_ibge"],
            "percentual_populacao_favela": 0.0,
            "numero_favelas_comunidades": 0,
        })
        df_completo = pd.concat([df_com_fcu, zeros], ignore_index=True)
    else:
        df_completo = df_com_fcu.copy()

    return df_completo


def executar_upsert(engine, df: pd.DataFrame):
    print(f"\nInserindo/atualizando `indicadores_sociais` para período {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, percentual_populacao_favela,
             numero_favelas_comunidades)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :percentual_populacao_favela,
             :numero_favelas_comunidades)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            percentual_populacao_favela = EXCLUDED.percentual_populacao_favela,
            numero_favelas_comunidades = EXCLUDED.numero_favelas_comunidades;
    """)

    total = len(df)
    inseridos = 0
    falhas = []

    def valor_ou_none(x):
        return None if pd.isna(x) else float(x)

    def int_ou_none(x):
        return None if pd.isna(x) else int(x)

    for i, linha in df.iterrows():
        unidade_espacial_id = f"municipio:{linha['codigo_ibge']}"
        try:
            with engine.begin() as conexao:
                conexao.execute(sql_upsert, {
                    "unidade_espacial_id": unidade_espacial_id,
                    "periodo_referencia": PERIODO_REFERENCIA,
                    "percentual_populacao_favela": valor_ou_none(linha.get("percentual_populacao_favela")),
                    "numero_favelas_comunidades": int_ou_none(linha.get("numero_favelas_comunidades")),
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
    print("Extraindo indicadores de Favelas e Comunidades Urbanas (Censo 2022)")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)

    df_com_fcu = montar_tabela_final(engine)
    df_completo = popular_zeros_para_municipios_sem_fcu(engine, df_com_fcu)
    executar_upsert(engine, df_completo)

    print("\n✅ Extração de Favelas e Comunidades Urbanas concluída.")
    print("   PENDENTE: shapefile de polígonos de FCU ainda não processado —")
    print("   cada FCU como unidade espacial própria requer seed separado")
    print("   em `unidades_espaciais` (tipo='favela_comunidade_urbana').")


if __name__ == "__main__":
    main()
