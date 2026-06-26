"""
SEED: municipios + unidades_espaciais (a partir da Malha Municipal Digital do IBGE)
================================================================================
O QUE ESTE SCRIPT FAZ:
  1. Lê o shapefile de municípios do Brasil (BR_Municipios_2025.shp)
  2. Normaliza geometrias (garante MultiPolygon, nunca Polygon solto)
  3. Mapeia UF -> Região (o shapefile do IBGE não traz a região diretamente)
  4. Insere/atualiza (upsert) a tabela `municipios`
  5. Insere/atualiza (upsert) o registro ESPELHO de cada município em
     `unidades_espaciais` (tipo='municipio') — necessário por causa da
     correção de modelagem que fizemos para suportar granularidade variável

POR QUE GEOPANDAS DIRETO PARA O POSTGIS, EM VEZ DE CONVERTER PARA GEOJSON
PRIMEIRO COM ogr2ogr?
  Porque geopandas já lê o shapefile nativamente e escreve direto no PostGIS
  via SQLAlchemy, sem precisar do GDAL instalado no sistema operacional (que
  estava travando na instalação via conda). Menos dependências, menos pontos
  de falha.

POR QUE ISSO É IDEMPOTENTE (pode rodar este script várias vezes sem duplicar)?
  Porque usamos "ON CONFLICT ... DO UPDATE" (upsert) em vez de INSERT puro,
  conforme exigido pelo CLAUDE.md do projeto.
================================================================================
"""

import os
import sys

import geopandas as gpd
from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import create_engine, text


# ------------------------------------------------------------------------------
# CONFIGURAÇÃO
# ------------------------------------------------------------------------------

CAMINHO_SHAPEFILE = os.environ.get(
    "CAMINHO_SHAPEFILE",
    "etl/data/raw/malha_municipal_2025/BR_Municipios_2025.shp",
)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

# Mapa UF -> Região. Fixo, não muda (só 27 UFs) — não depende de fonte externa.
UF_PARA_REGIAO = {
    "AC": "Norte", "AP": "Norte", "AM": "Norte", "PA": "Norte",
    "RO": "Norte", "RR": "Norte", "TO": "Norte",
    "AL": "Nordeste", "BA": "Nordeste", "CE": "Nordeste", "MA": "Nordeste",
    "PB": "Nordeste", "PE": "Nordeste", "PI": "Nordeste", "RN": "Nordeste",
    "SE": "Nordeste",
    "DF": "Centro-Oeste", "GO": "Centro-Oeste", "MT": "Centro-Oeste",
    "MS": "Centro-Oeste",
    "ES": "Sudeste", "MG": "Sudeste", "RJ": "Sudeste", "SP": "Sudeste",
    "PR": "Sul", "RS": "Sul", "SC": "Sul",
}


# Tolerância de simplificação de geometria, em graus (SIRGAS 2000 é geográfico,
# não métrico). 0.0001 grau equivale a aproximadamente 10 metros no equador —
# suficiente para visualização web (choropleth/heatmap), e reduz drasticamente
# o tamanho de municípios com fronteiras extremamente detalhadas (ex: Jutaí/AM,
# que tinha ~3 milhões de caracteres de WKT antes de simplificar). Ajuste para
# None se precisar da geometria original sem perda, mas isso volta a deixar
# municípios grandes pesados para transportar e renderizar no navegador.
TOLERANCIA_SIMPLIFICACAO = float(os.environ.get("TOLERANCIA_SIMPLIFICACAO", "0.0001"))


def normalizar_geometria(geom):
    """
    Garante que toda geometria seja MultiPolygon, nunca Polygon solto, e
    simplifica geometrias excessivamente detalhadas.
    --------------------------------------------------------------------------
    Detectado em teste: o shapefile pode trazer alguns municípios como
    Polygon simples (quando o território não tem ilhas/partes separadas) e
    outros como MultiPolygon (quando tem). A coluna `geom` do banco exige
    SEMPRE MultiPolygon — então normalizamos tudo aqui, antes de gravar.

    Detectado em produção: municípios grandes e irregulares (ex: Jutaí, no
    Amazonas) podem ter polígonos com centenas de milhares de vértices,
    gerando WKT/WKB de vários megabytes por geometria — grande o suficiente
    para a conexão com o banco cair no meio da transação. Simplificamos com
    Douglas-Peucker (preserve_topology=True evita criar geometria inválida)
    antes de normalizar o tipo.
    """
    if TOLERANCIA_SIMPLIFICACAO and TOLERANCIA_SIMPLIFICACAO > 0:
        geom = geom.simplify(TOLERANCIA_SIMPLIFICACAO, preserve_topology=True)

    if isinstance(geom, Polygon):
        return MultiPolygon([geom])
    return geom


def detectar_colunas(gdf: gpd.GeoDataFrame) -> dict:
    """
    Detecta os nomes reais das colunas no shapefile carregado, em vez de
    assumir nomes fixos. O IBGE varia ligeiramente a nomenclatura entre
    edições (ex: 'CD_MUN' vs 'CD_GEOCODM', 'NM_MUN' vs 'NM_MUNICIP').
    Se o seu arquivo usar nomes diferentes dos previstos aqui, ajuste o
    dicionário CANDIDATOS abaixo — não precisa reescrever o resto do script.
    """
    candidatos = {
        "codigo_ibge": ["CD_MUN", "CD_GEOCODM", "GEOCODIGO", "CD_GEOCODI"],
        "nome": ["NM_MUN", "NM_MUNICIP", "NOME"],
        "uf": ["SIGLA_UF", "SIGLA", "UF"],
        "nome_estado": ["NM_UF", "NOME_UF"],
        "area_km2": ["AREA_KM2", "AREA_KM", "AREA"],
    }

    colunas_disponiveis = set(gdf.columns)
    mapeamento_final = {}

    for campo_destino, opcoes in candidatos.items():
        encontrado = next((c for c in opcoes if c in colunas_disponiveis), None)
        if encontrado is None and campo_destino != "area_km2":
            # area_km2 é opcional (a tabela aceita NULL); os outros são obrigatórios
            print(f"[ERRO] Não encontrei nenhuma coluna candidata para '{campo_destino}'.")
            print(f"       Colunas disponíveis no shapefile: {sorted(colunas_disponiveis)}")
            print(f"       Ajuste o dicionário CANDIDATOS em detectar_colunas() com o nome correto.")
            sys.exit(1)
        mapeamento_final[campo_destino] = encontrado

    print("[OK] Mapeamento de colunas detectado:")
    for destino, origem in mapeamento_final.items():
        print(f"     {destino:15s} <- {origem}")

    return mapeamento_final


def carregar_e_normalizar_shapefile(caminho: str) -> gpd.GeoDataFrame:
    print(f"[1/5] Lendo shapefile de: {caminho}")
    gdf = gpd.read_file(caminho)
    print(f"      {len(gdf)} municípios encontrados no arquivo.")

    if gdf.crs is None:
        print("[AVISO] Shapefile sem CRS definido — assumindo SIRGAS 2000 (EPSG:4674).")
        gdf = gdf.set_crs(epsg=4674)
    elif gdf.crs.to_epsg() != 4674:
        print(f"[AVISO] CRS do arquivo é {gdf.crs}, reprojetando para EPSG:4674 (SIRGAS 2000)...")
        gdf = gdf.to_crs(epsg=4674)
    else:
        print("[OK] CRS já está em EPSG:4674 (SIRGAS 2000), como esperado.")

    print("[2/5] Normalizando geometrias para MultiPolygon...")
    gdf["geometry"] = gdf["geometry"].apply(normalizar_geometria)
    tipos_unicos = set(gdf.geometry.type)
    if tipos_unicos != {"MultiPolygon"}:
        print(f"[ERRO] Ainda há tipos de geometria inesperados após normalização: {tipos_unicos}")
        sys.exit(1)
    print("      Todas as geometrias confirmadas como MultiPolygon.")

    return gdf


def montar_dataframe_municipios(gdf: gpd.GeoDataFrame, colunas: dict) -> gpd.GeoDataFrame:
    print("[3/5] Montando estrutura final de municipios...")

    df = gdf[[colunas["codigo_ibge"], colunas["nome"], colunas["uf"], colunas["nome_estado"]]].copy()
    df.columns = ["codigo_ibge", "nome", "uf", "nome_estado"]

    if colunas.get("area_km2") and colunas["area_km2"] in gdf.columns:
        df["area_km2"] = gdf[colunas["area_km2"]]
    else:
        df["area_km2"] = None

    # Garante código IBGE como string de 7 caracteres (alguns shapefiles trazem como número)
    df["codigo_ibge"] = df["codigo_ibge"].astype(str).str.zfill(7)

    df["regiao"] = df["uf"].map(UF_PARA_REGIAO)
    sem_regiao = df[df["regiao"].isna()]
    if len(sem_regiao) > 0:
        print(f"[ERRO] {len(sem_regiao)} município(s) com UF não reconhecida: "
              f"{sem_regiao['uf'].unique().tolist()}")
        sys.exit(1)

    df["geometry"] = gdf["geometry"]
    gdf_final = gpd.GeoDataFrame(df, geometry="geometry", crs=gdf.crs)

    print(f"      {len(gdf_final)} registros prontos para inserção.")
    return gdf_final


def executar_upsert_municipios(engine, gdf: gpd.GeoDataFrame):
    """
    Faz upsert manual via SQL bruto (não geopandas.to_postgis direto), porque
    to_postgis() por padrão só faz INSERT/REPLACE de tabela inteira — não dá
    upsert linha a linha por chave primária, que é o que precisamos para
    rodar este script várias vezes sem duplicar ou falhar em código já existente.

    POR QUE WKB (binário) EM VEZ DE WKT (texto)?
    --------------------------------------------------------------------------
    Detectado em produção: municípios com geometria muito detalhada (ex:
    Jutaí/AM) geravam WKT de quase 3 milhões de caracteres, e a conexão com
    o Postgres caía no meio do parsing dessa string gigante
    ("server closed the connection unexpectedly"). WKB é a representação
    binária da mesma geometria — mais compacta e processada diretamente pelo
    PostGIS sem precisar fazer parsing de texto, o que é mais robusto para
    geometrias grandes. Usamos ST_GeomFromWKB em vez de ST_GeomFromText.
    """
    print("[4/5] Inserindo/atualizando tabela `municipios` (upsert)...")

    sql_upsert = text("""
        INSERT INTO municipios (codigo_ibge, nome, uf, nome_estado, regiao, geom, area_km2)
        VALUES (
            :codigo_ibge, :nome, :uf, :nome_estado, :regiao,
            ST_SetSRID(ST_GeomFromWKB(CAST(:geom_wkb AS bytea)), 4674),
            :area_km2
        )
        ON CONFLICT (codigo_ibge) DO UPDATE SET
            nome = EXCLUDED.nome,
            uf = EXCLUDED.uf,
            nome_estado = EXCLUDED.nome_estado,
            regiao = EXCLUDED.regiao,
            geom = EXCLUDED.geom,
            area_km2 = EXCLUDED.area_km2,
            atualizado_em = now();
    """)

    total = len(gdf)
    with engine.begin() as conexao:
        for i, (_, linha) in enumerate(gdf.iterrows(), start=1):
            conexao.execute(sql_upsert, {
                "codigo_ibge": linha["codigo_ibge"],
                "nome": linha["nome"],
                "uf": linha["uf"],
                "nome_estado": linha["nome_estado"],
                "regiao": linha["regiao"],
                "geom_wkb": linha["geometry"].wkb,
                "area_km2": float(linha["area_km2"]) if linha["area_km2"] is not None else None,
            })
            if i % 500 == 0 or i == total:
                print(f"      ... {i}/{total} municípios processados")

    print(f"      {total} municípios inseridos/atualizados com sucesso.")


def executar_upsert_unidades_espaciais(engine, gdf: gpd.GeoDataFrame):
    """
    Cria o registro ESPELHO de cada município em `unidades_espaciais`.
    --------------------------------------------------------------------------
    Necessário por causa da correção de modelagem: hoje, granularidade =
    município sempre, mas mmgd_indicadores e indicadores_sociais apontam para
    unidades_espaciais.id, não para municipios.codigo_ibge diretamente.
    Sem este espelho, não haveria nenhuma unidade espacial válida para os
    indicadores referenciarem.
    """
    print("[5/5] Inserindo/atualizando tabela `unidades_espaciais` (espelho de município)...")

    sql_upsert = text("""
        INSERT INTO unidades_espaciais
            (id, tipo, codigo_original, nome_exibicao, municipio_pai_codigo_ibge, geom, area_km2)
        VALUES (
            :id, 'municipio', :codigo_original, :nome_exibicao, :municipio_pai_codigo_ibge,
            ST_SetSRID(ST_GeomFromWKB(CAST(:geom_wkb AS bytea)), 4674),
            :area_km2
        )
        ON CONFLICT (id) DO UPDATE SET
            nome_exibicao = EXCLUDED.nome_exibicao,
            geom = EXCLUDED.geom,
            area_km2 = EXCLUDED.area_km2;
    """)

    total = len(gdf)
    with engine.begin() as conexao:
        for i, (_, linha) in enumerate(gdf.iterrows(), start=1):
            codigo = linha["codigo_ibge"]
            conexao.execute(sql_upsert, {
                "id": f"municipio:{codigo}",
                "codigo_original": codigo,
                "nome_exibicao": linha["nome"],
                "municipio_pai_codigo_ibge": codigo,
                "geom_wkb": linha["geometry"].wkb,
                "area_km2": float(linha["area_km2"]) if linha["area_km2"] is not None else None,
            })
            if i % 500 == 0 or i == total:
                print(f"      ... {i}/{total} unidades espaciais processadas")

    print(f"      {total} unidades espaciais (espelho) inseridas/atualizadas com sucesso.")


def main():
    if not os.path.exists(CAMINHO_SHAPEFILE):
        print(f"[ERRO] Shapefile não encontrado em: {CAMINHO_SHAPEFILE}")
        print("       Defina a variável de ambiente CAMINHO_SHAPEFILE ou ajuste o caminho padrão no script.")
        sys.exit(1)

    gdf = carregar_e_normalizar_shapefile(CAMINHO_SHAPEFILE)
    colunas = detectar_colunas(gdf)
    gdf_municipios = montar_dataframe_municipios(gdf, colunas)

    print(f"\nConectando ao banco: {DATABASE_URL.split('@')[-1]}")  # não loga a senha
    engine = create_engine(DATABASE_URL)

    executar_upsert_municipios(engine, gdf_municipios)
    executar_upsert_unidades_espaciais(engine, gdf_municipios)

    print("\n✅ Seed concluído com sucesso.")


if __name__ == "__main__":
    main()
