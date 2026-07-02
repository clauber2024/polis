"""
SEED: unidades_espaciais - ZEIS do Recife (tipo='zeis')
Fonte: Portal eSIG Recife / ArcGIS FeatureServer (Plano Diretor Lei 18.770/2020)
URL: https://esigportal2.recife.pe.gov.br/arcgis/rest/services/MeioAmbiente/MA_PlanoDiretor/FeatureServer/3
76 ZEIS (69 ZEIS + 7 ZEISII). SSL desabilitado (certificado invalido do servidor).
Recife e pioneira historica das ZEIS no Brasil (PREZEIS, anos 1980).
"""
import os, sys, requests, warnings
warnings.filterwarnings('ignore')
from shapely.geometry import shape
from shapely.ops import transform
from shapely.wkb import dumps as wkb_dumps
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
CODIGO_IBGE_RECIFE = "2611606"
SIMPLIFY_TOLERANCE = 0.0001
BASE_URL = "https://esigportal2.recife.pe.gov.br/arcgis/rest/services/MeioAmbiente/MA_PlanoDiretor/FeatureServer/3"

def baixar_zeis():
    print("[1/3] Baixando ZEIS do Recife via eSIG/ArcGIS...")
    url_count = f"{BASE_URL}/query?where=1=1&returnCountOnly=true&f=json"
    r = requests.get(url_count, timeout=30, verify=False)
    total = r.json().get("count", 0)
    print(f"      Total de ZEIS: {total}")
    url_all = f"{BASE_URL}/query?where=1=1&outFields=*&f=geojson&resultRecordCount={total}"
    r = requests.get(url_all, timeout=60, verify=False)
    if r.status_code != 200:
        print(f"      [ERRO] Status {r.status_code}")
        sys.exit(1)
    features = r.json().get("features", [])
    print(f"      {len(features)} ZEIS recebidas.")
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
        objectid = props.get("OBJECTID_1") or props.get("OBJECTID")
        nome = (props.get("NMNOME") or props.get("CDTIPO") or f"ZEIS-{objectid}").strip()
        tipo_zeis = (props.get("CDTIPO") or "ZEIS").strip()
        registros.append({
            "id": f"zeis:{CODIGO_IBGE_RECIFE}_{objectid}",
            "codigo_original": str(objectid),
            "nome_exibicao": f"{tipo_zeis} - {nome}"[:150],
            "geom": geom,
        })
    if sem_geom > 0:
        print(f"      [AVISO] {sem_geom} ZEIS sem geometria — descartadas.")
    print(f"      {len(registros)} ZEIS validas.")
    return registros

def executar_seed(engine, registros):
    print(f"[3/3] Inserindo {len(registros)} ZEIS em unidades_espaciais...")
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
                    "municipio_pai_codigo_ibge": CODIGO_IBGE_RECIFE,
                    "nome_exibicao": rec["nome_exibicao"],
                    "geom": geom_wkb,
                })
            inseridos += 1
        except Exception as e:
            falhas.append((rec["id"], str(e)[:100]))
    print(f"      {inseridos} ZEIS inseridas com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} falhas:")
        for uid, err in falhas[:5]:
            print(f"        - {uid}: {err}")

def main():
    print("Seed de ZEIS do Recife -> unidades_espaciais (tipo='zeis')")
    print("=" * 70)
    engine = create_engine(DATABASE_URL)
    features = baixar_zeis()
    registros = processar_features(features)
    executar_seed(engine, registros)
    with engine.connect() as con:
        total = con.execute(text("SELECT count(*) FROM unidades_espaciais WHERE tipo = 'zeis'")).scalar()
    print(f"\n      Total de ZEIS em unidades_espaciais: {total}")
    print("\nSeed de ZEIS/Recife concluido.")

if __name__ == "__main__":
    main()
