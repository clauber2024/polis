"""
INVESTIGAÇÃO EXPLORATÓRIA: Perdas Não Técnicas (furto/fraude, ANEEL SAMP-
Balanço) x renda média domiciliar, por município
================================================================================
CONTEXTO: ideia levantada em 03/07/2026 ("perdas não técnicas tendem a
concentrar em áreas de baixa renda") - pesquisa de viabilidade (07/07/2026,
ver ARQUITETURA.md, seção "Perdas técnicas e não técnicas") confirmou o
dataset (SAMP - Balanço, `dadosabertos.aneel.gov.br/dataset/samp-balanco`,
resource CSV id `9f03a034-fb01-4daa-b6a6-e25a84d979ed`) mas achou um
problema: a granularidade é por DISTRIBUIDORA (CNPJ/NomAgente) x mês, SEM
campo de município - diferente de MMGD/INDQUAL/indicadores sociais, que já
vêm no nível certo.

RECONFIRMADO nesta sessão (08/07/2026) via API `datastore_search` direto
(não só o resumo da sessão anterior): 12 colunas, 125.341 linhas contendo
"Perdas" de 542.641 totais, exemplo real batendo exatamente com o já
documentado (Energisa Acre, 2003-01: Perdas Técnicas 6.109.263 kWh, Perdas
Não-Técnicas 9.974.728 kWh). Dataset tem versão Parquet MUITO menor que o CSV
(3,8 MB vs 132 MB) - usada aqui para agilizar.

SOLUÇÃO DE GRANULARIDADE - MESMA JÁ USADA NO PROJETO PARA TARIFA RESIDENCIAL:
resolve por DISTRIBUIDORA via `qualidade_conjuntos`/`qualidade_conjunto_
municipio` (schema já carregado do INDQUAL) - só que aqui, MELHOR que a
tarifa: o SAMP-Balanço tem `NumCPFCNPJ` (CNPJ da distribuidora), e
`qualidade_conjuntos` tem `num_cnpj` - join por CNPJ é EXATO, não por nome
(a tarifa precisou casar por `SigAgente` textual porque a fonte dela não
tinha CNPJ). Município com MÚLTIPLAS distribuidoras (área de concessão
dividida) fica sem valor único, mesmo critério já usado para tarifa.

INDICADOR CALCULADO: `percentual_perdas_nao_tecnicas` = Perdas Não-Técnicas /
(Perdas Técnicas + Perdas Não-Técnicas), por distribuidora, no MODO "valor
medido" (não "valor faturado" - medido é a estimativa técnica real, faturado
é o que foi cobrado do consumidor, podem divergir por inadimplência/
parcelamento). Normalizado em % em vez de valor absoluto (kWh) para não
confundir "distribuidora grande" com "má distribuidora" - o que importa para
a hipótese de justiça energética é a PROPORÇÃO da perda que é furto/fraude,
não o volume absoluto (que reflete só o tamanho do mercado).

PERÍODO USADO: mês mais recente disponível no dataset (ver `MES_REFERENCIA`
abaixo, ajustar se o resultado parecer ruidoso demais - séries de 1 mês só
podem ser mais voláteis que uma média de 12 meses, mesma cautela já usada
noutras análises desta pasta).

ESTE SCRIPT É SOMENTE LEITURA - não grava nada no banco.
================================================================================
"""

import os
import sys

import pandas as pd
import requests
from sqlalchemy import create_engine, text

sys.path.insert(0, "backend/src/etl/analises")

from analisar_correlacao_mmgd_renda import (  # noqa: E402
    DATABASE_URL,
    correlacao_parcial_spearman,
    correlacao_spearman,
)

URL_PARQUET_SAMP_BALANCO = (
    "https://dadosabertos.aneel.gov.br/dataset/3193ebab-81b3-406e-be0e-f968a4a21689/"
    "resource/cffe3c15-9d3e-4187-ae63-e097cf88c0af/download/samp-balanco.parquet"
)
CAMINHO_CACHE_SAMP_BALANCO = os.environ.get(
    "CAMINHO_CACHE_SAMP_BALANCO",
    "backend/src/etl/data/raw/aneel_samp_balanco/samp-balanco.parquet",
)

# AnmCompetenciaBalanco no formato "AAAAMM". ACHADO IMPORTANTE (08/07/2026,
# apos rodar contra o arquivo real): o mes mais recente no dataset (202605)
# NAO tem defasagem de "algumas distribuidoras faltando" - tem uma defasagem
# de PROCESSAMENTO: so existem 16 linhas de "Perdas na Distribuicao (valor
# medido)" nesse mes, e TODAS sao "Perdas Totais" (nenhuma "Perdas Tecnicas"/
# "Perdas Nao-Tecnicas" ainda). A cobertura por distribuidora (contagem de
# CNPJs distintos com a quebra tecnica/nao-tecnica) cai de forma continua:
# ~57 em 2024 inteiro (baseline estavel) -> 54/52/52/51/47 em jan-jul/2025 ->
# despenca para 26/23/24/23/23/22/21/20 de ago/2025 a mar/2026 -> 0 em
# abr-mai/2026. Ou seja, a granularidade fina (tecnica x nao-tecnica) demora
# MUITO mais para ser publicada do que o "Perdas Totais" agregado. Usamos
# 202503 (mar/2025: 54 de ~57 distribuidoras historicas, ~95% de cobertura)
# como o mes mais recente com cobertura essencialmente completa. Reavaliar
# este valor se rodar em sessao futura (o dataset e atualizado mensalmente e
# a defasagem de processamento pode diminuir).
MES_REFERENCIA = os.environ.get("MES_REFERENCIA", "202503")


# --------------------------------------------------------------------------
# 1. Baixar e carregar SAMP-Balanço (Parquet - bem menor que o CSV)
# --------------------------------------------------------------------------
def baixar_samp_balanco() -> None:
    if os.path.exists(CAMINHO_CACHE_SAMP_BALANCO):
        print(f"      Cache local já existe em {CAMINHO_CACHE_SAMP_BALANCO} - pulando download.")
        return

    print(f"      Baixando {URL_PARQUET_SAMP_BALANCO} (~3,8 MB)...")
    os.makedirs(os.path.dirname(CAMINHO_CACHE_SAMP_BALANCO), exist_ok=True)
    cabecalhos = {"User-Agent": "Mozilla/5.0 (compatible; AtlasSolarJusto/1.0)"}
    resposta = requests.get(URL_PARQUET_SAMP_BALANCO, headers=cabecalhos, timeout=120)
    resposta.raise_for_status()
    with open(CAMINHO_CACHE_SAMP_BALANCO, "wb") as f:
        f.write(resposta.content)
    print(f"      Download concluído: {CAMINHO_CACHE_SAMP_BALANCO}")


def carregar_perdas_por_distribuidora() -> pd.DataFrame:
    print(f"[1/5] Carregando SAMP-Balanço (perdas, competência {MES_REFERENCIA}, "
          f"valor medido)...")
    baixar_samp_balanco()

    df = pd.read_parquet(CAMINHO_CACHE_SAMP_BALANCO)
    print(f"      {len(df)} linha(s) totais no arquivo.")

    # CUIDADO: no Parquet real (confirmado 08/07/2026, apos 1o erro de execucao),
    # AnmCompetenciaBalanco vem como int64 (ex.: 202605), NAO como string - por
    # isso comparamos com int(MES_REFERENCIA), nao com a string diretamente
    # (comparacao str==int no pandas nunca da match, falha silenciosamente
    # retornando 0 linhas em vez de erro).
    filtro = (
        (df["AnmCompetenciaBalanco"] == int(MES_REFERENCIA))
        & (df["DscModalidadeBalanco"] == "Perdas na Distribuição (valor medido)")
        & (df["DscCctBalanco"].isin(["Perdas Técnicas", "Perdas Não-Técnicas"]))
    )
    df_filtrado = df[filtro].copy()
    print(f"      {len(df_filtrado)} linha(s) após filtrar competência/modalidade/tipo "
          f"({df_filtrado['NumCPFCNPJ'].nunique()} distribuidora(s) distinta(s)).")

    if df_filtrado.empty:
        raise SystemExit(
            f"[ERRO] Nenhuma linha para competência {MES_REFERENCIA} - ajustar "
            f"MES_REFERENCIA para um mês com dado (ver coluna AnmCompetenciaBalanco "
            f"no arquivo bruto)."
        )

    df_filtrado["VlrEnergia"] = pd.to_numeric(df_filtrado["VlrEnergia"], errors="coerce")

    pivotado = df_filtrado.pivot_table(
        index="NumCPFCNPJ", columns="DscCctBalanco", values="VlrEnergia", aggfunc="sum"
    ).reset_index()
    pivotado.columns.name = None
    pivotado["NumCPFCNPJ"] = pivotado["NumCPFCNPJ"].apply(normalizar_cnpj)
    pivotado = pivotado.rename(columns={
        "Perdas Técnicas": "perdas_tecnicas_kwh",
        "Perdas Não-Técnicas": "perdas_nao_tecnicas_kwh",
    })

    for coluna in ["perdas_tecnicas_kwh", "perdas_nao_tecnicas_kwh"]:
        if coluna not in pivotado.columns:
            pivotado[coluna] = pd.NA

    pivotado["percentual_perdas_nao_tecnicas"] = (
        pivotado["perdas_nao_tecnicas_kwh"]
        / (pivotado["perdas_tecnicas_kwh"] + pivotado["perdas_nao_tecnicas_kwh"])
        * 100
    )

    n_incompleto = pivotado["percentual_perdas_nao_tecnicas"].isna().sum()
    if n_incompleto > 0:
        print(f"      [AVISO] {n_incompleto} distribuidora(s) sem os 2 tipos de perda "
              f"nesta competência - ficam sem percentual.")

    # ACHADO REAL (08/07/2026, contra o arquivo de producao): ~21% das
    # distribuidoras (11 de 53, competencia 202503) tem "Perdas Nao-Tecnicas"
    # NEGATIVA no modo "valor medido" (ex.: -31.803.169 kWh), gerando
    # percentuais impossiveis (-436% a +784%). Perda negativa nao tem
    # significado fisico - reflete a metodologia de calculo residual da ANEEL
    # (perdas nao-tecnicas = perdas totais - perdas tecnicas estimadas, que
    # pode dar negativo quando a estimativa tecnica excede o total medido
    # naquele periodo), nao um erro de leitura deste script. Excluir do
    # painel em vez de deixar distorcer a correlacao (Spearman e por rank,
    # mas um valor fora do range [0,100] ainda ocupa uma posicao de rank
    # sem significado real).
    fora_do_range = ~pivotado["percentual_perdas_nao_tecnicas"].between(0, 100)
    n_fora_do_range = int((fora_do_range & pivotado["percentual_perdas_nao_tecnicas"].notna()).sum())
    if n_fora_do_range > 0:
        print(f"      [AVISO] {n_fora_do_range} distribuidora(s) com percentual fora do "
              f"range fisicamente valido [0,100]% (perdas não-técnicas negativa no 'valor "
              f"medido' - quirk conhecido da metodologia residual da ANEEL, não erro deste "
              f"script) - excluídas do painel.")
        pivotado.loc[fora_do_range, "percentual_perdas_nao_tecnicas"] = pd.NA

    return pivotado[["NumCPFCNPJ", "perdas_tecnicas_kwh", "perdas_nao_tecnicas_kwh",
                      "percentual_perdas_nao_tecnicas"]]


# --------------------------------------------------------------------------
# 2. Resolver município -> CNPJ da distribuidora (via qualidade_conjuntos,
#    JOIN EXATO por CNPJ - mais robusto que o join por nome usado na tarifa)
#
# CAUTELA: qualidade_conjuntos.num_cnpj vem do INDQUAL (fonte ANEEL diferente
# do SAMP-Balanço) - NAO confirmado nesta sessao que as duas fontes formatam
# CNPJ de forma identica (com/sem pontuacao). Por isso normalizamos (só
# dígitos) dos dois lados antes do merge, e reportamos a taxa de casamento -
# se vier muito baixa, o join por CNPJ falhou silenciosamente e é preciso
# investigar o formato antes de confiar em qualquer resultado.
#
# BUG REAL ENCONTRADO E CORRIGIDO (08/07/2026): NumCPFCNPJ no Parquet do
# SAMP-Balanço vem como int64, NAO como texto - qualquer CNPJ cujo primeiro
# digito seja "0" perde esse zero a esquerda ao ser lido como inteiro (ex.:
# "04065033000170" vira 4065033000170, 13 digitos em vez de 14). zfill(14)
# restaura o zero perdido - seguro aplicar aos dois lados do join, pois um
# CNPJ ja completo (14 digitos) fica inalterado pelo zfill.
# --------------------------------------------------------------------------
def normalizar_cnpj(valor) -> str:
    if valor is None:
        return None
    apenas_digitos = "".join(c for c in str(valor) if c.isdigit())
    if not apenas_digitos:
        return None
    return apenas_digitos.zfill(14)


def resolver_municipio_cnpj(engine) -> pd.DataFrame:
    print("\n[2/5] Resolvendo município -> CNPJ da distribuidora (via CNPJ, schema já "
          "carregado do INDQUAL)...")

    query = text("""
        SELECT qcm.codigo_ibge, qc.num_cnpj
        FROM qualidade_conjunto_municipio qcm
        JOIN qualidade_conjuntos qc ON qc.ide_conjunto = qcm.ide_conjunto
        WHERE qc.num_cnpj IS NOT NULL
    """)
    with engine.connect() as conexao:
        pares = pd.read_sql(query, conexao)

    pares["num_cnpj"] = pares["num_cnpj"].apply(normalizar_cnpj)
    pares = pares.dropna(subset=["num_cnpj"])

    agrupado = pares.groupby("codigo_ibge")["num_cnpj"].agg(lambda s: sorted(set(s)))
    n_unica = int((agrupado.apply(len) == 1).sum())
    n_multipla = int((agrupado.apply(len) > 1).sum())
    print(f"      {n_unica} município(s) com CNPJ único | {n_multipla} município(s) com "
          f"múltiplos CNPJs (ficarão SEM percentual de perdas único).")

    resultado = agrupado.reset_index()
    resultado["cnpj_unico"] = resultado["num_cnpj"].apply(lambda lst: lst[0] if len(lst) == 1 else None)
    return resultado[["codigo_ibge", "cnpj_unico"]]


# --------------------------------------------------------------------------
# 3. Renda média domiciliar (controle/hipótese) - Postgres
# --------------------------------------------------------------------------
def carregar_renda(engine) -> pd.DataFrame:
    print("\n[3/5] Carregando renda média domiciliar e região...")
    query = text("""
        SELECT m.codigo_ibge, m.nome, m.regiao, m.uf, vsc.renda_media_domiciliar
        FROM municipios m
        JOIN unidades_espaciais ue
            ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
        LEFT JOIN vw_indicadores_sociais_consolidado vsc ON vsc.unidade_espacial_id = ue.id
    """)
    with engine.connect() as conexao:
        df = pd.read_sql(query, conexao)
    print(f"      {len(df)} município(s) com renda carregada.")
    return df


# --------------------------------------------------------------------------
# 4-5. Montar painel e testar a hipótese (Spearman bruta + parcial)
# --------------------------------------------------------------------------
def montar_e_testar(perdas: pd.DataFrame, municipio_cnpj: pd.DataFrame, renda: pd.DataFrame) -> pd.DataFrame:
    print("\n[4/5] Montando painel município x percentual de perdas não técnicas...")

    painel = municipio_cnpj.merge(
        perdas, left_on="cnpj_unico", right_on="NumCPFCNPJ", how="left"
    )
    painel = painel.merge(renda, on="codigo_ibge", how="left")

    n_com_percentual = painel["percentual_perdas_nao_tecnicas"].notna().sum()
    print(f"      {n_com_percentual} de {len(painel)} município(s) com CNPJ único têm "
          f"percentual de perdas calculado (resto: CNPJ da distribuidora não apareceu no "
          f"SAMP-Balanço para esta competência, ou distribuidora sem os 2 tipos de perda).")

    # ALERTA DE JOIN: se quase nada casou, o formato de CNPJ entre INDQUAL e
    # SAMP-Balanço provavelmente diverge mais do que a normalização (só
    # dígitos) resolve - checar manualmente antes de confiar em qualquer
    # correlação abaixo.
    taxa_casamento = n_com_percentual / len(painel) if len(painel) else 0
    if taxa_casamento < 0.3:
        print(f"      [AVISO] Taxa de casamento CNPJ muito baixa ({taxa_casamento:.0%}) - "
              f"suspeitar de divergência de formato entre qualidade_conjuntos.num_cnpj e "
              f"SAMP-Balanço.NumCPFCNPJ além da normalização já aplicada. NÃO confiar na "
              f"correlação abaixo sem investigar isso primeiro.")

    print("\n[5/5] Testando a hipótese: renda x % perdas não técnicas (Spearman)")
    bruta = correlacao_spearman(painel, "renda_media_domiciliar", "percentual_perdas_nao_tecnicas")
    print(f"      Bruta: rho={bruta['rho']:+.4f}  p={bruta['p_valor']:.4g}  n={bruta['n']}")
    print("      LEITURA: hipótese prevê rho NEGATIVO (renda mais alta -> % perdas não "
          "técnicas mais baixo).")

    print("\n      Sensibilidade por região:")
    for regiao in sorted(painel["regiao"].dropna().unique()):
        subset = painel[painel["regiao"] == regiao]
        resultado = correlacao_spearman(subset, "renda_media_domiciliar", "percentual_perdas_nao_tecnicas")
        print(f"        {regiao:15s} rho={resultado['rho']:+.4f}  p={resultado['p_valor']:.4g}  "
              f"n={resultado['n']}")

    return painel


def main():
    print("Investigação exploratória: Perdas Não Técnicas (ANEEL SAMP-Balanço) x renda "
          "média domiciliar, por município")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)

    perdas = carregar_perdas_por_distribuidora()
    municipio_cnpj = resolver_municipio_cnpj(engine)
    renda = carregar_renda(engine)

    montar_e_testar(perdas, municipio_cnpj, renda)

    print("\n✅ Investigação concluída (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
