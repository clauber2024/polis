"""
EXTRACTOR: desempenho_conexao_distribuidoras (a partir do dataset ANEEL
"Atendimento a pedidos de conexoes MMGD - pos Lei 14300")
================================================================================
CONTEXTO: primeira persistencia real (Postgres) do insumo tecnico do produto
"ranking publico de distribuidoras por desempenho em conexao de MMGD +
justica energetica" (priorizado 06/07/2026, ver ARQUITETURA.md, "Ideia de
produto: ranking publico de distribuidoras", e decisoes de exibicao em
docs/DECISOES.md, ADR "Ranking publico de distribuidoras", 10/07/2026).

Ate esta sessao, essa metodologia so existia validada em scripts de analise
SOMENTE LEITURA (`backend/src/etl/analises/`):
  - `mapear_desempenho_conexao_mmgd_nacional.py` - baixa as 5 regioes, calcula
    pct_conectado/pct_dentro_do_prazo/pct_datlim_presente POR REGIAO.
  - `construir_ranking_distribuidoras_conexao_mmgd.py` - agrega por
    distribuidora NACIONAL (entre regioes), monta o crosswalk com o schema
    INDQUAL (sig_agente) e compoe o score final.
Este extractor REUTILIZA a mesma metodologia (download, agregacao, crosswalk)
mas em vez de exportar CSV local, faz upsert em
`desempenho_conexao_distribuidoras`. O eixo de justica energetica (IVS medio
ponderado por populacao, ver ADR) NAO e calculado aqui - fica para o backend
Node/Express, que ja tem acesso direto a indicadores_sociais + populacao
estimada e pode juntar em tempo real com esta tabela via sig_agente_indqual.

O QUE ESTE SCRIPT FAZ:
  1. Baixa (ou reaproveita, se ja local) os 5 Parquets regionais da ANEEL
  2. Para cada regiao, calcula por distribuidora: n_pedidos, pct_conectado,
     pct_datlim_presente_entre_conectados, pct_dentro_do_prazo_entre_conectados
     - processa uma regiao por vez e descarta o DataFrame bruto antes da
     proxima (mesma precaucao de OOM ja documentada em
     mapear_desempenho_conexao_mmgd_nacional.py - Sudeste tem ~19,5M linhas)
  3. Agrega nacionalmente por distribuidora (media ponderada por n_pedidos
     entre as regioes onde ela aparece), marcando prazo_confiavel=False
     (limiar 50% de DatLim presente) em vez de expor "0% no prazo"
  4. Casa cada distribuidora com o sig_agente real do schema INDQUAL
     (`SELECT DISTINCT sig_agente FROM qualidade_conjuntos`) via mapeamento
     manual ja confirmado + casamento automatico por substring
  5. Upsert em `desempenho_conexao_distribuidoras` (uma transacao por
     distribuidora, mesmo motivo ja documentado em extrair_mmgd_aneel.py -
     uma falha isolada nao pode abortar as demais)

Requer a migration 0026 aplicada antes de rodar.
================================================================================
"""

import os
import re
import sys
import time

import numpy as np
import pandas as pd
import requests
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

PASTA_LOCAL = "backend/src/etl/data/raw/aneel_fila_conexao_mmgd"

# Mesmas URLs confirmadas em mapear_desempenho_conexao_mmgd_nacional.py
# (dataset ID f0773920-9847-46cb-9bc0-dde68761c573, um resource por regiao).
REGIOES = {
    "centro-oeste": {
        "url": (
            "https://dadosabertos.aneel.gov.br/dataset/f0773920-9847-46cb-9bc0-dde68761c573/"
            "resource/6afefff3-134c-48cc-add8-39c5a278628b/download/"
            "pedidos-de-conexao-mmgd-regiao-centro-oeste.parquet"
        ),
        "arquivo": "pedidos-de-conexao-mmgd-regiao-centro-oeste.parquet",
    },
    "nordeste": {
        "url": (
            "https://dadosabertos.aneel.gov.br/dataset/f0773920-9847-46cb-9bc0-dde68761c573/"
            "resource/9f2e7e25-fc53-4e99-8362-f9f5c8d4c04c/download/"
            "pedidos-de-conexao-mmgd-regiao-nordeste.parquet"
        ),
        "arquivo": "pedidos-de-conexao-mmgd-regiao-nordeste.parquet",
    },
    "norte": {
        "url": (
            "https://dadosabertos.aneel.gov.br/dataset/f0773920-9847-46cb-9bc0-dde68761c573/"
            "resource/68f3e0e6-c836-43b0-85f3-3d5898db2e22/download/"
            "pedidos-de-conexao-mmgd-regiao-norte.parquet"
        ),
        "arquivo": "pedidos-de-conexao-mmgd-regiao-norte.parquet",
    },
    "sudeste": {
        "url": (
            "https://dadosabertos.aneel.gov.br/dataset/f0773920-9847-46cb-9bc0-dde68761c573/"
            "resource/3fdb28ba-8834-4788-8d65-3defc930da6d/download/"
            "pedidos-de-conexao-mmgd-regiao-sudeste.parquet"
        ),
        "arquivo": "pedidos-de-conexao-mmgd-regiao-sudeste.parquet",
    },
    "sul": {
        "url": (
            "https://dadosabertos.aneel.gov.br/dataset/f0773920-9847-46cb-9bc0-dde68761c573/"
            "resource/87af337a-fab1-492a-82d3-607c07c417fe/download/"
            "pedidos-de-conexao-mmgd-regiao-sul.parquet"
        ),
        "arquivo": "pedidos-de-conexao-mmgd-regiao-sul.parquet",
    },
}

COLUNAS_NECESSARIAS = ["SigAgenteDistribuicao", "DatInj", "DatLim"]

LIMIAR_DATLIM_CONFIAVEL = 50.0
REGIAO_UNICA = os.environ.get("REGIAO_UNICA")

# Mesmo mapeamento manual ja validado em
# construir_ranking_distribuidoras_conexao_mmgd.py - ver aquele script para o
# racional completo (fontes/confianca de cada par).
MAPEAMENTO_MANUAL_CONFIRMADO = {
    "Energisa MT": "EMT",
    "Energisa MS": "EMS",
    "Enel GO": "EQUATORIAL GO",
    "Energisa PB": "EPB",
    "Energisa SE": "ESE",
    "Energisa RO": "ERO",
    "Energisa TO": "ETO",
    "Energisa AC": "EAC",
    "Energisa Borborema": "EBO",
    "Energisa Minas Rio": "EMR",
    "Energisa Sul-Sudeste": "ESS",
    "Enel SP": "ELETROPAULO",
    "Amazonas Energia": "AME",
    "CEEE Equatorial": "CEEE-D",
    "Roraima Energia": "BOA VISTA",
    # Adicionados em 10/07/2026 - investigação da pendência "14 distribuidoras
    # sem eixo de justiça" (ver ARQUITETURA.md, "Ideia de produto: ranking
    # público de distribuidoras"). Confirmados via pesquisa externa (mesmo
    # padrão de confiança do caso Enel GO=EQUATORIAL GO) + confirmação direta
    # de que a sigla existe em `qualidade_conjuntos.sig_agente`:
    #   - Forcel (Força e Luz Coronel Vivida, fundada em 1959) foi adquirida
    #     pelo Grupo Pacto Energia em 2021, mesmo CNPJ 79850574000109, hoje
    #     opera como "Pacto Energia Distribuição Paraná".
    #   - João Cesa = "Empresa Força e Luz João Cesa Ltda." (Siderópolis/SC),
    #     companhia real com ranking oficial de qualidade da ANEEL (DEC/FEC,
    #     1º/2º lugar entre pequenas distribuidoras em 2018/2021/2024) - sigla
    #     EFLJC.
    #   - Nova Palma = UHENPAL (Usina Hidrelétrica Nova Palma, hoje rebatizada
    #     "Nova Palma Energia") - atende Nova Palma e mais 8 municípios da
    #     Quarta Colônia/RS.
    #   - Santa Maria = "Empresa Luz e Força Santa Maria S/A" (110 mil
    #     consumidores, 11 municípios) - sigla ELFSM.
    "Forcel": "PACTO ENERGIA PR",
    "João Cesa": "EFLJC",
    "Nova Palma": "UHENPAL",
    "Santa Maria": "ELFSM",
}


def normalizar(nome: str) -> str:
    n = nome.upper()
    n = re.sub(r"[-\s]", "", n)
    return n


def baixar_se_necessario(regiao: str, url: str, caminho: str) -> None:
    if os.path.exists(caminho):
        print(f"      [{regiao}] Arquivo já existe localmente em {caminho} — pulando download.")
        return

    print(f"      [{regiao}] Baixando Parquet da ANEEL: {url}")
    os.makedirs(os.path.dirname(caminho), exist_ok=True)

    max_tentativas = 4
    resposta = None
    ultimo_erro = None
    for tentativa in range(1, max_tentativas + 1):
        try:
            resposta = requests.get(url, timeout=300)
            resposta.raise_for_status()
            ultimo_erro = None
            break
        except requests.exceptions.RequestException as erro:
            ultimo_erro = erro
            print(f"      [{regiao}] [AVISO] Tentativa {tentativa}/{max_tentativas} falhou "
                  f"({erro.__class__.__name__}: {str(erro)[:150]}).")
            if tentativa < max_tentativas:
                espera = 5 * tentativa
                print(f"      Aguardando {espera}s antes de tentar de novo...")
                time.sleep(espera)

    if ultimo_erro is not None:
        print(f"\n[ERRO] [{regiao}] Não foi possível baixar o arquivo após {max_tentativas} "
              f"tentativas: {ultimo_erro}")
        print(f"       Tente rodar de novo em alguns minutos, ou baixar manualmente e salvar em: {caminho}")
        raise SystemExit(1)

    with open(caminho, "wb") as f:
        f.write(resposta.content)
    print(f"      [{regiao}] {len(resposta.content) / 1_048_576:.1f} MB baixado(s).")


def processar_regiao(regiao: str) -> pd.DataFrame:
    info = REGIOES[regiao]
    caminho = os.path.join(PASTA_LOCAL, info["arquivo"])

    baixar_se_necessario(regiao, info["url"], caminho)

    print(f"      [{regiao}] Lendo Parquet (só {len(COLUNAS_NECESSARIAS)} colunas)...")
    df = pd.read_parquet(caminho, columns=COLUNAS_NECESSARIAS)
    print(f"      [{regiao}] {len(df)} linha(s) lida(s).")

    df["DatInj"] = pd.to_datetime(df["DatInj"], errors="coerce")
    df["DatLim"] = pd.to_datetime(df["DatLim"], errors="coerce")
    df["SigAgenteDistribuicao"] = df["SigAgenteDistribuicao"].astype("category")

    # Mesmo achado de sentinela ja visto no Centro-Oeste/Nordeste (DatInj com
    # datas implausiveis tipo 2099-12-31) - tratado como nao conectado.
    limite_futuro_plausivel = pd.Timestamp.today() + pd.Timedelta(days=365)
    sentinela = df["DatInj"].notna() & (df["DatInj"] > limite_futuro_plausivel)
    if sentinela.any():
        df.loc[sentinela, "DatInj"] = pd.NaT

    df["conectado"] = df["DatInj"].notna()
    df["datlim_presente"] = df["DatLim"].notna()
    df["dentro_do_prazo"] = df["conectado"] & df["datlim_presente"] & (df["DatInj"] <= df["DatLim"])

    n_pedidos = df.groupby("SigAgenteDistribuicao", observed=True).size()
    pct_conectado = (df.groupby("SigAgenteDistribuicao", observed=True)["conectado"].mean() * 100).round(1)

    conectados = df.loc[df["conectado"], ["SigAgenteDistribuicao", "datlim_presente", "dentro_do_prazo"]]
    grp_conectados = conectados.groupby("SigAgenteDistribuicao", observed=True)
    pct_datlim_presente = (grp_conectados["datlim_presente"].mean() * 100).round(1)
    pct_dentro_do_prazo = (grp_conectados["dentro_do_prazo"].mean() * 100).round(1)

    resumo = pd.DataFrame({
        "regiao": regiao,
        "n_pedidos": n_pedidos,
        "pct_conectado": pct_conectado,
        "pct_datlim_presente_entre_conectados": pct_datlim_presente,
        "pct_dentro_do_prazo_entre_conectados": pct_dentro_do_prazo,
    }).reset_index().rename(columns={"SigAgenteDistribuicao": "distribuidora"})

    # Libera memoria do DataFrame bruto (12M+ linhas em algumas regioes)
    # antes de seguir para a proxima regiao.
    del df, conectados
    return resumo


def agregar_nacional(resumo_por_regiao: pd.DataFrame) -> pd.DataFrame:
    print("\n[3/6] Agregando por distribuidora (média ponderada por n_pedidos entre as "
          "regiões onde ela aparece)...")

    # ACHADO 3 já registrado em ARQUITETURA.md: algumas combinações
    # distribuidora x região com volume residual (município de fronteira
    # classificado no arquivo regional "errado") têm pct_conectado == 0.0 -
    # ruído de classificação, não desempenho real. Excluídas da agregação.
    n_antes = len(resumo_por_regiao)
    df_valido = resumo_por_regiao[resumo_por_regiao["pct_conectado"] > 0].copy()
    n_excluidos = n_antes - len(df_valido)
    if n_excluidos > 0:
        print(f"      [AVISO] {n_excluidos} linha(s) com pct_conectado == 0.0 excluída(s) "
              f"(ruído de classificação regional de município de fronteira).")

    def agregar(grupo: pd.DataFrame) -> pd.Series:
        n_total = grupo["n_pedidos"].sum()
        linha_principal = grupo.loc[grupo["n_pedidos"].idxmax()]
        prazo_confiavel = bool(linha_principal["pct_datlim_presente_entre_conectados"] >= LIMIAR_DATLIM_CONFIAVEL)

        pct_conectado_pond = np.average(grupo["pct_conectado"], weights=grupo["n_pedidos"])

        if prazo_confiavel:
            grupo_confiavel = grupo[grupo["pct_datlim_presente_entre_conectados"] >= LIMIAR_DATLIM_CONFIAVEL]
            pct_prazo_pond = np.average(
                grupo_confiavel["pct_dentro_do_prazo_entre_conectados"],
                weights=grupo_confiavel["n_pedidos"],
            )
        else:
            pct_prazo_pond = np.nan

        return pd.Series({
            "n_pedidos": int(n_total),
            "n_regioes": int(grupo["regiao"].nunique()),
            "regiao_principal": linha_principal["regiao"],
            "pct_conectado": round(float(pct_conectado_pond), 1),
            "prazo_confiavel": prazo_confiavel,
            "pct_dentro_do_prazo": round(float(pct_prazo_pond), 1) if prazo_confiavel else None,
        })

    resumo = df_valido.groupby("distribuidora", observed=True).apply(agregar).reset_index()
    n_prazo_confiavel = int(resumo["prazo_confiavel"].sum())
    print(f"      {len(resumo)} distribuidora(s) distintas | {n_prazo_confiavel} com prazo "
          f"confiável, {len(resumo) - n_prazo_confiavel} SEM dado de prazo confiável "
          f"(pct_dentro_do_prazo fica NULL para essas, nunca '0%').")

    return resumo


def montar_crosswalk(engine, nomes_fila: list) -> dict:
    print("\n[4/6] Casando nomes de distribuidora com o sig_agente real do schema INDQUAL "
          "(SELECT DISTINCT sig_agente FROM qualidade_conjuntos)...")

    with engine.connect() as conexao:
        resultado = conexao.execute(text(
            "SELECT DISTINCT sig_agente FROM qualidade_conjuntos WHERE sig_agente IS NOT NULL"
        ))
        nomes_indqual = [linha[0] for linha in resultado]

    normalizados_indqual = {normalizar(n): n for n in nomes_indqual}
    crosswalk = {}
    nao_casados = []

    for nome_fila in nomes_fila:
        if nome_fila in MAPEAMENTO_MANUAL_CONFIRMADO:
            crosswalk[nome_fila] = MAPEAMENTO_MANUAL_CONFIRMADO[nome_fila]
            continue

        norm_fila = normalizar(nome_fila)

        if norm_fila in normalizados_indqual:
            crosswalk[nome_fila] = normalizados_indqual[norm_fila]
            continue

        # Contenção de substring em qualquer direção - sem filtro de tamanho
        # mínimo (siglas curtas como EMT/EMS/RGE são normais neste domínio,
        # ver bug já corrigido no protótipo em 06/07/2026).
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
    print(f"      {n_casados}/{len(nomes_fila)} distribuidoras casadas com o INDQUAL.")
    if nao_casados:
        print(f"      [AVISO] {len(nao_casados)} distribuidora(s) SEM par no INDQUAL - ficam "
              f"no ranking técnico, mas sig_agente_indqual = NULL (sem eixo de justiça):")
        for nome in nao_casados:
            print(f"        - {nome}")

    return crosswalk


def executar_upsert(engine, resumo: pd.DataFrame, crosswalk: dict):
    print(f"\n[5/6] Inserindo/atualizando `desempenho_conexao_distribuidoras`...")

    sql_upsert = text("""
        INSERT INTO desempenho_conexao_distribuidoras
            (distribuidora, sig_agente_indqual, regiao_principal, n_pedidos,
             n_regioes, pct_conectado, prazo_confiavel, pct_dentro_do_prazo)
        VALUES
            (:distribuidora, :sig_agente_indqual, :regiao_principal, :n_pedidos,
             :n_regioes, :pct_conectado, :prazo_confiavel, :pct_dentro_do_prazo)
        ON CONFLICT (distribuidora) DO UPDATE SET
            sig_agente_indqual = EXCLUDED.sig_agente_indqual,
            regiao_principal = EXCLUDED.regiao_principal,
            n_pedidos = EXCLUDED.n_pedidos,
            n_regioes = EXCLUDED.n_regioes,
            pct_conectado = EXCLUDED.pct_conectado,
            prazo_confiavel = EXCLUDED.prazo_confiavel,
            pct_dentro_do_prazo = EXCLUDED.pct_dentro_do_prazo;
    """)

    total = len(resumo)
    inseridos = 0
    falhas = []

    # Mesma decisão já documentada em extrair_mmgd_aneel.py: uma transação
    # por distribuidora, não uma única para o lote inteiro - uma falha
    # isolada não pode abortar as demais em cascata.
    for i, linha in resumo.iterrows():
        try:
            with engine.begin() as conexao:
                conexao.execute(sql_upsert, {
                    "distribuidora": linha["distribuidora"],
                    "sig_agente_indqual": crosswalk.get(linha["distribuidora"]),
                    "regiao_principal": linha["regiao_principal"],
                    "n_pedidos": int(linha["n_pedidos"]),
                    "n_regioes": int(linha["n_regioes"]),
                    "pct_conectado": float(linha["pct_conectado"]),
                    "prazo_confiavel": bool(linha["prazo_confiavel"]),
                    "pct_dentro_do_prazo": (
                        float(linha["pct_dentro_do_prazo"])
                        if pd.notna(linha["pct_dentro_do_prazo"]) else None
                    ),
                })
            inseridos += 1
        except Exception as e:
            falhas.append((linha["distribuidora"], str(e)))

    print(f"      {inseridos}/{total} distribuidora(s) inseridas/atualizadas com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} distribuidora(s) falharam:")
        for nome, erro in falhas[:10]:
            print(f"        - {nome}: {erro[:120]}")


def main():
    print("Extração: desempenho de conexão MMGD por distribuidora (5 regiões ANEEL) → "
          "desempenho_conexao_distribuidoras")
    print("=" * 78)

    regioes_a_processar = [REGIAO_UNICA] if REGIAO_UNICA else list(REGIOES.keys())
    if REGIAO_UNICA and REGIAO_UNICA not in REGIOES:
        print(f"[ERRO] REGIAO_UNICA='{REGIAO_UNICA}' inválida. Opções: {list(REGIOES.keys())}")
        raise SystemExit(1)

    print(f"\n[1/6] Regiões a processar: {regioes_a_processar}")
    resumos = []
    for i, regiao in enumerate(regioes_a_processar, start=1):
        print(f"\n[2/6] ({i}/{len(regioes_a_processar)}) Processando região: {regiao}")
        resumos.append(processar_regiao(regiao))

    if REGIAO_UNICA:
        print("\n[AVISO] Rodando com REGIAO_UNICA - a agregação nacional abaixo só reflete "
              "esta região. Rode as demais antes de considerar o resultado completo (o upsert "
              "é por distribuidora, então rodar região por região sobrescreve com dado parcial "
              "a cada vez até todas terem sido processadas).")

    resumo_por_regiao = pd.concat(resumos, ignore_index=True)
    resumo_nacional = agregar_nacional(resumo_por_regiao)

    print(f"\nConectando ao banco: {DATABASE_URL.split('@')[-1]}")
    engine = create_engine(DATABASE_URL)

    crosswalk = montar_crosswalk(engine, resumo_nacional["distribuidora"].tolist())
    executar_upsert(engine, resumo_nacional, crosswalk)

    print("\n[6/6] ✅ Extração de desempenho de conexão MMGD concluída.")
    print("Lembrete: pct_dentro_do_prazo = NULL sempre que prazo_confiavel = false - o backend "
          "que consumir esta tabela NUNCA deve interpretar NULL como '0% no prazo'.")


if __name__ == "__main__":
    main()
