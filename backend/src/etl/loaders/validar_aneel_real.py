"""
VALIDAÇÃO (sem escrita no banco) — testa a extração e agregação completas
com o arquivo real da ANEEL antes de rodar o upsert de verdade.
"""
import sys
sys.path.insert(0, '.')
sys.path.insert(0, 'backend/src/etl/loaders')

from extrair_mmgd_aneel import carregar_dados, extrair_periodo_referencia, agregar_por_municipio

CAMINHO = "backend/src/etl/data/raw/aneel_mmgd/empreendimento-geracao-distribuida.parquet"

df = carregar_dados(CAMINHO)
periodo = extrair_periodo_referencia(df)
agregado = agregar_por_municipio(df)

print()
print("--- Checagens de sanidade ---")

# Checa nulos em colunas críticas
nulos_municipio = df['CodMunicipioIbge'].isna().sum()
nulos_potencia = df['MdaPotenciaInstaladaKW'].isna().sum()
nulos_ucs = df['QtdUCRecebeCredito'].isna().sum()
print(f"Linhas com CodMunicipioIbge nulo: {nulos_municipio}")
print(f"Linhas com MdaPotenciaInstaladaKW nulo: {nulos_potencia}")
print(f"Linhas com QtdUCRecebeCredito nulo: {nulos_ucs}")

# Checa valores negativos ou zero suspeitos
negativos = (df['MdaPotenciaInstaladaKW'] <= 0).sum()
print(f"Linhas com potência <= 0: {negativos}")

# Top 5 municípios por potência agregada (para conferência visual de sanidade)
top5 = agregado.nlargest(5, 'potencia_instalada_kw')
print()
print("Top 5 municípios por potência instalada (kW):")
print(top5.to_string())

# Confere se algum código IBGE tem formato estranho (não 7 dígitos após zfill)
agregado_codigos_invalidos = agregado[agregado['codigo_ibge'].str.len() != 7]
print()
print(f"Códigos IBGE com tamanho != 7 após normalização: {len(agregado_codigos_invalidos)}")
if len(agregado_codigos_invalidos) > 0:
    print(agregado_codigos_invalidos.head(10).to_string())

print()
print("FIM DA VALIDACAO — nenhuma escrita foi feita no banco.")
