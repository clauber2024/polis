"""
PROTÓTIPO DE VALIDAÇÃO: ranking nacional de distribuidoras por desempenho de
conexão de MMGD + justiça energética (eixo social dos municípios atendidos).
================================================================================
CONTEXTO: implementa a "Ideia de produto: ranking público de distribuidoras"
(ver ARQUITETURA.md), a pedido do usuário, com as duas decisões de escopo já
tomadas: (1) ESCOPO = técnico + justiça energética (não só desempenho de
conexão isolado); (2) GRANULARIDADE = nacional por distribuidora (não por
UF/região).

PROTÓTIPO DE VALIDAÇÃO, NÃO A IMPLEMENTAÇÃO FINAL - mesma ressalva de
`identificar_vazios_de_acesso.py`: a lógica de cruzamento e composição do
score deve ser reimplementada no backend Node/Express quando ele existir.

EIXO TÉCNICO: reaproveita o CSV nacional já gerado por
`mapear_desempenho_conexao_mmgd_nacional.py` (pct_conectado,
pct_dentro_do_prazo, pct_datlim_presente - NÃO recalcula do zero, não baixa
nada de novo). RESSALVA JÁ CONHECIDA (ver ARQUITETURA.md, item 6 e "Ideia de
produto"): 11 distribuidoras têm o campo DatLim (prazo) praticamente ausente
- para essas, o eixo técnico usa SÓ pct_conectado (sem prazo), marcado
explicitamente na coluna `prazo_confiavel = False` da saída. NUNCA tratar
"pct_dentro_do_prazo ausente" como "0% no prazo".

EIXO JUSTIÇA ENERGÉTICA: reaproveita `carregar_dados` (indicadores sociais
consolidados, incl. IVS) e `carregar_municipio_distribuidora` (mapeamento
município -> distribuidora via schema INDQUAL) já usados em
`investigar_distribuidora_regioes_problema.py` - não duplica nenhuma query.
Agrega IVS médio (simples, não ponderado por população - mesma limitação já
assumida em outros cruzamentos deste projeto) dos municípios atendidos por
cada distribuidora.

ACHADO METODOLÓGICO CENTRAL DESTE SCRIPT: o dataset de conexão MMGD
(`SigAgenteDistribuicao`) e o schema INDQUAL (`sig_agente`) usam
NOMENCLATURAS DIFERENTES para a MESMA distribuidora (ex.: "Equatorial MA"
vs. "EQUATORIAL MA"; "Neoenergia Coelba" vs. "COELBA"; "Cemig-D" vs.
provavelmente "CEMIG-D"). Este script NÃO assume uma tabela de
correspondência pronta - tenta casar automaticamente (normalização de
maiúsculas/hífen/espaço + contenção de substring em ambas as direções),
aplica um pequeno conjunto de equivalências MANUAIS já estabelecidas em
sessões anteriores deste projeto (ex.: "EMT"="Energisa MT", ver
`investigar_tarifa_centro_oeste.py`), e IMPRIME explicitamente toda
distribuidora que não achou par - essas ficam de fora do eixo de justiça
(mas continuam no ranking técnico), em vez de arriscar um cruzamento errado.

Este script é SOMENTE LEITURA (não grava nada no banco) - exporta um CSV
local (dado derivado, não versionado) com o ranking final.
================================================================================
"""

import os
import re
import sys

import numpy as np
import pandas as pd
from sqlalchemy import create_engine

sys.path.insert(0, "backend/src/etl/analises")

from analisar_correlacao_mmgd_renda import DATABASE_URL, carregar_dados  # noqa: E402
from investigar_distribuidora_regioes_problema import (  # noqa: E402
    carregar_municipio_distribuidora,
)

CAMINHO_CSV_TECNICO = os.environ.get(
    "CAMINHO_CSV_DESEMPENHO_NACIONAL",
    "backend/src/etl/data/raw/aneel_fila_conexao_mmgd/desempenho_conexao_mmgd_distribuidoras_nacional.csv",
)
CAMINHO_CSV_SAIDA = os.environ.get(
    "CAMINHO_CSV_RANKING",
    "backend/src/etl/data/raw/aneel_fila_conexao_mmgd/ranking_distribuidoras_mmgd.csv",
)

LIMIAR_DATLIM_CONFIAVEL = 50.0  # mesmo limiar usado em mapear_desempenho_conexao_mmgd_nacional.py
N_PEDIDOS_MINIMO_ROBUSTO = 1000  # abaixo disso, sinaliza amostra pequena (não exclui)

# Equivalências MANUAIS - nomes do dataset de FILA DE CONEXÃO (chave) -> sig_agente
# real do INDQUAL (valor), confirmado via `SELECT DISTINCT sig_agente FROM
# qualidade_conjuntos` (sessão 06/07/2026, 115 siglas reais). Duas categorias:
#
# (a) JÁ CONFIRMADAS por investigação externa em sessões anteriores (ver
#     ARQUITETURA.md, "Teste do mecanismo tarifa" e achados de nome de agente
#     no Centro-Oeste):
#       Energisa MT = EMT | Energisa MS = EMS | Enel GO = EQUATORIAL GO (venda
#       Enel->Equatorial confirmada via CNPJ 01.543.032/0001-04)
#
# (b) INFERIDAS com alta confiança a partir do PADRÃO já confirmado em (a) -
#     Energisa usa consistentemente sigla de 3 letras "E"+UF/região no INDQUAL
#     (EMT, EMS já confirmados; EPB e ESE já vistos como sig_agente real do
#     Nordeste no item 4 da fila de trabalho) - mesma lógica aplicada às
#     demais siglas de Energisa encontradas na lista real do INDQUAL. NÃO
#     confirmadas individualmente por fonte externa (diferente das de "a") -
#     se algum ranking publicado usar isso, vale confirmar por CNPJ/nota
#     regulatória antes de publicar, mesmo cuidado já registrado alhures.
MAPEAMENTO_MANUAL_CONFIRMADO = {
    # (a) confirmadas externamente
    "Energisa MT": "EMT",
    "Energisa MS": "EMS",
    "Enel GO": "EQUATORIAL GO",
    # (b) inferidas por padrão (Energisa "E"+UF/região), alta confiança mas
    # não confirmadas individualmente por fonte externa
    "Energisa PB": "EPB",
    "Energisa SE": "ESE",
    "Energisa RO": "ERO",
    "Energisa TO": "ETO",
    "Energisa AC": "EAC",
    "Energisa Borborema": "EBO",
    "Energisa Minas Rio": "EMR",
    "Energisa Sul-Sudeste": "ESS",
    # (c) inferidas por nome/história corporativa, confiança média-alta:
    # Enel adquiriu a AES Eletropaulo (SP) em 2018 - "ELETROPAULO" no INDQUAL
    # é o nome pré-aquisição, mesmo padrão do caso Enel GO/Equatorial GO.
    "Enel SP": "ELETROPAULO",
    # Amazonas Energia - abreviação plausível "AME", NÃO confirmada por fonte
    # externa nesta sessão - conferir antes de publicar.
    "Amazonas Energia": "AME",
    # Equatorial adquiriu a CEEE-D (Rio Grande do Sul) em 2021 - mesmo padrão
    # de nome pré-aquisição retido no INDQUAL.
    "CEEE Equatorial": "CEEE-D",
    # Roraima Energia - histórico: concessão federalizada em 2001 virou
    # "Boa Vista Energia" (Eletrobras), privatizada e renomeada "Roraima
    # Energia" em 2021 - "BOA VISTA" no INDQUAL é provável nome antigo, mas
    # CONFIANÇA MENOR que os demais desta lista - conferir antes de publicar.
    "Roraima Energia": "BOA VISTA",
}

# AMBÍGUO, NÃO MAPEADO: "RGE" (dataset de fila) poderia corresponder a "RGE"
# OU "RGE SUL" no INDQUAL (ambos existem como sig_agente distintos - possível
# resquício da fusão RGE/AES Sul em entidade única "RGE" pós-2021). Deixado
# de fora do mapeamento manual de propósito - o casamento automático por
# substring vai achar AMBOS como candidatos e corretamente marcar como "sem
# par único" em vez de escolher errado. Se for confirmado que os dois miolos
# de conjunto pertencem à mesma empresa hoje, o ideal é ajustar
# `carregar_municipio_distribuidora` para tratar RGE+RGE SUL como uma
# distribuidora só, não resolver isso só no crosswalk deste script.


def normalizar(nome: str) -> str:
    """Maiúsculas, sem acento/hífen/espaço - só para efeito de comparação,
    não altera o nome original exibido no ranking."""
    n = nome.upper()
    n = re.sub(r"[-\s]", "", n)
    return n


def carregar_resumo_tecnico() -> pd.DataFrame:
    print(f"[1/6] Lendo resumo técnico nacional (já gerado por "
          f"mapear_desempenho_conexao_mmgd_nacional.py): {CAMINHO_CSV_TECNICO}")
    if not os.path.exists(CAMINHO_CSV_TECNICO):
        print(f"      [ERRO] Arquivo não encontrado. Rode primeiro "
              f"mapear_desempenho_conexao_mmgd_nacional.py.")
        raise SystemExit(1)

    df = pd.read_csv(CAMINHO_CSV_TECNICO)
    print(f"      {len(df)} linha(s) (distribuidora x região) lida(s).")

    # ACHADO 3 já registrado em ARQUITETURA.md: algumas combinações
    # distribuidora x região com volume residual (município de fronteira
    # classificado no arquivo regional "errado") têm pct_conectado == 0.0 e
    # métricas NaN - não são desempenho real, são ruído de classificação.
    # Excluídas da agregação (mantendo só a região "de casa" de cada
    # distribuidora, onde o volume é grande e os dados fazem sentido).
    n_antes = len(df)
    df_valido = df[df["pct_conectado"] > 0].copy()
    n_excluidos = n_antes - len(df_valido)
    if n_excluidos > 0:
        print(f"      [AVISO] {n_excluidos} linha(s) com pct_conectado == 0.0 excluída(s) da "
              f"agregação (ruído de classificação regional de município de fronteira, já "
              f"documentado em ARQUITETURA.md - 'Achado 3').")

    print("\n[2/6] Agregando por distribuidora (soma/média ponderada por n_pedidos entre "
          "as regiões onde ela aparece)...")

    def agregar(grupo: pd.DataFrame) -> pd.Series:
        n_total = grupo["n_pedidos"].sum()
        # "Região de casa" = onde a distribuidora tem o maior volume - usada
        # para decidir se o dado de prazo é confiável (mesmo limiar do
        # script nacional).
        linha_principal = grupo.loc[grupo["n_pedidos"].idxmax()]
        prazo_confiavel = bool(linha_principal["pct_datlim_presente_entre_conectados"] >= LIMIAR_DATLIM_CONFIAVEL)

        pct_conectado_pond = np.average(grupo["pct_conectado"], weights=grupo["n_pedidos"])

        if prazo_confiavel:
            # só usa linhas onde o prazo também é confiável para não diluir
            # com regiões-residuais de baixa qualidade de dado
            grupo_confiavel = grupo[grupo["pct_datlim_presente_entre_conectados"] >= LIMIAR_DATLIM_CONFIAVEL]
            pct_prazo_pond = np.average(
                grupo_confiavel["pct_dentro_do_prazo_entre_conectados"],
                weights=grupo_confiavel["n_pedidos"],
            )
        else:
            pct_prazo_pond = np.nan

        return pd.Series({
            "n_pedidos": n_total,
            "n_regioes": grupo["regiao"].nunique(),
            "regiao_principal": linha_principal["regiao"],
            "pct_conectado": round(pct_conectado_pond, 1),
            "prazo_confiavel": prazo_confiavel,
            "pct_dentro_do_prazo": round(pct_prazo_pond, 1) if prazo_confiavel else np.nan,
        })

    resumo = df_valido.groupby("distribuidora", observed=True).apply(agregar).reset_index()
    n_prazo_confiavel = resumo["prazo_confiavel"].sum()
    print(f"      {len(resumo)} distribuidora(s) distintas | {n_prazo_confiavel} com prazo "
          f"confiável, {len(resumo) - n_prazo_confiavel} SEM dado de prazo confiável.")

    return resumo


def carregar_resumo_justica() -> pd.DataFrame:
    print("\n[3/6] Carregando indicadores sociais (IVS, renda) por município + mapeamento "
          "município -> distribuidora (schema INDQUAL, mesma query já usada em "
          "investigar_distribuidora_regioes_problema.py)...")

    engine = create_engine(DATABASE_URL)
    df_sociais = carregar_dados(engine)
    df_distribuidora = carregar_municipio_distribuidora(engine)

    df = df_sociais.merge(df_distribuidora, on="codigo_ibge", how="inner")

    # Municípios com área de concessão dividida (marcados "MULTIPLA(...)"
    # por carregar_municipio_distribuidora) ficam de fora - atribuição
    # ambígua, mesmo critério já usado nos scripts anteriores desta linha
    # de investigação.
    df = df[~df["distribuidora"].str.startswith("MULTIPLA(")]

    if "ivs" not in df.columns:
        print("      [AVISO] Coluna 'ivs' não disponível no painel - eixo de justiça energética "
              "ficará vazio (verificar se a migration da view vw_ivs_consolidado foi aplicada).")
        df["ivs"] = np.nan

    resumo = df.groupby("distribuidora", observed=True).agg(
        n_municipios=("codigo_ibge", "count"),
        ivs_medio=("ivs", "mean"),
        renda_media_domiciliar_media=("renda_media_domiciliar", "mean"),
    ).reset_index()

    n_com_ivs = resumo["ivs_medio"].notna().sum()
    print(f"      {len(resumo)} distribuidora(s) (nomenclatura INDQUAL) com município mapeado | "
          f"{n_com_ivs} com IVS médio calculável.")

    return resumo


def montar_crosswalk(nomes_fila: list, nomes_indqual: list) -> dict:
    print("\n[4/6] Casando nomes de distribuidora entre o dataset de fila de conexão e o "
          "schema INDQUAL (nomenclaturas diferentes - não presume, tenta casar e reporta)...")

    normalizados_indqual = {normalizar(n): n for n in nomes_indqual}
    crosswalk = {}
    nao_casados = []

    for nome_fila in nomes_fila:
        if nome_fila in MAPEAMENTO_MANUAL_CONFIRMADO:
            crosswalk[nome_fila] = MAPEAMENTO_MANUAL_CONFIRMADO[nome_fila]
            continue

        norm_fila = normalizar(nome_fila)

        # 1) igualdade exata após normalizar
        if norm_fila in normalizados_indqual:
            crosswalk[nome_fila] = normalizados_indqual[norm_fila]
            continue

        # 2) contenção de substring em qualquer direção (ex.: "COELBA" dentro
        # de "NEOENERGIACOELBA")
        # BUG CORRIGIDO (sessão 06/07/2026, 1a execução): havia um filtro
        # `len(norm_fila) >= 4` que descartava TODOS os candidatos sempre que
        # o nome do lado da fila de conexão tinha 3 caracteres - bloqueou
        # "RGE" (a maior distribuidora do RS, 4,77M pedidos) de casar mesmo
        # que existisse sig_agente igual no INDQUAL. Removido: siglas curtas
        # são normais neste domínio (EMT, EMS, RGE, EPB...), não um sinal de
        # match genérico demais.
        candidatos = [
            nome_original for norm, nome_original in normalizados_indqual.items()
            if norm_fila in norm or norm in norm_fila
        ]

        if len(candidatos) == 1:
            crosswalk[nome_fila] = candidatos[0]
        else:
            crosswalk[nome_fila] = None
            nao_casados.append(nome_fila)

    n_casados = sum(1 for v in crosswalk.values() if v is not None)
    print(f"      {n_casados}/{len(nomes_fila)} distribuidoras do dataset de fila casadas com "
          f"o schema INDQUAL.")
    if nao_casados:
        print(f"      [AVISO] {len(nao_casados)} distribuidora(s) do dataset de fila SEM par "
              f"encontrado no INDQUAL - ficam FORA do eixo de justiça energética (mas continuam "
              f"no ranking técnico). Lista completa:")
        for nome in nao_casados:
            print(f"        - {nome}")
        print("      Conferir manualmente se algum destes é um par válido sob nome muito "
              "diferente (mesmo padrão já visto: 'Enel GO'='EQUATORIAL GO') antes de assumir "
              "que a distribuidora simplesmente não está no INDQUAL.")

    return crosswalk


def construir_ranking(resumo_tecnico: pd.DataFrame, resumo_justica: pd.DataFrame, crosswalk: dict) -> pd.DataFrame:
    print("\n[5/6] Compondo score final (normalização min-max, 0=melhor/1=pior - mesma "
          "convenção dos índices compostos já usados neste projeto, ex.: IVS, Índice de "
          "Precariedade de Infraestrutura)...")

    df = resumo_tecnico.copy()
    df["distribuidora_indqual"] = df["distribuidora"].map(crosswalk)
    df = df.merge(
        resumo_justica.rename(columns={"distribuidora": "distribuidora_indqual"}),
        on="distribuidora_indqual", how="left",
    )

    # Eixo técnico: normaliza (1 - pct_conectado/100) entre as distribuidoras
    # - já é 0=melhor (mais conectado) por construção antes de normalizar.
    base_conectado = 1 - (df["pct_conectado"] / 100)
    minimo, maximo = base_conectado.min(), base_conectado.max()
    df["eixo_tecnico_conexao_norm"] = (base_conectado - minimo) / (maximo - minimo)

    base_prazo = 1 - (df["pct_dentro_do_prazo"] / 100)  # NaN onde prazo não é confiável
    if base_prazo.notna().sum() > 1:
        minimo_p, maximo_p = base_prazo.min(), base_prazo.max()
        df["eixo_tecnico_prazo_norm"] = (base_prazo - minimo_p) / (maximo_p - minimo_p)
    else:
        df["eixo_tecnico_prazo_norm"] = np.nan

    # Eixo técnico final: média das duas sub-métricas quando prazo é
    # confiável; só conexão quando não é (documentado na coluna
    # prazo_confiavel, não escondido).
    df["eixo_tecnico"] = df[["eixo_tecnico_conexao_norm", "eixo_tecnico_prazo_norm"]].mean(axis=1, skipna=True)

    # Eixo justiça: IVS já é 0=melhor/1=pior por definição própria do
    # projeto (ver ARQUITETURA.md, "Índices compostos") - usado diretamente,
    # sem renormalizar entre distribuidoras (a escala já é comparável
    # nacionalmente por construção).
    df["eixo_justica"] = df["ivs_medio"]

    # Score composto final: média simples dos dois eixos, só quando ambos
    # disponíveis - senão, mostra só o eixo técnico e marca
    # score_apenas_tecnico=True (nunca inventa valor de justiça).
    df["score_apenas_tecnico"] = df["eixo_justica"].isna()
    df["score_composto"] = df[["eixo_tecnico", "eixo_justica"]].mean(axis=1, skipna=True)

    df["amostra_pequena"] = df["n_pedidos"] < N_PEDIDOS_MINIMO_ROBUSTO

    df = df.sort_values("score_composto", ascending=True)  # menor = melhor

    return df


def main():
    print("Construindo ranking nacional de distribuidoras: desempenho de conexão MMGD + "
          "justiça energética (IVS dos municípios atendidos)")
    print("=" * 78)

    resumo_tecnico = carregar_resumo_tecnico()
    resumo_justica = carregar_resumo_justica()
    crosswalk = montar_crosswalk(
        resumo_tecnico["distribuidora"].tolist(),
        resumo_justica["distribuidora"].tolist(),
    )
    ranking = construir_ranking(resumo_tecnico, resumo_justica, crosswalk)

    print("\n[6/6] Ranking final (ordenado do melhor para o pior score composto):")
    colunas_exibir = [
        "distribuidora", "regiao_principal", "n_pedidos", "amostra_pequena",
        "pct_conectado", "prazo_confiavel", "pct_dentro_do_prazo",
        "n_municipios", "ivs_medio", "score_apenas_tecnico", "score_composto",
    ]
    with pd.option_context("display.max_rows", None, "display.width", 200):
        print(ranking[colunas_exibir].round(3).to_string(index=False))

    os.makedirs(os.path.dirname(CAMINHO_CSV_SAIDA), exist_ok=True)
    ranking.to_csv(CAMINHO_CSV_SAIDA, index=False)
    print(f"\n✅ Ranking concluído (somente leitura, nenhuma escrita no banco). "
          f"CSV salvo localmente (não versionado) em: {CAMINHO_CSV_SAIDA}")
    print("\nLEITURA OBRIGATÓRIA antes de publicar qualquer versão deste ranking: (1) linhas "
          "com prazo_confiavel=False usam SÓ taxa de conexão, não é comparável 1-a-1 com quem "
          "tem os dois eixos técnicos - considerar exibir separadamente ou com selo 'dado de "
          "prazo indisponível'; (2) linhas com score_apenas_tecnico=True não têm par no INDQUAL "
          "- aparecem no ranking técnico mas SEM nota de justiça energética, não interpretar "
          "ausência como 'neutro'; (3) linhas com amostra_pequena=True (< "
          f"{N_PEDIDOS_MINIMO_ROBUSTO} pedidos) são estatisticamente menos robustas - válido "
          "incluir mas vale destacar visualmente numa versão pública.")


if __name__ == "__main__":
    main()
