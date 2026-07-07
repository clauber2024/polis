"""
CONSOLIDAÇÃO: junta os parquets por mês (checkpoint) de MERGE e ERA5 num
único arquivo por variável, para uso em investigar_clima_ressarcimento_
cobertura_nacional.py
================================================================================
CONTEXTO: escalar_merge_precipitacao_nacional.py e escalar_era5_vento_
nacional.py salvam 1 arquivo Parquet POR MÊS (checkpoint - ver ARQUITETURA.md
sobre o crash de 08/07/2026 que motivou isso), não 1 arquivo único. Este
script simplesmente concatena os parquets de cada pasta em 1 arquivo final,
no formato que o script de correlação espera.

Pode ser rodado a qualquer momento, mesmo com os scripts de escala ainda
incompletos (2024-2025) - vai consolidar só os meses que já existem. Rodar de
novo depois de mais meses ficarem prontos simplesmente refaz a consolidação
(idempotente, sem custo real - só concatenar parquets pequenos).
================================================================================
"""

import glob
import os

import pandas as pd

CAMINHO_POR_MES_PRECIPITACAO = os.environ.get(
    "CAMINHO_POR_MES_PRECIPITACAO", "backend/src/etl/data/raw/clima_nacional/precipitacao_por_mes"
)
CAMINHO_POR_MES_VENTO = os.environ.get(
    "CAMINHO_POR_MES_VENTO", "backend/src/etl/data/raw/clima_nacional/vento_por_mes"
)
CAMINHO_SAIDA_PRECIPITACAO = os.environ.get(
    "CAMINHO_SAIDA_PRECIPITACAO",
    "backend/src/etl/data/raw/clima_nacional/precipitacao_max_mes_municipio.parquet",
)
CAMINHO_SAIDA_VENTO = os.environ.get(
    "CAMINHO_SAIDA_VENTO",
    "backend/src/etl/data/raw/clima_nacional/vento_rajada_max_mes_municipio.parquet",
)


def consolidar(pasta_por_mes: str, caminho_saida: str, rotulo: str) -> None:
    arquivos = sorted(glob.glob(os.path.join(pasta_por_mes, "*.parquet")))
    if not arquivos:
        print(f"[AVISO] Nenhum parquet encontrado em {pasta_por_mes} para {rotulo} - pulando.")
        return

    print(f"Consolidando {rotulo}: {len(arquivos)} mês(es) encontrado(s) em {pasta_por_mes}...")
    partes = [pd.read_parquet(arquivo) for arquivo in arquivos]
    consolidado = pd.concat(partes, ignore_index=True)

    os.makedirs(os.path.dirname(caminho_saida), exist_ok=True)
    consolidado.to_parquet(caminho_saida, index=False)

    n_municipios = consolidado["codigo_ibge"].nunique()
    meses_presentes = sorted(consolidado[["ano", "mes"]].drop_duplicates().apply(tuple, axis=1).tolist())
    print(f"  {len(consolidado)} linha(s), {n_municipios} município(s) distinto(s).")
    print(f"  Meses presentes: {meses_presentes[0]} até {meses_presentes[-1]} "
          f"({len(meses_presentes)} mês(es) de {24} esperados para 2024-2025).")
    print(f"  Salvo em {caminho_saida}\n")


def main():
    print("Consolidação dos parquets climáticos por mês (MERGE + ERA5)")
    print("=" * 78)
    consolidar(CAMINHO_POR_MES_PRECIPITACAO, CAMINHO_SAIDA_PRECIPITACAO, "precipitação (MERGE)")
    consolidar(CAMINHO_POR_MES_VENTO, CAMINHO_SAIDA_VENTO, "vento (ERA5)")
    print("✅ Concluído.")


if __name__ == "__main__":
    main()
