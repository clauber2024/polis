import os, sys
import geopandas as gpd
from shapely.wkb import dumps as wkb_dumps
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
SHAPEFILE_PATH = os.environ.get("FCU_SHAPEFILE", "/tmp/poligonos_FCUs/qg_2022_670_fcu_agreg.shp")
SIMPLIFY_TOLERANCE = 0.0001

def main():
    print("Seed de Favelas e Comunidades Urbanas -> unidades_espaciais")
    print("=" * 70)
    if not os.path.exists(SHAPEFILE_PATH):
        print(f"[ERRO] Shapefile nao encontrado: {SHAPEFILE_PATH}")
        sys.exit(1)
    print(f"[1/3] Lendo shapefile...")
    gdf = gpd.read_file(SHAPEFILE_PATH)
    gdf["cd_mun"] = gdf["cd_mun"].astype(str).str.zfill(7)
    gdf = gdf[gdf["cd_fcu"].notna() & gdf["cd_mun"].notna() & gdf["geometry"].notna()].copy()
    print(f"      {len(gdf)} FCUs validas.")
    print(f"      Simplificando geometrias...")
    gdf["geometry"] = gdf["geometry"].simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
    engine = create_engine(DATABASE_URL)
    print("[2/3] Verificando municipios existentes...")
    with engine.connect() as con:
        codigos_validos = {r[0] for r in con.execute(text("SELECT codigo_ibge FROM municipios"))}
    gdf = gdf[gdf["cd_mun"].isin(codigos_validos)].copy()
    invalidos = len(gdf[~gdf["cd_mun"].isin(codigos_validos)]) if False else 0
    print(f"      {len(gdf)} FCUs com municipio pai valido.")
    sql = text("""
        INSERT INTO unidades_espaciais
            (id, tipo, codigo_original, municipio_pai_codigo_ibge, nome_exibicao, geom)
        VALUES
            (:id, :tipo, :codigo_original, :municipio_pai_codigo_ibge, :nome_exibicao,
             ST_SetSRID(ST_GeomFromWKB(:geom), 4674))
        ON CONFLICT (id) DO UPDATE SET
            nome_exibicao = EXCLUDED.nome_exibicao,
            geom = EXCLUDED.geom
    """)
    print(f"[3/3] Inserindo {len(gdf)} FCUs em unidades_espaciais...")
    total = len(gdf)
    inseridos = 0
    falhas = []
    for i, (_, row) in enumerate(gdf.iterrows()):
        uid = f"favela_comunidade_urbana:{row['cd_fcu']}"
        try:
            geom_wkb = wkb_dumps(row["geometry"], hex=False)
            with engine.begin() as con:
                con.execute(sql, {
                    "id": uid,
                    "tipo": "favela_comunidade_urbana",
                    "codigo_original": row["cd_fcu"],
                    "municipio_pai_codigo_ibge": row["cd_mun"],
                    "nome_exibicao": row["nm_fcu"],
                    "geom": geom_wkb,
                })
            inseridos += 1
        except Exception as e:
            falhas.append((row["cd_fcu"], str(e)[:100]))
        if (i + 1) % 1000 == 0 or (i + 1) == total:
            print(f"      ... {i + 1}/{total} FCUs processadas")
    print(f"      {inseridos} FCU(s) inseridas/atualizadas com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} falhas:")
        for cd, err in falhas[:10]:
            print(f"        - {cd}: {err}")
    with engine.connect() as con:
        total_fcu = con.execute(text("SELECT count(*) FROM unidades_espaciais WHERE tipo = 'favela_comunidade_urbana'")).scalar()
    print(f"\n      Total de FCUs em unidades_espaciais: {total_fcu}")
    print("\n Seed de FCUs concluido.")

if __name__ == "__main__":
    main()
