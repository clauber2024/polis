"""
SEED: unidades_espaciais — AEIS do Rio de Janeiro (tipo='zeis')
Fonte: DATA.RIO / ArcGIS Hub, AEIS-SMPU
URL: https://datario-pcrj.hub.arcgis.com/datasets/98fc248a56724688b06d6611bdb2524d_0.geojson
1.045 poligonos (Polygon + MultiPolygon), todas as tipologias incluidas.
Nota: Rio de Janeiro usa 'AEIS' (Area de Especial Interesse Social), nao 'ZEIS'.
O tipo='zeis' e usado como padrao no Atlas para esse instrumento, independente
da nomenclatura local de cada municipio.
"""
import os, sys, requests
import geopandas as gpd
from shapely.geometry import shape
from shapely.wkb import dumps as wkb_dumps
from shapely.ops import transform
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
GEOJSON_URL = "https://datario-pcrj.hub.arcgis.com/datasets/98fc248a56724688b06d6611bdb2524d_0.geojson"
CODIGO_IBGE_RIO = "3304557"
SIMPLIFY_TOLERANCE = 0.0001

def baixar_geojson():
    print("[1/3] Baixando AEIS do Rio de Janeiro via DATA.RIO...")
    r = requests.get(GEOJSON_URL, timeout=120)
    if r.status_code == 202:
        print("      [ERRO] Servidor ainda gerando o arquivo (202 Pending).")
        print("      Aguarde alguns minutos e tente novamente.")
        sys.exit(1)
    if r.status_code != 200:
        print(f"      [ERRO] Status {r.status_code}: {r.text[:200]}")
        sys.exit(1)
    dados = r.json()
    features = dados.get("features", [])
    print(f"      {len(features)} AEIS baixadas.")
    return features

def processar_features(features):
    print("[2/3] Processando geometrias...")
    registros = []
    sem_geom = 0
    for f in features:
        props = f.get("properties", {})
        geom_raw = f.get("geometry")
        if not geom_raw:
            sem_geom += 1
            continue
        geom = shape(geom_raw).simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        if geom.is_empty:
            sem_geom += 1
            continue
        objectid = props.get("objectid") or props.get("OBJECTID")
        nome = (props.get("nome") or props.get("nome_do_ar") or f"AEIS-RIO-{objectid}").strip()
        tipologia = (props.get("tipologia") or "SEM INFORMACAO").strip()
        legislacao = (props.get("legislacao") or "").strip()
        registros.append({
            "id": f"zeis:{CODIGO_IBGE_RIO}_{objectid}",
            "codigo_original": str(objectid),
            "nome_exibicao": nome[:150],
            "tipologia": tipologia,
            "legislacao": legislacao,
            "geom": geom,
        })
    if sem_geom > 0:
        print(f"      [AVISO] {sem_geom} AEIS sem geometria valida — descartadas.")
    print(f"      {len(registros)} AEIS com geometria valida.")
    return registros

def executar_seed(engine, registros):
    print(f"[3/3] Inserindo {len(registros)} AEIS em unidades_espaciais...")
    sql = text("""
        INSERT INTO unidades_espaciais
            (id, tipo, codigo_original, municipio_pai_codigo_ibge, nome_exibicao, geom)
        VALUES
            (:id, 'zeis', :codigo_original, :municipio_pai_codigo_ibge, :nome_exibicao,
             ST_SetSRID(ST_GeomFromWKB(:geom), 4674))
        ON CONFLICT (id) DO UPDATE SET
            nome_exibicao = EXCLUDED.nome_exibicao,
            geom = EXCLUDED.geom
    """)
    total = len(registros)
    inseridos = 0
    falhas = []
    for i, rec in enumerate(registros):
        try:
            geom_2d = transform(lambda x, y, z=None: (x, y), rec["geom"])
            geom_wkb = wkb_dumps(geom_2d, hex=False)
            with engine.begin() as con:
                con.execute(sql, {
                    "id": rec["id"],
                    "codigo_original": rec["codigo_original"],
                    "municipio_pai_codigo_ibge": CODIGO_IBGE_RIO,
                    "nome_exibicao": rec["nome_exibicao"],
                    "geom": geom_wkb,
                })
            inseridos += 1
        except Exception as e:
            falhas.append((rec["id"], str(e)[:100]))
        if (i + 1) % 200 == 0 or (i + 1) == total:
            print(f"      ... {i + 1}/{total} AEIS processadas")
    print(f"      {inseridos} AEIS inseridas/atualizadas com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} falhas:")
        for uid, err in falhas[:5]:
            print(f"        - {uid}: {err}")

def main():
    print("Seed de AEIS do Rio de Janeiro -> unidades_espaciais (tipo='zeis')")
    print("=" * 70)
    engine = create_engine(DATABASE_URL)
    with engine.connect() as con:
        existe = con.execute(text("SELECT 1 FROM municipios WHERE codigo_ibge = :c"), {"c": CODIGO_IBGE_RIO}).fetchone()
    if not existe:
        print(f"[ERRO] Municipio {CODIGO_IBGE_RIO} (Rio de Janeiro) nao encontrado na base territorial.")
        sys.exit(1)
    features = baixar_geojson()
    registros = processar_features(features)
    executar_seed(engine, registros)
    with engine.connect() as con:
        total = con.execute(text("SELECT count(*) FROM unidades_espaciais WHERE tipo = 'zeis'")).scalar()
    print(f"\n      Total de ZEIS/AEIS em unidades_espaciais: {total}")
    print("\nSeed de AEIS/Rio de Janeiro concluido.")

if __name__ == "__main__":
    main()
