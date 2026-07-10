"""
SEED: unidades_espaciais - ZEIS de Fortaleza (tipo='zeis')
Fonte: Fortaleza em Mapas (Ipplan Fortaleza) - plataforma propria, NAO ArcGIS
(diferente de Recife/Rio Branco/Contagem/Salvador). Camada "Zonas Especiais de Interesse
Social", fonte SEUMA, ano 2018, mapa id 623 na plataforma.
URL de download: https://mapas.fortaleza.ce.gov.br/api/download/geojson/623
Pagina do mapa: https://mapas.fortaleza.ce.gov.br/mapa/623/zonas-especiais-de-interesse-social

Base legal: Lei Complementar 062/2009 (Plano Diretor Participativo de Fortaleza - PDPFor),
art. 220, institui as ZEIS (45 tipo 1 "ocupacoes", 56 tipo 2 "conjuntos", 34 tipo 3
"vazios" segundo o IPLANFOR - a plataforma nao expoe essa subdivisao por tipo em
"Atributos disponiveis", so "Nome" e "Descricao").

BUG corrigido (10/07/2026, apos 1a execucao real): ao contrario de Recife/Rio
Branco/Contagem/Salvador (ArcGIS, onde `f=geojson` sempre reprojeta para WGS84
automaticamente por exigencia do proprio formato GeoJSON), a plataforma "Fortaleza em
Mapas" NAO reprojeta - o campo `epsg_codif` de cada feature confirma que as coordenadas
vem em EPSG:31984 (SIRGAS 2000 / UTM 24S, unidade METROS). A 1a versao deste script
gravou essas coordenadas direto com ST_SetSRID(...,4674) (que espera GRAUS) - dado
tecnicamente inserido sem erro (Postgres nao valida faixa de valores), mas
geometricamente incorreto. Corrigido com reprojecao via pyproj antes do WKB. Campos de
propriedade confirmados na 1a execucao: "Nome" (ex. "ZEIS 1") e "Descrição" (ex. "Zona
Especial de Interesse Social de Ocupação") - um por TIPO de ZEIS, nao um nome unico por
poligono.
"""
import os, sys, requests, warnings
warnings.filterwarnings("ignore")
from shapely.geometry import shape
from shapely.ops import transform
from shapely.wkb import dumps as wkb_dumps
from sqlalchemy import create_engine, text
from pyproj import Transformer

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
CODIGO_IBGE_FORTALEZA = "2304400"
SIMPLIFY_TOLERANCE = 0.0001
URL_GEOJSON = "https://mapas.fortaleza.ce.gov.br/api/download/geojson/623"
EPSG_ORIGEM = 31984  # SIRGAS 2000 / UTM zone 24S - confirmado no campo "epsg_codif" das features
_transformer = Transformer.from_crs(f"EPSG:{EPSG_ORIGEM}", "EPSG:4674", always_xy=True)


def baixar_zeis():
    print("[1/3] Baixando ZEIS de Fortaleza via Fortaleza em Mapas...")
    r = requests.get(URL_GEOJSON, timeout=60, verify=False)
    if r.status_code != 200:
        print(f"      [ERRO] Status {r.status_code}")
        sys.exit(1)
    dados = r.json()
    features = dados.get("features", [])
    print(f"      {len(features)} ZEIS recebidas.")
    if features:
        # AJUDA DE DEBUG (primeira execucao): confirmar nomes de campos reais.
        print(f"      [DEBUG] Exemplo de properties: {features[0].get('properties')}")
    return features


def processar_features(features):
    print("[2/3] Processando geometrias...")
    registros = []
    sem_geom = 0
    for i, f in enumerate(features):
        props = f.get("properties", {})
        geom_raw = f.get("geometry")
        if not geom_raw:
            sem_geom += 1
            continue
        # Reprojetar de UTM (metros) para SIRGAS2000 geografico (graus) ANTES de
        # simplificar - SIMPLIFY_TOLERANCE=0.0001 so faz sentido em graus.
        geom_utm = shape(geom_raw)
        geom_graus = transform(_transformer.transform, geom_utm)
        geom = geom_graus.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        if geom.is_empty:
            sem_geom += 1
            continue
        # Nomes de campo conforme metadado da pagina ("Atributos disponiveis: Nome,
        # Descricao") - ajustar aqui se o [DEBUG] acima mostrar chaves diferentes.
        nome = (props.get("Nome") or props.get("nome") or f"ZEIS-{i}").strip()
        descricao = (props.get("Descrição") or props.get("Descricao") or props.get("descricao") or "").strip()
        nome_exibicao = f"{nome} - {descricao}" if descricao else nome
        registros.append({
            "id": f"zeis:{CODIGO_IBGE_FORTALEZA}_{i}",
            "codigo_original": str(i),
            "nome_exibicao": nome_exibicao[:150],
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
                    "municipio_pai_codigo_ibge": CODIGO_IBGE_FORTALEZA,
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
    print("Seed de ZEIS de Fortaleza -> unidades_espaciais (tipo='zeis')")
    print("=" * 70)
    engine = create_engine(DATABASE_URL)
    with engine.connect() as con:
        existe = con.execute(text("SELECT 1 FROM municipios WHERE codigo_ibge = :c"), {"c": CODIGO_IBGE_FORTALEZA}).fetchone()
    if not existe:
        print(f"[ERRO] Municipio {CODIGO_IBGE_FORTALEZA} nao encontrado em municipios.")
        sys.exit(1)
    features = baixar_zeis()
    registros = processar_features(features)
    executar_seed(engine, registros)
    with engine.connect() as con:
        total = con.execute(text("SELECT count(*) FROM unidades_espaciais WHERE tipo = 'zeis'")).scalar()
    print(f"\n      Total de ZEIS em unidades_espaciais (todas as cidades): {total}")
    print("\nSeed de ZEIS/Fortaleza concluido.")


if __name__ == "__main__":
    main()
