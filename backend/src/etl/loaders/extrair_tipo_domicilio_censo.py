"""
EXTRACTOR: indicadores_sociais — percentual_apartamento (tipologia habitacional)
================================================================================
POR QUE ESTE EXTRACTOR EXISTE:
--------------------------------------------------------------------------
A análise de correlação MMGD x indicadores sociais (ver
backend/src/etl/analises/analisar_correlacao_mmgd_renda.py e
diagnosticar_outliers_regionais.py) encontrou dois casos em que nem renda
nem urbanização (percentual_populacao_rural) explicavam uma inversão de
sinal regional: Índice de Segurança da Posse no Sul e Irradiação Solar no
Centro-Oeste. Inspecionando os municípios concretos nos dois extremos,
apareceu um padrão: nos dois casos, o grupo de baixa adoção de MMGD incluía
cidades de periferia metropolitana (Curitiba) ou cidades-dormitório
(Entorno do DF) — hipótese: moradia em apartamento (sem telhado próprio
individual) é uma barreira física ao net metering que existe independente
de renda, IVS ou % rural, e pode ser o confundidor que faltava.

Este extractor testa essa hipótese carregando o dado, não confirma nada por
si só — a confirmação (ou não) vem de rodar de novo a análise de correlação
com esta nova coluna disponível.

FONTE: Tabela SIDRA 9928 (Censo 2022, nível municipal), classificação 125
(Tipo de domicílio), categorias confirmadas via metadado real da API (ver
backend/src/etl/analises/inspecionar_metadados_sidra_9928.py — não usar a
documentação sem confirmar, mesmo cuidado já registrado para o caso TSEE em
ARQUITETURA.md):
  - 2932  = Total
  - 3247  = Apartamento
(NÃO usa 121264 "Casa de vila ou em condomínio" — categoria distinta,
mantida fora de propósito, ver comentário no schema.)

Reaproveita a função de consulta SIDRA já validada em extrair_moradia_censo.py.
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


def consultar_sidra(classificacao: str, categorias: str) -> pd.DataFrame:
    """Mesma função de consulta já validada em extrair_infraestrutura_censo.py
    e extrair_moradia_censo.py — reaproveitada aqui sem alteração."""
    url = (
        f"{BASE_URL}/9928/periodos/2022/variaveis/381"
        f"?localidades=N6[all]&classificacao={classificacao}[{categorias}]"
    )
    print(f"      Consultando Tabela 9928 (classificação {classificacao}, categorias {categorias})...")

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
    for bloco_variavel in dados:
        for resultado in bloco_variavel.get("resultados", []):
            categoria_id = list(resultado["classificacoes"][0]["categoria"].keys())[0] \
                if resultado.get("classificacoes") else None
            for serie in resultado.get("series", []):
                codigo_ibge = serie["localidade"]["id"]
                for periodo_valor, valor in serie["serie"].items():
                    if valor == "-":
                        valor_numerico = 0.0
                    elif valor in ("...", "X", None):
                        continue
                    else:
                        valor_numerico = float(valor)
                    linhas.append({
                        "codigo_ibge": str(codigo_ibge).zfill(7),
                        "categoria_id": categoria_id,
                        "valor": valor_numerico,
                    })

    df = pd.DataFrame(linhas)
    print(f"      {len(df)} registros recebidos.")
    return df


def calcular_percentual_apartamento() -> pd.DataFrame:
    print("[1/1] Calculando % de domicílios do tipo Apartamento...")
    df = consultar_sidra(classificacao="125", categorias="2932,3247")

    total = df[df["categoria_id"] == "2932"].set_index("codigo_ibge")["valor"]
    apartamento = df[df["categoria_id"] == "3247"].set_index("codigo_ibge")["valor"]

    resultado = (apartamento / total * 100).rename("percentual_apartamento").reset_index()
    resultado.columns = ["codigo_ibge", "percentual_apartamento"]

    print(f"      {len(resultado)} municípios calculados.")
    print(f"      Média nacional (não ponderada por município): "
          f"{resultado['percentual_apartamento'].mean():.2f}%")
    top5 = resultado.nlargest(5, "percentual_apartamento")
    print("      Top 5 municípios por % apartamento:")
    print(top5.to_string(index=False))

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
            (unidade_espacial_id, periodo_referencia, percentual_apartamento)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :percentual_apartamento)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            percentual_apartamento = EXCLUDED.percentual_apartamento;
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
                    "percentual_apartamento": valor_ou_none(linha.get("percentual_apartamento")),
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
    print("Construindo indicador de Tipologia Habitacional — % Apartamento (Censo 2022/SIDRA 9928)")
    print("=" * 70)
    print("ATENÇÃO: requer a migration 0016_indicadores_sociais_tipo_domicilio.sql já aplicada")
    print("(cria a coluna indicadores_sociais.percentual_apartamento e atualiza a view consolidada).")
    print()

    engine = create_engine(DATABASE_URL)

    df = calcular_percentual_apartamento()
    df_valido = filtrar_municipios_existentes(engine, df)
    executar_upsert(engine, df_valido)

    print("\n✅ Extração de Tipologia Habitacional (% Apartamento) concluída.")


if __name__ == "__main__":
    main()
