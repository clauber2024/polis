"""
PROVA DE CONCEITO (refinamento): zonal statistics REAL para o MERGE/CPTEC-INPE
(precipitação), substituindo a simplificação de "ponto de grade mais próximo
do centroide" usada em prova_conceito_merge_precipitacao_x_inmet.py
================================================================================
CONTEXTO: a POC anterior (prova_conceito_merge_precipitacao_x_inmet.py, já
validada e com o bug de convenção de longitude corrigido - ver ARQUITETURA.md)
usava nearest-point ao centroide, uma simplificação deliberada documentada
como limitação: "para municípios grandes, isso pode subestimar o pico real,
porque a chuva mais forte pode ter caído numa parte do município longe do
centroide". Decisão do usuário (07/07/2026): construir a zonal statistics de
verdade ANTES de escalar para cobertura nacional, em vez de escalar com a
simplificação primeiro.

ZONAL STATISTICS DE VERDADE = para cada município, olhar TODOS os pontos de
grade cujo pixel intersecta o polígono do município (não só o mais próximo do
centroide) e tomar o MÁXIMO entre eles. Isso é especialmente importante para
municípios grandes (ex.: Tucumã e Tucuruí, no Pará, já presentes na amostra de
teste - território extenso, onde um evento de chuva forte pode ocorrer longe
do centroide geométrico).

DEPENDÊNCIA NOVA: `rasterstats` (usa `rasterio`/GDAL por baixo, via wheels
pré-compiladas - CONFIRMADO nesta sessão que instala limpo via pip puro, sem
precisar de GDAL de sistema, mesmo padrão dos outros pacotes novos desta
linha de investigação):
    pip install rasterstats

MÉTODO:
  1. Reusa a mesma seleção de municípios de teste (INMET-covered, jan/2024)
     da POC anterior, mas agora busca também a GEOMETRIA do município (via
     `ST_AsBinary(geom)` - WKB binário, nunca WKT textual, conforme
     CLAUDE.md) em vez de só o centroide.
  2. Para cada dia do mês de teste, abre o GRIB2 do MERGE (mesma leitura já
     validada: 1a variável por posição = PREC).
  3. CONVERTE A GRADE para o formato que `rasterstats` espera: array 2D
     "north-up" (linha 0 = norte) + `Affine` transform, convertendo a
     longitude de 0-360° (convenção real do arquivo, confirmada em
     diagnosticar_convencao_longitude_merge.py) para -180/180° (convenção do
     PostGIS/geometria dos municípios) - ver `preparar_grade_norte_para_cima`.
  4. Roda `rasterstats.zonal_stats(geometria, array, affine=..., stats="max")`
     por município, por dia.
  5. Agrega o máximo do mês (mesma lógica de "pico do mês" já usada em toda
     esta linha de investigação) e compara com: (a) INMET (estação real) e
     (b) o resultado nearest-point da POC anterior (esperado: zonal >=
     nearest, quase sempre - zonal olha mais pontos, então só pode empatar ou
     superar o valor do ponto único mais próximo do centroide).

ESTE SCRIPT É SOMENTE LEITURA quanto ao banco do projeto - não grava nada,
só lê geometria e centroide de município.
================================================================================
"""

import os
import sys

import numpy as np
import pandas as pd
import requests
import xarray as xr
from affine import Affine
from rasterstats import zonal_stats
from shapely import wkb
from sqlalchemy import create_engine, text

sys.path.insert(0, "backend/src/etl/analises")

from analisar_correlacao_mmgd_renda import DATABASE_URL  # noqa: E402
from investigar_clima_ressarcimento_danos_eletricos import (  # noqa: E402
    ANO_MINIMO,
    carregar_pico_climatico_municipio_mes,
)

ANO_TESTE = 2024
MES_TESTE = 1
N_MUNICIPIOS_TESTE = int(os.environ.get("N_MUNICIPIOS_TESTE", "15"))

URL_BASE_MERGE = "https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/DAILY"
CAMINHO_CACHE_MERGE = os.environ.get(
    "CAMINHO_CACHE_MERGE",
    f"backend/src/etl/data/raw/inpe_merge/{ANO_TESTE}/{MES_TESTE:02d}",
)


# --------------------------------------------------------------------------
# 1. Municípios de teste - mesma seleção da POC anterior, mas agora com
#    geometria (WKB) além do centroide
# --------------------------------------------------------------------------
def selecionar_municipios_teste(engine) -> pd.DataFrame:
    print(f"[1/5] Selecionando municípios de teste (com estação INMET, {ANO_TESTE}-{MES_TESTE:02d})...")

    clima_inmet = carregar_pico_climatico_municipio_mes()
    clima_mes_teste = clima_inmet[
        (clima_inmet["ano"] == ANO_TESTE) & (clima_inmet["mes"] == MES_TESTE)
    ].copy()

    if clima_mes_teste.empty:
        raise SystemExit(
            f"[ERRO] Nenhum município com dado INMET para {ANO_TESTE}-{MES_TESTE:02d} "
            f"(ANO_MINIMO configurado = {ANO_MINIMO}). Ajustar ANO_TESTE/MES_TESTE."
        )

    amostra = (
        clima_mes_teste.sort_values(["n_estacoes_municipio", "codigo_ibge"], ascending=[False, True])
        .head(N_MUNICIPIOS_TESTE)
        .copy()
    )

    codigos = amostra["codigo_ibge"].tolist()
    # ST_AsBinary = WKB binario (nunca WKT textual, ver CLAUDE.md secao ETL) -
    # geometrias de municipio podem ser bem detalhadas (litoral, Amazonia).
    consulta = text("""
        SELECT codigo_ibge, nome, uf, regiao,
               ST_Y(ST_Centroid(geom)) AS lat,
               ST_X(ST_Centroid(geom)) AS lon,
               ST_AsBinary(geom) AS geom_wkb
        FROM municipios
        WHERE codigo_ibge = ANY(:codigos)
    """)
    with engine.connect() as conexao:
        geo = pd.read_sql(consulta, conexao, params={"codigos": codigos})

    geo["geometria"] = geo["geom_wkb"].apply(lambda b: wkb.loads(bytes(b)))

    resultado = amostra.merge(geo.drop(columns=["geom_wkb"]), on="codigo_ibge", how="inner")
    print(f"      {len(resultado)} município(s) de teste com geometria carregada.")
    return resultado


# --------------------------------------------------------------------------
# 2. Baixar o mês inteiro (reusa cache da POC anterior, se já existir)
# --------------------------------------------------------------------------
def baixar_mes_merge() -> list:
    import calendar

    print(f"\n[2/5] Baixando/conferindo arquivos MERGE de {ANO_TESTE}-{MES_TESTE:02d}...")
    os.makedirs(CAMINHO_CACHE_MERGE, exist_ok=True)

    dias_no_mes = calendar.monthrange(ANO_TESTE, MES_TESTE)[1]
    caminhos = []
    n_baixados = 0
    n_cache = 0

    for dia in range(1, dias_no_mes + 1):
        nome_arquivo = f"MERGE_CPTEC_{ANO_TESTE}{MES_TESTE:02d}{dia:02d}.grib2"
        caminho_local = os.path.join(CAMINHO_CACHE_MERGE, nome_arquivo)

        if os.path.exists(caminho_local):
            n_cache += 1
            caminhos.append(caminho_local)
            continue

        url = f"{URL_BASE_MERGE}/{ANO_TESTE}/{MES_TESTE:02d}/{nome_arquivo}"
        resposta = requests.get(url, timeout=60)
        if resposta.status_code != 200:
            print(f"      [AVISO] Falha ao baixar {nome_arquivo} (HTTP {resposta.status_code}) - pulando.")
            continue

        with open(caminho_local, "wb") as f:
            f.write(resposta.content)
        n_baixados += 1
        caminhos.append(caminho_local)

    print(f"      {n_baixados} baixado(s), {n_cache} já em cache, de {dias_no_mes} dia(s) esperado(s).")
    return sorted(caminhos)


# --------------------------------------------------------------------------
# 3. Converter o campo 2D do MERGE em (array north-up, affine transform)
#    prontos para rasterstats
# --------------------------------------------------------------------------
def preparar_grade_norte_para_cima(campo) -> tuple:
    """
    Recebe o DataArray 2D (latitude, longitude) do MERGE e devolve
    (array numpy north-up, affine transform), convertendo a longitude de
    0-360 (convencao real do arquivo, ver diagnosticar_convencao_longitude_
    merge.py) para -180/180 (convencao do PostGIS/geometria dos municipios).
    """
    campo_ordenado = campo.sortby("latitude").sortby("longitude")

    lats = campo_ordenado.latitude.values
    lons = campo_ordenado.longitude.values
    lons_180 = np.where(lons > 180, lons - 360, lons)

    resolucao_lat = float(lats[1] - lats[0])
    resolucao_lon = float(lons_180[1] - lons_180[0])
    oeste = float(lons_180.min())
    norte = float(lats.max())

    # Inverte a ordem das linhas (latitude estava crescente = sul->norte;
    # rasterstats/rasterio esperam "north-up", linha 0 = norte).
    array_north_up = campo_ordenado.values[::-1, :]

    transform = Affine(resolucao_lon, 0, oeste, 0, -resolucao_lat, norte)
    return array_north_up, transform


# --------------------------------------------------------------------------
# 4. Extrair zonal max diário por município
# --------------------------------------------------------------------------
def extrair_zonal_max_diario(caminhos_grib: list, municipios: pd.DataFrame) -> pd.DataFrame:
    print(f"\n[3/5] Extraindo zonal max diário (rasterstats) para {len(municipios)} "
          f"município(s), {len(caminhos_grib)} dia(s)...")

    registros = []
    for caminho in caminhos_grib:
        try:
            ds = xr.open_dataset(caminho, engine="cfgrib")
        except Exception as exc:  # noqa: BLE001
            print(f"      [AVISO] falha ao abrir {os.path.basename(caminho)}: {exc} - pulando.")
            continue

        nome_var_prec = list(ds.data_vars)[0]  # PREC por posicao, cfgrib renomeia errado (ver ARQUITETURA.md)
        array_north_up, transform = preparar_grade_norte_para_cima(ds[nome_var_prec])

        # all_touched=True: CONFIRMADO por teste sintético (sessao 07/07/2026, antes de
        # rodar contra dado real) que o padrao do rasterstats (all_touched=False, so
        # conta um pixel se o CENTRO dele cair dentro do poligono) pode dar count=0
        # para municipios pequenos (menores que a celula de ~11km do MERGE) mesmo com
        # sobreposicao real - all_touched=True conta qualquer pixel que o poligono
        # tocar, essencial para nao perder municipio pequeno na cobertura nacional.
        estatisticas = zonal_stats(
            municipios["geometria"].tolist(),
            array_north_up,
            affine=transform,
            stats=["max", "count"],
            nodata=np.nan,
            all_touched=True,
        )

        for (_, municipio), stat in zip(municipios.iterrows(), estatisticas):
            registros.append({
                "codigo_ibge": municipio["codigo_ibge"],
                "arquivo": os.path.basename(caminho),
                "precipitacao_dia_mm_zonal": stat["max"],
                "n_pixels_zonal": stat["count"],
            })

        ds.close()

    return pd.DataFrame(registros)


# --------------------------------------------------------------------------
# 5. Agregar (max do mes) e comparar: zonal vs nearest-point vs INMET
# --------------------------------------------------------------------------
def agregar_e_comparar(diario_zonal: pd.DataFrame, municipios: pd.DataFrame) -> pd.DataFrame:
    print("\n[4/5] Agregando: máximo mensal de precipitação (zonal) por município...")

    mensal_zonal = diario_zonal.groupby("codigo_ibge", as_index=False).agg(
        precipitacao_max_mes_zonal=("precipitacao_dia_mm_zonal", "max"),
        n_pixels_zonal_mediano=("n_pixels_zonal", "median"),
    )

    comparacao = municipios.merge(mensal_zonal, on="codigo_ibge", how="left")
    comparacao = comparacao.rename(columns={"precipitacao_max_mes": "precipitacao_max_mes_inmet"})
    comparacao["diferenca_zonal_menos_inmet_mm"] = (
        comparacao["precipitacao_max_mes_zonal"] - comparacao["precipitacao_max_mes_inmet"]
    )

    print("\n[5/5] Comparação: MERGE zonal (máximo entre todos os pixels do polígono) x INMET "
          f"(estação real), {ANO_TESTE}-{MES_TESTE:02d}:")
    colunas_exibir = [
        "nome", "uf", "regiao", "precipitacao_max_mes_inmet", "precipitacao_max_mes_zonal",
        "diferenca_zonal_menos_inmet_mm", "n_pixels_zonal_mediano",
    ]
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(comparacao[colunas_exibir].round(2).to_string(index=False))

    print("\nLEITURA: 'n_pixels_zonal_mediano' mostra quantos pontos de grade (~11 km de "
          "lado cada) caem dentro do polígono do município - municípios pequenos podem ter "
          "só 1-2 pixels (zonal ~ nearest-point nesse caso); municípios grandes (ex.: Tucumã/"
          "Tucuruí-PA) devem ter dezenas, onde zonal tem mais chance de capturar um pico que "
          "o nearest-point (POC anterior) pode ter perdido.")

    return comparacao


def main():
    print("Prova de conceito (refinamento): zonal statistics real - MERGE (precipitação) x INMET")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    municipios = selecionar_municipios_teste(engine)

    caminhos_grib = baixar_mes_merge()
    diario_zonal = extrair_zonal_max_diario(caminhos_grib, municipios)
    agregar_e_comparar(diario_zonal, municipios)

    print("\n✅ Prova de conceito concluída (somente leitura quanto ao banco do projeto).")


if __name__ == "__main__":
    main()
