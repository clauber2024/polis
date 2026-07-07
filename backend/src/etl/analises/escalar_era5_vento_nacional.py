"""
ESCALA NACIONAL: rajada de vento máxima mensal (ERA5) para TODOS os
municípios do Brasil, 2024-2025 - zonal statistics real, método já validado
================================================================================
CONTEXTO: mesmo racional de escalar_merge_precipitacao_nacional.py, para
vento em vez de chuva - ver ARQUITETURA.md, seção "PESQUISA DE VIABILIDADE -
cobertura nacional (MERGE/ERA5)" e "Zonal statistics do ERA5/vento".

ESTE SCRIPT NÃO É UM EXTRACTOR FORMAL - não grava no banco. Salva o resultado
(município x mês x rajada máxima) num Parquet local, consumido por um
próximo script que recalcula a correlação com ressarcimento usando cobertura
nacional.

DIFERENÇA EM RELAÇÃO AO MERGE: o ERA5 é baixado por PEDIDO ao CDS API (não
por arquivo estático em FTP) - 1 pedido por mês, cobrindo o Brasil inteiro
(bbox calculado a partir do território real dos municípios, com margem, não
adivinhado). Cada pedido já vem com as dimensões `time`/`step` (ver
ARQUITETURA.md sobre a estrutura de campos "since previous post-processing")
- colapsa para 2D com `.max(dim=["time","step"], skipna=True)` (mesma lógica
já validada), e SÓ DEPOIS roda zonal_stats 1 vez por mês para todos os
municípios (mesma otimização de escala do script do MERGE).

TAMANHO/TEMPO ESPERADO: pedido de teste (1 mês, bbox pequeno do Nordeste) deu
4 MB - um pedido de 1 mês para o BRASIL INTEIRO deve ser bem maior (bbox ~15-
20x maior em área) e pode demorar mais na fila do CDS. 24 meses = 24 pedidos
sequenciais - rodar em background é fortemente recomendado (ver instrução no
final deste docstring), pode levar bastante tempo no total dependendo da fila
do serviço.

PRÉ-REQUISITO: mesmo `~/.cdsapirc` e termos de uso já aceitos nas POCs
anteriores desta sessão - não precisa refazer nada.

ESTE SCRIPT É SOMENTE LEITURA quanto ao banco do projeto (só lê geometria e
bbox de município) - toda a computação de clima fica em arquivos locais.
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

ANO_MINIMO = int(os.environ.get("ANO_MINIMO", "2024"))
ANO_MAXIMO = int(os.environ.get("ANO_MAXIMO", "2025"))
MARGEM_AREA_GRAUS = 1.0

CAMINHO_CACHE_ERA5_BASE = os.environ.get(
    "CAMINHO_CACHE_ERA5_BASE", "backend/src/etl/data/raw/era5_nacional"
)
# CHECKPOINT POR MES (adicionado 08/07/2026, apos crash real em producao: 1a
# versao acumulava tudo em memoria e so salvava 1 parquet no final dos 24
# meses - um PermissionError transitorio do OneDrive no mes 3 (ver abaixo)
# derrubou o processo e perdeu janeiro+fevereiro ja processados. Agora cada
# mes vira seu proprio arquivo assim que fica pronto - crash NAO perde
# trabalho de meses anteriores, e rodar de novo PULA os meses ja concluidos.
CAMINHO_SAIDA_POR_MES = os.environ.get(
    "CAMINHO_SAIDA_POR_MES", "backend/src/etl/data/raw/clima_nacional/vento_por_mes"
)


# --------------------------------------------------------------------------
# 1. Geometria de TODOS os municípios + bbox real do Brasil (não adivinhado)
# --------------------------------------------------------------------------
def carregar_municipios_e_bbox(engine) -> tuple:
    print("[1/4] Carregando geometria de todos os municípios e bbox real do Brasil...")
    consulta_geom = text("SELECT codigo_ibge, ST_AsBinary(geom) AS geom_wkb FROM municipios")
    with engine.connect() as conexao:
        df = pd.read_sql(consulta_geom, conexao)
    df["geometria"] = df["geom_wkb"].apply(lambda b: wkb.loads(bytes(b)))

    consulta_bbox = text("""
        SELECT MIN(ST_YMin(geom)) AS sul, MAX(ST_YMax(geom)) AS norte,
               MIN(ST_XMin(geom)) AS oeste, MAX(ST_XMax(geom)) AS leste
        FROM municipios
    """)
    with engine.connect() as conexao:
        bbox = pd.read_sql(consulta_bbox, conexao).iloc[0]

    area = [
        float(bbox["norte"]) + MARGEM_AREA_GRAUS,
        float(bbox["oeste"]) - MARGEM_AREA_GRAUS,
        float(bbox["sul"]) - MARGEM_AREA_GRAUS,
        float(bbox["leste"]) + MARGEM_AREA_GRAUS,
    ]
    print(f"      {len(df)} município(s). Bbox real do território + margem: {area}")
    return df[["codigo_ibge", "geometria"]], area


# --------------------------------------------------------------------------
# 2. Baixar 1 mês de rajada de vento (Brasil inteiro) via CDS
# --------------------------------------------------------------------------
def baixar_mes_era5(ano: int, mes: int, area: list) -> str:
    import calendar

    os.makedirs(CAMINHO_CACHE_ERA5_BASE, exist_ok=True)
    caminho_local = os.path.join(CAMINHO_CACHE_ERA5_BASE, f"rajada_{ano}{mes:02d}.grib")

    if os.path.exists(caminho_local):
        print(f"      {ano}-{mes:02d}: já em cache local ({caminho_local}).")
        return caminho_local

    import cdsapi

    dias_no_mes = calendar.monthrange(ano, mes)[1]
    dias = [f"{d:02d}" for d in range(1, dias_no_mes + 1)]
    horas = [f"{h:02d}:00" for h in range(24)]

    cliente = cdsapi.Client()
    dataset = "reanalysis-era5-single-levels"
    request = {
        "product_type": ["reanalysis"],
        "variable": ["10m_wind_gust_since_previous_post_processing"],
        "year": [str(ano)],
        "month": [f"{mes:02d}"],
        "day": dias,
        "time": horas,
        "area": area,
        "data_format": "grib",
    }

    print(f"      {ano}-{mes:02d}: solicitando ao CDS API (Brasil inteiro, {len(dias)} dia(s) "
          f"x {len(horas)} hora(s)) - pode demorar na fila...")
    try:
        cliente.retrieve(dataset, request, caminho_local)
    except Exception as exc:  # noqa: BLE001
        print(f"      [AVISO] pedido para {ano}-{mes:02d} falhou: {exc} - pulando mês.")
        return None

    # Pausa proativa apos o download (nao so reativa via retry ao abrir) -
    # CONFIRMADO em producao (08/07/2026) que 30s de retry (6x5s) NAO foi
    # suficiente pra um arquivo de ~43MB no mes 2025-11 - o lock do OneDrive
    # (ou handle de arquivo do proprio requests/cdsapi ainda fechando) pode
    # durar mais que isso para arquivos grandes. Espera fixa aqui reduz a
    # chance de precisar entrar no retry de leitura la embaixo.
    import time
    time.sleep(10)

    tamanho_mb = os.path.getsize(caminho_local) / (1024 * 1024)
    print(f"      {ano}-{mes:02d}: OK — {tamanho_mb:.1f} MB salvos.")
    return caminho_local


# --------------------------------------------------------------------------
# 2b. Abrir GRIB com retry - CONFIRMADO em producao (08/07/2026) que o
#    arquivo recem-baixado pode dar PermissionError ao ser aberto logo em
#    seguida - suspeita forte de lock transitorio do OneDrive (a pasta do
#    projeto e sincronizada, ver CLAUDE.md/ARQUITETURA.md sobre o quirk ja
#    conhecido de atraso de sincronizacao nesta pasta). Nao e erro de logica
#    do script - so precisa esperar e tentar de novo.
# --------------------------------------------------------------------------
def abrir_grib_com_retry(caminho: str, max_tentativas: int = 10, espera_segundos: int = 15):
    import time

    ultimo_erro = None
    for tentativa in range(1, max_tentativas + 1):
        try:
            return xr.open_dataset(caminho, engine="cfgrib")
        except PermissionError as exc:
            ultimo_erro = exc
            print(f"      [AVISO] PermissionError ao abrir {os.path.basename(caminho)} "
                  f"(tentativa {tentativa}/{max_tentativas}) - provavel lock temporario do "
                  f"OneDrive logo apos o download, tentando de novo em {espera_segundos}s...")
            time.sleep(espera_segundos)
    raise SystemExit(
        f"[ERRO] Não consegui abrir {caminho} após {max_tentativas} tentativas: {ultimo_erro}"
    )


# --------------------------------------------------------------------------
# 3. Colapsar time/step -> campo 2D north-up (mesma lógica já validada)
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
# 4. Zonal max mensal para TODOS os municípios, mês a mês - COM CHECKPOINT
# --------------------------------------------------------------------------
def processar_todos_os_meses(municipios: pd.DataFrame, area: list) -> None:
    print(f"\n[2-4/4] Processando {ANO_MINIMO}-{ANO_MAXIMO} (mês a mês, com checkpoint)...")
    os.makedirs(CAMINHO_SAIDA_POR_MES, exist_ok=True)

    geometrias = municipios["geometria"].tolist()
    codigos = municipios["codigo_ibge"].tolist()

    for ano in range(ANO_MINIMO, ANO_MAXIMO + 1):
        for mes in range(1, 13):
            caminho_saida_mes = os.path.join(CAMINHO_SAIDA_POR_MES, f"{ano}_{mes:02d}.parquet")
            if os.path.exists(caminho_saida_mes):
                print(f"\n--- {ano}-{mes:02d} --- já processado (checkpoint existe) - pulando.")
                continue

            print(f"\n--- {ano}-{mes:02d} ---")
            caminho_grib = baixar_mes_era5(ano, mes, area)
            if caminho_grib is None:
                continue

            ds = abrir_grib_com_retry(caminho_grib)

            nome_var = list(ds.data_vars)[0]
            campo_2d = ds[nome_var].max(dim=["time", "step"], skipna=True)
            array_north_up, transform = preparar_grade_norte_para_cima(campo_2d)
            ds.close()

            estatisticas = zonal_stats(
                geometrias, array_north_up, affine=transform,
                stats=["max"], nodata=np.nan, all_touched=True,
            )

            registros_mes = [
                {"codigo_ibge": codigo, "ano": ano, "mes": mes, "vento_rajada_max_mes": stat["max"]}
                for codigo, stat in zip(codigos, estatisticas)
            ]
            pd.DataFrame(registros_mes).to_parquet(caminho_saida_mes, index=False)

            n_com_dado = sum(1 for s in estatisticas if s["max"] is not None)
            print(f"      zonal max calculado para {n_com_dado}/{len(codigos)} município(s) - "
                  f"salvo em {caminho_saida_mes}")


def main():
    print(f"Escala nacional: rajada de vento máxima mensal (ERA5) - {ANO_MINIMO}-{ANO_MAXIMO}, "
          f"todos os municípios")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    municipios, area = carregar_municipios_e_bbox(engine)

    processar_todos_os_meses(municipios, area)

    print(f"\n✅ Concluído. Arquivos por mês em {CAMINHO_SAIDA_POR_MES}/ - rode "
          f"consolidar_parquets_climaticos.py para juntar tudo num único parquet.")


if __name__ == "__main__":
    main()
