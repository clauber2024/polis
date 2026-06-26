"""
EXTRACTOR: mmgd_indicadores (a partir da Relação de Empreendimentos de
Geração Distribuída da ANEEL)
================================================================================
O QUE ESTE SCRIPT FAZ:
  1. Lê o arquivo Parquet de empreendimentos MMGD da ANEEL (microdados, um
     registro por empreendimento/unidade consumidora)
  2. Agrega por município: soma potência instalada (kW) e soma de UCs que
     recebem crédito
  3. Faz upsert em `mmgd_indicadores`, usando o `unidade_espacial_id` do
     espelho de município (formato 'municipio:CODIGO_IBGE') que já existe
     em `unidades_espaciais` desde o seed de municípios

DECISÃO IMPORTANTE — POR QUE SNAPSHOT ÚNICO, NÃO HISTÓRICO MENSAL:
--------------------------------------------------------------------------
O arquivo da ANEEL é um SNAPSHOT do estado atual acumulado (toda a base tem
o mesmo AnmPeriodoReferencia e DatGeracaoConjuntoDados), não um log de
eventos de conexão com data variável por linha. A coluna
DthAtualizaCadastralEmpreend existe, mas representa "última atualização
cadastral", não necessariamente "data de conexão real" — usar isso para
reconstruir uma série histórica mensal seria uma inferência metodologicamente
frágil. Por isso, este extractor grava apenas o período de referência do
snapshot atual (ex: 2026-06-01). Histórico mensal real, se necessário no
futuro, deve vir de snapshots arquivados anteriores da própria ANEEL — não
de uma reconstrução a partir desta coluna.

POR QUE QtdUCRecebeCredito SOMADO, NÃO count() DE LINHAS:
--------------------------------------------------------------------------
Cada linha do arquivo é um empreendimento único (confirmado: CodEmpreendimento
não se repete). Mas o número de UCs efetivamente beneficiadas por aquele
empreendimento está no campo QtdUCRecebeCredito — um empreendimento pode
beneficiar múltiplas UCs (rateio de créditos). Por isso somamos esse campo,
em vez de contar linhas, para refletir o número real de UCs impactadas.

POR QUE total_ucs_municipio FICA NULL:
--------------------------------------------------------------------------
Esse dado (total de UCs cadastradas no município, não apenas as com MMGD)
não vem deste arquivo da ANEEL. Viria de outra fonte (ex: dados de mercado
das distribuidoras). Não inventamos esse número — fica NULL até termos uma
fonte real para ele, evitando que o "% de UCs com MMGD" do DRF seja calculado
sobre um denominador fictício.
================================================================================
"""

import os
import sys

import pandas as pd
from sqlalchemy import create_engine, text


CAMINHO_PARQUET = os.environ.get(
    "CAMINHO_PARQUET",
    "backend/src/etl/data/raw/aneel_mmgd/empreendimento-geracao-distribuida.parquet",
)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

# Data sentinela usada pela ANEEL para "sem data" — não é um dado real, ignorar.
DATA_SENTINELA = pd.to_datetime("1900-01-01").date()


def carregar_dados(caminho: str) -> pd.DataFrame:
    print(f"[1/4] Lendo Parquet de: {caminho}")
    df = pd.read_parquet(caminho)
    print(f"      {len(df)} empreendimentos encontrados no arquivo.")

    n_sentinela = (df["DthAtualizaCadastralEmpreend"] == DATA_SENTINELA).sum()
    if n_sentinela > 0:
        print(f"      [AVISO] {n_sentinela} registro(s) com data sentinela 1900-01-01 "
              f"(ignorados na contagem de idade do dado, mas mantidos na agregação de potência).")

    return df


def extrair_periodo_referencia(df: pd.DataFrame) -> str:
    """
    Extrai o período de referência (mês/ano) do snapshot, a partir da coluna
    AnmPeriodoReferencia (formato 'MM/YYYY'). Confirmado em teste que essa
    coluna tem um único valor para todo o arquivo (é um snapshot, não série).
    Converte para o formato de data 'YYYY-MM-01', seguindo a convenção do
    schema (dia 1 representa o mês inteiro).
    """
    valores_unicos = df["AnmPeriodoReferencia"].unique()
    if len(valores_unicos) != 1:
        print(f"[ERRO] Esperava um único período de referência no arquivo, "
              f"mas encontrei {len(valores_unicos)}: {valores_unicos}")
        print("       Isso pode significar que a ANEEL mudou o formato do arquivo, "
              "ou que este não é mais um snapshot único. Revise o script antes de prosseguir.")
        sys.exit(1)

    mes_str, ano_str = valores_unicos[0].split("/")
    periodo = f"{ano_str}-{mes_str}-01"
    print(f"[2/4] Período de referência do snapshot: {periodo}")
    return periodo


def agregar_por_municipio(df: pd.DataFrame) -> pd.DataFrame:
    print("[3/4] Agregando por município...")

    df = df.copy()

    # Verifica nulos em colunas críticas ANTES de agregar — um valor nulo
    # silenciosamente tratado como zero pelo .sum() do pandas mascararia
    # dados incompletos como "sem potência", o que é diferente de "dado
    # ausente". Reportamos isso explicitamente.
    nulos_potencia = df["MdaPotenciaInstaladaKW"].isna().sum()
    nulos_ucs = df["QtdUCRecebeCredito"].isna().sum()
    nulos_municipio = df["CodMunicipioIbge"].isna().sum()
    if nulos_potencia > 0:
        print(f"      [AVISO] {nulos_potencia} linha(s) com potência instalada nula — "
              f"serão tratadas como 0 na soma (não descartadas).")
    if nulos_ucs > 0:
        print(f"      [AVISO] {nulos_ucs} linha(s) com QtdUCRecebeCredito nula — "
              f"serão tratadas como 0 na soma (não descartadas).")
    if nulos_municipio > 0:
        print(f"      [ERRO] {nulos_municipio} linha(s) sem código de município (CodMunicipioIbge nulo). "
              f"Essas linhas não podem ser agregadas territorialmente e serão DESCARTADAS.")
        df = df[df["CodMunicipioIbge"].notna()].copy()

    # Garante código IBGE como string de 7 caracteres, mesma convenção do
    # seed de municípios (alguns sistemas podem trazer como número, perdendo
    # zeros à esquerda — nenhum município brasileiro começa com 0, mas
    # mantemos a normalização por segurança e consistência).
    df["codigo_ibge"] = df["CodMunicipioIbge"].astype(int).astype(str).str.zfill(7)

    agregado = df.groupby("codigo_ibge").agg(
        potencia_instalada_kw=("MdaPotenciaInstaladaKW", "sum"),
        numero_ucs_com_mmgd=("QtdUCRecebeCredito", "sum"),
        numero_empreendimentos=("codigo_ibge", "count"),
    ).reset_index()

    print(f"      {len(agregado)} municípios com MMGD agregados.")
    print(f"      Potência total nacional: {agregado['potencia_instalada_kw'].sum() / 1000:.1f} MW")
    print(f"      Total de empreendimentos: {agregado['numero_empreendimentos'].sum()}")

    return agregado


def executar_upsert_mmgd(engine, agregado: pd.DataFrame, periodo_referencia: str):
    """
    Faz upsert em mmgd_indicadores, referenciando o ESPELHO de município em
    unidades_espaciais (id = 'municipio:CODIGO_IBGE'), não municipios
    diretamente — mesma lógica de granularidade flexível do seed territorial.

    Se a unidade_espacial_id não existir (município sem espelho cadastrado),
    a foreign key vai rejeitar a linha — nesse caso reportamos quais códigos
    falharam, em vez de deixar o erro do banco interromper tudo sem contexto.
    """
    print(f"[4/4] Inserindo/atualizando `mmgd_indicadores` para período {periodo_referencia}...")

    sql_upsert = text("""
        INSERT INTO mmgd_indicadores
            (unidade_espacial_id, periodo_referencia, potencia_instalada_kw,
             numero_ucs_com_mmgd, total_ucs_municipio, e_dado_ilustrativo)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :potencia_instalada_kw,
             :numero_ucs_com_mmgd, NULL, 'false')
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            potencia_instalada_kw = EXCLUDED.potencia_instalada_kw,
            numero_ucs_com_mmgd = EXCLUDED.numero_ucs_com_mmgd;
    """)

    total = len(agregado)
    falhas = []
    inseridos = 0

    with engine.begin() as conexao:
        for i, linha in agregado.iterrows():
            unidade_espacial_id = f"municipio:{linha['codigo_ibge']}"
            try:
                conexao.execute(sql_upsert, {
                    "unidade_espacial_id": unidade_espacial_id,
                    "periodo_referencia": periodo_referencia,
                    "potencia_instalada_kw": float(linha["potencia_instalada_kw"]),
                    "numero_ucs_com_mmgd": int(linha["numero_ucs_com_mmgd"]),
                })
                inseridos += 1
            except Exception as e:
                falhas.append((linha["codigo_ibge"], str(e)))

            if (i + 1) % 1000 == 0 or (i + 1) == total:
                print(f"      ... {i + 1}/{total} municípios processados")

    print(f"      {inseridos} município(s) inseridos/atualizados com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} município(s) falharam (provavelmente sem "
              f"unidade_espacial correspondente — município não encontrado no seed territorial):")
        for codigo, erro in falhas[:10]:
            print(f"        - {codigo}: {erro[:120]}")
        if len(falhas) > 10:
            print(f"        ... e mais {len(falhas) - 10} falha(s).")


def main():
    if not os.path.exists(CAMINHO_PARQUET):
        print(f"[ERRO] Arquivo Parquet não encontrado em: {CAMINHO_PARQUET}")
        print("       Defina a variável de ambiente CAMINHO_PARQUET ou ajuste o caminho padrão.")
        sys.exit(1)

    df = carregar_dados(CAMINHO_PARQUET)
    periodo_referencia = extrair_periodo_referencia(df)
    agregado = agregar_por_municipio(df)

    print(f"\nConectando ao banco: {DATABASE_URL.split('@')[-1]}")
    engine = create_engine(DATABASE_URL)

    executar_upsert_mmgd(engine, agregado, periodo_referencia)

    print("\n✅ Extração de MMGD concluída com sucesso.")


if __name__ == "__main__":
    main()
