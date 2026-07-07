"""
APROFUNDAMENTO: Perdas Não Técnicas x Renda — janela de 12 meses + correlação
parcial (controlando urbanização) + diagnóstico da divergência do Centro-Oeste
================================================================================
CONTEXTO: 1a rodada (`investigar_perdas_nao_tecnicas_renda.py`, 08/07/2026,
1 único mês - competência 202503) achou sinal BRUTO fraco e NÃO ROBUSTO por
região: rho nacional = -0,0457 (n=2.098, na direção prevista mas
negligenciável), mas Centro-Oeste divergiu FORTEMENTE na direção OPOSTA
(rho = +0,35, p=9,7e-08, n=220) e Sul ficou inconclusivo (n=18). Ver
ARQUITETURA.md, seção "Perdas técnicas e não técnicas", para o resultado
completo da 1a rodada.

Por decisão do usuário (08/07/2026), este script aprofunda a investigação em
3 frentes que a 1a rodada deixou em aberto:

  1. MÉDIA DE 12 MESES em vez de 1 competência isolada — soma
     `perdas_tecnicas_kwh`/`perdas_nao_tecnicas_kwh` de cada distribuidora ao
     longo de uma janela de 12 meses ANTES de calcular o percentual (não faz
     média de percentuais mensais) - isso é mais robusto que média de razões
     E naturalmente absorve o problema de "perdas não-técnicas negativa em 1
     mês isolado" (ver 1a rodada) sem precisar excluir a distribuidora
     inteira, desde que a SOMA ao longo do ano não fique negativa.
  2. CORRELAÇÃO PARCIAL controlando `percentual_populacao_rural` (mesma
     variável de urbanização já usada em `analisar_correlacao_mmgd_renda.py`,
     `VARIAVEL_URBANIZACAO`) - testa se o sinal bruto (fraco) sobrevive
     quando se tira o efeito de zona rural x urbana, e testa por tercis de
     urbanização (mesma lógica de sensibilidade já estabelecida no projeto).
  3. DIAGNÓSTICO ESPECÍFICO DO CENTRO-OESTE: testa a hipótese de que a
     divergência (renda alta -> MAIS perdas não-técnicas, ao contrário do
     resto do país) é impulsionada por um confundidor rural/agronegócio -
     município de alta renda no Centro-Oeste tende a ser MAIS rural (grandes
     propriedades) que município de alta renda no Sudeste (mais urbano) -
     testando correlação renda x %rural e %rural x %perdas, dentro da
     própria região.

JANELA DE 12 MESES ESCOLHIDA: 2024-04 a 2025-03 (inclusive) - confirmado na
1a rodada que esta é a janela mais recente com cobertura essencialmente
completa (52 a 57 de ~57 distribuidoras históricas em cada mês; cai
abruptamente depois de 2025-07). Termina exatamente no mês testado na 1a
rodada (202503), permitindo comparação direta.

ACHADO METODOLÓGICO IMPORTANTE ADICIONADO APÓS A 1a EXECUÇÃO DESTE SCRIPT
(08/07/2026): o resultado municipal (nacional rho=-0,226, p=3e-30, n=2.488)
pareceu forte demais para ser confiado sem checagem - o indicador é medido
por DISTRIBUIDORA e cada município apenas HERDA o valor da sua
distribuidora, então o "n" municipal não é o número real de observações
independentes (pseudorreplicação: uma distribuidora que atende 200
municípios gera 200 linhas com o MESMO Y). Isso infla artificialmente a
significância estatística. Corrigido adicionando um teste em nível de
DISTRIBUIDORA (a unidade estatisticamente correta) — ver
`testar_hipotese_nivel_distribuidora` — que deve ser lido como o resultado
principal; o teste municipal fica como leitura descritiva/ilustrativa.

ESTE SCRIPT É SOMENTE LEITURA - não grava nada no banco. Reusa
`normalizar_cnpj` e a lógica de resolução município->CNPJ de
`investigar_perdas_nao_tecnicas_renda.py` (copiada aqui, não importada, para
manter os dois scripts de investigação independentes e legíveis
isoladamente).
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

# Janela de 12 meses com cobertura essencialmente completa (ver docstring).
# Formato int (AnmCompetenciaBalanco é int64 no Parquet real - bug encontrado
# e corrigido na 1a rodada, ver ARQUITETURA.md).
JANELA_COMPETENCIAS = [
    202404, 202405, 202406, 202407, 202408, 202409,
    202410, 202411, 202412, 202501, 202502, 202503,
]

VARIAVEL_URBANIZACAO = "percentual_populacao_rural"


def normalizar_cnpj(valor) -> str:
    """Mesma função da 1a rodada - ver lá o bug real que motivou o zfill(14)
    (NumCPFCNPJ é int64 no Parquet, perde zero à esquerda)."""
    if valor is None:
        return None
    apenas_digitos = "".join(c for c in str(valor) if c.isdigit())
    if not apenas_digitos:
        return None
    return apenas_digitos.zfill(14)


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


def carregar_perdas_12_meses() -> pd.DataFrame:
    print(f"[1/7] Carregando SAMP-Balanço (perdas, {len(JANELA_COMPETENCIAS)} meses: "
          f"{JANELA_COMPETENCIAS[0]}-{JANELA_COMPETENCIAS[-1]}, valor medido, agregado "
          f"por SOMA antes do percentual)...")
    baixar_samp_balanco()

    df = pd.read_parquet(CAMINHO_CACHE_SAMP_BALANCO)
    print(f"      {len(df)} linha(s) totais no arquivo.")

    filtro = (
        (df["AnmCompetenciaBalanco"].isin(JANELA_COMPETENCIAS))
        & (df["DscModalidadeBalanco"] == "Perdas na Distribuição (valor medido)")
        & (df["DscCctBalanco"].isin(["Perdas Técnicas", "Perdas Não-Técnicas"]))
    )
    df_filtrado = df[filtro].copy()
    print(f"      {len(df_filtrado)} linha(s) após filtrar janela/modalidade/tipo "
          f"({df_filtrado['NumCPFCNPJ'].nunique()} distribuidora(s) distinta(s) em "
          f"pelo menos 1 mês da janela).")

    if df_filtrado.empty:
        raise SystemExit("[ERRO] Nenhuma linha na janela de 12 meses - checar JANELA_COMPETENCIAS.")

    df_filtrado["VlrEnergia"] = pd.to_numeric(df_filtrado["VlrEnergia"], errors="coerce")

    # Quantos meses de dado cada distribuidora realmente tem na janela (para
    # reportar cobertura - uma distribuidora com só 2 de 12 meses tem uma
    # soma bem menos confiável que uma com 12 de 12).
    cobertura_mensal = (
        df_filtrado.groupby("NumCPFCNPJ")["AnmCompetenciaBalanco"].nunique().rename("n_meses_com_dado")
    )

    # SOMA (não média de percentuais) ao longo da janela - ver docstring.
    somado = df_filtrado.pivot_table(
        index="NumCPFCNPJ", columns="DscCctBalanco", values="VlrEnergia", aggfunc="sum"
    ).reset_index()
    somado.columns.name = None
    somado = somado.rename(columns={
        "Perdas Técnicas": "perdas_tecnicas_kwh_12m",
        "Perdas Não-Técnicas": "perdas_nao_tecnicas_kwh_12m",
    })
    for coluna in ["perdas_tecnicas_kwh_12m", "perdas_nao_tecnicas_kwh_12m"]:
        if coluna not in somado.columns:
            somado[coluna] = pd.NA

    somado = somado.merge(cobertura_mensal, on="NumCPFCNPJ", how="left")
    somado["NumCPFCNPJ"] = somado["NumCPFCNPJ"].apply(normalizar_cnpj)

    n_incompleta = (somado["n_meses_com_dado"] < len(JANELA_COMPETENCIAS)).sum()
    if n_incompleta > 0:
        print(f"      [INFO] {n_incompleta} de {len(somado)} distribuidora(s) têm menos que "
              f"os {len(JANELA_COMPETENCIAS)} meses completos na janela (ainda somadas com o "
              f"que existe - não excluídas, mas com menor confiabilidade).")

    somado["percentual_perdas_nao_tecnicas_12m"] = (
        somado["perdas_nao_tecnicas_kwh_12m"]
        / (somado["perdas_tecnicas_kwh_12m"] + somado["perdas_nao_tecnicas_kwh_12m"])
        * 100
    )

    fora_do_range = ~somado["percentual_perdas_nao_tecnicas_12m"].between(0, 100)
    n_fora_do_range = int((fora_do_range & somado["percentual_perdas_nao_tecnicas_12m"].notna()).sum())
    if n_fora_do_range > 0:
        print(f"      [AVISO] {n_fora_do_range} distribuidora(s) com percentual fora do range "
              f"[0,100]% MESMO SOMANDO 12 meses (raro - indica desequilíbrio sistemático, não só "
              f"ruído de 1 mês) - excluídas do painel.")
        somado.loc[fora_do_range, "percentual_perdas_nao_tecnicas_12m"] = pd.NA
    else:
        print("      Nenhuma distribuidora fora do range [0,100]% após somar 12 meses - a soma "
              "anual resolveu o problema de residual negativo mensal visto na 1a rodada.")

    return somado[["NumCPFCNPJ", "n_meses_com_dado", "perdas_tecnicas_kwh_12m",
                    "perdas_nao_tecnicas_kwh_12m", "percentual_perdas_nao_tecnicas_12m"]]


def resolver_municipio_cnpj(engine) -> pd.DataFrame:
    print("\n[2/7] Resolvendo município -> CNPJ da distribuidora...")
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
          f"múltiplos CNPJs.")

    resultado = agrupado.reset_index()
    resultado["cnpj_unico"] = resultado["num_cnpj"].apply(lambda lst: lst[0] if len(lst) == 1 else None)
    return resultado[["codigo_ibge", "cnpj_unico"]]


def carregar_renda_e_urbanizacao(engine) -> pd.DataFrame:
    print("\n[3/7] Carregando renda média domiciliar, região e % população rural...")
    query = text("""
        SELECT m.codigo_ibge, m.nome, m.regiao, m.uf,
               vsc.renda_media_domiciliar, vsc.percentual_populacao_rural
        FROM municipios m
        JOIN unidades_espaciais ue
            ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
        LEFT JOIN vw_indicadores_sociais_consolidado vsc ON vsc.unidade_espacial_id = ue.id
    """)
    with engine.connect() as conexao:
        df = pd.read_sql(query, conexao)
    print(f"      {len(df)} município(s) carregados.")
    return df


def montar_painel(perdas, municipio_cnpj, renda) -> pd.DataFrame:
    print("\n[4/7] Montando painel...")
    painel = municipio_cnpj.merge(perdas, left_on="cnpj_unico", right_on="NumCPFCNPJ", how="left")
    painel = painel.merge(renda, on="codigo_ibge", how="left")

    n_com_percentual = painel["percentual_perdas_nao_tecnicas_12m"].notna().sum()
    print(f"      {n_com_percentual} de {len(painel)} município(s) com CNPJ único têm "
          f"percentual de perdas (12 meses) calculado.")

    # ALERTA METODOLOGICO IMPORTANTE: o indicador e medido por DISTRIBUIDORA,
    # nao por municipio - cada municipio so HERDA o valor da sua
    # distribuidora. Isso significa que os "n" municipios de qualquer
    # correlacao NAO sao observacoes independentes (pseudorreplicacao):
    # se uma distribuidora atende 200 municipios, esses 200 pontos tem
    # EXATAMENTE o mesmo Y, e o Spearman entre municipios trata isso como se
    # fossem 200 informacoes independentes quando na pratica sao 1 so. Isso
    # infla artificialmente a significancia estatistica (p-valor) reportada
    # em qualquer tabela acima - quanto menor a razao distribuidoras/n
    # abaixo, MENOS confiavel e o p-valor daquele grupo.
    valido = painel[painel["percentual_perdas_nao_tecnicas_12m"].notna()]
    n_distribuidoras_distintas = valido["cnpj_unico"].nunique()
    n_municipios_validos = len(valido)
    print(f"\n      [ALERTA METODOLOGICO] Nacional: {n_municipios_validos} municipio(s) com "
          f"percentual, mas apenas {n_distribuidoras_distintas} distribuidora(s) DISTINTA(S) "
          f"por tras deles (razao {n_municipios_validos/max(n_distribuidoras_distintas,1):.1f} "
          f"municipios/distribuidora, em media). O 'n' usado no Spearman NAO e o numero real "
          f"de observacoes independentes - e uma forma de pseudorreplicacao. Os p-valores "
          f"acima devem ser lidos com cautela proporcional a essa razao.")
    print("\n      Mesma checagem por região (razão município/distribuidora - quanto maior, "
          "MENOS confiável o p-valor daquela região):")
    for regiao in sorted(valido["regiao"].dropna().unique()):
        subset = valido[valido["regiao"] == regiao]
        n_dist = subset["cnpj_unico"].nunique()
        n_mun = len(subset)
        print(f"        {regiao:15s} {n_mun:5d} município(s) | {n_dist:3d} distribuidora(s) "
              f"distinta(s) | razão {n_mun/max(n_dist,1):6.1f}")

    return painel


def testar_hipotese(painel: pd.DataFrame) -> None:
    coluna_y = "percentual_perdas_nao_tecnicas_12m"

    print(f"\n[5/7] Testando hipótese (NÍVEL MUNICÍPIO - ver alerta de pseudorreplicação "
          f"acima, ler como ilustrativo): renda x {coluna_y} (Spearman bruta + parcial "
          f"controlando {VARIAVEL_URBANIZACAO})")

    bruta = correlacao_spearman(painel, "renda_media_domiciliar", coluna_y)
    print(f"      Bruta nacional:  rho={bruta['rho']:+.4f}  p={bruta['p_valor']:.4g}  n={bruta['n']}")

    parcial = correlacao_parcial_spearman(
        painel, "renda_media_domiciliar", coluna_y, [VARIAVEL_URBANIZACAO]
    )
    print(f"      Parcial nacional (controlando {VARIAVEL_URBANIZACAO}): "
          f"rho={parcial['rho_parcial']:+.4f}  p={parcial['p_valor']:.4g}  n={parcial['n']}")
    print("      LEITURA: hipótese prevê rho NEGATIVO em ambos (renda mais alta -> % perdas "
          "não técnicas mais baixo).")

    print("\n      Sensibilidade por região (bruta | parcial controlando urbanização):")
    sinais_bruta = []
    sinais_parcial = []
    for regiao in sorted(painel["regiao"].dropna().unique()):
        subset = painel[painel["regiao"] == regiao]
        r_bruta = correlacao_spearman(subset, "renda_media_domiciliar", coluna_y)
        r_parcial = correlacao_parcial_spearman(
            subset, "renda_media_domiciliar", coluna_y, [VARIAVEL_URBANIZACAO]
        )
        print(f"        {regiao:15s} bruta: rho={r_bruta['rho']:+.4f} p={r_bruta['p_valor']:.4g} "
              f"n={r_bruta['n']:5d}  |  parcial: rho={r_parcial['rho_parcial']:+.4f} "
              f"p={r_parcial['p_valor']:.4g} n={r_parcial['n']:5d}")
        if not pd.isna(r_bruta["rho"]):
            sinais_bruta.append((regiao, r_bruta["rho"]))
        if not pd.isna(r_parcial["rho_parcial"]):
            sinais_parcial.append((regiao, r_parcial["rho_parcial"]))

    n_negativas_bruta = sum(1 for _, rho in sinais_bruta if rho < 0)
    n_negativas_parcial = sum(1 for _, rho in sinais_parcial if rho < 0)
    print(f"\n      Robustez bruta: {n_negativas_bruta}/{len(sinais_bruta)} região(ões) com sinal "
          f"na direção prevista (negativo).")
    print(f"      Robustez parcial: {n_negativas_parcial}/{len(sinais_parcial)} região(ões) com "
          f"sinal na direção prevista (negativo).")

    print("\n      Sensibilidade por tercil de urbanização (parcial controlando "
          f"{VARIAVEL_URBANIZACAO} não faz sentido dentro do próprio tercil de "
          f"{VARIAVEL_URBANIZACAO} - reportando BRUTA por tercil):")
    try:
        painel_tercis = painel.copy()
        painel_tercis["faixa_urbanizacao"] = pd.qcut(
            painel_tercis[VARIAVEL_URBANIZACAO], q=3,
            labels=["Mais urbanizados (menor % rural)", "Urbanização intermediária",
                    "Menos urbanizados (maior % rural)"],
            duplicates="drop",
        )
        for faixa in painel_tercis["faixa_urbanizacao"].cat.categories:
            subset = painel_tercis[painel_tercis["faixa_urbanizacao"] == faixa]
            resultado = correlacao_spearman(subset, "renda_media_domiciliar", coluna_y)
            print(f"        {faixa:32s} rho={resultado['rho']:+.4f}  p={resultado['p_valor']:.4g}  "
                  f"n={resultado['n']}")
    except ValueError as erro:
        print(f"      [AVISO] Não foi possível cortar em tercis: {erro}")


def montar_painel_por_distribuidora(painel_municipal: pd.DataFrame) -> pd.DataFrame:
    """
    Colapsa o painel municipal para 1 linha por DISTRIBUIDORA - a unidade de
    observação estatisticamente correta aqui, já que percentual_perdas_
    nao_tecnicas_12m é medido por distribuidora e só é HERDADO por cada
    município do seu território (ver alerta de pseudorreplicação em
    montar_painel). renda_media_domiciliar e percentual_populacao_rural
    viram média NÃO ponderada por população dos municípios do território
    (limitação: sem peso populacional aqui, uma distribuidora com muitos
    municípios pequenos pesa igual a uma com poucos municípios grandes -
    aceitável para esta investigação exploratória, mas registrar a
    limitação).
    """
    valido = painel_municipal[painel_municipal["percentual_perdas_nao_tecnicas_12m"].notna()]

    agregado = valido.groupby("cnpj_unico").agg(
        percentual_perdas_nao_tecnicas_12m=("percentual_perdas_nao_tecnicas_12m", "first"),
        renda_media_domiciliar=("renda_media_domiciliar", "mean"),
        percentual_populacao_rural=("percentual_populacao_rural", "mean"),
        n_municipios_no_territorio=("codigo_ibge", "count"),
        n_regioes_distintas=("regiao", "nunique"),
        regiao_predominante=("regiao", lambda s: s.mode().iloc[0] if not s.mode().empty else None),
    ).reset_index()

    n_multi_regiao = int((agregado["n_regioes_distintas"] > 1).sum())
    if n_multi_regiao > 0:
        print(f"\n      [INFO] {n_multi_regiao} distribuidora(s) atende(m) municípios em mais "
              f"de 1 região - usando a região predominante (moda) para a sensibilidade regional "
              f"deste teste em nível de distribuidora.")

    return agregado


def testar_hipotese_nivel_distribuidora(painel_distribuidora: pd.DataFrame) -> None:
    """
    Repete o teste de hipótese, mas com 1 linha por distribuidora (n real de
    observações independentes) em vez de 1 linha por município
    (pseudorreplicado - ver montar_painel). Este é o teste ESTATISTICAMENTE
    CORRETO para esta pergunta - os resultados em nível de município acima
    devem ser lidos como ilustrativos/descritivos, não como evidência
    inferencial válida por si só.
    """
    coluna_y = "percentual_perdas_nao_tecnicas_12m"
    print(f"\n[6/7] TESTE CORRIGIDO - nível de distribuidora (n = número real de "
          f"observações independentes, sem pseudorreplicação):")
    print(f"      n = {len(painel_distribuidora)} distribuidora(s) com percentual válido.")

    bruta = correlacao_spearman(painel_distribuidora, "renda_media_domiciliar", coluna_y)
    print(f"      Bruta nacional (nível distribuidora): rho={bruta['rho']:+.4f}  "
          f"p={bruta['p_valor']:.4g}  n={bruta['n']}")

    parcial = correlacao_parcial_spearman(
        painel_distribuidora, "renda_media_domiciliar", coluna_y, [VARIAVEL_URBANIZACAO]
    )
    print(f"      Parcial nacional (nível distribuidora, controlando "
          f"{VARIAVEL_URBANIZACAO}): rho={parcial['rho_parcial']:+.4f}  "
          f"p={parcial['p_valor']:.4g}  n={parcial['n']}")

    print("\n      Sensibilidade por região predominante (nível distribuidora - N BAIXO, "
          "leitura qualitativa apenas, abaixo do mínimo de 30 amostras em quase todas):")
    for regiao in sorted(painel_distribuidora["regiao_predominante"].dropna().unique()):
        subset = painel_distribuidora[painel_distribuidora["regiao_predominante"] == regiao]
        r = correlacao_spearman(subset, "renda_media_domiciliar", coluna_y)
        print(f"        {regiao:15s} rho={r['rho']!r}  p={r['p_valor']!r}  n={r['n']} "
              f"(n_distribuidoras)")

    co = painel_distribuidora[painel_distribuidora["regiao_predominante"] == "Centro-Oeste"]
    print(f"\n      Centro-Oeste especificamente: {len(co)} distribuidora(s) distinta(s) "
          f"por trás dos municípios vistos no teste municipal acima.")
    if len(co) > 0:
        print(co[["cnpj_unico", "renda_media_domiciliar", "percentual_populacao_rural",
                   coluna_y, "n_municipios_no_territorio"]].to_string(index=False))


def diagnosticar_centro_oeste(painel: pd.DataFrame) -> None:
    print("\n[7/7] Diagnóstico específico do Centro-Oeste, nível município (hipótese: "
          "confundidor rural/agronegócio explicaria a divergência de sinal vista na "
          "1a rodada) - LER JUNTO com o teste em nível distribuidora acima, já que este "
          "diagnóstico herda a mesma limitação de pseudorreplicação.")

    co = painel[painel["regiao"] == "Centro-Oeste"]
    coluna_y = "percentual_perdas_nao_tecnicas_12m"
    print(f"      n = {len(co)} município(s) do Centro-Oeste no painel "
          f"({co[coluna_y].notna().sum()} com percentual de perdas calculado).")

    print(f"\n      Estatísticas descritivas (Centro-Oeste):")
    print(co[["renda_media_domiciliar", VARIAVEL_URBANIZACAO, coluna_y]].describe().to_string())

    r_renda_rural = correlacao_spearman(co, "renda_media_domiciliar", VARIAVEL_URBANIZACAO)
    print(f"\n      renda x {VARIAVEL_URBANIZACAO} (dentro do Centro-Oeste): "
          f"rho={r_renda_rural['rho']:+.4f}  p={r_renda_rural['p_valor']:.4g}  n={r_renda_rural['n']}")
    print("      LEITURA: se POSITIVO, confirma que município de renda mais alta no "
          "Centro-Oeste tende a ser MAIS rural (compatível com hipótese agronegócio) - o "
          "oposto do padrão típico nacional (renda alta = mais urbano).")

    r_rural_perdas = correlacao_spearman(co, VARIAVEL_URBANIZACAO, coluna_y)
    print(f"\n      {VARIAVEL_URBANIZACAO} x {coluna_y} (dentro do Centro-Oeste): "
          f"rho={r_rural_perdas['rho']:+.4f}  p={r_rural_perdas['p_valor']:.4g}  n={r_rural_perdas['n']}")
    print("      LEITURA: se POSITIVO, município mais rural do Centro-Oeste tem MAIS % de "
          "perdas não-técnicas - combinado com o resultado acima, sustentaria a hipótese de "
          "que 'renda alta -> mais rural -> mais perdas' é a cadeia causal por trás da "
          "divergência (não uma relação direta renda->perdas).")

    parcial_controlando_rural = correlacao_parcial_spearman(
        co, "renda_media_domiciliar", coluna_y, [VARIAVEL_URBANIZACAO]
    )
    print(f"\n      renda x {coluna_y}, controlando {VARIAVEL_URBANIZACAO} (dentro do "
          f"Centro-Oeste): rho={parcial_controlando_rural['rho_parcial']:+.4f}  "
          f"p={parcial_controlando_rural['p_valor']:.4g}  n={parcial_controlando_rural['n']}")
    print("      LEITURA: se este rho cair MUITO em relação ao bruto regional, a divergência "
          "do Centro-Oeste é majoritariamente explicada pelo confundidor rural - se continuar "
          "forte e positivo, a divergência é outra coisa (não capturada por %rural).")


def main():
    print("Aprofundamento: Perdas Não Técnicas (12 meses) x Renda, controlando urbanização, "
          "com diagnóstico do Centro-Oeste e correção de pseudorreplicação")
    print("=" * 78)

    engine = create_engine(DATABASE_URL)

    perdas = carregar_perdas_12_meses()
    municipio_cnpj = resolver_municipio_cnpj(engine)
    renda = carregar_renda_e_urbanizacao(engine)

    painel = montar_painel(perdas, municipio_cnpj, renda)
    testar_hipotese(painel)

    painel_distribuidora = montar_painel_por_distribuidora(painel)
    testar_hipotese_nivel_distribuidora(painel_distribuidora)

    diagnosticar_centro_oeste(painel)

    print("\n✅ Aprofundamento concluído (somente leitura, nenhuma escrita no banco).")


if __name__ == "__main__":
    main()
