"""
DIAGNÓSTICO: a EQUATORIAL GO tem desempenho pior que EMT/EMS no atendimento
a pedidos de conexão de MMGD? (evidência quantitativa para a hipótese de
fila/capacidade de conexão levantada em ARQUITETURA.md, seção "Hipótese de
distribuidora/concessionária")
================================================================================
CONTEXTO: a investigação de distribuidora (investigar_distribuidora_regioes_
problema.py) encontrou que, no Centro-Oeste, TODOS os 10 municípios do fundo
do ranking de MMGD residencial per capita são da EQUATORIAL GO, apesar de
irradiação igual ou maior que a mediana regional — e reportagem do Canal
Solar (02/07/2025, "Empresas apontam atrasos na conexão de usinas em Goiás")
documenta relatos de atraso/desorganização no processo de conexão de GD pela
Equatorial Goiás após a descontinuação da plataforma SICAP em abril/2025.
Este script busca uma evidência QUANTITATIVA (não só anedótica) comparando
EQUATORIAL GO x EMT x EMS no cumprimento do prazo regulatório de conexão.

FONTE: ANEEL Dados Abertos, dataset "Atendimento a pedidos de conexões MMGD
- Mini e Microgeração distribuída - pós Lei 14300"
(https://dadosabertos.aneel.gov.br/dataset/atendimento-mmgd-mini-e-micro-geracao-distribuida).
Campos confirmados via dicionário de metadados real (versão 1.3, 26/09/2024
- não confiar em nome de campo sem checar, mesmo cuidado do caso TSEE):
  - SigAgenteDistribuicao: sigla da distribuidora
  - CodMunicipioIBGE, NomUF, NomMunicipio
  - DatSolicitacao: data da solicitação
  - DatLim: "Data limite para injeção (art. 655-O, §4º, REN 1/2021)" — o
    prazo regulatório
  - DatInj: data de início efetivo de injeção (quando conectado)
  - DscSituacaoConexao / DscStatusConexao / DscMotivoSituacao: texto livre
    (categorias reais não documentadas no dicionário — este script inspeciona
    os valores reais antes de calcular qualquer métrica derivada, mesmo
    cuidado já usado para DscClasseConsumo do MMGD/ANEEL)

RESSALVA IMPORTANTE DE COBERTURA TEMPORAL: a "Visão Geral" do dataset diz que
os dados cobrem SOMENTE pedidos feitos entre 7/jan/2022 e 7/jan/2023 (um
levantamento pontual solicitado por Ofício Circular específico), mesmo a
página do dataset listando "Frequência de atualização: Mensal" e "Última
Atualização: junho/2026" (provavelmente um campo genérico da plataforma CKAN,
não uma garantia de conteúdo novo). Este script IMPRIME o intervalo real de
DatSolicitacao encontrado no arquivo, para confirmar ou refutar isso com o
dado de fato, em vez de confiar na descrição.

Este script é SOMENTE LEITURA (não grava nada no banco) — baixa o Parquet
público diretamente da ANEEL para a pasta local de dados brutos (mesmo
padrão de backend/src/etl/data/raw/ usado pelos demais extractors) e analisa
com pandas.
================================================================================
"""

import os
import time

import pandas as pd
import requests

URL_PARQUET_CENTRO_OESTE = (
    "https://dadosabertos.aneel.gov.br/dataset/f0773920-9847-46cb-9bc0-dde68761c573/"
    "resource/6afefff3-134c-48cc-add8-39c5a278628b/download/"
    "pedidos-de-conexao-mmgd-regiao-centro-oeste.parquet"
)

CAMINHO_LOCAL = os.environ.get(
    "CAMINHO_PARQUET_FILA_CENTRO_OESTE",
    "backend/src/etl/data/raw/aneel_fila_conexao_mmgd/pedidos-de-conexao-mmgd-regiao-centro-oeste.parquet",
)

# ACHADO (confirmado via pesquisa externa, não suposição): as siglas deste
# dataset NÃO batem com as do INDQUAL (EQUATORIAL GO / EMT / EMS) — são a
# MESMA empresa sob nomes diferentes por período/dataset:
#   "Enel GO" = "EQUATORIAL GO": confirmado — a Enel vendeu sua distribuidora
#     de Goiás (CNPJ 01.543.032/0001-04) para a Equatorial em 23/09/2022,
#     aprovado pela ANEEL em 06/12/2022, com a marca alterada de "Enel
#     Distribuição Goiás" para "Equatorial Energia Goiás" em 30/12/2022 —
#     mesma pessoa jurídica, nome mudou. Este dataset (pedidos de 2021-2024)
#     usa o nome ANTIGO ("Enel GO") mesmo cobrindo parte do período já sob
#     controle da Equatorial — o rótulo do agente aqui não foi atualizado
#     retroativamente.
#   "Energisa MT" = "EMT", "Energisa MS" = "EMS": mesma empresa (Energisa),
#     apenas abreviação mais curta usada no INDQUAL.
DISTRIBUIDORAS_FOCO = ["Enel GO", "Energisa MT", "Energisa MS"]


def baixar_se_necessario() -> None:
    if os.path.exists(CAMINHO_LOCAL):
        print(f"[1/5] Arquivo já existe localmente em {CAMINHO_LOCAL} — pulando download.")
        return

    print(f"[1/5] Baixando Parquet da ANEEL (Centro-Oeste): {URL_PARQUET_CENTRO_OESTE}")
    os.makedirs(os.path.dirname(CAMINHO_LOCAL), exist_ok=True)

    # Retry com backoff — o portal de dados abertos da ANEEL já mostrou instabilidade
    # pontual em outras ocasiões neste projeto (ver ARQUITETURA.md, bloqueio de
    # "Beneficiarios da CDE" por loop de redirecionamento HTTP 302), não
    # necessariamente um erro do script.
    max_tentativas = 4
    resposta = None
    ultimo_erro = None
    for tentativa in range(1, max_tentativas + 1):
        try:
            resposta = requests.get(URL_PARQUET_CENTRO_OESTE, timeout=180)
            resposta.raise_for_status()
            ultimo_erro = None
            break
        except requests.exceptions.RequestException as erro:
            ultimo_erro = erro
            print(f"      [AVISO] Tentativa {tentativa}/{max_tentativas} falhou ({erro.__class__.__name__}: "
                  f"{str(erro)[:150]}).")
            if tentativa < max_tentativas:
                espera = 5 * tentativa
                print(f"      Aguardando {espera}s antes de tentar de novo...")
                time.sleep(espera)

    if ultimo_erro is not None:
        print(f"\n[ERRO] Não foi possível baixar o arquivo após {max_tentativas} tentativas: {ultimo_erro}")
        print("       Isso pode ser instabilidade pontual do portal da ANEEL (já visto antes neste "
              "projeto, ver ARQUITETURA.md) — tente rodar de novo em alguns minutos, ou baixar "
              "manualmente pelo navegador e salvar em:")
        print(f"       {CAMINHO_LOCAL}")
        raise SystemExit(1)

    with open(CAMINHO_LOCAL, "wb") as f:
        f.write(resposta.content)
    print(f"      {len(resposta.content) / 1_048_576:.1f} MB baixado(s).")


def converter_datas(df: pd.DataFrame) -> pd.DataFrame:
    """As colunas de data vêm do Parquet como `object` (mistura de
    `datetime.date` e `NaN`/float quando ausentes) — sem converter para
    datetime64 primeiro, até `.min()`/`.max()` quebram comparando tipos
    diferentes."""
    df = df.copy()
    for coluna in ["DatSolicitacao", "DatPrzEnvio", "DatInj", "DatLim", "DatOrcamentoConexao", "DatVistoria"]:
        if coluna in df.columns:
            df[coluna] = pd.to_datetime(df[coluna], errors="coerce")
    return df


def inspecionar_valores_reais(df: pd.DataFrame) -> None:
    print("\n[2/5] Inspecionando valores reais (não confiar no dicionário sem checar)...")

    print(f"      Intervalo real de DatSolicitacao: {df['DatSolicitacao'].min()} a {df['DatSolicitacao'].max()}")
    print(f"      Intervalo real de DatInj (quando presente): "
          f"{df['DatInj'].min()} a {df['DatInj'].max()}")

    print("\n      Distribuidoras presentes no arquivo (SigAgenteDistribuicao), contagem de linhas:")
    print(df["SigAgenteDistribuicao"].value_counts().to_string())

    print("\n      Valores distintos de DscSituacaoConexao:")
    print(df["DscSituacaoConexao"].value_counts(dropna=False).to_string())

    print("\n      Valores distintos de DscStatusConexao:")
    print(df["DscStatusConexao"].value_counts(dropna=False).to_string())


def calcular_desempenho_por_distribuidora(df: pd.DataFrame) -> None:
    print("\n[3/5] Calculando % de pedidos conectados (DatInj preenchida) e cumprimento do prazo "
          "(DatInj <= DatLim) por distribuidora...")

    df = df.copy()

    # ACHADO DE QUALIDADE DE DADO: DatInj tem valores sentinela implausíveis
    # (ex.: 2099-12-31) — não são datas de conexão reais, provavelmente um
    # placeholder do sistema da ANEEL para "ainda não conectado" preenchido
    # incorretamente numa data em vez de ficar nulo. Excluídos do cálculo de
    # atraso (tratados como não conectado), reportados separadamente.
    limite_futuro_plausivel = pd.Timestamp.today() + pd.Timedelta(days=365)
    sentinela = df["DatInj"].notna() & (df["DatInj"] > limite_futuro_plausivel)
    n_sentinela = int(sentinela.sum())
    if n_sentinela > 0:
        print(f"      [AVISO] {n_sentinela} registro(s) com DatInj implausível (> 1 ano no futuro, "
              f"ex.: sentinela 2099-12-31) — tratados como NÃO conectados neste cálculo.")
        df.loc[sentinela, "DatInj"] = pd.NaT

    df["conectado"] = df["DatInj"].notna()
    df["dentro_do_prazo"] = df["conectado"] & df["DatLim"].notna() & (df["DatInj"] <= df["DatLim"])
    df["dias_atraso_vs_prazo"] = (df["DatInj"] - df["DatLim"]).dt.days

    def resumir_grupo(grupo: pd.DataFrame) -> pd.Series:
        conectados = grupo[grupo["conectado"]]
        return pd.Series({
            "n_pedidos": len(grupo),
            "pct_conectado": round(grupo["conectado"].mean() * 100, 1),
            "pct_dentro_do_prazo_entre_conectados": (
                round(conectados["dentro_do_prazo"].mean() * 100, 1) if len(conectados) > 0 else float("nan")
            ),
            "mediana_dias_atraso_vs_prazo": conectados["dias_atraso_vs_prazo"].median() if len(conectados) > 0 else float("nan"),
        })

    # Nota: dependendo da versão do pandas instalada, este .apply() pode emitir um
    # DeprecationWarning sobre incluir a coluna de agrupamento no grupo — inofensivo
    # aqui, pois resumir_grupo não referencia essa coluna.
    resumo = (
        df.groupby("SigAgenteDistribuicao", group_keys=True)
        .apply(resumir_grupo)
        .sort_values("n_pedidos", ascending=False)
    )

    print(resumo.to_string())

    print("\n      --- Foco nas 3 distribuidoras do Centro-Oeste comparadas na análise anterior ---")
    foco = resumo[resumo.index.isin(DISTRIBUIDORAS_FOCO)]
    if len(foco) == 0:
        print("      [AVISO] Nenhuma das 3 siglas esperadas (EQUATORIAL GO, EMT, EMS) foi encontrada "
              "exatamente como esperado no arquivo — conferir a lista completa de siglas acima "
              "(pode haver variação de grafia, ex.: com/sem hífen ou espaço).")
    else:
        print(foco.to_string())


def inspecionar_motivos_nao_conectado(df: pd.DataFrame) -> None:
    print("\n[4/5] Para pedidos NÃO conectados (DatInj vazia), motivos mais comuns por distribuidora "
          "(DscMotivoSituacao)...")

    df_pendente = df[df["DatInj"].isna()]
    if len(df_pendente) == 0:
        print("      Nenhum pedido pendente encontrado no arquivo.")
        return

    for distribuidora in DISTRIBUIDORAS_FOCO:
        subset = df_pendente[df_pendente["SigAgenteDistribuicao"] == distribuidora]
        if len(subset) == 0:
            continue
        print(f"\n      {distribuidora} ({len(subset)} pedido(s) sem DatInj):")
        print(subset["DscMotivoSituacao"].value_counts(dropna=False).head(10).to_string())


def main():
    print("Investigação: EQUATORIAL GO tem desempenho pior que EMT/EMS no atendimento a pedidos "
          "de conexão de MMGD? (evidência quantitativa, ANEEL 'Atendimento a pedidos de conexões MMGD')")
    print("=" * 78)

    baixar_se_necessario()

    print("\n[2/5] Lendo Parquet local...")
    df = pd.read_parquet(CAMINHO_LOCAL)
    print(f"      {len(df)} linha(s) lida(s). Colunas: {list(df.columns)}")
    df = converter_datas(df)

    inspecionar_valores_reais(df)
    calcular_desempenho_por_distribuidora(df)
    inspecionar_motivos_nao_conectado(df)

    print("\n✅ Investigação concluída (somente leitura, nenhuma escrita no banco).")
    print("[5/5] Leitura sugerida: se EQUATORIAL GO tiver % dentro do prazo MENOR e/ou mediana de "
          "atraso MAIOR que EMT/EMS, é evidência quantitativa a favor da hipótese de fila/capacidade "
          "de conexão como explicação (parcial) para o caso Centro-Oeste x Irradiação Solar. "
          "LEMBRETE: a descrição do dataset na ANEEL cita jan/2022 a jan/2023, mas o intervalo REAL "
          "encontrado no arquivo (impresso acima) é mais amplo — confiar no dado, não na descrição. "
          "ao momento do snapshot de MMGD usado na análise principal, mas evidência de padrão "
          "administrativo persistente da distribuidora é razoável de considerar.")


if __name__ == "__main__":
    main()
