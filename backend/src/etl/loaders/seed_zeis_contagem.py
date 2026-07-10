"""
SEED: unidades_espaciais - ZEIS de Contagem (tipo='zeis')
Fonte: Geoprocessamento Contagem / ArcGIS MapServer (Plano Diretor Lei Complementar 362/2023)
URL: https://geoprocessamento.contagem.mg.gov.br/arcgis/rest/services/SIGM_BD_Publico/Legislacao_Urbana_Publico/MapServer/9
A camada 9 ("Zoneamento LC362_2023") contem TODAS as zonas do Plano Diretor (ZUD, ZAE,
ZPA, PRACA, ZEIS), nao so ZEIS - por isso o filtro `where=zona IN ('ZEIS1','ZEIS2')` e
obrigatorio (mesmo raciocinio do filtro `ue.tipo = 'municipio'` ja usado em outros pontos
do Atlas: sem o filtro, o fan-out traria zonas irrelevantes). Campo `zona` e a sigla
(ZEIS1/ZEIS2); `nome_zonea` e o nome completo do zoneamento.
Descoberto em pesquisa de vazios de acesso x leis de ZEIS (10/07/2026, ver
docs/PLANO_ATUAL.md se existir) - Contagem confirmado no quadrante Vazio de Acesso,
Lei Complementar 362/2023 institui ZEIS (ver ARQUITETURA.md).

RESULTADO ESPERADO: exatamente 2 features (nao um numero maior). Confirmado por
inspecao direta da API (10/07/2026) - ao contrario de Recife/Salvador (1 linha por
assentamento/gleba), o modelo de dados de Contagem trata ZEIS1 e ZEIS2 como 2 ZONAS
AGREGADAS: cada uma e um (multi)poligono unico cobrindo todas as vilas/favelas/loteamentos
daquele tipo no municipio (campo `definicao` do ZEIS1: "Abrange as vilas, favelas e
comunidades tradicionais"). Nao e bug nem falta de dado - e granularidade diferente por
municipio, mesmo principio ja documentado para `unidades_espaciais.tipo` no Atlas
(cada fonte tem sua propria unidade de registro).
"""
import os, sys, requests, warnings
warnings.filterwarnings("ignore")
from shapely.geometry import shape
from shapely.ops import transform
from shapely.wkb import dumps as wkb_dumps
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
CODIGO_IBGE_CONTAGEM = "3118601"
SIMPLIFY_TOLERANCE = 0.0001
BASE_URL = "https://geoprocessamento.contagem.mg.gov.br/arcgis/rest/services/SIGM_BD_Publico/Legislacao_Urbana_Publico/MapServer/9"


def baixar_zeis():
    print("[1/3] Baixando ZEIS de Contagem via ArcGIS MapServer...")
    # BUG corrigido (10/07/2026): where clause concatenada direto na URL (com espacos,
    # parenteses e aspas simples nao codificados) fazia o ArcGIS interpretar so um
    # fragmento do filtro, retornando apenas 2 feicoes em vez de todas as ZEIS1/ZEIS2.
    # Usar `params=` do requests garante URL-encoding correto (%20, %27, %28...).
    where = "zona IN ('ZEIS1','ZEIS2')"
    r = requests.get(f"{BASE_URL}/query", params={
        "where": where, "returnCountOnly": "true", "f": "json",
    }, timeout=30, verify=False)
    total = r.json().get("count", 0)
    print(f"      Total de ZEIS (ZEIS1+ZEIS2): {total}")
    if total == 0:
        print("      [AVISO] Nenhuma feature retornada - confirmar se os valores de "
              "'zona' continuam sendo 'ZEIS1'/'ZEIS2' (a camada pode ter sido atualizada).")
        return []
    r = requests.get(f"{BASE_URL}/query", params={
        "where": where, "outFields": "*", "f": "geojson", "resultRecordCount": total,
    }, timeout=60, verify=False)
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
        objectid = props.get("OBJECTID")
        sigla = (props.get("zona") or "ZEIS").strip()
        nome = (props.get("nome_zonea") or sigla).strip()
        registros.append({
            "id": f"zeis:{CODIGO_IBGE_CONTAGEM}_{objectid}",
            "codigo_original": str(objectid),
            "nome_exibicao": f"{sigla} - {nome}"[:150],
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
                    "municipio_pai_codigo_ibge": CODIGO_IBGE_CONTAGEM,
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
    print("Seed de ZEIS de Contagem -> unidades_espaciais (tipo='zeis')")
    print("=" * 70)
    engine = create_engine(DATABASE_URL)
    with engine.connect() as con:
        existe = con.execute(text("SELECT 1 FROM municipios WHERE codigo_ibge = :c"), {"c": CODIGO_IBGE_CONTAGEM}).fetchone()
    if not existe:
        print(f"[ERRO] Municipio {CODIGO_IBGE_CONTAGEM} nao encontrado em municipios.")
        sys.exit(1)
    features = baixar_zeis()
    registros = processar_features(features)
    executar_seed(engine, registros)
    with engine.connect() as con:
        total = con.execute(text("SELECT count(*) FROM unidades_espaciais WHERE tipo = 'zeis'")).scalar()
    print(f"\n      Total de ZEIS em unidades_espaciais (todas as cidades): {total}")
    print("\nSeed de ZEIS/Contagem concluido.")


if __name__ == "__main__":
    main()
