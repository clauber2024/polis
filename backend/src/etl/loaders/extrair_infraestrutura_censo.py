"""
EXTRACTOR: indicadores_sociais — dimensão Infraestrutura Urbana
(índice próprio inspirado no IVS/IPEA, construído a partir do Censo 2022)
================================================================================
NOTA METODOLÓGICA IMPORTANTE — LEIA ANTES DE USAR ESTE EXTRACTOR:
--------------------------------------------------------------------------
O IVS (Índice de Vulnerabilidade Social) OFICIAL do IPEA, em nível municipal
completo, só existe para os anos de 2000 e 2010 — depende de microdados de
amostra do Censo, que não são atualizados em nível municipal desde então
(atualizações pós-2010 via PNAD Contínua só têm resultado por UF, não por
município, por limitação estatística da amostra, não por escolha editorial).

Este extractor NÃO calcula o IVS oficial. Ele constrói um ÍNDICE PRÓPRIO,
inspirado na mesma dimensão conceitual "Infraestrutura Urbana" do IVS oficial,
usando dados reais e atuais do Censo Demográfico 2022 (recenseamento completo,
não amostra — cobre os 5.568 municípios brasileiros). A equivalência das
tabelas Censo 2010 -> Censo 2022 para estes 5 indicadores foi documentada em
trabalho acadêmico (Gilli, 2025, INPE) usado como referência metodológica.

Isto deve ser tratado, na documentação do projeto (CLAUDE.md / DRF), com a
MESMA cautela já aplicada ao "Índice de Pobreza Energética Regional" em
relação ao OBEPE: claramente identificado como elaboração própria do Atlas,
inspirada em metodologia de terceiros, não como reprodução do dado oficial.

INDICADORES CALCULADOS (v1 — só a dimensão Infraestrutura Urbana):
--------------------------------------------------------------------------
1. % população rural               (Tabela SIDRA 9923)
2. % abastecimento de água inadequado (sem rede geral) (Tabela SIDRA 6803)
3. % esgotamento sanitário inadequado                  (Tabela SIDRA 6805)
4. % coleta de lixo inadequada                          (Tabela SIDRA 6892)
5. Densidade populacional (hab/km²) — população do Censo 2022 dividida pela
   área municipal já presente em `municipios.area_km2`

As dimensões "Capital Humano" e "Renda e Trabalho" do IVS oficial NÃO são
cobertas por este extractor — ficam para uma versão futura.

NOTA DE VALIDAÇÃO — MÉDIA SIMPLES vs. MÉDIA NACIONAL PONDERADA:
--------------------------------------------------------------------------
Ao validar este extractor, a média simples de "% esgotamento inadequado"
calculada sobre os 5.570 municípios (~62%) ficou bem mais alta que a
estatística nacional divulgada pelo IBGE (~35% inadequado, ou 62,5% adequado,
medida sobre a POPULAÇÃO, não sobre os municípios). Isso não é um bug: 55,6%
dos municípios brasileiros têm inadequação acima de 60%, porque a maioria dos
municípios é pequena/rural — mas a população está concentrada nas grandes
cidades, que têm cobertura melhor. Uma média simples por município pesa cada
município igualmente (um município pequeno e São Paulo contam "1" cada),
enquanto a estatística nacional do IBGE é ponderada por domicílios/população.
As duas métricas são válidas e medem coisas diferentes; nenhuma "corrige" a
outra. Os valores por município gravados aqui em `indicadores_sociais` estão
corretos — o que mudaria é qual agregação você usa para resumir o cenário
nacional. Essa disparidade entre média municipal e média nacional é, aliás,
exatamente o tipo de desigualdade territorial que o Atlas Solar Justo busca
expor.
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

# Período de referência deste índice: ano do Censo usado como fonte.
PERIODO_REFERENCIA = "2022-01-01"

BASE_URL = "https://servicodados.ibge.gov.br/api/v3/agregados"

# Tempo de espera entre chamadas à API do IBGE, para não sobrecarregar o
# serviço público (boa prática com APIs governamentais gratuitas e sem chave).
PAUSA_ENTRE_CHAMADAS_SEGUNDOS = 0.5


def consultar_sidra(tabela: str, variavel: str, classificacao: str, categorias: str = "all",
                     periodo: str = "2022") -> pd.DataFrame:
    """
    Consulta a API de Agregados do IBGE para uma tabela/variável/classificação
    específica, em nível municipal (N6), e retorna um DataFrame com colunas
    'codigo_ibge', 'categoria_id', 'valor'.

    O parâmetro `categorias` permite restringir quais categorias da
    classificação são pedidas (ex: "72129,72153" em vez de "all"). Isso é
    importante para classificações com muitas categorias (ex: 1821 tem 18
    categorias) — pedir todas de uma vez para ~5.568 municípios pode
    sobrecarregar o servidor do IBGE e retornar erro 500. Pedir só as 2
    categorias que realmente usamos reduz o payload drasticamente.
    """
    url = (
        f"{BASE_URL}/{tabela}/periodos/{periodo}/variaveis/{variavel}"
        f"?localidades=N6[all]&classificacao={classificacao}[{categorias}]"
    )
    print(f"      Consultando tabela {tabela} (variável {variavel}, classificação {classificacao}, categorias {categorias})...")

    max_tentativas = 3
    resposta = None
    for tentativa in range(1, max_tentativas + 1):
        resposta = requests.get(url, timeout=90)
        if resposta.status_code == 200:
            break
        print(f"      [AVISO] Tentativa {tentativa}/{max_tentativas} falhou com status {resposta.status_code}.")
        if tentativa < max_tentativas:
            espera = 5 * tentativa
            print(f"      Aguardando {espera}s antes de tentar novamente...")
            time.sleep(espera)

    if resposta.status_code != 200:
        print(f"      [ERRO] Tabela {tabela} retornou status {resposta.status_code} após "
              f"{max_tentativas} tentativas: {resposta.text[:200]}")
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
                    # O IBGE usa "-" para indicar "zero ou nenhuma ocorrência" em
                    # indicadores de contagem (ex: população rural = 0 num
                    # município totalmente urbano) — tratamos como 0.0, não
                    # descartamos a linha, senão o cálculo de percentual desse
                    # município ficaria com NaN por falta de denominador/numerador.
                    # "..." e "X" são valores de fato ausentes/sigilosos — esses
                    # sim são descartados.
                    if valor == "-":
                        valor_numerico = 0.0
                    elif valor in ("...", "X", None):
                        continue
                    else:
                        valor_numerico = float(valor)
                    linhas.append({
                        "codigo_ibge": codigo_ibge,
                        "categoria_id": categoria_id,
                        "valor": valor_numerico,
                    })

    time.sleep(PAUSA_ENTRE_CHAMADAS_SEGUNDOS)
    df = pd.DataFrame(linhas)
    print(f"      {len(df)} registros recebidos.")
    return df


def calcular_percentual_rural(engine) -> pd.DataFrame:
    """
    % população rural = população rural / população total, por município.
    Tabela 9923, variável 93 (População residente), classificação 1
    (Situação do domicílio: categoria 2 = Rural, 6795 = Total).
    """
    print("[1/5] Calculando % população rural...")
    df = consultar_sidra(tabela="9923", variavel="93", classificacao="1")

    rural = df[df["categoria_id"] == "2"].set_index("codigo_ibge")["valor"]
    total = df[df["categoria_id"] == "6795"].set_index("codigo_ibge")["valor"]

    resultado = (rural / total * 100).rename("percentual_populacao_rural").reset_index()
    resultado["codigo_ibge"] = resultado["codigo_ibge"].astype(str).str.zfill(7)
    return resultado


def calcular_percentual_agua_inadequada(engine) -> pd.DataFrame:
    """
    % domicílios sem ligação à rede geral de água = categoria "Não possui
    ligação com a rede geral" (72153) / Total (72129).
    Tabela 6803, variável 381 (Domicílios), classificação 1821.
    """
    print("[2/5] Calculando % abastecimento de água inadequado...")
    df = consultar_sidra(tabela="6803", variavel="381", classificacao="1821", categorias="72129,72153")

    inadequado = df[df["categoria_id"] == "72153"].set_index("codigo_ibge")["valor"]
    total = df[df["categoria_id"] == "72129"].set_index("codigo_ibge")["valor"]

    resultado = (inadequado / total * 100).rename("percentual_agua_inadequada").reset_index()
    resultado["codigo_ibge"] = resultado["codigo_ibge"].astype(str).str.zfill(7)
    return resultado


def calcular_percentual_esgoto_inadequado(engine) -> pd.DataFrame:
    """
    % domicílios com esgotamento inadequado = Total (46292) menos a categoria
    "Rede geral, rede pluvial ou fossa ligada à rede" (46290), dividido pelo Total.
    Tabela 6805, variável 381, classificação 11558.
    """
    print("[3/5] Calculando % esgotamento inadequado...")
    df = consultar_sidra(tabela="6805", variavel="381", classificacao="11558", categorias="46290,46292")

    adequado = df[df["categoria_id"] == "46290"].set_index("codigo_ibge")["valor"]
    total = df[df["categoria_id"] == "46292"].set_index("codigo_ibge")["valor"]

    inadequado = total - adequado
    resultado = (inadequado / total * 100).rename("percentual_esgoto_inadequado").reset_index()
    resultado["codigo_ibge"] = resultado["codigo_ibge"].astype(str).str.zfill(7)
    return resultado


def calcular_percentual_lixo_inadequado(engine) -> pd.DataFrame:
    """
    % domicílios com coleta de lixo inadequada = Total (10972) menos a
    categoria "Coletado" (2520), dividido pelo Total.
    Tabela 6892, variável 381, classificação 67.
    """
    print("[4/5] Calculando % coleta de lixo inadequada...")
    df = consultar_sidra(tabela="6892", variavel="381", classificacao="67", categorias="2520,10972")

    coletado = df[df["categoria_id"] == "2520"].set_index("codigo_ibge")["valor"]
    total = df[df["categoria_id"] == "10972"].set_index("codigo_ibge")["valor"]

    inadequado = total - coletado
    resultado = (inadequado / total * 100).rename("percentual_lixo_inadequado").reset_index()
    resultado["codigo_ibge"] = resultado["codigo_ibge"].astype(str).str.zfill(7)
    return resultado


def calcular_densidade_populacional(engine) -> pd.DataFrame:
    """
    Densidade = população residente total (Tabela 9923, categoria 6795) /
    área municipal (já temos em municipios.area_km2 — evita nova consulta
    de área, que exigiria outra tabela e nova lógica de parsing).
    """
    print("[5/5] Calculando densidade populacional...")
    df = consultar_sidra(tabela="9923", variavel="93", classificacao="1")
    populacao = df[df["categoria_id"] == "6795"].set_index("codigo_ibge")["valor"]
    populacao = populacao.rename("populacao_total").reset_index()
    populacao["codigo_ibge"] = populacao["codigo_ibge"].astype(str).str.zfill(7)

    with engine.connect() as conexao:
        areas = pd.read_sql(text("SELECT codigo_ibge, area_km2 FROM municipios"), conexao)

    combinado = populacao.merge(areas, on="codigo_ibge", how="inner")
    combinado["densidade_populacional"] = combinado["populacao_total"] / combinado["area_km2"]

    return combinado[["codigo_ibge", "densidade_populacional"]]


def montar_tabela_final(engine) -> pd.DataFrame:
    """Combina os 5 indicadores em um único DataFrame, por município."""
    rural = calcular_percentual_rural(engine)
    agua = calcular_percentual_agua_inadequada(engine)
    esgoto = calcular_percentual_esgoto_inadequado(engine)
    lixo = calcular_percentual_lixo_inadequado(engine)
    densidade = calcular_densidade_populacional(engine)

    combinado = rural
    for outro in (agua, esgoto, lixo, densidade):
        combinado = combinado.merge(outro, on="codigo_ibge", how="outer")

    print(f"\n      {len(combinado)} municípios com ao menos um indicador calculado.")
    return combinado


def filtrar_municipios_existentes(engine, df: pd.DataFrame) -> pd.DataFrame:
    """Mesma lógica de proteção usada no extractor de MMGD: garante que só
    gravamos códigos IBGE que de fato existem na base territorial."""
    with engine.connect() as conexao:
        resultado = conexao.execute(text("SELECT codigo_ibge FROM municipios"))
        codigos_validos = {linha[0] for linha in resultado}

    mascara_valida = df["codigo_ibge"].isin(codigos_validos)
    invalidos = df[~mascara_valida]
    if len(invalidos) > 0:
        print(f"      [AVISO] {len(invalidos)} código(s) IBGE não existem na base territorial — serão IGNORADOS:")
        for codigo in invalidos["codigo_ibge"].tolist()[:10]:
            print(f"        - {codigo}")

    return df[mascara_valida].copy()


def executar_upsert(engine, df: pd.DataFrame):
    """Upsert com transação individual por município, mesma correção de
    robustez aplicada ao extractor de MMGD (evita falha em cascata)."""
    print(f"\nInserindo/atualizando `indicadores_sociais` para período {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia, percentual_populacao_rural,
             percentual_agua_inadequada, percentual_esgoto_inadequado,
             percentual_lixo_inadequado, densidade_populacional)
        VALUES
            (:unidade_espacial_id, :periodo_referencia, :percentual_populacao_rural,
             :percentual_agua_inadequada, :percentual_esgoto_inadequado,
             :percentual_lixo_inadequado, :densidade_populacional)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            percentual_populacao_rural = EXCLUDED.percentual_populacao_rural,
            percentual_agua_inadequada = EXCLUDED.percentual_agua_inadequada,
            percentual_esgoto_inadequado = EXCLUDED.percentual_esgoto_inadequado,
            percentual_lixo_inadequado = EXCLUDED.percentual_lixo_inadequado,
            densidade_populacional = EXCLUDED.densidade_populacional;
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
                    "percentual_populacao_rural": valor_ou_none(linha.get("percentual_populacao_rural")),
                    "percentual_agua_inadequada": valor_ou_none(linha.get("percentual_agua_inadequada")),
                    "percentual_esgoto_inadequado": valor_ou_none(linha.get("percentual_esgoto_inadequado")),
                    "percentual_lixo_inadequado": valor_ou_none(linha.get("percentual_lixo_inadequado")),
                    "densidade_populacional": valor_ou_none(linha.get("densidade_populacional")),
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
    print("Construindo índice próprio de Infraestrutura Urbana (Censo 2022 via SIDRA)")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)

    df = montar_tabela_final(engine)
    df_valido = filtrar_municipios_existentes(engine, df)
    executar_upsert(engine, df_valido)

    print("\n✅ Extração de indicadores de Infraestrutura Urbana concluída.")


if __name__ == "__main__":
    main()
