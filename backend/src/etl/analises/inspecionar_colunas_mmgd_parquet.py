"""
INSPEÇÃO (não grava nada): lista as colunas do Parquet bruto de MMGD/ANEEL e,
para qualquer coluna que pareça indicar classe/subclasse de consumo ou tipo
de uso, imprime a contagem de valores únicos.

Objetivo: confirmar os nomes REAIS das colunas antes de tentar separar
MMGD residencial de MMGD rural/irrigação — mesmo cuidado já documentado em
ARQUITETURA.md para o caso do TSEE (dicionário oficial desatualizado em
relação ao dado real).
"""

import os

import pandas as pd

CAMINHO_PARQUET = os.environ.get(
    "CAMINHO_PARQUET",
    "backend/src/etl/data/raw/aneel_mmgd/empreendimento-geracao-distribuida.parquet",
)

PALAVRAS_CHAVE = ["clas", "tipo", "grupo", "modal", "subgrupo", "fonte", "porte", "atividade"]

print(f"Lendo: {CAMINHO_PARQUET}")
df = pd.read_parquet(CAMINHO_PARQUET)

print(f"\n{len(df)} linhas, {len(df.columns)} colunas.\n")
print("Todas as colunas:")
for col in df.columns:
    print(f"  - {col}")

print("\n" + "=" * 78)
print("Colunas candidatas a classificação de uso (nome contém uma das palavras-chave):")
print("=" * 78)

for col in df.columns:
    if any(palavra in col.lower() for palavra in PALAVRAS_CHAVE):
        print(f"\n--- {col} ({df[col].dtype}) ---")
        print(df[col].value_counts(dropna=False).head(30).to_string())
