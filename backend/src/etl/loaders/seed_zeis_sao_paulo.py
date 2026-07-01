"""
SEED: unidades_espaciais - ZEIS de Sao Paulo (tipo='zeis')
Fonte: GeoSampa (geosampa.prefeitura.sp.gov.br), 3 arquivos GeoJSON:
- geoportal_pde2014_v_zeis_04_map_v2.geojson  (ZEIS-1, 1401 poligonos)
- geoportal_pde2014_v_zeis_04a_map_v2.geojson (ZEIS-2/3/4/5, 1170 poligonos)
- geoportal_aiu_vl_zeis1.geojson              (ZEIS-1 via Lei AIU-VL, 3 poligonos)
NAO incluido: geoportal_zeis_revogada_v2.geojson (ZEIS revogadas - nao sao mais ZEIS)
Total esperado: 2.574 ZEIS ativas.
"""
import os, sys, json
from shapely.geometry import shape
from shapely.ops import transform
from shapely.wkb import dumps as wkb_dumps
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
CODIGO_IBGE_SP = "3550308"
SIMPLIFY_TOLERANCE = 0.0001
BASE_DOWNLOADS = "/mnt/c/Users/Rosana Santos/Downloads"
ARQUIVOS = [
    "geoportal_pde2014_v_zeis_04_map_v2.geojson",
    "geoportal_pde2014_v_zeis_04a_map_v2.geojson",
    "geoportal_aiu_vl_zeis1.geojson",
]

def processar_arquivos():
    print("[1/3] Lendo arquivos GeoJSON...")
    registros = []
    for arq in ARQUIVOS:
        path = os.path.join(BASE_DOWNLOADS, arq)
        if not os.path.exists(path):
            print(f"      [ERRO] Arquivo nao encontrado: {path}")
            sys.exit(1)
        with open(path) as f:
            dados = json.load(f)
        features = dados.get("features", [])
        print(f"      {arq}: {len(features)} features")
        for ft in features:
            props = ft.get("properties", {})
            geom_raw = ft.get("geometry")
            if not geom_raw:
                continue
            geom = shape(geom_raw).simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
            if geom.is_empty:
                continue
            cd_id = props.get("cd_identificador") or props.get("objectid")
            tipo_zeis = (props.get("cd_zoneamento_perimetro") or
                        props.get("tx_tipo_camada") or "ZEIS").strip()
            nome = (props.get("tx_zoneamento_perimetro") or
                   props.get("nm_aiu") or tipo_zeis).strip()
            registros.append({
                "id": f"zeis:{CODIGO_IBGE_SP}_{cd_id}",
                "codigo_original": str(cd_id),
                "nome_exibicao": nome[:150],
                "geom": geom,
            })
    print(f"      Total: {len(registros)} ZEIS validas.")
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
                    "municipio_pai_codigo_ibge": CODIGO_IBGE_SP,
                    "nome_exibicao": rec["nome_exibicao"],
                    "geom": geom_wkb,
                })
            inseridos += 1
        except Exception as e:
            falhas.append((rec["id"], str(e)[:100]))
        if (i + 1) % 500 == 0 or (i + 1) == total:
            print(f"      ... {i + 1}/{total} ZEIS processadas")
    print(f"      {inseridos} ZEIS inseridas/atualizadas com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} falhas:")
        for uid, err in falhas[:5]:
            print(f"        - {uid}: {err}")

def main():
    print("Seed de ZEIS de Sao Paulo -> unidades_espaciais (tipo='zeis')")
    print("=" * 70)
    engine = create_engine(DATABASE_URL)
    with engine.connect() as con:
        existe = con.execute(text("SELECT 1 FROM municipios WHERE codigo_ibge = :c"), {"c": CODIGO_IBGE_SP}).fetchone()
    if not existe:
        print(f"[ERRO] Municipio {CODIGO_IBGE_SP} nao encontrado.")
        sys.exit(1)
    registros = processar_arquivos()
    print("[2/3] Municipio pai validado.")
    executar_seed(engine, registros)
    with engine.connect() as con:
        total = con.execute(text("SELECT count(*) FROM unidades_espaciais WHERE tipo = 'zeis'")).scalar()
    print(f"\n      Total de ZEIS em unidades_espaciais: {total}")
    print("\nSeed de ZEIS/Sao Paulo concluido.")

if __name__ == "__main__":
    main()
