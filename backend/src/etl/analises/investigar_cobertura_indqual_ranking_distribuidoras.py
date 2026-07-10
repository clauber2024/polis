"""
DIAGNÓSTICO: por que 14 distribuidoras caem em `distribuidorasComDadosIncompletos`
do ranking público (GET /api/ranking-distribuidoras) por falta do eixo de
justiça energética, SEM relação com prazo_confiavel?
================================================================================
CONTEXTO: pendência registrada em ARQUITETURA.md ("Ideia de produto: ranking
público de distribuidoras", 10/07/2026) após validar o endpoint com dado
real. Duas causas distintas, nenhuma confirmada por investigação direta
ainda:
  (a) SEM PAR no INDQUAL (sig_agente_indqual = NULL, resolvido pelo
      crosswalk automático de extrair_desempenho_conexao_mmgd.py):
      Forcel, João Cesa, Nova Palma, Santa Maria.
  (b) PAR ENCONTRADO no INDQUAL (sig_agente_indqual != NULL), mas NENHUM
      município atendido tem IVS calculável: Demei, Dmed, Mux Energia,
      Hidropan, Eflul, Cooperaliança, Cocel, RGE, Chesp, CPFL Santa Cruz,
      Energisa Borborema.

Hipótese já registrada no protótipo (06/07/2026, "ACHADO ADICIONAL" em
construir_ranking_distribuidoras_conexao_mmgd.py): causa (b) é COBERTURA, não
NOMENCLATURA — esses sig_agente existem em `qualidade_conjuntos` mas têm 0
linhas em `qualidade_conjunto_municipio` (nenhum município associado ao
conjunto elétrico). Este script CONFIRMA ou REFUTA essa hipótese com consulta
direta, e busca candidatos de nome para o grupo (a) que o casamento
automático (normalização + substring) pode ter perdido.

Este script é SOMENTE LEITURA (não grava nada no banco).
================================================================================
"""

import os

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

# Grupo (b): sig_agente_indqual já resolvido pelo crosswalk, mas sem IVS.
GRUPO_B_SIG_AGENTE = [
    "DEMEI", "DMED", "MUXENERGIA", "HIDROPAN", "EFLUL", "COOPERALIANÇA",
    "COCEL", "RGE", "CHESP", "CPFL SANTA CRUZ", "EBO",
]

# Grupo (a): nomes do dataset de fila de conexão SEM par encontrado.
GRUPO_A_NOMES_FILA = ["Forcel", "João Cesa", "Nova Palma", "Santa Maria"]


def investigar_grupo_b(engine):
    print("=" * 78)
    print("GRUPO (b): sig_agente resolvido, mas sem município com IVS calculável")
    print("=" * 78)

    with engine.connect() as conexao:
        for sig in GRUPO_B_SIG_AGENTE:
            conjuntos = conexao.execute(text("""
                SELECT ide_conjunto, dsc_conjunto, num_cnpj
                FROM qualidade_conjuntos
                WHERE sig_agente = :sig
            """), {"sig": sig}).fetchall()

            if not conjuntos:
                print(f"\n[{sig}] [ERRO] Nenhum conjunto encontrado em qualidade_conjuntos "
                      f"com este sig_agente exato — inconsistente com o crosswalk ter "
                      f"encontrado par (conferir normalização/acentuação).")
                continue

            ides = [c[0] for c in conjuntos]
            print(f"\n[{sig}] {len(conjuntos)} conjunto(s) elétrico(s): "
                  f"{[c[1] for c in conjuntos]}")

            placeholders = ", ".join(f":ide{i}" for i in range(len(ides)))
            params = {f"ide{i}": ide for i, ide in enumerate(ides)}
            n_municipios = conexao.execute(text(f"""
                SELECT COUNT(*) FROM qualidade_conjunto_municipio
                WHERE ide_conjunto IN ({placeholders})
            """), params).scalar()

            n_indicadores = conexao.execute(text(f"""
                SELECT COUNT(*) FROM qualidade_indicadores
                WHERE ide_conjunto IN ({placeholders})
            """), params).scalar()

            print(f"        municípios em qualidade_conjunto_municipio: {n_municipios} | "
                  f"linhas em qualidade_indicadores (DEC/FEC): {n_indicadores}")
            if n_municipios == 0:
                print("        -> CONFIRMA a hipótese: conjunto existe, mas sem município "
                      "associado (cobertura, não nomenclatura).")
            else:
                print("        -> REFUTA a hipótese para este caso — município(s) existem, "
                      "o problema deve estar em outro lugar (conferir join do service Node "
                      "com municipios.area_km2 / vw_indicadores_sociais_consolidado).")


def investigar_multipla_grupo_b(engine):
    """
    1a RODADA já REFUTOU a hipótese original ("conjunto sem município
    associado") - todos os 11 sig_agente do grupo (b) têm municípios em
    qualidade_conjunto_municipio. Nova hipótese, mais provável: são
    distribuidoras pequenas (cooperativas/prefeituras) que atendem SÓ UM
    BOLSÃO dentro de municípios cuja área é majoritariamente coberta por
    outra distribuidora maior - ou seja, TODOS os municípios que elas
    atendem também aparecem no conjunto de outra distribuidora, e por isso
    são excluídos pela regra "MULTIPLA(...)" (área de concessão dividida,
    atribuição ambígua - mesma regra já usada no protótipo
    investigar_distribuidora_regioes_problema.py). Esta função confirma isso
    contando, para cada município atendido por um sig_agente do grupo (b),
    quantos sig_agente DISTINTOS cobrem aquele mesmo município.
    """
    print("\n" + "=" * 78)
    print("GRUPO (b), 2a hipótese: os municípios atendidos são TODOS compartilhados "
          "com outra distribuidora (regra MULTIPLA exclui 100% da cobertura)")
    print("=" * 78)

    with engine.connect() as conexao:
        for sig in GRUPO_B_SIG_AGENTE:
            linhas = conexao.execute(text("""
                WITH municipios_do_agente AS (
                    SELECT DISTINCT qcm.codigo_ibge
                    FROM qualidade_conjunto_municipio qcm
                    JOIN qualidade_conjuntos qc ON qc.ide_conjunto = qcm.ide_conjunto
                    WHERE qc.sig_agente = :sig
                ),
                contagem_agentes_por_municipio AS (
                    SELECT
                        mda.codigo_ibge,
                        COUNT(DISTINCT qc2.sig_agente) AS n_agentes_distintos
                    FROM municipios_do_agente mda
                    JOIN qualidade_conjunto_municipio qcm2 ON qcm2.codigo_ibge = mda.codigo_ibge
                    JOIN qualidade_conjuntos qc2 ON qc2.ide_conjunto = qcm2.ide_conjunto
                    WHERE qc2.sig_agente IS NOT NULL
                    GROUP BY mda.codigo_ibge
                )
                SELECT
                    COUNT(*) AS total_municipios,
                    COUNT(*) FILTER (WHERE n_agentes_distintos = 1) AS municipios_exclusivos,
                    COUNT(*) FILTER (WHERE n_agentes_distintos > 1) AS municipios_compartilhados
                FROM contagem_agentes_por_municipio
            """), {"sig": sig}).fetchone()

            total, exclusivos, compartilhados = linhas
            print(f"\n[{sig}] {total} município(s) atendido(s) | {exclusivos} exclusivo(s) "
                  f"(1 só sig_agente) | {compartilhados} compartilhado(s) (>1 sig_agente)")
            if total > 0 and exclusivos == 0:
                print("        -> CONFIRMA a 2a hipótese: 100% dos municípios são "
                      "compartilhados com outra distribuidora - a regra MULTIPLA (área de "
                      "concessão dividida) exclui TODA a cobertura deste sig_agente do eixo "
                      "de justiça, não é bug, é consequência esperada da regra.")
            elif exclusivos > 0:
                print(f"        -> REFUTA parcialmente: {exclusivos} município(s) são "
                      "exclusivos e DEVERIAM ter passado pelo filtro MULTIPLA - se mesmo "
                      "assim não apareceram no resultado do endpoint, o problema está em "
                      "outra etapa da query do rankingDistribuidoras.service.ts.")


def investigar_grupo_a(engine):
    print("\n" + "=" * 78)
    print("GRUPO (a): sem par encontrado pelo crosswalk automático")
    print("=" * 78)

    with engine.connect() as conexao:
        for nome in GRUPO_A_NOMES_FILA:
            # Busca pelo NOME COMPLETO primeiro (mais preciso — evita ruído de
            # nomes de município genéricos como "Santa"/"Nova"/"João" que
            # aparecem em dezenas de dsc_conjunto sem relação nenhuma).
            candidatos_nome_completo = conexao.execute(text("""
                SELECT sig_agente, dsc_conjunto, ide_conjunto
                FROM qualidade_conjuntos
                WHERE sig_agente ILIKE :termo OR dsc_conjunto ILIKE :termo
                LIMIT 10
            """), {"termo": f"%{nome}%"}).fetchall()

            print(f"\n[{nome}] candidatos por ILIKE '%{nome}%' (nome completo): "
                  f"{[(c[0], c[1]) for c in candidatos_nome_completo] if candidatos_nome_completo else 'NENHUM'}")

            if not candidatos_nome_completo:
                termo = nome.split()[0]
                candidatos_parcial = conexao.execute(text("""
                    SELECT sig_agente, dsc_conjunto, ide_conjunto
                    FROM qualidade_conjuntos
                    WHERE sig_agente ILIKE :termo OR dsc_conjunto ILIKE :termo
                    LIMIT 10
                """), {"termo": f"%{termo}%"}).fetchall()
                print(f"        (sem match p/ nome completo — candidatos por 1º token "
                      f"'%{termo}%', ruído esperado, conferir manualmente): "
                      f"{[(c[0], c[1]) for c in candidatos_parcial] if candidatos_parcial else 'NENHUM'}")
                print("        -> Provavelmente distribuidora pequena demais para estar "
                      "sujeita ao reporte de qualidade (DEC/FEC), não uma falha de "
                      "nomenclatura do crosswalk — mas conferir os candidatos acima antes "
                      "de assumir isso.")


def investigar_siglas_confirmadas_grupo_a(engine):
    """
    2a rodada de investigação do grupo (a), após pesquisa externa (mesmo
    padrão já usado para Enel GO=EQUATORIAL GO - confirmação via CNPJ/nome
    corporativo, não suposição):
      - Forcel (Força e Luz Coronel Vivida) foi adquirida pelo Grupo Pacto
        Energia em 2021 - mesmo CNPJ 79850574000109, hoje "Pacto Energia
        Distribuição Paraná". Candidato à sigla: PACTO ENERGIA PR (já visto
        no dsc_conjunto "SISTEMA - FORCEL" na 1a rodada).
      - João Cesa = "Empresa Força e Luz João Cesa Ltda." (SC), companhia
        real com ranking oficial de qualidade da ANEEL (DEC/FEC) - sigla
        provável EFLJC.
      - Santa Maria = "Empresa Luz e Força Santa Maria S/A" (110 mil
        consumidores, 11 municípios) - sigla provável ELFSM.
      - Nova Palma = UHENPAL (Usina Hidrelétrica Nova Palma, hoje "Nova
        Palma Energia") - já confirmado na 1a rodada via dsc_conjunto.
    """
    print("\n" + "=" * 78)
    print("GRUPO (a), 2a rodada: siglas candidatas após pesquisa externa")
    print("=" * 78)

    candidatas = {
        "Forcel": ["PACTO ENERGIA PR", "PACTO", "FORCEL"],
        "João Cesa": ["EFLJC", "JOAO CESA", "JOÃO CESA"],
        "Santa Maria": ["ELFSM", "LUZ E FORCA SANTA MARIA", "LUZ E FORÇA SANTA MARIA"],
        "Nova Palma": ["UHENPAL"],
    }

    with engine.connect() as conexao:
        for nome, siglas in candidatas.items():
            for sigla in siglas:
                encontrado = conexao.execute(text("""
                    SELECT DISTINCT sig_agente FROM qualidade_conjuntos
                    WHERE sig_agente = :sigla
                """), {"sigla": sigla}).fetchall()
                print(f"[{nome}] sig_agente = '{sigla}': "
                      f"{'ENCONTRADO' if encontrado else 'não encontrado'}")


def main():
    print(f"Conectando ao banco: {DATABASE_URL.split('@')[-1]}")
    engine = create_engine(DATABASE_URL)

    investigar_grupo_b(engine)
    investigar_multipla_grupo_b(engine)
    investigar_grupo_a(engine)
    investigar_siglas_confirmadas_grupo_a(engine)

    print("\n" + "=" * 78)
    print("Próximo passo, conforme o resultado acima:")
    print("  - Se grupo (b) confirmou n_municipios=0 para todos: é limitação real de dado")
    print("    (conjunto elétrico existe no INDQUAL, mas sem município associado) —")
    print("    registrar em ARQUITETURA.md como limitação de fonte, não bug do Atlas.")
    print("  - Se algum caso do grupo (a) achou candidato plausível: adicionar ao")
    print("    MAPEAMENTO_MANUAL_CONFIRMADO em extrair_desempenho_conexao_mmgd.py e")
    print("    re-rodar o extractor.")


if __name__ == "__main__":
    main()
