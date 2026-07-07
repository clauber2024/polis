"""
PROVA DE CONCEITO (refinamento): zonal statistics REAL para o ERA5 (rajada de
vento), substituindo a simplificação de "ponto de grade mais próximo do
centroide" usada em prova_conceito_era5_vento_x_inmet.py
================================================================================
CONTEXTO: mesma decisão do usuário (07/07/2026, "construir zonal statistics
antes" de escalar) já aplicada à chuva em
prova_conceito_zonal_statistics_merge_precipitacao.py - este script replica a
MESMA lógica validada (conversão de longitude, orientação north-up,
`all_touched=True`) para a rajada de vento (ERA5), fechando a paridade
metodológica entre as duas variáveis antes de decidir sobre escala nacional.

REUSA, SEM RE-INVENTAR, 2 achados já validados em
prova_conceito_zonal_statistics_merge_precipitacao.py (ver ARQUITETURA.md):
  1. A fórmula de conversão de longitude `np.where(lon > 180, lon - 360, lon)`
     é segura independente da convenção original do arquivo (se já estiver em
     -180/180, o `where` não faz nada; se estiver em 0/360, converte) - não
     precisa checar de novo qual convenção o ERA5 usa, a fórmula já cobre os
     dois casos.
  2. `all_touched=True` no `zonal_stats` é necessário para não perder
     município pequeno (menor que a célula de grade) - MAIS RELEVANTE AINDA
     aqui, já que a célula do ERA5 (~28 km / 0,25°) é bem maior que a do
     MERGE (~11 km / 0,1°) - mais municípios brasileiros são menores que uma
     célula de 28 km do que uma de 11 km.

DIFERENÇA EM RELAÇÃO AO SCRIPT DO MERGE: o ERA5 já foi baixado como 1 ÚNICO
arquivo para o mês inteiro (`prova_conceito_era5_vento_x_inmet.py`, reusa o
mesmo cache), com dimensões extras `time`/`step` (ciclo de previsão-base x
passo, ver ARQUITETURA.md sobre a estrutura de campos "since previous
post-processing"). Em vez de rodar zonal_stats por dia como no MERGE, aqui
primeiro colapsa `time`/`step` num único campo 2D de "rajada máxima do mês"
(`.max(dim=["time","step"], skipna=True)` - mesma lógica já validada na POC
anterior do ERA5) e SÓ DEPOIS roda zonal_stats, uma vez por município.

ESTE SCRIPT É SOMENTE LEITURA quanto ao banco do projeto - não grava nada.
================================================================================
"""

import os
import sys

import numpy as np
import pandas as pd
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
N_MUNICIPIOS_TESTE = int(os.environ.get("N_MUNICIPIOS_TESTE", "10"))
REGIAO_TESTE = "Nordeste"

# Mesmo cache já baixado por prova_conceito_era5_vento_x_inmet.py - não baixa de novo.
CAMINHO_CACHE_ERA5 = os.environ.get(
    "CAMINHO_CACHE_ERA5",
    f"backend/src/etl/data/raw/era5_teste/rajada_mes_{ANO_TESTE}{MES_TESTE:02d}.grib",
)


# --------------------------------------------------------------------------
# 1. Municípios de teste - mesma seleção da POC de nearest-point, agora com
#    geometria (WKB) além do centroide
# --------------------------------------------------------------------------
def selecionar_municipios_teste(engine) -> pd.DataFrame:
    print(f"[1/4] Selecionando municípios de teste ({REGIAO_TESTE}, com estação INMET, "
          f"{ANO_TESTE}-{MES_TESTE:02d})...")

    clima_inmet = carregar_pico_climatico_municipio_mes()
    clima_mes_teste = clima_inmet[
        (clima_inmet["ano"] == ANO_TESTE) & (clima_inmet["mes"] == MES_TESTE)
    ].copy()

    if clima_mes_teste.empty:
        raise SystemExit(
            f"[ERRO] Nenhum município com dado INMET para {ANO_TESTE}-{MES_TESTE:02d} "
            f"(ANO_MINIMO configurado = {ANO_MINIMO}). Ajustar ANO_TESTE/MES_TESTE."
        )

    codigos_candidatos = clima_mes_teste["codigo_ibge"].tolist()
    consulta = text("""
        SELECT codigo_ibge, nome, uf, regiao,
               ST_Y(ST_Centroid(geom)) AS lat,
               ST_X(ST_Centroid(geom)) AS lon,
               ST_AsBinary(geom) AS geom_wkb
        FROM municipios
        WHERE codigo_ibge = ANY(:codigos) AND regiao = :regiao
    """)
    with engine.connect() as conexao:
        geo = pd.read_sql(consulta, conexao, params={"codigos": codigos_candidatos, "regiao": REGIAO_TESTE})

    geo["geometria"] = geo["geom_wkb"].apply(lambda b: wkb.loads(bytes(b)))

    candidatos = clima_mes_teste.merge(geo.drop(columns=["geom_wkb"]), on="codigo_ibge", how="inner")
    if candidatos.empty:
        raise SystemExit(
            f"[ERRO] Nenhum município de '{REGIAO_TESTE}' com dado INMET em "
            f"{ANO_TESTE}-{MES_TESTE:02d}. Ajustar REGIAO_TESTE ou o mês de teste."
        )

    amostra = (
        candidatos.sort_values(["n_estacoes_municipio", "codigo_ibge"], ascending=[False, True])
        .head(N_MUNICIPIOS_TESTE)
        .copy()
    )

    print(f"      {len(amostra)} município(s) de teste selecionado(s).")
    return amostra


# --------------------------------------------------------------------------
# 2. Colapsar time/step -> campo 2D de rajada máxima do mês (mesma lógica já
#    validada em prova_conceito_era5_vento_x_inmet.py)
# --------------------------------------------------------------------------
def carregar_campo_2d_rajada_max_mes() -> "xr.DataArray":
    print(f"\n[2/4] Abrindo GRIB do ERA5 e colapsando time/step em rajada máxima do mês...")

    if not os.path.exists(CAMINHO_CACHE_ERA5):
        raise SystemExit(
            f"[ERRO] Arquivo {CAMINHO_CACHE_ERA5} não encontrado - rode antes "
            f"prova_conceito_era5_vento_x_inmet.py (ele baixa e deixa em cache este arquivo)."
        )

    ds = xr.open_dataset(CAMINHO_CACHE_ERA5, engine="cfgrib")
    nome_var = list(ds.data_vars)[0]  # so 1 variavel pedida (fg10), mas por posicao por cautela
    campo = ds[nome_var].max(dim=["time", "step"], skipna=True)

    print(f"      Campo 2D pronto: dims={dict(campo.sizes)}, "
          f"lat range=[{float(campo.latitude.min()):.2f}, {float(campo.latitude.max()):.2f}], "
          f"lon range=[{float(campo.longitude.min()):.2f}, {float(campo.longitude.max()):.2f}]")
    return campo


# --------------------------------------------------------------------------
# 3. Preparar grade north-up (REUSA a mesma função já validada no script do
#    MERGE - conversão de longitude segura para -180/180 ou 0/360, flip de
#    latitude robusto à ordem original)
# --------------------------------------------------------------------------
def preparar_grade_norte_para_cima(campo) -> tuple:
    campo_ordenado = campo.sortby("latitude").sortby("longitude")

    lats = campo_ordenado.latitude.values
    lons = campo_ordenado.longitude.values
    lons_180 = np.where(lons > 180, lons - 360, lons)

    resolucao_lat = float(lats[1] - lats[0])
    resolucao_lon = float(lons_180[1] - lons_180[0])
    oeste = float(lons_180.min())
    norte = float(lats.max())

    array_north_up = campo_ordenado.values[::-1, :]
    transform = Affine(resolucao_lon, 0, oeste, 0, -resolucao_lat, norte)
    return array_north_up, transform


# --------------------------------------------------------------------------
# 4. Zonal max por município e comparação com nearest-point/INMET
# --------------------------------------------------------------------------
def extrair_zonal_e_comparar(campo_2d, municipios: pd.DataFrame) -> pd.DataFrame:
    print(f"\n[3/4] Extraindo zonal max (rasterstats, all_touched=True) para "
          f"{len(municipios)} município(s)...")

    array_north_up, transform = preparar_grade_norte_para_cima(campo_2d)

    estatisticas = zonal_stats(
        municipios["geometria"].tolist(),
        array_north_up,
        affine=transform,
        stats=["max", "count"],
        nodata=np.nan,
        all_touched=True,
    )

    resultado_zonal = pd.DataFrame({
        "codigo_ibge": municipios["codigo_ibge"].values,
        "vento_rajada_max_mes_zonal": [s["max"] for s in estatisticas],
        "n_pixels_zonal": [s["count"] for s in estatisticas],
    })

    comparacao = municipios.merge(resultado_zonal, on="codigo_ibge", how="left")
    comparacao = comparacao.rename(columns={"vento_rajada_max_mes": "vento_rajada_max_mes_inmet"})
    comparacao["diferenca_zonal_menos_inmet_ms"] = (
        comparacao["vento_rajada_max_mes_zonal"] - comparacao["vento_rajada_max_mes_inmet"]
    )

    print(f"\n[4/4] Comparação: ERA5 zonal (máximo entre todos os pixels do polígono) x INMET "
          f"(estação real), {ANO_TESTE}-{MES_TESTE:02d}:")
    colunas_exibir = [
        "nome", "uf", "vento_rajada_max_mes_inmet", "vento_rajada_max_mes_zonal",
        "diferenca_zonal_menos_inmet_ms", "n_pixels_zonal",
    ]
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(comparacao[colunas_exibir].round(2).to_string(index=False))

    print("\nLEITURA: 'n_pixels_zonal' pequeno é esperado aqui - a célula do ERA5 (~28 km) é "
          "bem maior que a do MERGE (~11 km), então mesmo município médio deve ter poucos "
          "pixels (às vezes 1). Onde n_pixels=1, zonal deve ficar igual ou muito perto do "
          "nearest-point da POC anterior - é o mesmo teste de consistência interna já usado "
          "no MERGE (zonal >= nearest sempre, diferença maior conforme mais pixels entram).")

    return comparacao


def main():
    print("Prova de conceito (refinamento): zonal statistics real - ERA5 (vento) x INMET")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    municipios = selecionar_municipios_teste(engine)

    campo_2d = carregar_campo_2d_rajada_max_mes()
    extrair_zonal_e_comparar(campo_2d, municipios)

    print("\n✅ Prova de conceito concluída (somente leitura quanto ao banco do projeto).")


if __name__ == "__main__":
    main()
