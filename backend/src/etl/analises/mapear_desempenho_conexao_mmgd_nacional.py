"""
MAPEAMENTO NACIONAL: desempenho de distribuidoras no atendimento a pedidos de
conexão de MMGD, nas 5 regiões do Brasil.
================================================================================
CONTEXTO: extensão, a pedido do usuário, do diagnóstico já feito para
Centro-Oeste (`investigar_fila_conexao_mmgd_centro_oeste.py`) e Nordeste
(`investigar_fila_conexao_mmgd_nordeste.py`) para as 3 regiões restantes
(Norte, Sudeste, Sul) - primeiro passo de dado para a "Ideia de produto:
ranking público de distribuidoras" (ver ARQUITETURA.md).

MOTIVAÇÃO ADICIONAL (achado da sessão Nordeste, 06/07/2026): o campo DatLim
(prazo regulatório, base de qualquer métrica de "% dentro do prazo") apareceu
praticamente AUSENTE para EQUATORIAL MA/PI/AL e Energisa Borborema (0-0,1% de
preenchimento, contra 86,7-100% nas demais distribuidoras da mesma região).
Antes de considerar este dataset confiável para um ranking público nacional,
é preciso checar se esse problema é uma peculiaridade do recurso Nordeste ou
se se repete em outras regiões/distribuidoras. Este script calcula, para
TODAS as distribuidoras de TODAS as 5 regiões, a mesma métrica de
`pct_datlim_presente_entre_conectados` usada no diagnóstico do Nordeste,
para mapear onde o dado é confiável e onde não é.

FONTE: mesmo dataset ANEEL "Atendimento a pedidos de conexões MMGD - pós Lei
14300", 5 recursos regionais separados (URLs confirmadas via
dadosabertos.aneel.gov.br/dataset/atendimento-mmgd-mini-e-micro-geracao-distribuida,
não supostas por padrão de nome de arquivo).

RESSALVA DE MEMÓRIA (achado real da sessão Nordeste - a 1a tentativa de
processar aquele arquivo sozinho, carregando todas as 21 colunas, foi morta
pelo OOM killer do Linux): este script (1) carrega só as 3 colunas
estritamente necessárias para a métrica (SigAgenteDistribuicao, DatInj,
DatLim - mais leve ainda que os scripts regionais anteriores, que também
inspecionavam campos de texto livre), (2) processa UMA REGIÃO POR VEZ,
guardando só o resumo agregado (poucas linhas, uma por distribuidora) antes
de descartar o DataFrame bruto da região e seguir para a próxima. Mesmo
assim, Sudeste é historicamente a região com mais municípios/pedidos do
Brasil - se ainda assim faltar memória, considerar processar região por
região manualmente via a variável de ambiente REGIAO_UNICA (ver abaixo).

Reaproveita os arquivos de Centro-Oeste e Nordeste já baixados em sessões
anteriores (não baixa de novo) e baixa Norte, Sudeste e Sul pela primeira vez.

Este script é SOMENTE LEITURA (não grava nada no banco) - ao final, exporta
um CSV local (dado derivado, não versionado) com o resumo de todas as
distribuidoras x regiões.
================================================================================
"""

import os
import time

import pandas as pd
import requests

PASTA_LOCAL = "backend/src/etl/data/raw/aneel_fila_conexao_mmgd"

# URLs confirmadas via a página do dataset na ANEEL (mesmo dataset ID
# f0773920-9847-46cb-9bc0-dde68761c573, um resource por região).
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

# Colunas mínimas para a métrica - mais enxuto que os scripts regionais
# anteriores (que também inspecionavam DscSituacaoConexao/DscMotivoSituacao
# para diagnóstico qualitativo). Aqui o objetivo é só mapear
# pct_datlim_presente e desempenho básico em todas as distribuidoras.
COLUNAS_NECESSARIAS = ["SigAgenteDistribuicao", "DatInj", "DatLim"]

CAMINHO_CSV_SAIDA = os.environ.get(
    "CAMINHO_CSV_DESEMPENHO_NACIONAL",
    "backend/src/etl/data/raw/aneel_fila_conexao_mmgd/desempenho_conexao_mmgd_distribuidoras_nacional.csv",
)

# Para rodar região por região manualmente (ex.: se a memória disponível não
# aguentar todas as 5 em sequência), defina REGIAO_UNICA com uma das chaves
# de REGIOES antes de rodar: `REGIAO_UNICA=sudeste python3 mapear_...py`
REGIAO_UNICA = os.environ.get("REGIAO_UNICA")


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

    # Mesmo achado de sentinela já visto no Centro-Oeste/Nordeste (DatInj com
    # datas implausíveis tipo 2099-12-31) - tratado como não conectado.
    limite_futuro_plausivel = pd.Timestamp.today() + pd.Timedelta(days=365)
    sentinela = df["DatInj"].notna() & (df["DatInj"] > limite_futuro_plausivel)
    if sentinela.any():
        df.loc[sentinela, "DatInj"] = pd.NaT

    df["conectado"] = df["DatInj"].notna()
    df["datlim_presente"] = df["DatLim"].notna()
    df["dentro_do_prazo"] = df["conectado"] & df["datlim_presente"] & (df["DatInj"] <= df["DatLim"])
    df["dias_atraso_vs_prazo"] = (df["DatInj"] - df["DatLim"]).dt.days

    n_pedidos = df.groupby("SigAgenteDistribuicao", observed=True).size()
    pct_conectado = (df.groupby("SigAgenteDistribuicao", observed=True)["conectado"].mean() * 100).round(1)

    conectados = df.loc[df["conectado"], ["SigAgenteDistribuicao", "datlim_presente", "dentro_do_prazo", "dias_atraso_vs_prazo"]]
    grp_conectados = conectados.groupby("SigAgenteDistribuicao", observed=True)
    pct_datlim_presente = (grp_conectados["datlim_presente"].mean() * 100).round(1)
    pct_dentro_do_prazo = (grp_conectados["dentro_do_prazo"].mean() * 100).round(1)
    mediana_atraso = grp_conectados["dias_atraso_vs_prazo"].median()

    resumo = pd.DataFrame({
        "regiao": regiao,
        "n_pedidos": n_pedidos,
        "pct_conectado": pct_conectado,
        "pct_datlim_presente_entre_conectados": pct_datlim_presente,
        "pct_dentro_do_prazo_entre_conectados": pct_dentro_do_prazo,
        "mediana_dias_atraso_vs_prazo": mediana_atraso,
    }).reset_index().rename(columns={"SigAgenteDistribuicao": "distribuidora"})

    # Libera memória do DataFrame bruto (12M+ linhas em algumas regiões) antes
    # de seguir para a próxima região - só o resumo (poucas linhas) é mantido.
    del df, conectados
    return resumo


def main():
    print("Mapeamento nacional: desempenho de distribuidoras no atendimento a pedidos de "
          "conexão MMGD (5 regiões) + checagem de completude do campo DatLim")
    print("=" * 78)

    regioes_a_processar = [REGIAO_UNICA] if REGIAO_UNICA else list(REGIOES.keys())
    if REGIAO_UNICA and REGIAO_UNICA not in REGIOES:
        print(f"[ERRO] REGIAO_UNICA='{REGIAO_UNICA}' inválida. Opções: {list(REGIOES.keys())}")
        raise SystemExit(1)

    resumos = []
    for i, regiao in enumerate(regioes_a_processar, start=1):
        print(f"\n[{i}/{len(regioes_a_processar)}] Processando região: {regiao}")
        resumos.append(processar_regiao(regiao))

    resumo_nacional = pd.concat(resumos, ignore_index=True).sort_values(
        ["pct_datlim_presente_entre_conectados", "n_pedidos"], ascending=[True, False]
    )

    print("\n" + "=" * 78)
    print("RESUMO NACIONAL - todas as distribuidoras, ordenado por "
          "pct_datlim_presente_entre_conectados (menor primeiro - destaca onde o dado de "
          "prazo NÃO é confiável):")
    with pd.option_context("display.max_rows", None, "display.width", 160):
        print(resumo_nacional.to_string(index=False))

    limiar_alerta = 50.0
    alerta = resumo_nacional[resumo_nacional["pct_datlim_presente_entre_conectados"] < limiar_alerta]
    print(f"\n[ALERTA DE QUALIDADE DE DADO] {len(alerta)} distribuidora(s) com "
          f"pct_datlim_presente_entre_conectados < {limiar_alerta}% - métricas de prazo/atraso "
          f"NÃO CONFIÁVEIS para estas, tratar como 'sem dado', não como '0% no prazo':")
    if len(alerta) > 0:
        print(alerta[["regiao", "distribuidora", "n_pedidos", "pct_datlim_presente_entre_conectados"]].to_string(index=False))
    else:
        print("      Nenhuma distribuidora abaixo do limiar nesta rodada.")

    os.makedirs(os.path.dirname(CAMINHO_CSV_SAIDA), exist_ok=True)
    resumo_nacional.to_csv(CAMINHO_CSV_SAIDA, index=False)
    print(f"\n✅ Mapeamento concluído (somente leitura, nenhuma escrita no banco). "
          f"CSV salvo localmente (não versionado) em: {CAMINHO_CSV_SAIDA}")
    print("Leitura sugerida: qualquer ranking público de distribuidoras (ver ARQUITETURA.md, "
          "'Ideia de produto') PRECISA excluir ou marcar como 'sem dado' as distribuidoras "
          "listadas no ALERTA acima antes de publicar qualquer métrica de prazo/atraso.")


if __name__ == "__main__":
    main()
