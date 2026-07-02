import os, sys
import pandas as pd
from sqlalchemy import create_engine, text
import urllib.request

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
CSV_URL = "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/programa-minha-casa-minha-vida/arquivos/dados_abertos_FGTS_SINTETICO_202512.csv"
CSV_LOCAL = "/tmp/mcmv_fgts_sintetico.csv"
PERIODO_REFERENCIA = "2025-12-01"

def main():
    print("Extractor MCMV/FGTS - Unidades Habitacionais de Interesse Social")
    print("=" * 70)
    if not os.path.exists(CSV_LOCAL):
        print("[1/3] Baixando CSV do Ministerio das Cidades...")
        urllib.request.urlretrieve(CSV_URL, CSV_LOCAL)
    else:
        print("[1/3] Usando CSV local:", CSV_LOCAL)
    df = pd.read_csv(CSV_LOCAL, sep=";", encoding="latin1", dtype={"cod_ibge": str})
    df["cod6"] = df["cod_ibge"].str.replace(".", "").str.strip().str.zfill(6)
    df["qtd"] = pd.to_numeric(df["qtd_uh_financiadas"].astype(str).str.replace(".", "").str.replace(",", "."), errors="coerce").fillna(0).astype(int)
    agregado = df.groupby("cod6").agg(unidades_habitacionais_fgts=("qtd", "sum")).reset_index()
    total_uh = int(agregado["unidades_habitacionais_fgts"].sum())
    print(f"[2/3] {len(agregado)} municipios com MCMV/FGTS. Total UH: {total_uh:,}")
    engine = create_engine(DATABASE_URL)
    with engine.connect() as con:
        muns = pd.read_sql(text("SELECT codigo_ibge FROM municipios"), con)
    muns["cod6"] = muns["codigo_ibge"].str[:6]
    mapa = dict(zip(muns["cod6"], muns["codigo_ibge"]))
    agregado["codigo_ibge"] = agregado["cod6"].map(mapa)
    sem_match = int(agregado["codigo_ibge"].isna().sum())
    if sem_match > 0:
        print(f"    [AVISO] {sem_match} municipios sem match no banco -- ignorados")
    validos = agregado[agregado["codigo_ibge"].notna()].copy()
    print(f"[3/3] Inserindo {len(validos)} municipios...")
    sql = text("INSERT INTO indicadores_sociais (unidade_espacial_id, periodo_referencia, unidades_habitacionais_fgts) VALUES (:uid, :per, :uh) ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET unidades_habitacionais_fgts = EXCLUDED.unidades_habitacionais_fgts")
    inseridos, falhas = 0, []
    for _, row in validos.iterrows():
        try:
            uid = "municipio:" + str(row["codigo_ibge"])
            with engine.begin() as con:
                con.execute(sql, {"uid": uid, "per": PERIODO_REFERENCIA, "uh": int(row["unidades_habitacionais_fgts"])})
            inseridos += 1
        except Exception as e:
            falhas.append((row["codigo_ibge"], str(e)[:80]))
    print(f"    {inseridos} municipios inseridos. Falhas: {len(falhas)}")
    if falhas:
        for c, e in falhas[:5]:
            print(f"      - {c}: {e}")
    print("Extractor MCMV/FGTS concluido.")

if __name__ == "__main__":
    main()
