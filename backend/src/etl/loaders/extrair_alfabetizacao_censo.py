"""
EXTRACTOR: indicadores_sociais — dimensão Capital Humano (PARCIAL: alfabetização)
(índice próprio inspirado no IVS/IPEA, construído a partir do Censo 2022)
================================================================================
NOTA METODOLÓGICA — LEIA ANTES DE USAR ESTE EXTRACTOR:
--------------------------------------------------------------------------
Mesma ressalva já documentada para Infraestrutura Urbana e Renda e Trabalho:
isto NÃO é o IVS oficial do IPEA. É um índice próprio inspirado na dimensão
conceitual "Capital Humano", usando o Censo Demográfico 2022 (recenseamento
completo, nível municipal) via API SIDRA do IBGE.

COBERTURA PARCIAL DESTA DIMENSÃO:
--------------------------------------------------------------------------
O IVS oficial, na dimensão Capital Humano, inclui indicadores de SAÚDE
(mortalidade infantil, expectativa de vida) além de educação. Este extractor
cobre APENAS o componente de educação (taxa de alfabetização). Os indicadores
de saúde dependem do DATASUS/SIM (Sistema de Informações sobre Mortalidade),
que NÃO tem API REST simples como o IBGE — exige parsing de arquivos .dbc
binários (formato proprietário), tipicamente via biblioteca `pysus` ou
equivalente, e os dados oficiais só são publicados ~15 meses após o
encerramento do ano de referência. Por essa complexidade adicional, esse
componente foi deixado como item pendente para uma sessão de trabalho
dedicada — ver TODO no CLAUDE.md/DRF do projeto.

INDICADOR CALCULADO:
--------------------------------------------------------------------------
Taxa de alfabetização das pessoas de 15 anos ou mais de idade (%), recorte
"Total" (todos os sexos, todas as cores/raças, todas as idades dentro do
grupo 15+) — Tabela SIDRA 9543, variável 2513.
================================================================================
"""

import os
import sys

import pandas as pd
import requests
from sqlalchemy import create_engine, text


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

PERIODO_REFERENCIA = "2022-01-01"
BASE_URL = "https://servicodados.ibge.gov.br/api/v3/agregados"


def consultar_taxa_alfabetizacao() -> pd.DataFrame:
    """
    Consulta a Tabela 9543 (Taxa de alfabetização, Censo 2022), filtrando
    apenas a categoria "Total" das três classificações (Sexo, Cor ou raça,
    Idade) — já que queremos a taxa agregada do município, não recortes
    por subgrupo.
    """
    print("[1/1] Consultando taxa de alfabetização (Tabela SIDRA 9543)...")

    # Categorias "Total" de cada classificação: Sexo=6794, Cor/raça=95251, Idade=100362
    url = (
        f"{BASE_URL}/9543/periodos/2022/variaveis/2513"
        f"?localidades=N6[all]&classificacao=2[6794]|86[95251]|287[100362]"
    )

    max_tentativas = 3
    resposta = None
    for tentativa in range(1, max_tentativas + 1):
        resposta = requests.get(url, timeout=90)
        if resposta.status_code == 200:
            break
        print(f"      [AVISO] Tentativa {tentativa}/{max_tentativas} falhou com status {resposta.status_code}.")
        if tentativa < max_tentativas:
            import time
            time.sleep(5 * tentativa)

    if resposta.status_code != 200:
        print(f"      [ERRO] Status {resposta.status_code} após {max_tentativas} tentativas: {resposta.text[:300]}")
        sys.exit(1)

    dados = resposta.json()
    linhas = []
    for bloco_variavel in dados:
        for resultado in bloco_variavel.get("resultados", []):
            for serie in resultado.get("series", []):
                codigo_ibge = serie["localidade"]["id"]
                for periodo_valor, valor in serie["serie"].items():
                    if valor == "-":
                        continue  # sem dado para este município (raro nesta tabela)
                    elif valor in ("...", "X", None):
                        continue
                    linhas.append({
                        "codigo_ibge": str(codigo_ibge).zfill(7),
                        "taxa_alfabetizacao": float(valor),
                    })

    df = pd.DataFrame(linhas)
    print(f"      {len(df)} municípios retornados.")
    if len(df) > 0:
        print(f"      Taxa média nacional (não ponderada por município): {df['taxa_alfabetizacao'].mean():.1f}%")
    return df


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
    print(f"\nInserindo/atualizando `indicadores_sociais` para período {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, taxa_alfabetizacao)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :taxa_alfabetizacao)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            taxa_alfabetizacao = EXCLUDED.taxa_alfabetizacao;
    """)

    total = len(df)
    inseridos = 0
    falhas = []

    for i, linha in df.iterrows():
        unidade_espacial_id = f"municipio:{linha['codigo_ibge']}"
        try:
            with engine.begin() as conexao:
                conexao.execute(sql_upsert, {
                    "unidade_espacial_id": unidade_espacial_id,
                    "periodo_referencia": PERIODO_REFERENCIA,
                    "taxa_alfabetizacao": float(linha["taxa_alfabetizacao"]),
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
    print("Construindo índice próprio de Capital Humano — PARCIAL (alfabetização, Censo 2022)")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)

    df = consultar_taxa_alfabetizacao()
    if len(df) == 0:
        print("[ERRO] Nenhum dado retornado. Verifique a query/classificação antes de prosseguir.")
        sys.exit(1)

    df_valido = filtrar_municipios_existentes(engine, df)
    executar_upsert(engine, df_valido)

    print("\n✅ Extração de Capital Humano (alfabetização) concluída.")
    print("   PENDENTE: mortalidade infantil/expectativa de vida (DATASUS) — ")
    print("   requer sessão dedicada para lidar com arquivos .dbc/biblioteca pysus.")


if __name__ == "__main__":
    main()
