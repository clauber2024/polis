"""
DIAGNÓSTICO (não grava nada): % de preenchimento de cada coluna de
indicadores_sociais, para checar rapidamente quais indicadores já têm dado
carregado e quais ainda estão vazios.

ORIGEM: normalizado a partir de um script ad-hoc (`check_colunas.py`) que
apareceu solto na raiz do repositório, provavelmente de uma sessão paralela
de trabalho neste projeto — a lista de colunas ali estava hardcoded e já
desatualizada (não incluía `percentual_apartamento`, `renda_per_capita_rdpc`,
`percentual_baixa_renda_rdpc`, entre outras adicionadas depois). Para evitar
que isso fique defasado de novo a cada nova coluna/migration, este script
NÃO hardcoda a lista — ele lê as colunas reais de `indicadores_sociais` via
`information_schema.columns`, sempre refletindo o schema atual do banco.

RESSALVA IMPORTANTE: este script conta preenchimento na tabela BRUTA
`indicadores_sociais`, que é fragmentada por `periodo_referencia` (cada
extractor grava seu próprio período — ver ARQUITETURA.md, "Achado
arquitetural: fragmentação de indicadores_sociais por período"). Uma coluna
pode aparecer com % baixo aqui mesmo estando 100% coberta na prática, porque
o preenchimento real está espalhado em múltiplas linhas/períodos do mesmo
município. Para uma leitura "por município, valor mais recente", usar
`vw_indicadores_sociais_consolidado`, não a tabela crua. Este script serve
para um diagnóstico rápido da tabela bruta, não é a fonte de verdade sobre
cobertura real por município.

Este script é SOMENTE LEITURA — não grava nada no banco.
================================================================================
"""

import os

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

# Colunas estruturais/de controle, não são "indicador" propriamente dito —
# excluídas do relatório de preenchimento.
COLUNAS_EXCLUIDAS = {"id", "unidade_espacial_id", "periodo_referencia", "criado_em"}


def listar_colunas_reais(engine) -> list:
    print("[1/2] Lendo colunas reais de indicadores_sociais via information_schema...")
    query = text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'indicadores_sociais'
        ORDER BY ordinal_position
    """)
    with engine.connect() as conexao:
        colunas = [linha[0] for linha in conexao.execute(query)]

    colunas_indicador = [c for c in colunas if c not in COLUNAS_EXCLUIDAS]
    print(f"      {len(colunas)} coluna(s) no total, {len(colunas_indicador)} indicador(es) a checar.")
    return colunas_indicador


def relatorio_preenchimento(engine, colunas: list) -> None:
    print("\n[2/2] Calculando % de preenchimento por coluna...")

    with engine.connect() as conexao:
        total = conexao.execute(text("SELECT COUNT(*) FROM indicadores_sociais")).scalar()
        print(f"      Total de linhas em indicadores_sociais: {total}\n")

        for coluna in colunas:
            preenchidos = conexao.execute(
                text(f'SELECT COUNT("{coluna}") FROM indicadores_sociais')
            ).scalar()
            pct = round(100 * preenchidos / total, 1) if total else 0.0
            status = "OK" if preenchidos > 0 else "VAZIO"
            print(f"  {coluna:<40} {preenchidos:>8} / {total}  ({pct:>5.1f}%)  -> {status}")


def main():
    print("Verificação de preenchimento — indicadores_sociais")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)
    colunas = listar_colunas_reais(engine)
    relatorio_preenchimento(engine, colunas)

    print("\n✅ Verificação concluída (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
