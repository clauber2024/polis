"""
EXTRACTOR: indicadores_sociais — dimensão Moradia (Eixo 4: inadequação
habitacional, parcial — só material das paredes)
================================================================================
TESE DESTA DIMENSÃO (ver docs/PLANO_MORADIA_TERRITORIO_POPULAR.md):
--------------------------------------------------------------------------
Acesso à MMGD não depende apenas de renda. Depende também da condição de
moradia — neste caso especificamente, da CAPACIDADE FÍSICA da edificação
de receber a instalação de um sistema solar. Domicílios com paredes
inadequadas (taipa sem revestimento, materiais de descarte, sem parede)
tendem a ter telhados/estruturas igualmente precárias, o que dificulta a
instalação de MMGD no modelo individual e sugere que a resposta para esses
territórios pode ser geração compartilhada/comunitária, não instalação
domiciliar isolada.

COBERTURA PARCIAL DESTE EXTRACTOR (Eixo 4):
--------------------------------------------------------------------------
O índice oficial "Adequação da Moradia" do IBGE (Tabela 3513, Censo 2010)
combina material das paredes + existência de energia elétrica. Este
extractor cobre APENAS o componente de material das paredes: o IBGE não
divulgou, para o Censo 2022, uma tabela equivalente de "existência de
energia elétrica" por domicílio — provavelmente porque o acesso já está
quase universalizado (~99,8% segundo PNAD 2019, citado em estudo do Polis
sobre justiça energética) e perdeu poder discriminativo entre municípios.
Confirmado nesta sessão: busca exaustiva por tabelas Censo 2022 (prefixo
9800+) com "energia"/"iluminação"/"eletric" no nome só retornou tabelas de
"iluminação PÚBLICA" (infraestrutura de via, amostra de setores
selecionados), não "existência de energia elétrica no domicílio".

FONTE: Tabela SIDRA 9928 (Censo 2022, nível municipal), classificação 137
(Tipo de material das paredes externas).

DEFINIÇÃO DE "INADEQUADO" (decisão registrada nesta sessão):
- Taipa sem revestimento (73074)
- Madeira aproveitada de tapume, embalagens, andaimes (73076)
- Outro material (2876)
- Sem parede (13226)
NÃO incluído como inadequado: "Alvenaria sem revestimento" (12194) e
"Madeira para construção" (73075) — materiais legítimos e comuns em
grande parte do Brasil (especialmente Norte), não precariedade em si.
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

# Categorias da classificação 137 (Tipo de material das paredes externas)
CATEGORIA_TOTAL = "13233"
CATEGORIAS_INADEQUADAS = ["73074", "73076", "2876", "13226"]


def consultar_sidra(classificacao: str, categorias: str) -> pd.DataFrame:
    """Consulta a Tabela 9928, variável 381 (Domicílios). Mesma função já
    validada nos extractors de Infraestrutura Urbana e Moradia (Eixo 3)."""
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


def calcular_inadequacao_parede() -> pd.DataFrame:
    """
    % domicílios com material de parede inadequado = soma das 4 categorias
    inadequadas / Total.
    """
    print("Calculando % domicílios com material de parede inadequado...")
    categorias_pedir = ",".join([CATEGORIA_TOTAL] + CATEGORIAS_INADEQUADAS)
    df = consultar_sidra(classificacao="137", categorias=categorias_pedir)

    total = df[df["categoria_id"] == CATEGORIA_TOTAL].set_index("codigo_ibge")["valor"]

    # Soma as 4 categorias inadequadas por município. Usamos groupby em vez
    # de somar colunas separadas, para o caso de algum município não ter
    # NENHUM registro em alguma categoria específica (não vira erro, só
    # não soma nada para aquela categoria ausente).
    df_inadequado = df[df["categoria_id"].isin(CATEGORIAS_INADEQUADAS)]
    inadequado = df_inadequado.groupby("codigo_ibge")["valor"].sum()

    resultado = (inadequado / total * 100).rename("percentual_parede_inadequada").reset_index()
    resultado.columns = ["codigo_ibge", "percentual_parede_inadequada"]

    # Municípios que têm total mas não têm NENHUM registro inadequado nas
    # 4 categorias pedidas devem aparecer com 0%, não ficar ausentes —
    # reindexamos pelo total para garantir isso.
    resultado_completo = pd.DataFrame({"codigo_ibge": total.index}).merge(
        resultado, on="codigo_ibge", how="left"
    )
    resultado_completo["percentual_parede_inadequada"] = (
        resultado_completo["percentual_parede_inadequada"].fillna(0.0)
    )

    print(f"      {len(resultado_completo)} municípios calculados.")
    print(f"      Média nacional (não ponderada por município): "
          f"{resultado_completo['percentual_parede_inadequada'].mean():.2f}%")
    return resultado_completo


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
            (unidade_espacial_id, periodo_referencia, percentual_parede_inadequada)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :percentual_parede_inadequada)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            percentual_parede_inadequada = EXCLUDED.percentual_parede_inadequada;
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
                    "percentual_parede_inadequada": valor_ou_none(linha.get("percentual_parede_inadequada")),
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
    print("Construindo indicador de Moradia — Eixo 4 (inadequação habitacional, material das paredes)")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)

    df = calcular_inadequacao_parede()
    df_valido = filtrar_municipios_existentes(engine, df)
    executar_upsert(engine, df_valido)

    print("\n✅ Extração de inadequação habitacional (Eixo 4, parcial) concluída.")
    print("   PENDENTE: componente de energia elétrica não incluído (sem fonte SIDRA")
    print("   equivalente para Censo 2022) — ver nota metodológica no topo deste arquivo.")


if __name__ == "__main__":
    main()
