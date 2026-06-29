"""
EXTRACTOR: indicadores_sociais — dimensão Moradia, Território Popular e
Barreiras Habitacionais à MMGD (Eixo 3 + parte do Eixo 5)
================================================================================
TESE DESTA DIMENSÃO (ver docs/PLANO_MORADIA_TERRITORIO_POPULAR.md):
--------------------------------------------------------------------------
Acesso à MMGD não depende apenas de renda. Depende também da condição de
moradia. O modelo atual tende a favorecer proprietários de imóveis
regulares, com estabilidade de permanência e capacidade física/financeira
de instalação. Por isso, a democratização da energia solar exige olhar
para política habitacional, regularização fundiária, locação, coabitação,
HIS e inadequação habitacional.

Esta dimensão mede uma BARREIRA ESTRUTURAL (jurídica/física), diferente das
demais dimensões já implementadas, que medem PRIVAÇÃO socioeconômica.

COBERTURA DESTE EXTRACTOR (Eixo 3 + parte do Eixo 5):
--------------------------------------------------------------------------
- % domicílios próprios, alugados e cedidos/emprestados (regime de ocupação)
- % domicílios em casa de cômodos ou cortiço (tipologia popular, Eixo 5)

NÃO COBRE (ver plano para os demais eixos, pendentes):
- Eixo 1 (ZEIS/regularização fundiária) — sem fonte nacional, restrito a
  pesquisa por capital
- Eixo 2 (MCMV/HIS) — fonte ainda não investigada
- Eixo 4 completo (inadequação habitacional) — "Adequação da Moradia" do
  IBGE só existe para Censo 2010 (Tabela 3513), não foi recalculada para
  2022; construir versão própria a partir de material de parede/energia
  elétrica fica para sessão futura

FONTE: Tabela SIDRA 9928 (Censo 2022, nível municipal), duas classificações
diferentes da MESMA tabela:
  - Classificação 63 (Condição de ocupação do domicílio): Próprio (73554),
    Alugado (1055), Cedido (73553), Total (95826)
  - Classificação 125 (Tipo de domicílio): Cortiço (71975), Total (2932)
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
    """
    Consulta a Tabela 9928, variável 381 (Domicílios), para uma classificação
    e categorias específicas. Mesma função de consulta já validada nos
    extractors anteriores (Infraestrutura Urbana), reaproveitada aqui.
    """
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


def calcular_regime_ocupacao() -> pd.DataFrame:
    """
    % próprio, % alugado, % cedido — Classificação 63 (Condição de ocupação).
    """
    print("[1/2] Calculando regime de ocupação do domicílio (próprio/alugado/cedido)...")
    df = consultar_sidra(classificacao="63", categorias="95826,73554,1055,73553")

    total = df[df["categoria_id"] == "95826"].set_index("codigo_ibge")["valor"]
    proprio = df[df["categoria_id"] == "73554"].set_index("codigo_ibge")["valor"]
    alugado = df[df["categoria_id"] == "1055"].set_index("codigo_ibge")["valor"]
    cedido = df[df["categoria_id"] == "73553"].set_index("codigo_ibge")["valor"]

    resultado = pd.DataFrame({
        "percentual_domicilio_proprio": (proprio / total * 100),
        "percentual_domicilio_alugado": (alugado / total * 100),
        "percentual_domicilio_cedido": (cedido / total * 100),
    }).reset_index().rename(columns={"index": "codigo_ibge"})

    print(f"      {len(resultado)} municípios calculados.")
    print(f"      Médias nacionais (não ponderadas por município): "
          f"próprio={resultado['percentual_domicilio_proprio'].mean():.1f}%, "
          f"alugado={resultado['percentual_domicilio_alugado'].mean():.1f}%, "
          f"cedido={resultado['percentual_domicilio_cedido'].mean():.1f}%")
    return resultado


def calcular_percentual_cortico() -> pd.DataFrame:
    """
    % domicílios em casa de cômodos ou cortiço — Classificação 125 (Tipo de
    domicílio). Componente do Eixo 5 (tipologias populares).
    """
    print("[2/2] Calculando % domicílios em cortiço/casa de cômodos...")
    df = consultar_sidra(classificacao="125", categorias="2932,71975")

    total = df[df["categoria_id"] == "2932"].set_index("codigo_ibge")["valor"]
    cortico = df[df["categoria_id"] == "71975"].set_index("codigo_ibge")["valor"]

    resultado = (cortico / total * 100).rename("percentual_cortico").reset_index()
    resultado.columns = ["codigo_ibge", "percentual_cortico"]

    n_com_cortico = (resultado["percentual_cortico"] > 0).sum()
    print(f"      {len(resultado)} municípios calculados.")
    print(f"      {n_com_cortico} município(s) com pelo menos 1 domicílio em cortiço registrado.")
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
    print(f"\nInserindo/atualizando `indicadores_sociais` para período {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, percentual_domicilio_proprio,
             percentual_domicilio_alugado, percentual_domicilio_cedido, percentual_cortico)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :percentual_domicilio_proprio,
             :percentual_domicilio_alugado, :percentual_domicilio_cedido, :percentual_cortico)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            percentual_domicilio_proprio = EXCLUDED.percentual_domicilio_proprio,
            percentual_domicilio_alugado = EXCLUDED.percentual_domicilio_alugado,
            percentual_domicilio_cedido = EXCLUDED.percentual_domicilio_cedido,
            percentual_cortico = EXCLUDED.percentual_cortico;
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
                    "percentual_domicilio_proprio": valor_ou_none(linha.get("percentual_domicilio_proprio")),
                    "percentual_domicilio_alugado": valor_ou_none(linha.get("percentual_domicilio_alugado")),
                    "percentual_domicilio_cedido": valor_ou_none(linha.get("percentual_domicilio_cedido")),
                    "percentual_cortico": valor_ou_none(linha.get("percentual_cortico")),
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
    print("Construindo indicadores de Moradia — Eixo 3 (regime de ocupação) + Eixo 5 (cortiço)")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)

    df_regime = calcular_regime_ocupacao()
    df_cortico = calcular_percentual_cortico()

    df_combinado = df_regime.merge(df_cortico, on="codigo_ibge", how="outer")

    df_valido = filtrar_municipios_existentes(engine, df_combinado)
    executar_upsert(engine, df_valido)

    print("\n✅ Extração de Moradia (Eixo 3 + parte do Eixo 5) concluída.")
    print("   PENDENTES: Eixo 1 (ZEIS, restrito a capitais), Eixo 2 (MCMV/HIS),")
    print("   Eixo 4 completo (inadequação habitacional) — ver docs/PLANO_MORADIA_TERRITORIO_POPULAR.md")


if __name__ == "__main__":
    main()
