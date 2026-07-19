"""
CALCULO: analises_estatisticas — modelo controlado de MMGD residencial sobre
o eixo "moradia" (Precariedade Habitacional / Segurança da Posse)
================================================================================
CONTEXTO: primeira peça de "infraestrutura estatística integrada" do Atlas —
proposta em cima da Seção 2.2 de docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md
("ausência de infraestrutura estatística no backend hoje") e da Recomendação
Priorizada #3 do mesmo relatório: "testar formalmente o modelo controlado de
MMGD residencial per capita sobre indice_precariedade_moradia, controlando
irradiação e renda". Decisão de escopo (usuário, ver docs/DECISOES.md, ADR
"Infraestrutura estatística integrada"): motor FIXO, materializado via ETL —
não um microsserviço Python sob demanda nem uma reimplementação em
TypeScript. Este script roda a análise e grava o resultado em
`analises_estatisticas` (migration 0029); o backend Node/Express só lê e
serve via GET /api/analises-estatisticas.

NÃO é um script de `analises/` (aquela pasta é documentada como SOMENTE
LEITURA/exploratória) — este script GRAVA no banco, por isso vive em
`loaders/`, seguindo o padrão de idempotência/transação-por-linha do
etl-atlas SKILL.md, mesmo não tendo fonte externa (não há download nem
arquivo bruto — todo insumo já está no Postgres). Por isso o nome usa o
prefixo `calcular_`, não `extrair_` (mesmo espírito de
`backend/src/etl/etl_indqual.py`, que também foge do padrão `extrair_` por
não ter extração de fonte externa envolvida).

O QUE ESTE SCRIPT FAZ:
  1. Monta o painel município a município (MMGD residencial, moradia,
     irradiação, renda) — mesma CTE de
     `backend/src/etl/analises/analisar_correlacao_mmgd_renda.py`, mas lendo
     `mmgd_indicadores.potencia_residencial_kw` DIRETO DO POSTGRES (coluna
     existente desde a migration 0020) em vez de reprocessar o Parquet bruto
     da ANEEL — o script exploratório precisava do Parquet porque foi escrito
     antes de a quebra residencial estar persistida no schema; hoje não
     precisa mais. Simplificação real, não um comportamento herdado.
  2. Calcula MMGD potência RESIDENCIAL per capita (kW/1.000 hab). Regra de
     ausência (mesma de `vaziosDeAcesso.service.ts`): município SEM registro
     em `mmgd_indicadores` → potência residencial = 0 (ausência real de
     instalação); município COM registro mas `potencia_residencial_kw IS
     NULL` (snapshot anterior à migration 0020, ainda não reextraído) →
     EXCLUÍDO do cálculo, nunca tratado como 0.
  3. Para cada variável do eixo moradia (`indice_precariedade_moradia`,
     `indice_seguranca_posse`): calcula a correlação de Spearman de ordem
     zero (bruta) e a correlação PARCIAL de Spearman controlando
     SIMULTANEAMENTE por renda média domiciliar E irradiação solar — o
     controle conjunto que a Recomendação #3 pede e que o script exploratório
     (que só controla renda isoladamente) ainda não fazia.
  4. Checa robustez regional: refaz a correlação parcial dentro de cada uma
     das 5 regiões e conta em quantas o sinal do coeficiente nacional se
     mantém (mesmo espírito de `resumo_robustez` no script exploratório, sem
     repetir a bateria completa de sensibilidade por urbanização/tipologia —
     fora do escopo desta Recomendação específica).
  5. Upsert em `analises_estatisticas` (uma transação por linha, mesmo padrão
     de todos os extractors do projeto — mesmo só havendo 2 linhas hoje).

MÉTODO DE CORRELAÇÃO PARCIAL DE SPEARMAN: idêntico ao já validado em
`analisar_correlacao_mmgd_renda.py` (resíduo de postos + Pearson dos
resíduos) — funções portadas aqui, não importadas de `analises/` (pasta
documentada como exploratória, não uma dependência importável de `loaders/`).

LIMITAÇÕES METODOLÓGICAS (mesmas do script exploratório, documentar sempre
que este resultado for citado): correlação (mesmo parcial) não estabelece
causalidade; `renda_media_domiciliar` é renda do trabalho FORMAL (RAIS), não
renda domiciliar total.

Requer a migration 0029 aplicada antes de rodar.
================================================================================
"""

import os

import numpy as np
import pandas as pd
from scipy.stats import pearsonr, rankdata, spearmanr
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

# Mesmo limiar do script exploratório (analisar_correlacao_mmgd_renda.py) —
# abaixo disso, rho é estatisticamente instável e enganoso reportar.
N_MINIMO_AMOSTRA = int(os.environ.get("N_MINIMO_AMOSTRA", "30"))

VARIAVEL_Y = "mmgd_potencia_residencial_per_1000_hab"
CONTROLES = ["renda_media_domiciliar", "irradiacao_media_kwh_m2_dia"]

# Variáveis do eixo "moradia" testadas contra MMGD residencial per capita —
# escopo desta sessão (Recomendação #3): não a bateria completa de 15
# indicadores do script exploratório, só as 2 variáveis centrais do
# argumento moradia x acesso à MMGD (ver Seção 1 de
# docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md).
VARIAVEIS_X = {
    "indice_precariedade_moradia": (
        "Índice de Precariedade Habitacional (cortiço + parede inadequada + população em favela)",
        "negativo",
    ),
    "indice_seguranca_posse": (
        "Índice de Segurança da Posse (próprio=1,0 / alugado=0,5 / cedido=0,0)",
        "positivo",
    ),
}

METODO = "spearman_parcial_residuo_postos"


# --------------------------------------------------------------------------
# 1. Carga dos dados
# --------------------------------------------------------------------------
def carregar_dados(engine) -> pd.DataFrame:
    """
    Painel município a município. Filtro `ue.tipo = 'municipio'` evita
    fan-out de FCUs/ZEIS-AEIS ligadas ao mesmo município (mesmo motivo já
    documentado em analisar_correlacao_mmgd_renda.py). DISTINCT ON garante 1
    linha por município mesmo que o schema comporte múltiplos períodos.
    """
    print("[1/6] Carregando painel município x MMGD residencial x moradia x irradiação x renda...")

    query = text("""
        WITH mmgd_latest AS (
            SELECT DISTINCT ON (unidade_espacial_id)
                unidade_espacial_id, potencia_residencial_kw, periodo_referencia
            FROM mmgd_indicadores
            ORDER BY unidade_espacial_id, periodo_referencia DESC
        ),
        irr_latest AS (
            SELECT DISTINCT ON (codigo_ibge)
                codigo_ibge, irradiacao_media_kwh_m2_dia, periodo_referencia
            FROM irradiacao_solar
            ORDER BY codigo_ibge, periodo_referencia DESC
        )
        SELECT
            m.codigo_ibge,
            m.regiao,
            m.area_km2,
            (mmgd.unidade_espacial_id IS NOT NULL) AS tem_registro_mmgd,
            mmgd.potencia_residencial_kw,
            vsc.densidade_populacional,
            vsc.renda_media_domiciliar,
            vim.indice_precariedade_moradia,
            vim.indice_seguranca_posse,
            irr.irradiacao_media_kwh_m2_dia
        FROM municipios m
        JOIN unidades_espaciais ue
            ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
        LEFT JOIN mmgd_latest mmgd ON mmgd.unidade_espacial_id = ue.id
        LEFT JOIN vw_indicadores_sociais_consolidado vsc ON vsc.unidade_espacial_id = ue.id
        LEFT JOIN vw_indices_compostos_moradia_infraestrutura vim ON vim.codigo_ibge = m.codigo_ibge
        LEFT JOIN irr_latest irr ON irr.codigo_ibge = m.codigo_ibge;
    """)

    with engine.connect() as conexao:
        df = pd.read_sql(query, conexao)

    print(f"      {len(df)} município(s) carregado(s).")
    return df


# --------------------------------------------------------------------------
# 2. MMGD residencial per capita
# --------------------------------------------------------------------------
def calcular_mmgd_residencial_per_capita(df: pd.DataFrame) -> pd.DataFrame:
    print("[2/6] Calculando população estimada e MMGD residencial per capita...")

    df = df.copy()
    df["populacao_estimada"] = df["densidade_populacional"] * df["area_km2"]

    sem_populacao = df["populacao_estimada"].isna().sum()
    if sem_populacao > 0:
        print(f"      [AVISO] {sem_populacao} município(s) sem população estimada — "
              f"ficarão de fora de todas as correlações.")

    # Sem registro em mmgd_indicadores => ausência real de instalação (0).
    # Com registro mas potencia_residencial_kw NULL => snapshot anterior à
    # migration 0020, ainda não reextraído — EXCLUÍDO, nunca tratado como 0.
    sem_registro = ~df["tem_registro_mmgd"]
    pendente_reextracao = df["tem_registro_mmgd"] & df["potencia_residencial_kw"].isna()

    n_pendente = int(pendente_reextracao.sum())
    if n_pendente > 0:
        print(f"      [AVISO] {n_pendente} município(s) com MMGD registrada mas sem quebra "
              f"residencial (pré-migration 0020, ainda não reextraído) — EXCLUÍDO(S) do cálculo, "
              f"não tratados como 0.")

    potencia_residencial = df["potencia_residencial_kw"].copy()
    potencia_residencial[sem_registro] = 0.0
    potencia_residencial[pendente_reextracao] = np.nan

    populacao_valida = df["populacao_estimada"] > 0
    df["mmgd_potencia_residencial_per_1000_hab"] = np.where(
        populacao_valida,
        potencia_residencial / df["populacao_estimada"] * 1000,
        np.nan,
    )

    n_validos = df["mmgd_potencia_residencial_per_1000_hab"].notna().sum()
    print(f"      {n_validos} município(s) com MMGD residencial per capita calculável "
          f"(mediana: {df['mmgd_potencia_residencial_per_1000_hab'].median():.4f} kW/1.000 hab).")

    return df


# --------------------------------------------------------------------------
# 3. Correlação de Spearman (ordem zero) e correlação parcial de Spearman
#    (idêntico ao já validado em analisar_correlacao_mmgd_renda.py)
# --------------------------------------------------------------------------
def correlacao_spearman(df: pd.DataFrame, coluna_x: str, coluna_y: str) -> dict:
    subset = df[[coluna_x, coluna_y]].dropna()
    n = len(subset)
    if n < N_MINIMO_AMOSTRA:
        return {"rho": np.nan, "p_valor": np.nan, "n": n}
    rho, p_valor = spearmanr(subset[coluna_x], subset[coluna_y])
    return {"rho": rho, "p_valor": p_valor, "n": n}


def _residuo_de_postos(postos_alvo: np.ndarray, postos_controles: np.ndarray) -> np.ndarray:
    design = np.column_stack([np.ones(len(postos_controles)), postos_controles])
    coeficientes, _, _, _ = np.linalg.lstsq(design, postos_alvo, rcond=None)
    preditos = design @ coeficientes
    return postos_alvo - preditos


def correlacao_parcial_spearman(
    df: pd.DataFrame, coluna_x: str, coluna_y: str, colunas_controle: list
) -> dict:
    colunas = [coluna_x, coluna_y] + colunas_controle
    subset = df[colunas].dropna()
    n = len(subset)
    if n < N_MINIMO_AMOSTRA:
        return {"rho_parcial": np.nan, "p_valor": np.nan, "n": n}

    postos_x = rankdata(subset[coluna_x].to_numpy())
    postos_y = rankdata(subset[coluna_y].to_numpy())
    postos_controles = np.column_stack(
        [rankdata(subset[c].to_numpy()) for c in colunas_controle]
    )

    residuo_x = _residuo_de_postos(postos_x, postos_controles)
    residuo_y = _residuo_de_postos(postos_y, postos_controles)

    if np.std(residuo_x) == 0 or np.std(residuo_y) == 0:
        return {"rho_parcial": np.nan, "p_valor": np.nan, "n": n}

    rho_parcial, p_valor = pearsonr(residuo_x, residuo_y)
    return {"rho_parcial": rho_parcial, "p_valor": p_valor, "n": n}


# --------------------------------------------------------------------------
# 4. Robustez regional
# --------------------------------------------------------------------------
def checar_robustez_regional(df: pd.DataFrame, coluna_x: str, coluna_y: str, sinal_nacional: float) -> dict:
    regioes = sorted(df["regiao"].dropna().unique())
    testadas = 0
    mesmo_sinal = 0
    for regiao in regioes:
        subset = df[df["regiao"] == regiao]
        resultado = correlacao_parcial_spearman(subset, coluna_x, coluna_y, CONTROLES)
        if pd.isna(resultado["rho_parcial"]) or resultado["n"] < N_MINIMO_AMOSTRA:
            continue
        testadas += 1
        if np.sign(resultado["rho_parcial"]) == sinal_nacional:
            mesmo_sinal += 1

    if testadas == 0:
        veredito = "amostra regional insuficiente"
    elif mesmo_sinal == testadas:
        veredito = f"robusto — mesmo sinal em {mesmo_sinal}/{testadas} regiões"
    else:
        veredito = f"sensível — sinal muda em ao menos 1 região ({mesmo_sinal}/{testadas} concordam)"

    return {"n_regioes_testadas": testadas, "n_regioes_mesmo_sinal": mesmo_sinal, "veredito": veredito}


# --------------------------------------------------------------------------
# 5. Upsert em analises_estatisticas (transação por linha)
# --------------------------------------------------------------------------
SQL_UPSERT = text("""
    INSERT INTO analises_estatisticas
        (variavel_x, rotulo_variavel_x, sentido_esperado, variavel_y, variaveis_controle,
         metodo, n, rho_bruto, p_valor_bruto, rho_parcial, p_valor_parcial,
         n_regioes_testadas, n_regioes_mesmo_sinal, veredito_robustez, calculado_em)
    VALUES
        (:variavel_x, :rotulo_variavel_x, :sentido_esperado, :variavel_y, :variaveis_controle,
         :metodo, :n, :rho_bruto, :p_valor_bruto, :rho_parcial, :p_valor_parcial,
         :n_regioes_testadas, :n_regioes_mesmo_sinal, :veredito_robustez, now())
    ON CONFLICT (variavel_x, variavel_y) DO UPDATE SET
        rotulo_variavel_x = EXCLUDED.rotulo_variavel_x,
        sentido_esperado = EXCLUDED.sentido_esperado,
        variaveis_controle = EXCLUDED.variaveis_controle,
        metodo = EXCLUDED.metodo,
        n = EXCLUDED.n,
        rho_bruto = EXCLUDED.rho_bruto,
        p_valor_bruto = EXCLUDED.p_valor_bruto,
        rho_parcial = EXCLUDED.rho_parcial,
        p_valor_parcial = EXCLUDED.p_valor_parcial,
        n_regioes_testadas = EXCLUDED.n_regioes_testadas,
        n_regioes_mesmo_sinal = EXCLUDED.n_regioes_mesmo_sinal,
        veredito_robustez = EXCLUDED.veredito_robustez,
        calculado_em = now()
""")


def _valor_sql(valor):
    """
    NaN do numpy/pandas não é serializável para o driver — vira None (NULL).
    Também converte numpy.float64 (retorno de scipy/numpy) para float nativo
    do Python — psycopg2 não tem adapter para numpy.float64, e o valor cai
    no fallback de repr() do SQLAlchemy, que gera SQL inválido (ex.:
    "np.float64(0.1524)" interpretado como "schema np").
    """
    if valor is None or (isinstance(valor, (float, np.floating)) and np.isnan(valor)):
        return None
    return float(valor)


def main():
    print("Cálculo de análise estatística: MMGD residencial x eixo moradia "
          "(Spearman + parcial controlando renda+irradiação, com robustez regional)")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)

    df = carregar_dados(engine)
    df = calcular_mmgd_residencial_per_capita(df)

    print(f"\n[3/6] Correlação de ordem zero x parcial (controlando {CONTROLES})...")
    resultados = []
    for coluna_x, (rotulo, sentido) in VARIAVEIS_X.items():
        bruta = correlacao_spearman(df, coluna_x, VARIAVEL_Y)
        parcial = correlacao_parcial_spearman(df, coluna_x, VARIAVEL_Y, CONTROLES)
        print(f"      {rotulo}:")
        print(f"        bruto   = {bruta['rho']:+.4f} (p={bruta['p_valor']:.4g}, n={bruta['n']})"
              if pd.notna(bruta["rho"]) else f"        bruto   = amostra insuficiente (n={bruta['n']})")
        print(f"        parcial = {parcial['rho_parcial']:+.4f} (p={parcial['p_valor']:.4g}, n={parcial['n']})"
              if pd.notna(parcial["rho_parcial"]) else f"        parcial = amostra insuficiente (n={parcial['n']})")
        resultados.append({"coluna_x": coluna_x, "rotulo": rotulo, "sentido": sentido,
                            "bruta": bruta, "parcial": parcial})

    print(f"\n[4/6] Checando robustez regional (sinal do parcial mantido em quantas das 5 regiões)...")
    for r in resultados:
        if pd.isna(r["parcial"]["rho_parcial"]):
            r["robustez"] = {"n_regioes_testadas": 0, "n_regioes_mesmo_sinal": 0,
                              "veredito": "amostra nacional insuficiente"}
            print(f"      {r['rotulo']}: amostra nacional insuficiente, robustez não testada.")
            continue
        sinal_nacional = np.sign(r["parcial"]["rho_parcial"])
        r["robustez"] = checar_robustez_regional(df, r["coluna_x"], VARIAVEL_Y, sinal_nacional)
        print(f"      {r['rotulo']}: {r['robustez']['veredito']}")

    print(f"\n[5/6] Gravando {len(resultados)} resultado(s) em analises_estatisticas "
          f"(ON CONFLICT (variavel_x, variavel_y) DO UPDATE)...")
    gravados = 0
    falhas = []
    for r in resultados:
        try:
            with engine.begin() as con:
                con.execute(SQL_UPSERT, {
                    "variavel_x": r["coluna_x"],
                    "rotulo_variavel_x": r["rotulo"],
                    "sentido_esperado": r["sentido"],
                    "variavel_y": VARIAVEL_Y,
                    "variaveis_controle": CONTROLES,
                    "metodo": METODO,
                    "n": int(r["bruta"]["n"]),
                    "rho_bruto": _valor_sql(r["bruta"]["rho"]),
                    "p_valor_bruto": _valor_sql(r["bruta"]["p_valor"]),
                    "rho_parcial": _valor_sql(r["parcial"]["rho_parcial"]),
                    "p_valor_parcial": _valor_sql(r["parcial"]["p_valor"]),
                    "n_regioes_testadas": r["robustez"]["n_regioes_testadas"],
                    "n_regioes_mesmo_sinal": r["robustez"]["n_regioes_mesmo_sinal"],
                    "veredito_robustez": r["robustez"]["veredito"],
                })
            gravados += 1
        except Exception as e:
            falhas.append((r["coluna_x"], str(e)[:200]))

    print(f"[6/6] {gravados} resultado(s) gravado(s). Falhas: {len(falhas)}")
    for coluna_x, erro in falhas:
        print(f"        - {coluna_x}: {erro}")

    print("\n✅ Cálculo de análise estatística concluído.")


if __name__ == "__main__":
    main()
