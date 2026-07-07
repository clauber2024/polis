"""
PROVA DE CONCEITO: pipeline MERGE/CPTEC-INPE (precipitação gridded nacional)
x município, validado contra INMET/BDMEP para um mês de teste
================================================================================
CONTEXTO: decisão do usuário (07/07/2026) de investir em cobertura nacional
para o teste de clima x ressarcimento por danos elétricos (ver ARQUITETURA.md,
seção "Queima de equipamentos"), depois do sinal aparecer robusto na amostra
restrita a estações INMET (`investigar_clima_ressarcimento_danos_eletricos.py`,
~571 municípios, cobertura enviesada para cidades maiores). Antes de baixar e
processar 2 anos inteiros de grade nacional (MERGE), este script valida o
pipeline inteiro num escopo pequeno (1 mês, poucos municípios) comparando o
resultado do MERGE contra o que o INMET já mostrou PARA OS MESMOS municípios.

PRÉ-REQUISITOS já confirmados nesta sessão (ver diagnosticar_leitura_merge_
grib2.py e ARQUITETURA.md, seção "PESQUISA DE VIABILIDADE"):
  - `cfgrib`/`xarray`/`eccodes` instalam via pip puro, sem conda.
  - O arquivo GRIB2 do MERGE tem 2 variáveis, NESTA ORDEM: PREC (precipitação
    de superfície) e NEST (número de estações). O `cfgrib` RENOMEIA as duas
    errado (`rdp`, `prmsl`) por causa de um conflito de tabela GRIB2 local do
    CPTEC não reconhecida pelo eccodes — **NUNCA usar o nome da variável,
    usar a POSIÇÃO** (`list(ds.data_vars)[0]` = PREC, sempre).

ESCOLHA DOS MUNICÍPIOS DE TESTE: em vez de uma lista fixa adivinhada, este
script CONSULTA o próprio INMET (mesma função já usada e validada em
investigar_clima_ressarcimento_danos_eletricos.py) para o mês de teste e pega
os municípios que realmente têm estação e dado no período — garante que a
comparação MERGE x INMET sempre tem um par real dos dois lados, em vez de
arriscar escolher um código IBGE errado de memória.

MÉTODO (SIMPLIFICAÇÃO DELIBERADA DESTA PROVA DE CONCEITO):
  1. Baixa os 31 arquivos GRIB2 diários do MERGE para o mês de teste
     (JANEIRO/2024 — mesmo mês/ano usado nos diagnósticos anteriores desta
     linha de investigação).
  2. Para cada dia, abre com cfgrib, pega a 1a variável por posição (PREC).
  3. Para cada município de teste, usa `.sel(..., method="nearest")` para
     achar o PONTO DE GRADE MAIS PRÓXIMO DO CENTROIDE do município — não é
     zonal statistics de verdade (que pegaria o MÁXIMO entre todos os pontos
     de grade que caem dentro do polígono do município). Para municípios
     grandes, isso pode subestimar o pico real do mês, porque a chuva mais
     forte pode ter caído numa parte do município longe do centroide. Um
     extractor de produção precisaria fazer a interseção geométrica de
     verdade (PostGIS/rasterstats), não esta aproximação.
  4. Calcula o máximo mensal por município (mesma lógica de "pico do mês" já
     usada com INMET) e compara lado a lado — NÃO espera bater exato (fontes
     diferentes: satélite+gauge interpolado vs. estação pontual), só que
     fiquem na mesma ordem de grandeza, sem viés sistemático grosseiro.

ESTE SCRIPT É SOMENTE LEITURA quanto ao banco do projeto (só usa o Postgres
para ler centroide de município) — não grava nada. Faz download real de
arquivos do FTP público do CPTEC (~14 MB para o mês inteiro) e uma consulta
real ao BigQuery (Base dos Dados, mesma credencial já usada no projeto).
================================================================================
"""

import os
import sys

import numpy as np
import pandas as pd
import requests
import xarray as xr
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
# 1. Município de teste: os que o INMET já tem dado no mês de teste
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

    # Amostra determinística (não escolhida a dedo) - ordena por número de
    # estações (prioriza municípios com leitura mais confiável) e pega os N
    # primeiros por codigo_ibge para reprodutibilidade.
    amostra = (
        clima_mes_teste.sort_values(["n_estacoes_municipio", "codigo_ibge"], ascending=[False, True])
        .head(N_MUNICIPIOS_TESTE)
        .copy()
    )

    codigos = amostra["codigo_ibge"].tolist()
    consulta = text("""
        SELECT codigo_ibge, nome, uf, regiao,
               ST_Y(ST_Centroid(geom)) AS lat,
               ST_X(ST_Centroid(geom)) AS lon
        FROM municipios
        WHERE codigo_ibge = ANY(:codigos)
    """)
    with engine.connect() as conexao:
        geo = pd.read_sql(consulta, conexao, params={"codigos": codigos})

    resultado = amostra.merge(geo, on="codigo_ibge", how="inner")
    faltando = set(codigos) - set(resultado["codigo_ibge"])
    if faltando:
        print(f"      [AVISO] {len(faltando)} código(s) IBGE do INMET não encontrado(s) "
              f"na tabela municipios - descartado(s): {sorted(faltando)}")

    print(f"      {len(resultado)} município(s) de teste selecionado(s):")
    print(resultado[["codigo_ibge", "nome", "uf", "regiao", "precipitacao_max_mes"]]
          .rename(columns={"precipitacao_max_mes": "inmet_precipitacao_max_mes_mm"})
          .round(1).to_string(index=False))

    return resultado


# --------------------------------------------------------------------------
# 2. Baixar o mês inteiro de arquivos MERGE
# --------------------------------------------------------------------------
def baixar_mes_merge() -> list:
    import calendar

    print(f"\n[2/5] Baixando arquivos MERGE de {ANO_TESTE}-{MES_TESTE:02d}...")
    os.makedirs(CAMINHO_CACHE_MERGE, exist_ok=True)

    dias_no_mes = calendar.monthrange(ANO_TESTE, MES_TESTE)[1]
    caminhos = []
    n_baixados = 0
    n_cache = 0
    n_falha = 0

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
            n_falha += 1
            continue

        with open(caminho_local, "wb") as f:
            f.write(resposta.content)
        n_baixados += 1
        caminhos.append(caminho_local)

    print(f"      {n_baixados} baixado(s), {n_cache} já em cache, {n_falha} falha(s) "
          f"de {dias_no_mes} dia(s) esperado(s).")
    if n_falha > dias_no_mes * 0.2:
        print("      [AVISO] mais de 20% dos dias falharam - resultado do mês pode ficar "
              "subestimado (menos dias considerados no máximo mensal).")

    return sorted(caminhos)


# --------------------------------------------------------------------------
# 3. Ler cada dia e extrair o valor no ponto de grade mais próximo de cada
#    município de teste (nearest-point ao centroide - ver LIMITAÇÕES no
#    docstring do módulo)
# --------------------------------------------------------------------------
def extrair_precipitacao_diaria_por_municipio(caminhos_grib: list, municipios: pd.DataFrame) -> pd.DataFrame:
    print(f"\n[3/5] Extraindo precipitação diária no ponto de grade mais próximo de "
          f"{len(municipios)} município(s), para {len(caminhos_grib)} dia(s)...")

    registros = []
    n_falha_leitura = 0

    for caminho in caminhos_grib:
        try:
            ds = xr.open_dataset(caminho, engine="cfgrib")
        except Exception as exc:  # noqa: BLE001
            print(f"      [AVISO] falha ao abrir {os.path.basename(caminho)}: "
                  f"{type(exc).__name__}: {exc} - pulando este dia.")
            n_falha_leitura += 1
            continue

        # NUNCA usar o nome da variável (cfgrib renomeia errado, ver docstring) -
        # a 1a variável do dataset é sempre PREC, por posição, conforme o .ctl oficial.
        nome_var_prec = list(ds.data_vars)[0]
        campo_prec = ds[nome_var_prec]

        for _, municipio in municipios.iterrows():
            # A grade do MERGE guarda longitude em 0-360deg (CONFIRMADO em
            # diagnosticar_convencao_longitude_merge.py, sessao 07/07/2026:
            # longitude real vai de 239.95 a 339.95, nao -120.05 a -20.05
            # como o .ctl "descreve"), diferente da convencao -180/180 usada
            # por municipios.lon (Postgres/PostGIS SIRGAS2000). "% 360"
            # converte corretamente longitude negativa para a convencao do
            # grid (ex.: -38.51 -> 321.49) - sem essa conversao, .sel()
            # pegava o ponto errado (borda oeste da grade, oceano, valor
            # ~0 sempre), o que gerou a razao MERGE/INMET de 0,01-0,23
            # (bug, nao diferenca real de fonte).
            longitude_grid = municipio["lon"] % 360
            valor = campo_prec.sel(
                latitude=municipio["lat"], longitude=longitude_grid, method="nearest"
            ).item()
            registros.append({
                "codigo_ibge": municipio["codigo_ibge"],
                "arquivo": os.path.basename(caminho),
                "precipitacao_dia_mm": valor,
            })

        ds.close()

    if n_falha_leitura > 0:
        print(f"      [AVISO] {n_falha_leitura} arquivo(s) não puderam ser lidos.")

    return pd.DataFrame(registros)


# --------------------------------------------------------------------------
# 4-5. Agregar (máximo do mês) e comparar com INMET
# --------------------------------------------------------------------------
def agregar_e_comparar(diario: pd.DataFrame, municipios: pd.DataFrame) -> pd.DataFrame:
    print("\n[4/5] Agregando: máximo mensal de precipitação por município (MERGE)...")

    mensal_merge = diario.groupby("codigo_ibge", as_index=False).agg(
        precipitacao_max_mes_merge=("precipitacao_dia_mm", "max"),
        n_dias_lidos=("precipitacao_dia_mm", "count"),
    )

    comparacao = municipios.merge(mensal_merge, on="codigo_ibge", how="left")
    comparacao = comparacao.rename(columns={"precipitacao_max_mes": "precipitacao_max_mes_inmet"})
    comparacao["diferenca_mm"] = (
        comparacao["precipitacao_max_mes_merge"] - comparacao["precipitacao_max_mes_inmet"]
    )
    comparacao["razao_merge_sobre_inmet"] = (
        comparacao["precipitacao_max_mes_merge"] / comparacao["precipitacao_max_mes_inmet"]
    )

    print("\n[5/5] Comparação MERGE (ponto de grade mais próximo do centroide) x INMET "
          f"(estação real) — pico de precipitação, {ANO_TESTE}-{MES_TESTE:02d}:")
    colunas_exibir = [
        "nome", "uf", "regiao", "precipitacao_max_mes_inmet", "precipitacao_max_mes_merge",
        "diferenca_mm", "razao_merge_sobre_inmet", "n_dias_lidos",
    ]
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(comparacao[colunas_exibir].round(2).to_string(index=False))

    print("\nLEITURA: não esperar valores idênticos (fontes diferentes - MERGE é satélite+gauge "
          "interpolado num ponto de grade ~11km de lado; INMET é a estação pontual real). Um "
          "resultado plausível: mesma ORDEM DE GRANDEZA, sem viés sistemático grosseiro (ex.: "
          "MERGE não deveria estar em outra escala completamente, tipo 10x menor/maior). Se a "
          "razão merge/inmet variar muito e sem padrão claro, revisitar antes de escalar para "
          "cobertura nacional.")

    return comparacao


def main():
    print("Prova de conceito: MERGE/CPTEC-INPE (precipitação) x INMET, por município/mês")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)
    municipios = selecionar_municipios_teste(engine)

    caminhos_grib = baixar_mes_merge()
    diario = extrair_precipitacao_diaria_por_municipio(caminhos_grib, municipios)
    agregar_e_comparar(diario, municipios)

    print("\n✅ Prova de conceito concluída (somente leitura quanto ao banco do projeto).")


if __name__ == "__main__":
    main()
