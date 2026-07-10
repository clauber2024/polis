"""
SEED: unidades_espaciais - ZEIS de Salvador (tipo='zeis')
Fonte: GeoSalvador / ArcGIS Online FeatureServer (Plano Diretor de Desenvolvimento Urbano,
Lei Municipal 9.069/2016 - 234 ZEIS demarcadas em 5 categorias: ZEIS-1 a ZEIS-5, ver
anexo tecnico da lei em https://www.cms.ba.gov.br/uploads/pddu/pdduquadro01.pdf).
URL: https://services6.arcgis.com/GP5qdNaePRPh2SdT/ArcGIS/rest/services/ZEIS/FeatureServer/0

LIMITACAO CONHECIDA: esta camada tem apenas os campos FID/ID (sem nome, sem subcategoria
ZEIS-1..5) - ao contrario de Recife/Rio Branco, nao da pra rotular a subcategoria de cada
poligono so com este layer. Ha tambem um servico "SELECAO_ZEIS" no mesmo folder
(services6.arcgis.com/.../SELECAO_ZEIS/FeatureServer) que pode ter mais atributos - nao
verificado ainda; se a riqueza de atributos for necessaria no futuro (ex: exibir a
subcategoria no frontend), vale investigar aquele servico antes de expandir este seed.
Por ora, nome_exibicao fica genérico ("ZEIS Salvador <id>").

Descoberto em pesquisa de vazios de acesso x leis de ZEIS (10/07/2026) - Salvador
confirmado no quadrante Vazio de Acesso.
"""
import os, sys, requests, warnings
warnings.filterwarnings("ignore")
from shapely.geometry import shape
from shapely.ops import transform
from shapely.wkb import dumps as wkb_dumps
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
CODIGO_IBGE_SALVADOR = "2927408"
SIMPLIFY_TOLERANCE = 0.0001
BASE_URL = "https://services6.arcgis.com/GP5qdNaePRPh2SdT/ArcGIS/rest/services/ZEIS/FeatureServer/0"


def baixar_zeis():
    print("[1/3] Baixando ZEIS de Salvador via ArcGIS Online (GeoSalvador)...")
    url_count = f"{BASE_URL}/query?where=1=1&returnCountOnly=true&f=json"
    r = requests.get(url_count, timeout=30, verify=False)
    total = r.json().get("count", 0)
    print(f"      Total de ZEIS: {total}")
    if total == 0:
        print("      [AVISO] Nenhuma feature retornada.")
        return []
    # maxRecordCount do servico e 2000 - Salvador tem 234 ZEIS na lei, entao 1 pagina basta;
    # se algum dia total > 2000, sera preciso paginar com resultOffset.
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
        objectid = props.get("FID")
        id_zeis = props.get("ID")
        registros.append({
            "id": f"zeis:{CODIGO_IBGE_SALVADOR}_{objectid}",
            "codigo_original": str(objectid),
            "nome_exibicao": f"ZEIS Salvador {id_zeis if id_zeis is not None else objectid}"[:150],
            "geom": geom,
        })
    if sem_geom > 0:
        print(f"      [AVISO] {sem_geom} feicoes sem geometria - descartadas.")
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
                    "municipio_pai_codigo_ibge": CODIGO_IBGE_SALVADOR,
                    "nome_exibicao": rec["nome_exibicao"],
                    "geom": geom_wkb,
                })
            inseridos += 1
        except Exception as e:
            falhas.append((rec["id"], str(e)[:100]))
    print(f"      {inseridos} ZEIS inseridas/atualizadas com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} falhas:")
        for uid, err in falhas[:5]:
            print(f"        - {uid}: {err}")


def main():
    print("Seed de ZEIS de Salvador -> unidades_espaciais (tipo='zeis')")
    print("=" * 70)
    engine = create_engine(DATABASE_URL)
    with engine.connect() as con:
        existe = con.execute(text("SELECT 1 FROM municipios WHERE codigo_ibge = :c"), {"c": CODIGO_IBGE_SALVADOR}).fetchone()
    if not existe:
        print(f"[ERRO] Municipio {CODIGO_IBGE_SALVADOR} nao encontrado em municipios.")
        sys.exit(1)
    features = baixar_zeis()
    registros = processar_features(features)
    executar_seed(engine, registros)
    with engine.connect() as con:
        total = con.execute(text("SELECT count(*) FROM unidades_espaciais WHERE tipo = 'zeis'")).scalar()
    print(f"\n      Total de ZEIS em unidades_espaciais (todas as cidades): {total}")
    print("\nSeed de ZEIS/Salvador concluido.")


if __name__ == "__main__":
    main()
