"""
PROVA DE CONCEITO: pipeline ERA5 (rajada de vento gridded nacional) x
município, validado contra INMET/BDMEP para um mês de teste
================================================================================
CONTEXTO: mesmo racional de prova_conceito_merge_precipitacao_x_inmet.py,
para a variável de vento em vez de chuva — ver ARQUITETURA.md, seção
"Queima de equipamentos" e "PESQUISA DE VIABILIDADE - cobertura nacional
(MERGE/ERA5)".

CORREÇÃO JÁ REGISTRADA (08/07/2026, ANTES deste script): a rajada de vento
(`fg10`) NÃO existe no ERA5-Land (~9 km) como se pensava originalmente — só
no ERA5 "completo" (`reanalysis-era5-single-levels`, ~28 km/0,25°). Este
script usa o dataset CORRETO.

PRÉ-REQUISITOS já confirmados nesta sessão (ver
diagnosticar_leitura_era5_rajada_vento.py):
  - Conta Copernicus CDS criada, `~/.cdsapirc` configurado, termos de uso do
    dataset aceitos manualmente pelo usuário (passo obrigatório, não
    delegável).
  - `pip install cdsapi cfgrib xarray eccodes` funciona sem conda.
  - O campo `fg10` vem organizado em `time` (ciclo de previsão-base,
    00Z/12Z) x `step` (passo dentro do ciclo) — só uma fatia de cada
    combinação é válida, o resto vem `NaN` de propósito (não é erro). Como
    só precisamos do MÁXIMO do período (mesma filosofia de "pico do mês" já
    usada com INMET e com o MERGE), a solução é simplesmente tirar o máximo
    com `skipna=True` sobre as dimensões `time` e `step` juntas — não
    precisa alinhar por `valid_time` hora a hora, o NaN é ignorado
    naturalmente e o valor real (não importa em qual (time, step) ele caiu)
    entra no máximo.

ESCOLHA DOS MUNICÍPIOS DE TESTE: restringe a região Nordeste (mesma região já
tratada com atenção nos diagnósticos anteriores desta linha de investigação
— ver ARQUITETURA.md, "DIAGNOSTICO DEDICADO Nordeste/vento") para manter a
área geográfica do pedido ao CDS pequena (pedidos maiores demoram mais na
fila do serviço) e ficar diretamente comparável ao caso já estudado. Dentro
do Nordeste, pega os municípios que o INMET realmente tem dado no mês de
teste — mesmo critério do script do MERGE, para nunca comparar contra um
município sem par real do lado do INMET.

MÉTODO (SIMPLIFICAÇÃO DELIBERADA DESTA PROVA DE CONCEITO, mesma do MERGE):
ponto de grade mais próximo do centroide via `.sel(..., method="nearest")`,
não zonal statistics real — para município grande, pode subestimar o pico
real se a rajada mais forte do mês tiver ocorrido longe do centroide. Some-se
a isso a limitação JÁ CONHECIDA do ERA5 de subestimar rajadas localizadas
(fenômeno de sub-escala de grade) — duas fontes de subestimação empilhadas,
o que deve ser levado em conta ao interpretar a comparação com o INMET.

ESTE SCRIPT É SOMENTE LEITURA quanto ao banco do projeto — não grava nada.
Faz 1 pedido real ao Copernicus CDS (mês inteiro, área pequena) e 1 consulta
real ao BigQuery (Base dos Dados, mesma credencial já usada no projeto).
================================================================================
"""

import os
import sys

import numpy as np
import pandas as pd
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
MARGEM_AREA_GRAUS = 1.0  # buffer ao redor do bbox dos municípios de teste, em graus

CAMINHO_CACHE_ERA5 = os.environ.get(
    "CAMINHO_CACHE_ERA5",
    f"backend/src/etl/data/raw/era5_teste/rajada_mes_{ANO_TESTE}{MES_TESTE:02d}.grib",
)


# --------------------------------------------------------------------------
# 1. Município de teste: Nordeste, com estação INMET no mês de teste
# --------------------------------------------------------------------------
def selecionar_municipios_teste(engine) -> pd.DataFrame:
    print(f"[1/5] Selecionando municípios de teste ({REGIAO_TESTE}, com estação INMET, "
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
               ST_X(ST_Centroid(geom)) AS lon
        FROM municipios
        WHERE codigo_ibge = ANY(:codigos) AND regiao = :regiao
    """)
    with engine.connect() as conexao:
        geo = pd.read_sql(consulta, conexao, params={"codigos": codigos_candidatos, "regiao": REGIAO_TESTE})

    candidatos = clima_mes_teste.merge(geo, on="codigo_ibge", how="inner")
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

    print(f"      {len(amostra)} município(s) de teste selecionado(s):")
    print(amostra[["codigo_ibge", "nome", "uf", "vento_rajada_max_mes"]]
          .rename(columns={"vento_rajada_max_mes": "inmet_vento_rajada_max_mes_ms"})
          .round(1).to_string(index=False))

    return amostra


# --------------------------------------------------------------------------
# 2. Baixar rajada de vento do mês inteiro, recorte pequeno (bbox dos
#    municípios de teste + margem)
# --------------------------------------------------------------------------
def baixar_mes_era5(municipios: pd.DataFrame) -> str:
    print(f"\n[2/5] Solicitando rajada de vento (fg10) ao CDS API para "
          f"{ANO_TESTE}-{MES_TESTE:02d}, recorte {REGIAO_TESTE}...")
    os.makedirs(os.path.dirname(CAMINHO_CACHE_ERA5), exist_ok=True)

    if os.path.exists(CAMINHO_CACHE_ERA5):
        print(f"      Já em cache local ({CAMINHO_CACHE_ERA5}) — pulando novo pedido.")
        return CAMINHO_CACHE_ERA5

    import calendar

    norte = municipios["lat"].max() + MARGEM_AREA_GRAUS
    sul = municipios["lat"].min() - MARGEM_AREA_GRAUS
    leste = municipios["lon"].max() + MARGEM_AREA_GRAUS
    oeste = municipios["lon"].min() - MARGEM_AREA_GRAUS
    area = [norte, oeste, sul, leste]

    dias_no_mes = calendar.monthrange(ANO_TESTE, MES_TESTE)[1]
    dias = [f"{d:02d}" for d in range(1, dias_no_mes + 1)]
    horas = [f"{h:02d}:00" for h in range(24)]

    import cdsapi

    cliente = cdsapi.Client()
    dataset = "reanalysis-era5-single-levels"
    request = {
        "product_type": ["reanalysis"],
        "variable": ["10m_wind_gust_since_previous_post_processing"],
        "year": [str(ANO_TESTE)],
        "month": [f"{MES_TESTE:02d}"],
        "day": dias,
        "time": horas,
        "area": area,
        "data_format": "grib",
    }

    print(f"      area={area} (bbox dos municípios de teste + {MARGEM_AREA_GRAUS}° de margem)")
    print(f"      {len(dias)} dia(s) x {len(horas)} hora(s) - pedido maior que o diagnóstico "
          f"estágio 0, pode demorar mais na fila do CDS.")

    try:
        cliente.retrieve(dataset, request, CAMINHO_CACHE_ERA5)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(
            f"[ERRO] Pedido ao CDS falhou: {type(exc).__name__}: {exc}"
        ) from exc

    tamanho_mb = os.path.getsize(CAMINHO_CACHE_ERA5) / (1024 * 1024)
    print(f"      OK — {tamanho_mb:.1f} MB salvos em {CAMINHO_CACHE_ERA5}")
    return CAMINHO_CACHE_ERA5


# --------------------------------------------------------------------------
# 3-4. Extrair rajada máxima do mês por município (nearest-point) e comparar
# --------------------------------------------------------------------------
def extrair_e_comparar(caminho_grib: str, municipios: pd.DataFrame) -> pd.DataFrame:
    print(f"\n[3/5] Abrindo GRIB do mês e extraindo rajada máxima por município "
          f"(ponto de grade mais próximo do centroide)...")

    import xarray as xr

    ds = xr.open_dataset(caminho_grib, engine="cfgrib")
    nome_var = list(ds.data_vars)[0]  # so 1 variavel pedida (fg10) - mas por posicao, mesma cautela do MERGE
    campo_rajada = ds[nome_var]

    registros = []
    for _, municipio in municipios.iterrows():
        serie = campo_rajada.sel(
            latitude=municipio["lat"], longitude=municipio["lon"], method="nearest"
        )
        # Máximo com skipna=True sobre time E step juntos - ver docstring do
        # módulo sobre por que isso dispensa alinhar por valid_time aqui.
        maximo = float(serie.max(skipna=True).values)
        n_valores_validos = int(serie.notnull().sum().values)
        registros.append({
            "codigo_ibge": municipio["codigo_ibge"],
            "vento_rajada_max_mes_era5": maximo,
            "n_valores_validos_era5": n_valores_validos,
        })

    resultado_era5 = pd.DataFrame(registros)

    print("\n[4/5] Agregando e comparando com INMET...")
    comparacao = municipios.merge(resultado_era5, on="codigo_ibge", how="left")
    comparacao = comparacao.rename(columns={"vento_rajada_max_mes": "vento_rajada_max_mes_inmet"})
    comparacao["diferenca_ms"] = (
        comparacao["vento_rajada_max_mes_era5"] - comparacao["vento_rajada_max_mes_inmet"]
    )
    comparacao["razao_era5_sobre_inmet"] = (
        comparacao["vento_rajada_max_mes_era5"] / comparacao["vento_rajada_max_mes_inmet"]
    )

    print(f"\n[5/5] Comparação ERA5 (ponto de grade mais próximo do centroide) x INMET "
          f"(estação real) — pico de rajada de vento, {ANO_TESTE}-{MES_TESTE:02d}:")
    colunas_exibir = [
        "nome", "uf", "vento_rajada_max_mes_inmet", "vento_rajada_max_mes_era5",
        "diferenca_ms", "razao_era5_sobre_inmet", "n_valores_validos_era5",
    ]
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(comparacao[colunas_exibir].round(2).to_string(index=False))

    print("\nLEITURA: espera-se o ERA5 TENDER A SUBESTIMAR o pico do INMET (reanálise a "
          "~28 km de resolução borra rajadas localizadas, limitação já conhecida e "
          "documentada no ARQUITETURA.md) — uma razão consistentemente < 1 é ESPERADA, não "
          "necessariamente um problema. O que preocuparia seria: (a) razão muito próxima de "
          "zero ou negativa/sem sentido físico, ou (b) nenhuma relação/ordem entre os "
          "municípios (o ranking de intensidade do ERA5 deveria ao menos direcionalmente "
          "acompanhar o do INMET).")

    return comparacao


def main():
    print("Prova de conceito: ERA5 (rajada de vento) x INMET, por município/mês")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    municipios = selecionar_municipios_teste(engine)

    caminho_grib = baixar_mes_era5(municipios)
    extrair_e_comparar(caminho_grib, municipios)

    print("\n✅ Prova de conceito concluída (somente leitura quanto ao banco do projeto).")


if __name__ == "__main__":
    main()
