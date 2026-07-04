"""
EXTRACTOR: irradiacao_solar - dimensao Irradiacao Solar
(Atlas Brasileiro de Energia Solar, 2a edicao 2017, LABREN/CCST/INPE)
================================================================================
NOTA METODOLOGICA - LEIA ANTES DE USAR ESTE EXTRACTOR:
--------------------------------------------------------------------------
Fonte: Atlas Brasileiro de Energia Solar, 2a edicao (2017), LABREN (Laboratorio
de Modelagem e Estudos de Recursos Renovaveis de Energia) / CCST (Centro de
Ciencia do Sistema Terrestre) / INPE. Download direto (nao ha API):
https://labren.ccst.inpe.br/atlas_2017.html
Arquivo usado: GLOBAL_HORIZONTAL_sedes-munic_(csv).zip - extrato do Atlas ja
recortado nas SEDES DE MUNICIPIOS (nao e a grade completa de 0.1x0.1 grau -
esse recorte evita termos que fazer nos mesmos a interpolacao espacial/point-
in-polygon contra a grade, ja vem pronto por municipio).

DADO E UMA MEDIA CLIMATOLOGICA DE 17 ANOS, NAO UM ANO ESPECIFICO:
--------------------------------------------------------------------------
As estimativas sao baseadas em 17 anos de dados de satelite (1999 a 2015),
validadas por 503 estacoes de superficie (rede SONDA, INMET, privadas).
NAO representa a irradiacao de um ano civil especifico - e uma media/normal
climatologica de longo prazo. Gravamos com periodo_referencia = 2017-01-01
(ano de publicacao da 2a edicao do Atlas) apenas como convencao de chave,
mas o valor semanticamente representa a media 1999-2015, nao o ano de 2017
em si - documentar isso claramente em qualquer lugar que exiba este dado.

LICENCIAMENTO - IMPORTANTE:
--------------------------------------------------------------------------
A base de dados do Atlas Brasileiro de Energia Solar 2a Edicao NAO pode ser
reproduzida, copiada integral ou parcialmente para propositos COMERCIAIS sem
autorizacao expressa do CCST/INPE. Uso nao-comercial (como este projeto) e
permitido, mas a fonte deve ser sempre citada como: "LABREN (Laboratorio de
Modelagem e Estudos de Recursos Renovaveis de Energia) / CCST (Centro de
Ciencia do Sistema Terrestre) / INPE (Instituto Nacional de Pesquisas
Espaciais) - Brasil". Se o Atlas Solar Justo for usado em contexto que possa
ser interpretado como comercial no futuro, revisitar esta licenca antes.

VARIAVEL CARREGADA: Irradiacao Global Horizontal (GHI) - media ANUAL, em
kWh/m2.dia (arquivo original vem em Wh/m2.dia - dividido por 1000 aqui).
GHI e a variavel padrao para dimensionamento de sistemas fotovoltaicos fixos
(a maioria dos sistemas residenciais/comerciais no Brasil). Os dados mensais
e as outras variaveis (Direta Normal, Difusa, Plano Inclinado, PAR) tambem
estao disponiveis no Atlas mas NAO foram carregados nesta primeira passada -
ver ARQUITETURA.md para decisao de escopo.

JOIN POR NOME + ESTADO (SEM CODIGO IBGE NA FONTE):
--------------------------------------------------------------------------
O arquivo do INPE NAO tem codigo IBGE - so nome do municipio (`NAME`) e nome
do estado por extenso em maiusculas (`STATE`, ex: "ACRE"). O campo `ID` do
arquivo e um codigo de CELULA DE GRADE de 0.1x0.1 grau, NAO um identificador
de municipio (municipios proximos como Brasileia/Epitaciolandia compartilham
o mesmo ID de celula) - por isso NAO pode ser usado como chave.
Validado empiricamente (sessao 04/07/2026): a combinacao NAME+STATE e unica
dentro do arquivo do INPE (sem duplicatas), entao o join e feito casando
nome do municipio + nome do estado, normalizados (maiusculas, sem acento,
espacos colapsados) para tolerar pequenas diferencas de grafia entre as
duas fontes.

COBERTURA FINAL (apos tabela de alias, sessao 04/07/2026): dos 5.573
municipios da base territorial, 5.569 casam com o INPE. Os 4 que ficam sem
irradiacao_solar sao genuinamente ausentes do Atlas: Fernando de Noronha/PE
(2605459, arquipelago/distrito especial), duas entradas "Area Operacional"
de corpo d'agua no RS (4300001, 4300002 - nao sao municipios reais, mesmo
padrao de placeholder ja visto em outras fontes como ANEEL) e Boa Esperanca
do Norte/MT (5101837, sem correspondencia de nenhum tipo no arquivo do INPE).

TABELA DE ALIAS (21 correcoes de nome/grafia, validadas manualmente em
04/07/2026 cruzando ID de celula + coordenadas do INPE): a maioria e
variacao de grafia (DE/DO, hifen/espaco, S/Z) ou nome historico do
municipio anterior a uma renomeacao (ex: "Augusto Severo" -> "Campo
Grande/RN", "Fortaleza do Tabocao" -> "Tabocao/TO"). UM CASO E ERRO REAL
NA FONTE DO INPE: a linha de "Porto Alegre" (capital do RS, ID=1230,
coordenadas -51.2074/-30.0327 - inequivocamente RS) esta rotulada como
"RIO GRANDE DO NORTE" no arquivo original do INPE - confirmado como erro
de digitacao na fonte (RN fica entre -35 e -38 de longitude, nada perto
de -51). Sem essa correcao, a maior cidade do RS (~1,4M hab.) ficaria sem
irradiacao_solar.
================================================================================
"""

import csv
import os
import unicodedata

import pandas as pd
from sqlalchemy import create_engine, text


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo",
)

CAMINHO_CSV = os.path.join(
    os.path.dirname(__file__),
    "..", "data", "raw", "inpe_atlas_solar_2017",
    "global_horizontal_means_sedes-munic.csv",
)

PERIODO_REFERENCIA = "2017-01-01"

# Correcoes de chave NAME|STATE (ja normalizadas) do arquivo do INPE que nao
# batem literalmente com a base territorial - ver docstring para detalhes de
# cada caso (grafia, nome historico, ou o erro real de estado do Porto Alegre).
# Chave = como aparece no INPE (normalizado); valor = como aparece na base
# territorial (normalizado), para o merge encontrar corretamente.
ALIAS_INPE = {
    "ACU|RIO GRANDE DO NORTE": "ASSU|RIO GRANDE DO NORTE",
    "AMPARO DE SAO FRANCISCO|SERGIPE": "AMPARO DO SAO FRANCISCO|SERGIPE",
    "ARES|RIO GRANDE DO NORTE": "AREZ|RIO GRANDE DO NORTE",
    "AUGUSTO SEVERO|RIO GRANDE DO NORTE": "CAMPO GRANDE|RIO GRANDE DO NORTE",
    "BARAO DE MONTE ALTO|MINAS GERAIS": "BARAO DO MONTE ALTO|MINAS GERAIS",
    "BELEM DE SAO FRANCISCO|PERNAMBUCO": "BELEM DO SAO FRANCISCO|PERNAMBUCO",
    "BIRITIBA-MIRIM|SAO PAULO": "BIRITIBA MIRIM|SAO PAULO",
    "DONA EUSEBIA|MINAS GERAIS": "DONA EUZEBIA|MINAS GERAIS",
    "FLORINIA|SAO PAULO": "FLORINEA|SAO PAULO",
    "FORTALEZA DO TABOCAO|TOCANTINS": "TABOCAO|TOCANTINS",
    "GRAO PARA|SANTA CATARINA": "GRAO-PARA|SANTA CATARINA",
    "LAGOA DO ITAENGA|PERNAMBUCO": "LAGOA DE ITAENGA|PERNAMBUCO",
    "MUQUEM DE SAO FRANCISCO|BAHIA": "MUQUEM DO SAO FRANCISCO|BAHIA",
    "OLHO-D'AGUA DO BORGES|RIO GRANDE DO NORTE": "OLHO D'AGUA DO BORGES|RIO GRANDE DO NORTE",
    "PASSA-VINTE|MINAS GERAIS": "PASSA VINTE|MINAS GERAIS",
    # ERRO REAL NA FONTE DO INPE - ver docstring (coordenadas confirmam ser RS, nao RN)
    "PORTO ALEGRE|RIO GRANDE DO NORTE": "PORTO ALEGRE|RIO GRANDE DO SUL",
    "SANTA TERESINHA|BAHIA": "SANTA TEREZINHA|BAHIA",
    "SANTO ANTONIO DO LEVERGER|MATO GROSSO": "SANTO ANTONIO DE LEVERGER|MATO GROSSO",
    "SAO LUIZ|RORAIMA": "SAO LUIZ DO ANAUA|RORAIMA",
    "SAO THOME DAS LETRAS|MINAS GERAIS": "SAO TOME DAS LETRAS|MINAS GERAIS",
    "SAO VALERIO DA NATIVIDADE|TOCANTINS": "SAO VALERIO|TOCANTINS",
}


def normalizar(texto: str) -> str:
    """Maiusculas, sem acento, espacos colapsados - para tolerar pequenas
    diferencas de grafia entre a fonte do INPE e a nossa base territorial."""
    texto = str(texto).strip().upper()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = " ".join(texto.split())
    return texto


def ler_csv_inpe() -> pd.DataFrame:
    """Le o CSV do Atlas (delimitador ; conforme readme.txt), converte
    Wh/m2.dia para kWh/m2.dia e monta a chave normalizada de join."""
    print(f"[1/3] Lendo CSV do INPE ({CAMINHO_CSV})...")

    df = pd.read_csv(CAMINHO_CSV, sep=";", decimal=".", encoding="utf-8")
    print(f"      {len(df)} municipios (sedes) no arquivo do INPE.")

    df["irradiacao_media_kwh_m2_dia"] = df["ANNUAL"] / 1000.0
    df["chave_join"] = df["NAME"].apply(normalizar) + "|" + df["STATE"].apply(normalizar)

    aplicados = df["chave_join"].isin(ALIAS_INPE.keys()).sum()
    if aplicados > 0:
        print(f"      Aplicando tabela de alias: {aplicados} chave(s) corrigida(s) "
              f"(grafia/nome historico/erro de estado do Porto Alegre).")
    df["chave_join"] = df["chave_join"].replace(ALIAS_INPE)

    duplicatas = df["chave_join"].duplicated().sum()
    if duplicatas > 0:
        print(f"      [AVISO] {duplicatas} chave(s) NAME+STATE duplicada(s) no arquivo do INPE "
              f"apos normalizacao - investigar antes de prosseguir.")

    return df


def buscar_municipios(engine) -> pd.DataFrame:
    """Busca codigo_ibge, nome e nome_estado da base territorial e monta
    a mesma chave normalizada usada no CSV do INPE."""
    print("[2/3] Buscando municipios da base territorial...")

    with engine.connect() as conexao:
        query = text("SELECT codigo_ibge, nome, nome_estado FROM municipios")
        df = pd.read_sql(query, conexao)

    print(f"      {len(df)} municipios na base territorial.")
    df["chave_join"] = df["nome"].apply(normalizar) + "|" + df["nome_estado"].apply(normalizar)
    return df


def casar_e_relatar(df_inpe: pd.DataFrame, df_municipios: pd.DataFrame) -> pd.DataFrame:
    """Casa os dois dataframes pela chave normalizada e relata o que nao
    deu match de nenhum dos dois lados (esperado ~4 municipios, ver docstring)."""
    print("[3/3] Casando municipios do INPE com a base territorial...")

    combinado = df_municipios.merge(
        df_inpe[["chave_join", "irradiacao_media_kwh_m2_dia"]],
        on="chave_join",
        how="left",
    )

    sem_match = combinado[combinado["irradiacao_media_kwh_m2_dia"].isna()]
    if len(sem_match) > 0:
        print(f"      [AVISO] {len(sem_match)} municipio(s) da base territorial SEM "
              f"correspondencia no INPE (ficarao sem irradiacao_solar):")
        for _, linha in sem_match.iterrows():
            print(f"        - {linha['codigo_ibge']}: {linha['nome']}/{linha['nome_estado']}")

    chaves_municipios = set(df_municipios["chave_join"])
    chaves_inpe = set(df_inpe["chave_join"])
    inpe_sem_match = chaves_inpe - chaves_municipios
    if len(inpe_sem_match) > 0:
        print(f"      [AVISO] {len(inpe_sem_match)} entrada(s) do INPE SEM correspondencia "
              f"na base territorial (ignoradas):")
        for chave in sorted(inpe_sem_match)[:10]:
            print(f"        - {chave}")

    return combinado[combinado["irradiacao_media_kwh_m2_dia"].notna()].copy()


def executar_upsert(engine, df: pd.DataFrame):
    """Upsert com transacao individual por municipio (mesmo padrao de
    robustez dos extractors de MMGD, Infraestrutura, RAIS e Capital Humano)."""
    print(f"\nInserindo/atualizando irradiacao_solar para periodo {PERIODO_REFERENCIA}...")

    sql_upsert = text("""
        INSERT INTO irradiacao_solar
            (codigo_ibge, periodo_referencia, irradiacao_media_kwh_m2_dia)
        VALUES
            (:codigo_ibge, :periodo_referencia, :irradiacao_media_kwh_m2_dia)
        ON CONFLICT (codigo_ibge, periodo_referencia) DO UPDATE SET
            irradiacao_media_kwh_m2_dia = EXCLUDED.irradiacao_media_kwh_m2_dia;
    """)

    total = len(df)
    inseridos = 0
    falhas = []

    for i, linha in df.iterrows():
        codigo_ibge = linha["codigo_ibge"]
        try:
            with engine.begin() as conexao:
                conexao.execute(sql_upsert, {
                    "codigo_ibge": codigo_ibge,
                    "periodo_referencia": PERIODO_REFERENCIA,
                    "irradiacao_media_kwh_m2_dia": float(linha["irradiacao_media_kwh_m2_dia"]),
                })
            inseridos += 1
        except Exception as e:
            falhas.append((codigo_ibge, str(e)))

        if (i + 1) % 1000 == 0 or (i + 1) == total:
            print(f"      ... {i + 1}/{total} municipios processados")

    print(f"      {inseridos} municipio(s) inseridos/atualizados com sucesso.")
    if falhas:
        print(f"      [AVISO] {len(falhas)} municipio(s) falharam:")
        for codigo, erro in falhas[:10]:
            print(f"        - {codigo}: {erro[:120]}")


def main():
    print("Carregando Irradiacao Solar (Atlas Brasileiro de Energia Solar 2017, LABREN/CCST/INPE)")
    print("=" * 70)

    engine = create_engine(DATABASE_URL)

    df_inpe = ler_csv_inpe()
    df_municipios = buscar_municipios(engine)
    df_combinado = casar_e_relatar(df_inpe, df_municipios)

    print()
    print("Resumo da irradiacao media (kWh/m2.dia):")
    print(df_combinado["irradiacao_media_kwh_m2_dia"].describe())

    executar_upsert(engine, df_combinado)

    print("\nExtracao de Irradiacao Solar (INPE) concluida.")
    print("LEMBRETE: citar a fonte LABREN/CCST/INPE em qualquer exibicao publica deste dado.")


if __name__ == "__main__":
    main()
