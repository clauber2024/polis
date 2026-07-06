"""
DIAGNÓSTICO (não grava nada): raio-x geral do banco — lista todas as
tabelas/views existentes, contagem de linhas, e classifica cada uma na
dimensão do Atlas a que pertence (MMGD, Renda, Moradia, Qualidade de
Fornecimento etc.), sinalizando dimensões sem nenhuma tabela correspondente.

ORIGEM: normalizado a partir de um script ad-hoc (`diagnostico_atlas.py`)
que apareceu solto na raiz do repositório, provavelmente de uma sessão
paralela de trabalho neste projeto. Ajustes feitos aqui: usa o mesmo padrão
`DATABASE_URL` via variável de ambiente (com o mesmo default de dev local)
já usado em todos os outros scripts do projeto, em vez de depender de um
arquivo `backend/.env` próprio; e usa SQLAlchemy em vez de psycopg2 puro,
para consistência com o resto de `backend/src/etl/analises/`.

Este script é SOMENTE LEITURA — não grava nada no banco.
================================================================================
"""

import os

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

# Mapeamento de palavras-chave (no nome da tabela/view) -> dimensão do Atlas.
# Ajustar esta lista conforme novas dimensões/tabelas forem adicionadas.
MAPA_PALAVRAS_CHAVE = {
    "Unidades espaciais (municípios/FCU/ZEIS)": ["unidades_espaciais", "municipio", "fcu", "zeis", "aeis"],
    "MMGD": ["mmgd", "ugbt", "ugmt", "microgeracao"],
    "IVS / Vulnerabilidade Social": ["ivs", "vulnerabilidade"],
    "Renda / Trabalho": ["renda", "rdpc", "vinculos_formais"],
    "CadÚnico / TSEE": ["cadunico", "cad_unico", "tsee", "cde", "beneficiari"],
    "Qualidade de Fornecimento (INDQUAL)": ["qualidade_conjunto", "vw_qualidade", "indqual", "dec_fec", "conjunto_eletrico"],
    "Moradia — inadequação/MCMV/posse": ["mcmv", "inadequacao", "parede", "domicilio", "posse", "cortico", "apartamento"],
    "Irradiação Solar / INPE": ["irradiacao", "solar_potencial", "inpe"],
    "Capital Humano / DATASUS": ["mortalidade", "datasus", "alfabetizacao", "capital_humano"],
    "Infraestrutura Urbana": ["agua_inadequada", "esgoto_inadequado", "lixo_inadequado", "populacao_rural"],
}


def classificar_tabela(nome_tabela: str) -> str:
    nome = nome_tabela.lower()
    for rotulo, palavras_chave in MAPA_PALAVRAS_CHAVE.items():
        if any(palavra in nome for palavra in palavras_chave):
            return rotulo
    return "(não classificada)"


def listar_tabelas_e_views(engine) -> list:
    print("[1/3] Listando tabelas e views do schema public...")
    with engine.connect() as conexao:
        tabelas = [
            linha[0] for linha in conexao.execute(text("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """))
        ]
        views = [
            linha[0] for linha in conexao.execute(text("""
                SELECT table_name FROM information_schema.views
                WHERE table_schema = 'public'
                ORDER BY table_name
            """))
        ]

    print(f"      {len(tabelas)} tabela(s), {len(views)} view(s).")
    return tabelas, views


def contar_linhas(engine, nomes: list, sufixo: str = "") -> list:
    resultados = []
    with engine.connect() as conexao:
        for nome in nomes:
            try:
                n = conexao.execute(text(f'SELECT COUNT(*) FROM "{nome}"')).scalar()
            except Exception as erro:
                n = f"erro: {erro}"
            resultados.append((f"{nome}{sufixo}", n, classificar_tabela(nome)))
    return resultados


def main():
    print("Diagnóstico do estado geral do banco — Atlas Solar Justo")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)

    tabelas, views = listar_tabelas_e_views(engine)

    print("\n[2/3] Contando linhas de cada tabela/view...")
    resultados = contar_linhas(engine, tabelas) + contar_linhas(engine, views, sufixo=" [VIEW]")

    print("\nTABELAS E CONTAGENS")
    print("-" * 70)
    for nome, n, rotulo in resultados:
        print(f"  {nome:<45} {str(n):>12}   -> {rotulo}")

    print("\n[3/3] Resumo por dimensão do Atlas...")
    print("-" * 70)
    for rotulo in MAPA_PALAVRAS_CHAVE:
        correspondencias = [(n, cnt) for n, cnt, r in resultados if r == rotulo]
        if correspondencias:
            print(f"\n[OK] {rotulo}:")
            for n, cnt in correspondencias:
                print(f"     - {n}: {cnt} linha(s)")
        else:
            print(f"\n[AVISO] {rotulo}: nenhuma tabela/view encontrada")

    nao_classificadas = [(n, cnt) for n, cnt, r in resultados if r == "(não classificada)"]
    if nao_classificadas:
        print("\n" + "-" * 70)
        print("TABELAS/VIEWS NÃO CLASSIFICADAS (revisar MAPA_PALAVRAS_CHAVE se necessário)")
        print("-" * 70)
        for n, cnt in nao_classificadas:
            print(f"  {n}: {cnt} linha(s)")

    print("\n✅ Diagnóstico concluído (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
