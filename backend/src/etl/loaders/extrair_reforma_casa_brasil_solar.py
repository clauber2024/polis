"""
EXTRACTOR: Reforma Casa Brasil - modalidade SOLAR (Caixa/Ministerio das Cidades)
--------------------------------------------------------------------------------
Motivacao: capitulo "Atlas das experiencias de MMGD solar" (Instituto Polis,
relatorio em elaboracao) levanta a pergunta "quem tem acesso a tecnologia
solar?" e cita explicitamente o programa Reforma Casa Brasil como fonte a
checar (ver docs do capitulo, Parte II, "Quem tem acesso a tecnologia?").

FONTE NAO E PUBLICA/AUTOMATIZAVEL - diferente de todos os outros extractors
deste projeto (que baixam de uma URL publica), este dado veio de um PDF
extraido pontualmente do sistema interno da Caixa (SIC), fornecido
manualmente pelo usuario em
"<BASE_DOWNLOADS>/SOLAR_REFORMA_CASA_BRASIL-SIC - solar.pdf". Nao ha endpoint
publico conhecido para reproduzir esta carga - uma atualizacao futura exige
um novo extrato manual no mesmo formato (colunas ANO_MES, MUNICIPIO, UF,
FAIXA_PROGRAMA, QTD, VF_TOTAL, VR_LIBERADO).

Cobertura do extrato usado: 6 meses (nov/2025 a abr/2026), 3.253 contratos,
R$ 61.377.571,09 liberados, 1.093 municipios.

Granularidade: agregado UNICO por municipio, somando os 6 meses e as duas
faixas de renda (Faixa 1 e Faixa 2, renda familiar bruta mensal ate
R$9.600) - mesma decisao ja usada em unidades_habitacionais_fgts (sem serie
temporal). periodo_referencia = fim do ultimo mes coberto pelo extrato.

valor_liberado (VR_LIBERADO) foi escolhido em vez de VF_TOTAL (valor
contratado) por representar o que foi de fato desembolsado.

Casamento de municipio: a fonte nao traz codigo IBGE, so nome + UF em
maiusculas sem acento. A normalizacao usada (maiusculas, sem acento, hifen
vira espaco, apostrofo removido sem espaco) resolve 1091/1093 casos; os 2
restantes ("ACU"/RN e "ITAPAGE"/CE) sao grafias divergentes do nome oficial
IBGE (respectivamente "Assu" - renomeado de "Acu" em 2013 - e "Itapaje") e
foram tratados via ALIASES_MUNICIPIO explicito abaixo, nao fuzzy matching
(risco de casamento errado em escala nacional).
"""
import os
import re
import sys
import unicodedata
from collections import defaultdict

from pypdf import PdfReader
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo"
)
BASE_DOWNLOADS = "/mnt/c/Users/Rosana Santos/Downloads"
NOME_ARQUIVO_PDF = "SOLAR_REFORMA_CASA_BRASIL-SIC - solar.pdf"
PERIODO_REFERENCIA = "2026-04-30"

# Grafias da fonte Caixa/SIC divergentes do nome oficial IBGE - ver docstring.
ALIASES_MUNICIPIO = {
    "ACU|RN": "ASSU|RN",
    "ITAPAGE|CE": "ITAPAJE|CE",
}

PADRAO_LINHA = re.compile(
    r"^(\d{6})\s+(.+?)\s+([A-Z]{2})\s+(REFORMA FAIXA \d)\s+(\d+)\s+([\d.,]+)R\$\s+([\d.,]+)R\$\s*$"
)


def normalizar(texto: str) -> str:
    """Maiusculas, sem acento, hifen vira espaco, apostrofo removido - para
    tolerar as diferencas de grafia entre o extrato da Caixa e a nossa base
    territorial (ver docstring do modulo)."""
    texto = str(texto).strip().upper()
    texto = texto.replace("-", " ")
    texto = texto.replace("'", "")
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return " ".join(texto.split())


def ler_pdf_agregado(caminho: str) -> dict[str, dict]:
    """Le o PDF, parseia cada linha de dado e agrega qtd/valor_liberado por
    chave normalizada nome|uf, somando os 6 meses e as duas faixas."""
    leitor = PdfReader(caminho)
    agregados: dict[str, dict] = defaultdict(lambda: {"qtd": 0, "valor_liberado": 0.0})
    linhas_sem_match = []

    for pagina in leitor.pages:
        texto = pagina.extract_text() or ""
        for linha in texto.split("\n"):
            linha = linha.strip()
            if not linha or linha.startswith("ANO_MES"):
                continue
            m = PADRAO_LINHA.match(linha)
            if not m:
                linhas_sem_match.append(linha)
                continue
            _ano_mes, municipio, uf, _faixa, qtd, _vf_total, vr_liberado = m.groups()
            chave = normalizar(municipio) + "|" + normalizar(uf)
            chave = ALIASES_MUNICIPIO.get(chave, chave)
            valor = float(vr_liberado.replace(".", "").replace(",", "."))
            agregados[chave]["qtd"] += int(qtd)
            agregados[chave]["valor_liberado"] += valor

    if linhas_sem_match:
        print(f"    [AVISO] {len(linhas_sem_match)} linha(s) do PDF nao casaram o padrao esperado e foram ignoradas:")
        for linha in linhas_sem_match[:10]:
            print(f"      - {linha!r}")

    return agregados


def main():
    print("Extractor Reforma Casa Brasil - modalidade SOLAR (Caixa/SIC)")
    print("=" * 70)

    caminho_pdf = os.path.join(BASE_DOWNLOADS, NOME_ARQUIVO_PDF)
    if not os.path.exists(caminho_pdf):
        print(f"[ERRO] Arquivo nao encontrado: {caminho_pdf}")
        print("       Este dado nao e publico - precisa de um extrato manual do SIC/Caixa. Ver docstring do modulo.")
        sys.exit(1)

    print(f"[1/3] Lendo e agregando {caminho_pdf} ...")
    agregados = ler_pdf_agregado(caminho_pdf)
    total_qtd = sum(a["qtd"] for a in agregados.values())
    total_valor = sum(a["valor_liberado"] for a in agregados.values())
    print(f"      {len(agregados)} municipios distintos no extrato. "
          f"{total_qtd} contratos, R$ {total_valor:,.2f} liberados.")

    engine = create_engine(DATABASE_URL)
    with engine.connect() as con:
        municipios = con.execute(text("SELECT codigo_ibge, nome, uf FROM municipios")).fetchall()
    mapa_municipio = {
        normalizar(nome) + "|" + normalizar(uf): codigo_ibge for codigo_ibge, nome, uf in municipios
    }

    print("[2/3] Casando municipios da fonte com a base territorial...")
    casados = {}
    nao_casados = []
    for chave, dados in agregados.items():
        codigo_ibge = mapa_municipio.get(chave)
        if codigo_ibge is None:
            nao_casados.append(chave)
        else:
            casados[codigo_ibge] = dados

    if nao_casados:
        print(f"      [AVISO] {len(nao_casados)} municipio(s) do extrato NAO encontrados na base territorial (ignorados):")
        for chave in nao_casados:
            print(f"        - {chave}")
    print(f"      {len(casados)} municipios casados com sucesso.")

    print(f"[3/3] Inserindo/atualizando {len(casados)} municipios (periodo_referencia={PERIODO_REFERENCIA})...")
    sql_upsert = text("""
        INSERT INTO indicadores_sociais
            (unidade_espacial_id, periodo_referencia,
             numero_contratos_reforma_casa_brasil_solar,
             valor_liberado_reforma_casa_brasil_solar)
        VALUES
            (:uid, :periodo, :qtd, :valor)
        ON CONFLICT (unidade_espacial_id, periodo_referencia) DO UPDATE SET
            numero_contratos_reforma_casa_brasil_solar = EXCLUDED.numero_contratos_reforma_casa_brasil_solar,
            valor_liberado_reforma_casa_brasil_solar = EXCLUDED.valor_liberado_reforma_casa_brasil_solar
    """)

    inseridos = 0
    falhas = []
    for codigo_ibge, dados in casados.items():
        unidade_espacial_id = f"municipio:{codigo_ibge}"
        try:
            with engine.begin() as con:
                con.execute(
                    sql_upsert,
                    {
                        "uid": unidade_espacial_id,
                        "periodo": PERIODO_REFERENCIA,
                        "qtd": dados["qtd"],
                        "valor": round(dados["valor_liberado"], 2),
                    },
                )
            inseridos += 1
        except Exception as e:
            falhas.append((codigo_ibge, str(e)[:120]))

    print(f"      {inseridos} municipios inseridos/atualizados. Falhas: {len(falhas)}")
    for codigo_ibge, erro in falhas[:5]:
        print(f"        - {codigo_ibge}: {erro}")

    print("Extractor Reforma Casa Brasil Solar concluido.")


if __name__ == "__main__":
    main()
