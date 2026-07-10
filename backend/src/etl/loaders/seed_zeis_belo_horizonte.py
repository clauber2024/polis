"""
SEED: unidades_espaciais - ZEIS/AEIS de Belo Horizonte (tipo='zeis')
Fonte: Portal de Dados Abertos da PBH (CKAN), dataset "Zoneamento - Lei 11181/19"
Pagina: https://dados.pbh.gov.br/dataset/zoneamento-lei-11181
Recurso usado: 20260101_zoneamento_11181.csv (atualizado 10/06/2026 segundo a pagina do
dataset - o mais recente disponivel no momento desta escrita).
URL direta: https://ckan.pbh.gov.br/dataset/f395ecdc-bdf9-4bb0-be91-32c129fa0c18/resource/ff935813-c969-47e9-9841-7d51231e70ee/download/20260101_zoneamento_11181.csv

NOMENCLATURA (pesquisa de vazios de acesso x leis de ZEIS, 10/07/2026): o Plano Diretor
de BH (Lei 11.181/2019) usa "AEIS" (Area Especial de Interesse Social), NAO "ZEIS" - BH e
Recife sao citados como pioneiros do instrumento no Brasil (Leis 7.165/1996 e 7.166/1996),
mas BH renomeou para AEIS na pratica. Este script grava tudo com tipo='zeis' no Atlas
(mesma convencao usada para outras cidades - o campo `nome_exibicao` preserva a sigla
original AEIS_1/AEIS_2/etc para quem for consultar o dado bruto).

CONFERIDO POR INSPECAO COMPLETA DO ARQUIVO (10/07/2026, nao amostra): o CSV atual so tem
72 poligonos "AEIS_1" + 1 "OP-1" (Ocupacao Preferencial, categoria NAO social - descartado
pelo filtro abaixo). NAO ha "AEIS_2", "ZEIS_1" ou "ZEIS_2" nesta exportacao especifica,
apesar de existirem na legislacao (ver ARQUITETURA.md) - ou esses poligonos ainda nao
foram mapeados nesta base aberta, ou vivem em outro dataset da PBH ainda nao identificado.
Nao e um erro deste script - e o estado real do dado publicado. Revisar periodicamente
(o dataset e atualizado ~anualmente) se novas categorias aparecerem.

Formato: CSV delimitado por ';' (nao ','), coluna GEOMETRIA em WKT (POLYGON(...)),
coordenadas em EPSG:31983 (SIRGAS 2000 / UTM 23S, METROS - confirmado na pagina do
dataset: "Para visualizacao em mapa utilize o EPSG: 31983"). Mesmo cuidado de reprojecao
ja necessario em seed_zeis_fortaleza.py (fonte tambem nao serve em WGS84/graus).

DOWNLOAD MANUAL OBRIGATORIO (diferente de Recife/Rio Branco/Contagem/Salvador/Fortaleza,
que baixam direto via requests): ckan.pbh.gov.br devolve HTTP 403 para requests.get, mesmo
com header de User-Agent de navegador (testado 10/07/2026) - indicativo de bloqueio por
WAF/fingerprint de TLS, nao so por User-Agent, entao nao da pra contornar so trocando
headers. Mesmo padrao ja usado em seed_zeis_sao_paulo.py (fonte municipal que exige baixar
pelo navegador antes). Baixar manualmente
https://dados.pbh.gov.br/dataset/zoneamento-lei-11181 -> recurso mais recente
("20260101_zoneamento_11181.csv" ou o que estiver mais atual quando for rodar) -> salvar em
BASE_DOWNLOADS (abaixo) antes de rodar este script.
"""
import os, sys, csv, glob, warnings
warnings.filterwarnings("ignore")
from shapely import wkt as shapely_wkt
from shapely.ops import transform
from shapely.wkb import dumps as wkb_dumps
from sqlalchemy import create_engine, text
from pyproj import Transformer

# Limite padrao do modulo csv (128 KB por campo) estoura na coluna GEOMETRIA para os
# poligonos maiores/mais detalhados de BH (WKT com muitos vertices) - descoberto na 1a
# execucao real (10/07/2026, _csv.Error: field larger than field limit). sys.maxsize pode
# gerar OverflowError em builds de 32 bits; fallback para 2**31-1 nesse caso (mais que
# suficiente para qualquer WKT deste dataset).
try:
    csv.field_size_limit(sys.maxsize)
except OverflowError:
    csv.field_size_limit(2**31 - 1)

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo")
CODIGO_IBGE_BH = "3106200"
SIMPLIFY_TOLERANCE = 0.0001
BASE_DOWNLOADS = "/mnt/c/Users/Rosana Santos/Downloads"
PADRAO_ARQUIVO = "*zoneamento_11181*.csv"  # casa qualquer data (20260101_zoneamento_11181.csv etc.)
EPSG_ORIGEM = 31983  # SIRGAS 2000 / UTM zone 23S
_transformer = Transformer.from_crs(f"EPSG:{EPSG_ORIGEM}", "EPSG:4674", always_xy=True)

# Prefixos de sigla que contam como habitacao de interesse social (ver nota no docstring
# sobre AEIS_2/ZEIS_1/ZEIS_2 ainda nao aparecerem nesta exportacao - filtro preparado para
# quando aparecerem, sem precisar editar o script de novo).
PREFIXOS_INTERESSE_SOCIAL = ("AEIS", "ZEIS")


def baixar_zeis():
    print("[1/3] Lendo zoneamento de Belo Horizonte (arquivo local, ver docstring)...")
    candidatos = sorted(glob.glob(os.path.join(BASE_DOWNLOADS, PADRAO_ARQUIVO)))
    if not candidatos:
        print(f"      [ERRO] Nenhum arquivo casando '{PADRAO_ARQUIVO}' em {BASE_DOWNLOADS}.")
        print("      Baixe manualmente em https://dados.pbh.gov.br/dataset/zoneamento-lei-11181")
        print("      (recurso CSV mais recente) e salve nessa pasta antes de rodar de novo.")
        sys.exit(1)
    caminho = candidatos[-1]  # mais recente por ordenacao alfabetica (nomes tem data no prefixo)
    print(f"      Usando arquivo: {caminho}")
    with open(caminho, encoding="utf-8") as f:
        leitor = csv.DictReader(f, delimiter=";")
        linhas = list(leitor)
    print(f"      {len(linhas)} zonas lidas (todas as categorias).")
    return linhas


def processar_features(linhas):
    print("[2/3] Filtrando AEIS/ZEIS e reprojetando geometrias...")
    registros = []
    sem_geom = 0
    descartadas_outra_zona = 0
    for linha in linhas:
        sigla = (linha.get("SIGLA_TIPO_ZONEAMENTO") or "").strip()
        if not sigla.upper().startswith(PREFIXOS_INTERESSE_SOCIAL):
            descartadas_outra_zona += 1
            continue
        geom_wkt = linha.get("GEOMETRIA")
        if not geom_wkt:
            sem_geom += 1
            continue
        try:
            geom_utm = shapely_wkt.loads(geom_wkt)
        except Exception:
            sem_geom += 1
            continue
        geom_graus = transform(_transformer.transform, geom_utm)
        geom = geom_graus.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        if geom.is_empty:
            sem_geom += 1
            continue
        id_zoneamento = linha.get("ID_ZONEAMENTO")
        descricao = (linha.get("DESC_TIPO_ZONEAMENTO") or sigla).strip()
        registros.append({
            "id": f"zeis:{CODIGO_IBGE_BH}_{sigla}_{id_zoneamento}",
            "codigo_original": str(id_zoneamento),
            "nome_exibicao": f"{sigla} - {descricao}"[:150],
            "geom": geom,
        })
    print(f"      {descartadas_outra_zona} zonas descartadas (nao sao AEIS/ZEIS - ex.: OP, ZP, ADE).")
    if sem_geom > 0:
        print(f"      [AVISO] {sem_geom} feicoes AEIS/ZEIS sem geometria valida - descartadas.")
    print(f"      {len(registros)} ZEIS/AEIS validas.")
    return registros


def executar_seed(engine, registros):
    print(f"[3/3] Inserindo {len(registros)} ZEIS/AEIS em unidades_espaciais...")
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
                    "municipio_pai_codigo_ibge": CODIGO_IBGE_BH,
                    "nome_exibicao": rec["nome_exibicao"],
                    "geom": geom_wkb,
                })
            inseridos += 1
        except Exception as e:
            falhas.append((rec["id"], str(e)[:100]))
    print(f"      {inseridos} ZEIS/AEIS inseridas/atualizadas com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} falhas:")
        for uid, err in falhas[:5]:
            print(f"        - {uid}: {err}")


def main():
    print("Seed de ZEIS/AEIS de Belo Horizonte -> unidades_espaciais (tipo='zeis')")
    print("=" * 70)
    engine = create_engine(DATABASE_URL)
    with engine.connect() as con:
        existe = con.execute(text("SELECT 1 FROM municipios WHERE codigo_ibge = :c"), {"c": CODIGO_IBGE_BH}).fetchone()
    if not existe:
        print(f"[ERRO] Municipio {CODIGO_IBGE_BH} nao encontrado em municipios.")
        sys.exit(1)
    linhas = baixar_zeis()
    registros = processar_features(linhas)
    executar_seed(engine, registros)
    with engine.connect() as con:
        total = con.execute(text("SELECT count(*) FROM unidades_espaciais WHERE tipo = 'zeis'")).scalar()
    print(f"\n      Total de ZEIS em unidades_espaciais (todas as cidades): {total}")
    print("\nSeed de ZEIS/Belo Horizonte concluido.")


if __name__ == "__main__":
    main()
