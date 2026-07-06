"""
EXTRACTOR: indicadores_sociais — RDPC (Rendimento Domiciliar Per Capita)
================================================================================
POR QUE ESTE EXTRACTOR EXISTE:
--------------------------------------------------------------------------
Achado colateral da investigação de "ônus excessivo com aluguel" (sessão
06/07/2026, ver ARQUITETURA.md, seção "Decisões de fontes"). O indicador de
aluguel em si foi descartado (Censo 2022 não coletou valor de aluguel; PNAD
Contínua/POF sem granularidade municipal; CadÚnico/CECAD tem o dado mas
acesso restrito por perfil) — mas essa mesma investigação encontrou que o
RDPC é uma melhoria real para a dimensão Renda e Trabalho, independente da
questão do aluguel: é renda de TODAS as fontes (trabalho formal e informal,
aposentadoria, benefícios sociais, aluguel recebido etc.), mais completa que
`renda_media_domiciliar` (RAIS, capta só trabalho formal).

FONTES (nível municipal, Censo 2022) — metadados confirmados via API real,
não via documentação/busca (mesmo cuidado já registrado para os casos TSEE e
percentual_apartamento, ver backend/src/etl/analises/inspecionar_metadados_
sidra_rdpc.py):
  - Tabela SIDRA 10295, variável 13431 ("Valor do rendimento nominal médio
    mensal domiciliar per capita..."), classificações Sexo (id 2), Cor ou
    raça (id 86) e Grupo de idade (id 58) fixadas em "Total"
    (6794 / 95251 / 95253) — valor agregado do município, não quebrado por
    subgrupo.
  - Tabela SIDRA 10296, variável 1013604 ("...percentual do total geral"),
    classificação 386 (Classes de rendimento nominal mensal domiciliar per
    capita), categorias 9681 ("Até 1/4 de salário mínimo") + 9682 ("Mais de
    1/4 a 1/2 salário mínimo") somadas = % de moradores com RDPC até 1/2
    salário mínimo.

Reaproveita o padrão de consulta SIDRA já validado em extrair_moradia_censo.py
e extrair_tipo_domicilio_censo.py, adaptado para múltiplas classificações na
mesma query (formato `classificacao=ID1[cat]|ID2[cat]|...` da API v3 do IBGE).
================================================================================
"""

import os
import sys
import time

import pandas as pd
import requests
from sqlalchemy import create_engine, text


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

PERIODO_REFERENCIA = "2022-01-01"
BASE_URL = "https://servicodados.ibge.gov.br/api/v3/agregados"


def consultar_sidra(tabela: int, variavel: int, filtro_classificacoes: str) -> pd.DataFrame:
    """Consulta genérica com suporte a múltiplas classificações combinadas
    (formato `ID1[categorias]|ID2[categorias]|...`). Quando a classificação
    386 (Classes de rendimento) está entre os filtros com mais de uma
    categoria, cada combinação retorna como um `resultado` separado — a
    categoria correspondente é extraída e devolvida na coluna
    `categoria_386` para permitir agregação posterior (soma de faixas)."""
    url = (
        f"{BASE_URL}/{tabela}/periodos/2022/variaveis/{variavel}"
        f"?localidades=N6[all]&classificacao={filtro_classificacoes}"
    )
    print(f"      Consultando Tabela {tabela} (variável {variavel})...")

    max_tentativas = 3
    resposta = None
    for tentativa in range(1, max_tentativas + 1):
        resposta = requests.get(url, timeout=90)
        if resposta.status_code == 200:
            break
        print(f"      [AVISO] Tentativa {tentativa}/{max_tentativas} falhou com status {resposta.status_code}.")
        if tentativa < max_tentativas:
            time.sleep(5 * tentativa)

    if resposta.status_code != 200:
        print(f"      [ERRO] Status {resposta.status_code} após {max_tentativas} tentativas: {resposta.text[:300]}")
        sys.exit(1)

    dados = resposta.json()
    linhas = []
    contagem_zeros_literais = 0
    for bloco_variavel in dados:
        for resultado in bloco_variavel.get("resultados", []):
            categoria_386 = None
            for classif in resultado.get("classificacoes", []):
                if classif.get("id") == "386":
                    categoria_386 = list(classif["categoria"].keys())[0]

            for serie in resultado.get("series", []):
                codigo_ibge = serie["localidade"]["id"]
                for _periodo, valor in serie["serie"].items():
                    if valor in ("...", "X", None):
                        continue
                    if valor == "-":
                        # "-" = dado numerico igual a zero (convencao IBGE). Para
                        # um valor MEDIO (RDPC), zero legitimo so faz sentido se o
                        # municipio nao tem populacao na categoria consultada -
                        # improvavel aqui (Total/Total/Total). Registra para AVISO
                        # mas nao descarta, mesmo tratamento ja usado nos demais
                        # extractors deste projeto para o simbolo "-".
                        contagem_zeros_literais += 1
                        valor_numerico = 0.0
                    else:
                        valor_numerico = float(valor)
                    linhas.append({
                        "codigo_ibge": str(codigo_ibge).zfill(7),
                        "categoria_386": categoria_386,
                        "valor": valor_numerico,
                    })

    if contagem_zeros_literais > 0:
        print(f"      [AVISO] {contagem_zeros_literais} registro(s) vieram como \"-\" (zero literal "
              f"segundo convenção do IBGE) — verificar se são municípios sem população na categoria "
              f"consultada, não erro de extração.")

    df = pd.DataFrame(linhas)
    print(f"      {len(df)} registro(s) recebido(s).")
    return df


def calcular_renda_per_capita_rdpc() -> pd.DataFrame:
    print("[1/2] Consultando RDPC médio (Tabela SIDRA 10295, variável 13431)...")
    df = consultar_sidra(10295, 13431, "2[6794]|86[95251]|58[95253]")

    resultado = df[["codigo_ibge", "valor"]].rename(columns={"valor": "renda_per_capita_rdpc"})
    print(f"      {len(resultado)} município(s) calculado(s).")
    print(f"      Média nacional (não ponderada por município): R$ {resultado['renda_per_capita_rdpc'].mean():.2f}")
    return resultado


def calcular_percentual_baixa_renda_rdpc() -> pd.DataFrame:
    print("[2/2] Consultando distribuição por classes de RDPC (Tabela SIDRA 10296, variável 1013604)...")
    df = consultar_sidra(10296, 1013604, "2[6794]|86[95251]|386[9681,9682]")

    categorias_encontradas = sorted(df["categoria_386"].dropna().unique().tolist())
    esperadas = {"9681", "9682"}
    if set(categorias_encontradas) != esperadas:
        print(f"      [AVISO] Categorias retornadas ({categorias_encontradas}) diferem do esperado "
              f"({sorted(esperadas)}) — conferir classificação 386 antes de confiar no resultado.")

    resultado = (
        df.groupby("codigo_ibge")["valor"].sum()
        .rename("percentual_baixa_renda_rdpc")
        .reset_index()
    )
    print(f"      {len(resultado)} município(s) calculado(s).")
    print(f"      Média nacional (não ponderada): {resultado['percentual_baixa_renda_rdpc'].mean():.2f}%")
    return resultado


def filtrar_municipios_existentes(engine, df: pd.DataFrame) -> pd.DataFrame:
    with engine.connect() as conexao:
        resultado = conexao.execute(text("SELECT codigo_ibge FROM municipios"))
        codigos_validos = {linha[0] for linha in resultado}

    mascara_valida = df["codigo_ibge"].isin(codigos_validos)
    invalidos = df[~mascara_valida]
    if len(invalidos) > 0:
        print(f"      [AVISO] {len(invalidos)} código(s) IBGE não existem na base territorial — IGNORADOS:")
        for codigo in invalidos["codigo_ibge"].tolist()[:10]:
            print(f"        - {codigo}")

    return df[mascara_valida].copy()


def executar_upsert(engine, df: pd.DataFrame):
    """Transação por município (mesma correção de robustez já aplicada em
    todos os extractors anteriores — ver CLAUDE.md seção 4)."""
    print(f"\nInserindo/atualizando `indicadores_sociais` para período {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, renda_per_capita_rdpc, percentual_baixa_renda_rdpc)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :renda_per_capita_rdpc, :percentual_baixa_renda_rdpc)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            renda_per_capita_rdpc = EXCLUDED.renda_per_capita_rdpc,
            percentual_baixa_renda_rdpc = EXCLUDED.percentual_baixa_renda_rdpc;
    """)

    total = len(df)
    inseridos = 0
    falhas = []

    def valor_ou_none(x):
        return None if pd.isna(x) else float(x)

    for i, linha in df.iterrows():
        unidade_espacial_id = f"municipio:{linha['codigo_ibge']}"
        try:
            with engine.begin() as conexao:
                conexao.execute(sql_upsert, {
                    "unidade_espacial_id": unidade_espacial_id,
                    "periodo_referencia": PERIODO_REFERENCIA,
                    "renda_per_capita_rdpc": valor_ou_none(linha.get("renda_per_capita_rdpc")),
                    "percentual_baixa_renda_rdpc": valor_ou_none(linha.get("percentual_baixa_renda_rdpc")),
                })
            inseridos += 1
        except Exception as e:
            falhas.append((linha["codigo_ibge"], str(e)))

        if (i + 1) % 1000 == 0 or (i + 1) == total:
            print(f"      ... {i + 1}/{total} municípios processados")

    print(f"      {inseridos} município(s) inseridos/atualizados com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} município(s) falharam:")
        for codigo, erro in falhas[:10]:
            print(f"        - {codigo}: {erro[:120]}")


def main():
    print("Construindo indicador de RDPC (Rendimento Domiciliar Per Capita) — Censo 2022/SIDRA 10295+10296")
    print("=" * 70)
    print("ATENÇÃO: requer a migration 0017_indicadores_sociais_rdpc.sql já aplicada")
    print("(cria as colunas renda_per_capita_rdpc / percentual_baixa_renda_rdpc e atualiza a view consolidada).")
    print()

    engine = create_engine(DATABASE_URL)

    df_renda = calcular_renda_per_capita_rdpc()
    df_baixa_renda = calcular_percentual_baixa_renda_rdpc()

    df_combinado = df_renda.merge(df_baixa_renda, on="codigo_ibge", how="outer")
    sem_par = df_combinado[df_combinado.isna().any(axis=1)]
    if len(sem_par) > 0:
        print(f"\n[AVISO] {len(sem_par)} município(s) tem valor em só uma das duas tabelas (10295/10296) "
              f"— ficarão com NULL na coluna faltante, não descartados.")

    df_valido = filtrar_municipios_existentes(engine, df_combinado)
    executar_upsert(engine, df_valido)

    print("\nExtração de RDPC concluída.")


if __name__ == "__main__":
    main()
