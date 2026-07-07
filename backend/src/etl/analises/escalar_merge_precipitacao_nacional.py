"""
ESCALA NACIONAL: precipitação máxima mensal (MERGE/CPTEC-INPE) para TODOS os
municípios do Brasil, 2024-2025 - zonal statistics real, método já validado
================================================================================
CONTEXTO: decisão do usuário (07/07/2026) de escalar a cobertura climática
para todos os ~5.573 municípios (não só os ~571 com estação INMET própria),
depois de: (1) o sinal aparecer robusto na amostra restrita a estações INMET
(investigar_clima_ressarcimento_danos_eletricos.py); (2) o pipeline técnico
MERGE ser validado (leitura GRIB2, correção da convenção de longitude,
zonal statistics real com `all_touched=True`) em
prova_conceito_zonal_statistics_merge_precipitacao.py - ver ARQUITETURA.md,
seção "PESQUISA DE VIABILIDADE - cobertura nacional (MERGE/ERA5)".

ESTE SCRIPT NÃO É UM EXTRACTOR FORMAL - não grava no banco Postgres. Salva o
resultado (município x mês x precipitação máxima) num Parquet local, para
ser consumido por um próximo script que recalcula a correlação com
ressarcimento usando cobertura nacional em vez da amostra INMET. Formalizar
como extractor (schema Drizzle, `loaders/`) é uma decisão a se tomar DEPOIS
de confirmar que o sinal se sustenta em escala nacional - não antes.

OTIMIZAÇÃO DE ESCALA (diferença importante em relação à POC, que rodava
zonal_stats por DIA para só 15 municípios): rodar zonal_stats por dia para
todos os ~5.573 municípios x ~730 dias (2 anos) seria caro demais. Em vez
disso, para cada MÊS: empilha os arrays diários (numpy puro, barato) e tira
o MÁXIMO PIXEL A PIXEL do mês ANTES de rodar zonal_stats - reduz de
~5.573 x 730 operações zonais para só 24 (uma por mês, cada uma cobrindo
todos os municípios de uma vez). Mesma lógica já usada para o ERA5 (colapsar
tempo antes de rodar zonal_stats), aplicada aqui manualmente porque o MERGE
vem em arquivos diários separados (não um único arquivo com dimensão de
tempo como o ERA5).

TEMPO/ESPAÇO ESPERADO: ~730 arquivos diários (~400-500 KB cada) = ~300-350 MB
de download total (2024-2025). Processamento: 24 rodadas de "empilhar ~30
arrays + zonal_stats sobre 5.573 polígonos" - tempo depende da máquina, pode
levar de alguns minutos a algumas dezenas de minutos no total. Rodar em
background é recomendável (ver instrução no final deste docstring).

ESTE SCRIPT É SOMENTE LEITURA quanto ao banco do projeto (só lê geometria de
município) - toda a computação de clima fica em arquivos locais.
================================================================================
"""

import calendar
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

ANO_MINIMO = int(os.environ.get("ANO_MINIMO", "2024"))
ANO_MAXIMO = int(os.environ.get("ANO_MAXIMO", "2025"))

URL_BASE_MERGE = "https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/DAILY"
CAMINHO_CACHE_MERGE_BASE = os.environ.get(
    "CAMINHO_CACHE_MERGE_BASE", "backend/src/etl/data/raw/inpe_merge"
)
# CHECKPOINT POR MES (adicionado 08/07/2026 - mesmo fix aplicado em
# escalar_era5_vento_nacional.py apos um crash real em producao: acumular
# tudo em memoria e so salvar 1 parquet no final dos 24 meses significa
# perder TODO o progresso se o processo cair no meio - ver ARQUITETURA.md).
# Cada mes vira seu proprio arquivo assim que fica pronto - rodar de novo
# PULA os meses ja concluidos.
CAMINHO_SAIDA_POR_MES = os.environ.get(
    "CAMINHO_SAIDA_POR_MES", "backend/src/etl/data/raw/clima_nacional/precipitacao_por_mes"
)


# --------------------------------------------------------------------------
# 1. Geometria de TODOS os municípios (uma vez só, reusada em todos os meses)
# --------------------------------------------------------------------------
def carregar_geometrias_todos_municipios(engine) -> pd.DataFrame:
    print("[1/4] Carregando geometria de todos os municípios (uma vez, reusada nos 24 meses)...")
    consulta = text("SELECT codigo_ibge, ST_AsBinary(geom) AS geom_wkb FROM municipios")
    with engine.connect() as conexao:
        df = pd.read_sql(consulta, conexao)
    df["geometria"] = df["geom_wkb"].apply(lambda b: wkb.loads(bytes(b)))
    print(f"      {len(df)} município(s) carregado(s).")
    return df[["codigo_ibge", "geometria"]]


# --------------------------------------------------------------------------
# 2. Baixar 1 mês de arquivos MERGE (mesma lógica das POCs anteriores)
# --------------------------------------------------------------------------
def baixar_mes_merge(ano: int, mes: int) -> list:
    caminho_cache_mes = os.path.join(CAMINHO_CACHE_MERGE_BASE, str(ano), f"{mes:02d}")
    os.makedirs(caminho_cache_mes, exist_ok=True)

    dias_no_mes = calendar.monthrange(ano, mes)[1]
    caminhos = []
    n_baixados = n_cache = n_falha = 0

    for dia in range(1, dias_no_mes + 1):
        nome_arquivo = f"MERGE_CPTEC_{ano}{mes:02d}{dia:02d}.grib2"
        caminho_local = os.path.join(caminho_cache_mes, nome_arquivo)

        if os.path.exists(caminho_local):
            n_cache += 1
            caminhos.append(caminho_local)
            continue

        url = f"{URL_BASE_MERGE}/{ano}/{mes:02d}/{nome_arquivo}"
        resposta = requests.get(url, timeout=60)
        if resposta.status_code != 200:
            print(f"      [AVISO] Falha ao baixar {nome_arquivo} (HTTP {resposta.status_code}) - pulando.")
            n_falha += 1
            continue

        with open(caminho_local, "wb") as f:
            f.write(resposta.content)
        n_baixados += 1
        caminhos.append(caminho_local)

    print(f"      {ano}-{mes:02d}: {n_baixados} baixado(s), {n_cache} em cache, "
          f"{n_falha} falha(s) de {dias_no_mes} dia(s).")
    return sorted(caminhos)


# --------------------------------------------------------------------------
# 2b. Abrir GRIB com retry - CONFIRMADO em producao (08/07/2026, no script
#    irmao escalar_era5_vento_nacional.py) que o arquivo recem-baixado pode
#    dar PermissionError ao ser aberto logo em seguida - suspeita forte de
#    lock transitorio do OneDrive (pasta do projeto sincronizada). Aqui,
#    diferente do ERA5 (1 arquivo por mes), sao ~730 arquivos diarios - se
#    um dia specifico falhar mesmo apos todas as tentativas, so pula ESSE
#    DIA (nao aborta o mes inteiro), avisando explicitamente.
# --------------------------------------------------------------------------
def abrir_grib_com_retry(caminho: str, max_tentativas: int = 6, espera_segundos: int = 5):
    import time

    ultimo_erro = None
    for tentativa in range(1, max_tentativas + 1):
        try:
            return xr.open_dataset(caminho, engine="cfgrib")
        except PermissionError as exc:
            ultimo_erro = exc
            print(f"      [AVISO] PermissionError ao abrir {os.path.basename(caminho)} "
                  f"(tentativa {tentativa}/{max_tentativas}) - tentando de novo em "
                  f"{espera_segundos}s...")
            time.sleep(espera_segundos)
        except Exception as exc:  # noqa: BLE001
            print(f"      [AVISO] falha ao abrir {os.path.basename(caminho)}: {exc} - pulando dia.")
            return None

    print(f"      [AVISO] {os.path.basename(caminho)} continuou dando PermissionError após "
          f"{max_tentativas} tentativas - pulando este dia (máximo mensal fica calculado com "
          f"1 dia a menos).")
    return None


# --------------------------------------------------------------------------
# 3. Empilhar os dias do mês -> máximo pixel a pixel -> grade north-up
# --------------------------------------------------------------------------
def calcular_grade_maxima_do_mes(caminhos_grib: list) -> tuple:
    """
    Abre todos os dias do mês, empilha (numpy puro - barato) e tira o máximo
    pixel a pixel. Retorna (array_north_up, affine_transform) prontos para
    zonal_stats - só 1 chamada de zonal_stats por mês, não por dia (ver
    docstring do módulo sobre por que essa otimização é necessária em escala
    nacional).
    """
    arrays_do_mes = []
    transform_referencia = None

    for caminho in caminhos_grib:
        ds = abrir_grib_com_retry(caminho)
        if ds is None:
            continue

        nome_var_prec = list(ds.data_vars)[0]  # PREC por posicao - cfgrib renomeia errado (ver ARQUITETURA.md)
        campo_ordenado = ds[nome_var_prec].sortby("latitude").sortby("longitude")

        if transform_referencia is None:
            lats = campo_ordenado.latitude.values
            lons = campo_ordenado.longitude.values
            lons_180 = np.where(lons > 180, lons - 360, lons)
            resolucao_lat = float(lats[1] - lats[0])
            resolucao_lon = float(lons_180[1] - lons_180[0])
            oeste = float(lons_180.min())
            norte = float(lats.max())
            transform_referencia = Affine(resolucao_lon, 0, oeste, 0, -resolucao_lat, norte)

        arrays_do_mes.append(campo_ordenado.values[::-1, :])  # north-up
        ds.close()

    if not arrays_do_mes:
        return None, None

    pilha = np.stack(arrays_do_mes, axis=0)
    maximo_do_mes = np.nanmax(pilha, axis=0)
    return maximo_do_mes, transform_referencia


# --------------------------------------------------------------------------
# 4. Zonal max mensal para TODOS os municípios, mês a mês - COM CHECKPOINT
# --------------------------------------------------------------------------
def processar_todos_os_meses(municipios: pd.DataFrame) -> None:
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
            caminhos_grib = baixar_mes_merge(ano, mes)
            if not caminhos_grib:
                print(f"      [AVISO] nenhum arquivo disponível para {ano}-{mes:02d} - pulando mês.")
                continue

            maximo_do_mes, transform = calcular_grade_maxima_do_mes(caminhos_grib)
            if maximo_do_mes is None:
                print(f"      [AVISO] nenhum arquivo pôde ser lido para {ano}-{mes:02d} - pulando mês.")
                continue

            estatisticas = zonal_stats(
                geometrias, maximo_do_mes, affine=transform,
                stats=["max"], nodata=np.nan, all_touched=True,
            )

            registros_mes = [
                {"codigo_ibge": codigo, "ano": ano, "mes": mes, "precipitacao_max_mes": stat["max"]}
                for codigo, stat in zip(codigos, estatisticas)
            ]
            pd.DataFrame(registros_mes).to_parquet(caminho_saida_mes, index=False)

            n_com_dado = sum(1 for s in estatisticas if s["max"] is not None)
            print(f"      zonal max calculado para {n_com_dado}/{len(codigos)} município(s) - "
                  f"salvo em {caminho_saida_mes}")


def main():
    print(f"Escala nacional: precipitação máxima mensal (MERGE) - {ANO_MINIMO}-{ANO_MAXIMO}, "
          f"todos os municípios")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    municipios = carregar_geometrias_todos_municipios(engine)

    processar_todos_os_meses(municipios)

    print(f"\n✅ Concluído. Arquivos por mês em {CAMINHO_SAIDA_POR_MES}/ - rode "
          f"consolidar_parquets_climaticos.py para juntar tudo num único parquet.")


if __name__ == "__main__":
    main()
