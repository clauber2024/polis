"""
EXTRACTOR: indicadores_climaticos - precipitação máxima mensal
(MERGE/CPTEC-INPE, satélite GPM-IMERG V07B + rede de pluviômetros)
================================================================================
CONTEXTO E VALIDAÇÃO METODOLÓGICA - LEIA ANTES DE USAR ESTE EXTRACTOR:
--------------------------------------------------------------------------
Primeiro indicador climático formal do Atlas, formalizado em 08/07/2026 após
uma linha de investigação completa (ver ARQUITETURA.md, "Queima de
equipamentos" e "PESQUISA DE VIABILIDADE - cobertura nacional") que:
  1. Testou a hipótese de clima (chuva/vento) x ressarcimento por danos
     elétricos (ANEEL/INDGER), primeiro numa amostra restrita a municípios
     com estação INMET própria (~571 de 5.573).
  2. Validou tecnicamente o pipeline MERGE (leitura GRIB2 via cfgrib,
     corrigindo 2 bugs reais: (a) o cfgrib renomeia a variável de
     precipitação errado - usar SEMPRE a 1ª variável por POSIÇÃO, nunca pelo
     nome; (b) a grade do MERGE usa longitude em 0-360°, não -180/180 como o
     `.ctl` sugere - converter com `% 360`).
  3. Construiu zonal statistics real (rasterstats, `all_touched=True` -
     necessário para não perder município menor que 1 pixel de ~11km).
  4. Escalou para os 5.573 municípios x 24 meses (2024-2025) e CONFIRMOU o
     sinal em escala nacional: rho parcial +0,19 (controlando renda),
     robusto nas 5 regiões e nos 3 tercis de urbanização.

O VALOR ARMAZENADO É UM MÁXIMO ZONAL, NÃO O PICO DE UMA ESTAÇÃO - ver
comentário completo em backend/src/db/schema/indicadores_climaticos.ts e
migration 0019. Resumo: para cada mês, empilha os dias, tira o máximo pixel
a pixel (numpy), e roda zonal_stats (máximo entre todos os pixels que tocam
o polígono do município) - 1 chamada de zonal_stats por mês, cobrindo todos
os municípios de uma vez (não por dia/por município - inviável em escala
nacional, ver nota de performance abaixo).

ESTE EXTRACTOR REUSA, SEM REINVENTAR, A LÓGICA JÁ VALIDADA E EXECUTADA COM
SUCESSO EM `backend/src/etl/analises/escalar_merge_precipitacao_nacional.py`
(que salvava em Parquet local, não no banco - script exploratório, nunca
formal). Este extractor é a versão FORMAL: mesma lógica de download/leitura/
zonal statistics, mas com upsert em `indicadores_climaticos` em vez de
Parquet.

CHECKPOINT / IDEMPOTÊNCIA: como o processamento de 24 meses x 5.573
municípios pode levar bastante tempo (rodada anterior: ~1h para o MERGE),
este extractor verifica, por mês, se TODOS os municípios daquele mês já
foram gravados no banco antes de reprocessar - rodar de novo pula meses já
completos. Mesma motivação do checkpoint por Parquet no script exploratório
irmão: um crash (ex.: PermissionError transitório do OneDrive na pasta do
projeto - CONFIRMADO em produção, 08/07/2026) não deve obrigar reprocessar
tudo do zero.

TRANSAÇÃO POR MUNICÍPIO NO UPSERT, NUNCA UMA TRANSAÇÃO ÚNICA PARA O MÊS
INTEIRO (regra do CLAUDE.md, seção ETL) - erro de FK ou de dado num
município não deve cancelar os outros 5.572 do mesmo mês.

DEPENDÊNCIAS NOVAS (já confirmadas nesta sessão, `pip install` puro, sem
conda): cfgrib, xarray, eccodes, rasterstats (traz rasterio/GDAL via wheels
pré-compiladas).

TEMPO/ESPAÇO ESPERADO: ~730 arquivos diários (~400-500 KB cada, cache
compartilhado com o script exploratório) = ~300-350 MB. Processamento pode
levar de alguns minutos a algumas dezenas de minutos - rodar em background
(nohup) é recomendável para a carga inicial completa.
================================================================================
"""

import calendar
import os
import time

import numpy as np
import pandas as pd
import requests
import xarray as xr
from affine import Affine
from rasterstats import zonal_stats
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

ANO_MINIMO = int(os.environ.get("ANO_MINIMO", "2024"))
ANO_MAXIMO = int(os.environ.get("ANO_MAXIMO", "2025"))

URL_BASE_MERGE = "https://ftp.cptec.inpe.br/modelos/tempo/MERGE/GPM/DAILY"
CAMINHO_CACHE_MERGE_BASE = os.environ.get(
    "CAMINHO_CACHE_MERGE_BASE", "backend/src/etl/data/raw/inpe_merge"
)


# --------------------------------------------------------------------------
# 1. Geometria de TODOS os municípios (uma vez só, reusada em todos os meses)
# --------------------------------------------------------------------------
def carregar_geometrias_todos_municipios(engine) -> pd.DataFrame:
    print("[1/5] Carregando geometria de todos os municípios...")
    consulta = text("SELECT codigo_ibge, ST_AsBinary(geom) AS geom_wkb FROM municipios")
    with engine.connect() as conexao:
        df = pd.read_sql(consulta, conexao)

    from shapely import wkb
    df["geometria"] = df["geom_wkb"].apply(lambda b: wkb.loads(bytes(b)))
    print(f"      {len(df)} município(s) carregado(s).")
    return df[["codigo_ibge", "geometria"]]


# --------------------------------------------------------------------------
# 2. Verificar se o mês já está completo no banco (checkpoint/idempotência)
# --------------------------------------------------------------------------
def mes_ja_completo(engine, ano: int, mes: int, n_municipios_esperado: int) -> bool:
    periodo = f"{ano}-{mes:02d}-01"
    consulta = text("""
        SELECT COUNT(*) FROM indicadores_climaticos
        WHERE periodo_referencia = :periodo
    """)
    with engine.connect() as conexao:
        n_existente = conexao.execute(consulta, {"periodo": periodo}).scalar()
    return n_existente >= n_municipios_esperado


# --------------------------------------------------------------------------
# 3. Baixar 1 mês de arquivos MERGE (mesma lógica já validada)
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
# 3b. Abrir GRIB com retry - PermissionError transitorio ja confirmado em
#    producao (pasta do projeto sincronizada via OneDrive) - ver ARQUITETURA.md
# --------------------------------------------------------------------------
def abrir_grib_com_retry(caminho: str, max_tentativas: int = 6, espera_segundos: int = 5):
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
          f"{max_tentativas} tentativas - pulando este dia.")
    return None


# --------------------------------------------------------------------------
# 4. Empilhar os dias do mês -> máximo pixel a pixel -> grade north-up
# --------------------------------------------------------------------------
def calcular_grade_maxima_do_mes(caminhos_grib: list) -> tuple:
    """
    Máximo pixel a pixel entre os dias do mês (numpy puro), convertido para
    grade north-up com longitude em -180/180 (convertida de 0-360 - ver
    docstring do módulo sobre o bug de convenção já corrigido).
    """
    arrays_do_mes = []
    transform_referencia = None

    for caminho in caminhos_grib:
        ds = abrir_grib_com_retry(caminho)
        if ds is None:
            continue

        nome_var_prec = list(ds.data_vars)[0]  # PREC por posicao - cfgrib renomeia errado
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
# 5. Upsert por município (transação individual, nunca 1 transação pro mês
#    inteiro - regra do CLAUDE.md)
# --------------------------------------------------------------------------
def executar_upsert_mes(engine, ano: int, mes: int, codigos: list, valores: list) -> None:
    periodo_referencia = f"{ano}-{mes:02d}-01"

    sql_upsert = text("""
        INSERT INTO indicadores_climaticos
            (unidade_espacial_id, periodo_referencia, precipitacao_max_mes_mm)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :precipitacao_max_mes_mm)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            precipitacao_max_mes_mm = EXCLUDED.precipitacao_max_mes_mm;
    """)

    inseridos = 0
    falhas = []

    for codigo_ibge, valor in zip(codigos, valores):
        unidade_espacial_id = f"municipio:{codigo_ibge}"
        valor_python = None if valor is None or (isinstance(valor, float) and np.isnan(valor)) else float(valor)
        try:
            with engine.begin() as conexao:
                conexao.execute(sql_upsert, {
                    "unidade_espacial_id": unidade_espacial_id,
                    "periodo_referencia": periodo_referencia,
                    "precipitacao_max_mes_mm": valor_python,
                })
            inseridos += 1
        except Exception as e:  # noqa: BLE001
            falhas.append((codigo_ibge, str(e)))

    print(f"      {inseridos}/{len(codigos)} município(s) inseridos/atualizados.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} falha(s):")
        for codigo, erro in falhas[:10]:
            print(f"        - {codigo}: {erro[:120]}")


# --------------------------------------------------------------------------
# 6. Loop principal - mês a mês, com checkpoint
# --------------------------------------------------------------------------
def processar_todos_os_meses(engine, municipios: pd.DataFrame) -> None:
    print(f"\n[2-5/5] Processando {ANO_MINIMO}-{ANO_MAXIMO} (mês a mês, com checkpoint no banco)...")

    geometrias = municipios["geometria"].tolist()
    codigos = municipios["codigo_ibge"].tolist()

    for ano in range(ANO_MINIMO, ANO_MAXIMO + 1):
        for mes in range(1, 13):
            if mes_ja_completo(engine, ano, mes, len(codigos)):
                print(f"\n--- {ano}-{mes:02d} --- já completo no banco (checkpoint) - pulando.")
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
            valores = [s["max"] for s in estatisticas]

            executar_upsert_mes(engine, ano, mes, codigos, valores)


def main():
    print(f"Extração formal: indicadores_climaticos (precipitação máxima mensal, MERGE) - "
          f"{ANO_MINIMO}-{ANO_MAXIMO}, todos os municípios")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    municipios = carregar_geometrias_todos_municipios(engine)

    processar_todos_os_meses(engine, municipios)

    print("\n✅ Extração concluída. Dados gravados em indicadores_climaticos (Postgres).")


if __name__ == "__main__":
    main()
