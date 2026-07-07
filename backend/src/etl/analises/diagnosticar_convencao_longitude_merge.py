"""
DIAGNÓSTICO PONTUAL: a grade do MERGE usa longitude em -180/180 ou 0/360?
================================================================================
CONTEXTO: prova_conceito_merge_precipitacao_x_inmet.py deu razão MERGE/INMET
entre 0,01 e 0,23 - muito abaixo do plausível (esperava-se mesma ordem de
grandeza, não 10-100x menor). Hipótese: o `.ctl` do MERGE descreve longitude
como `-120.05 a -20.05` (convenção -180/180), mas o GRIB2 real pode estar
armazenado em 0-360° (convenção comum em GRIB, diferente da usada pelo `.ctl`
do GrADS) - se for esse o caso, `.sel(longitude=-43.2, method="nearest")`
estaria pegando o ponto de grade MAIS PRÓXIMO NUMERICAMENTE de -43.2 dentro
de um array todo positivo (240 a 340), ou seja, o menor valor do array
(~240, equivalente a -120° na convenção correta) - bem longe do Brasil.

Este script só abre 1 arquivo já baixado e imprime o range real de latitude/
longitude, sem nenhuma suposição.
================================================================================
"""

import xarray as xr

CAMINHO = "backend/src/etl/data/raw/inpe_merge/2024/01/MERGE_CPTEC_20240115.grib2"

ds = xr.open_dataset(CAMINHO, engine="cfgrib")

print(f"longitude: min={float(ds.longitude.min()):.3f}  max={float(ds.longitude.max()):.3f}")
print(f"latitude:  min={float(ds.latitude.min()):.3f}  max={float(ds.latitude.max()):.3f}")
print(f"\nprimeiros 5 valores de longitude: {ds.longitude.values[:5]}")
print(f"últimos 5 valores de longitude:   {ds.longitude.values[-5:]}")

# Teste direto: Salvador (BA), lat=-12.97, lon=-38.51 (aprox.)
nome_var = list(ds.data_vars)[0]
campo = ds[nome_var]

ponto_convencao_180 = campo.sel(latitude=-12.97, longitude=-38.51, method="nearest")
ponto_convencao_360 = campo.sel(latitude=-12.97, longitude=360 - 38.51, method="nearest")

print(f"\nSalvador via longitude=-38.51 (convenção -180/180): "
      f"lat_encontrada={float(ponto_convencao_180.latitude):.2f} "
      f"lon_encontrada={float(ponto_convencao_180.longitude):.2f} valor={float(ponto_convencao_180):.3f}")
print(f"Salvador via longitude={360-38.51:.2f} (convenção 0/360):      "
      f"lat_encontrada={float(ponto_convencao_360.latitude):.2f} "
      f"lon_encontrada={float(ponto_convencao_360.longitude):.2f} valor={float(ponto_convencao_360):.3f}")
