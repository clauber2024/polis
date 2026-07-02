import os, sys, requests, warnings
warnings.filterwarnings("ignore")
from shapely.geometry import shape
from shapely.ops import transform
from shapely.wkb import dumps as wkb_dumps
from sqlalchemy import create_engine, text
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
CODIGO = "1200401"
URL = "https://rbgeo.riobranco.ac.gov.br/server/rest/services/Hosted/Favelas_e_Comunidades_urbanas_e_ZEIS/FeatureServer/0"

def main():
    print("Seed ZEIS Rio Branco")
    r = requests.get(URL + "/query?where=1=1&outFields=*&f=geojson", timeout=60, verify=False)
    features = r.json().get("features", [])
    print(f"  {len(features)} ZEIS baixadas")
    engine = create_engine(DATABASE_URL)
    sql = text("""INSERT INTO unidades_espaciais (id,tipo,codigo_original,municipio_pai_codigo_ibge,nome_exibicao,geom) VALUES (:id,:tipo,:cod,:mun,:nome,ST_SetSRID(ST_GeomFromWKB(:geom),4674)) ON CONFLICT (id) DO UPDATE SET nome_exibicao=EXCLUDED.nome_exibicao,geom=EXCLUDED.geom""")
    inseridos = 0
    for f in features:
        props = f.get("properties", {})
        geom_raw = f.get("geometry")
        if not geom_raw: continue
        geom = shape(geom_raw).simplify(0.0001, preserve_topology=True)
        fid = props.get("fid") or props.get("FID") or 0
        area_ha = round((props.get("SHAPE__Area") or 0)/10000, 1)
        geom_2d = transform(lambda x, y, z=None: (x, y), geom)
        geom_wkb = wkb_dumps(geom_2d, hex=False)
        with engine.begin() as con:
            con.execute(sql, {"id": f"zeis:{CODIGO}_{fid}", "tipo": "zeis", "cod": str(fid), "mun": CODIGO, "nome": f"AEIS Rio Branco {area_ha}ha"[:150], "geom": geom_wkb})
        inseridos += 1
    print(f"  {inseridos} ZEIS inseridas")
    with engine.connect() as con:
        total = con.execute(text("SELECT count(*) FROM unidades_espaciais WHERE tipo = 'zeis'")).scalar()
    print(f"  Total ZEIS: {total}")

if __name__ == "__main__":
    main()
