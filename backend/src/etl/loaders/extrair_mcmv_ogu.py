import os, sys, urllib.request, zipfile
import pandas as pd
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
ZIP_URL = "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/programa-minha-casa-minha-vida/arquivos/view_dados_abertos_ogu_202603201556.zip"
ZIP_LOCAL = "/tmp/mcmv_ogu.zip"
CSV_LOCAL = "/tmp/mcmv_ogu/view_dados_abertos_ogu_202603201556.csv"
PERIODO_REFERENCIA = "2025-12-31"

def main():
    print("Extractor MCMV/OGU - Empreendimentos Subsidiados")
    print("=" * 70)
    if not os.path.exists(CSV_LOCAL):
        print("[1/3] Baixando ZIP do Ministerio das Cidades...")
        urllib.request.urlretrieve(ZIP_URL, ZIP_LOCAL)
        os.makedirs("/tmp/mcmv_ogu", exist_ok=True)
        with zipfile.ZipFile(ZIP_LOCAL) as z:
            z.extractall("/tmp/mcmv_ogu")
    else:
        print("[1/3] Usando CSV local:", CSV_LOCAL)
    df = pd.read_csv(CSV_LOCAL, sep=";", encoding="latin1", dtype={"cod_ibge": str})
    df_validos = df[~df["txt_situacao_empreendimento"].str.strip().isin(["Distratado/Cancelado"])]
    df_validos = df_validos.copy()
    df_validos["cod6"] = df_validos["cod_ibge"].astype(str).str.strip().str.zfill(6).str[:6]
    df_validos["qtd_uh"] = pd.to_numeric(df_validos["qtd_uh"], errors="coerce").fillna(0).astype(int)
    df_validos["qtd_uh_entregues"] = pd.to_numeric(df_validos["qtd_uh_entregues"], errors="coerce").fillna(0).astype(int)
    agregado = df_validos.groupby("cod6").agg(
        empreendimentos_ogu=("cod_operacao", "count"),
        unidades_ogu_previstas=("qtd_uh", "sum"),
        unidades_ogu_entregues=("qtd_uh_entregues", "sum"),
    ).reset_index()
    print(f"[2/3] {len(agregado)} municipios com MCMV/OGU. {int(agregado['empreendimentos_ogu'].sum()):,} empreendimentos, {int(agregado['unidades_ogu_entregues'].sum()):,} UH entregues.")
    engine = create_engine(DATABASE_URL)
    with engine.connect() as con:
        muns = pd.read_sql(text("SELECT codigo_ibge FROM municipios"), con)
    muns["cod6"] = muns["codigo_ibge"].str[:6]
    mapa = dict(zip(muns["cod6"], muns["codigo_ibge"]))
    agregado["codigo_ibge"] = agregado["cod6"].map(mapa)
    sem_match = int(agregado["codigo_ibge"].isna().sum())
    if sem_match > 0:
        print(f"    [AVISO] {sem_match} municipios sem match -- ignorados")
    validos = agregado[agregado["codigo_ibge"].notna()].copy()
    print(f"[3/3] Inserindo {len(validos)} municipios...")
    sql = text("INSERT INTO indicadores_sociais (unidade_espacial_id, periodo_referencia, empreendimentos_ogu, unidades_ogu_previstas, unidades_ogu_entregues) VALUES (:uid, :per, :emp, :prev, :ent) ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET empreendimentos_ogu=EXCLUDED.empreendimentos_ogu, unidades_ogu_previstas=EXCLUDED.unidades_ogu_previstas, unidades_ogu_entregues=EXCLUDED.unidades_ogu_entregues")
    inseridos, falhas = 0, []
    for _, row in validos.iterrows():
        try:
            uid = "municipio:" + str(row["codigo_ibge"])
            with engine.begin() as con:
                con.execute(sql, {"uid": uid, "per": PERIODO_REFERENCIA, "emp": int(row["empreendimentos_ogu"]), "prev": int(row["unidades_ogu_previstas"]), "ent": int(row["unidades_ogu_entregues"])})
            inseridos += 1
        except Exception as e:
            falhas.append((row["codigo_ibge"], str(e)[:80]))
    print(f"    {inseridos} municipios inseridos. Falhas: {len(falhas)}")
    if falhas:
        for c, e in falhas[:5]:
            print(f"      - {c}: {e}")
    print("Extractor MCMV/OGU concluido.")

if __name__ == "__main__":
    main()
