"""
ETL: Qualidade do Fornecimento (INDQUAL) - DEC/FEC por Conjunto Elétrico
Fonte: ANEEL Dados Abertos

Uso:
    python3 etl_indqual.py --check-headers   # só mostra os cabeçalhos reais
    python3 etl_indqual.py                   # roda a carga completa
"""
import argparse
import csv
import io
import sys
import zipfile

import psycopg2
import requests
from psycopg2.extras import execute_values

import os

DB_DSN = os.environ.get("DATABASE_URL")
if not DB_DSN:
    raise RuntimeError("DATABASE_URL não encontrada. Confirme que o .env está sendo carregado.")

URLS = {
    "atributos": (
        "https://dadosabertos.aneel.gov.br/dataset/d5f0712e-62f6-4736-8dff-9991f10758a7/"
        "resource/3c780aca-38cf-406d-9d45-f07a9216eef2/download/"
        "indicadores-continuidade-coletivos-atributos.csv"
    ),
    "indicadores": (
        "https://dadosabertos.aneel.gov.br/dataset/d5f0712e-62f6-4736-8dff-9991f10758a7/"
        "resource/4493985c-baea-429c-9df5-3030422c71d7/download/"
        "indicadores-continuidade-coletivos-2020-2029.csv"
    ),
    "municipio": (
        "https://dadosabertos.aneel.gov.br/dataset/db9c9f60-b3b5-4504-9dfe-2637922d53ce/"
        "resource/3f841488-80a8-42f2-a6ca-e0c593b228de/download/indqual-municipio.csv"
    ),
}

COLS_ATRIBUTOS = {
    "ide_conjunto": "IdeConjUndConsumidoras",
    "sig_agente": "SigAgente",
    "num_cnpj": "NumCNPJ",
    "dsc_conjunto": "DscConjUndConsumidoras",
}
COLS_INDICADORES = {
    "ide_conjunto": "IdeConjUndConsumidoras",
    "sig_agente": "SigAgente",
    "num_cnpj": "NumCNPJ",
    "dsc_conjunto": "DscConjUndConsumidoras",
    "sig_indicador": "SigIndicador",
    "ano_indice": "AnoIndice",
    "num_periodo_indice": "NumPeriodoIndice",
    "vlr_indice": "VlrIndiceEnviado",
}
COLS_MUNICIPIO = {
    "ide_conjunto": "IdeConjUnidConsumidoras",
    "codigo_ibge": "CodMunicipio",
}

DELIMITER = ";"
BATCH_SIZE = 5000


def fetch_csv_rows(url, delimiter=DELIMITER):
    resp = requests.get(url, timeout=180)
    resp.raise_for_status()

    if resp.content[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            csv_names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            if not csv_names:
                raise ValueError(f"ZIP não contém nenhum .csv: {zf.namelist()}")
            with zf.open(csv_names[0]) as f:
                text = f.read().decode("utf-8-sig")
    else:
        raw = resp.content
        try:
            text = raw.decode("utf-8-sig")
            if "\ufffd" in text:
                raise UnicodeDecodeError("utf-8-sig", b"", 0, 1, "replacement char found")
        except UnicodeDecodeError:
            text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=delimiter)
    return reader.fieldnames, list(reader)


def check_headers():
    for nome, url in URLS.items():
        try:
            fieldnames, rows = fetch_csv_rows(url)
            print(f"\n[{nome}] {url}")
            print(f"  colunas: {fieldnames}")
            print(f"  registros: {len(rows)}")
            if rows:
                print(f"  primeira linha: {rows[0]}")
        except Exception as e:
            print(f"\n[{nome}] ERRO ao baixar/ler: {e}")


def parse_float(valor):
    if not valor:
        return None
    try:
        return float(str(valor).replace(",", "."))
    except ValueError:
        return None


def load_conjuntos(cur, *fontes):
    seen = {}
    for rows, c in fontes:
        for r in rows:
            ide = r.get(c["ide_conjunto"])
            if not ide or ide in seen:
                continue
            seen[ide] = (
                ide,
                (r.get(c["sig_agente"]) or "").strip() or None,
                r.get(c["num_cnpj"]),
                r.get(c["dsc_conjunto"]),
            )
    values = list(seen.values())
    if not values:
        print("  conjuntos: 0 registros")
        return set(seen.keys())
    execute_values(cur, """
        INSERT INTO qualidade_conjuntos (ide_conjunto, sig_agente, num_cnpj, dsc_conjunto)
        VALUES %s
        ON CONFLICT (ide_conjunto) DO UPDATE SET
            sig_agente = EXCLUDED.sig_agente,
            num_cnpj = EXCLUDED.num_cnpj,
            dsc_conjunto = EXCLUDED.dsc_conjunto,
            atualizado_em = now()
    """, values)
    print(f"  conjuntos: {len(values)} registros")
    return set(seen.keys())


def load_conjuntos_placeholder(cur, ide_conjuntos):
    values = [(ide,) for ide in ide_conjuntos]
    if not values:
        return
    execute_values(cur, """
        INSERT INTO qualidade_conjuntos (ide_conjunto)
        VALUES %s
        ON CONFLICT (ide_conjunto) DO NOTHING
    """, values)
    print(f"  conjuntos (placeholder, sem metadado): até {len(values)} candidatos")


def load_conjunto_municipio(cur, rows):
    c = COLS_MUNICIPIO
    pares = set()
    for r in rows:
        ide = r.get(c["ide_conjunto"])
        cod = r.get(c["codigo_ibge"])
        if ide and cod:
            pares.add((ide, str(cod).zfill(7)))

    cur.execute("SELECT codigo_ibge FROM municipios")
    validos = {row[0].strip() for row in cur.fetchall()}
    pares_validos = [(ide, cod) for ide, cod in pares if cod in validos]
    invalidos = pares - set(pares_validos)
    if invalidos:
        codigos_invalidos = sorted({cod for _, cod in invalidos})
        print(f"  AVISO: {len(invalidos)} pares ignorados por codigo_ibge inexistente "
              f"em municipios: {codigos_invalidos[:10]}")

    values = pares_validos
    if not values:
        print("  conjunto_municipio: 0 pares")
        return
    execute_values(cur, """
        INSERT INTO qualidade_conjunto_municipio (ide_conjunto, codigo_ibge)
        VALUES %s
        ON CONFLICT DO NOTHING
    """, values)
    print(f"  conjunto_municipio: {len(values)} pares")


def _flush_indicadores(cur, batch):
    execute_values(cur, """
        INSERT INTO qualidade_indicadores
            (ide_conjunto, sig_indicador, ano_indice, num_periodo_indice, vlr_indice)
        VALUES %s
        ON CONFLICT (ide_conjunto, sig_indicador, ano_indice, num_periodo_indice) DO UPDATE SET
            vlr_indice = EXCLUDED.vlr_indice,
            atualizado_em = now()
    """, batch)


def load_indicadores(cur, rows):
    c = COLS_INDICADORES
    dedup = {}
    for r in rows:
        ide = r.get(c["ide_conjunto"])
        sig = r.get(c["sig_indicador"])
        ano = r.get(c["ano_indice"])
        periodo = r.get(c["num_periodo_indice"])
        if not (ide and sig and ano and periodo):
            continue
        chave = (ide, sig, int(ano), int(periodo))
        dedup[chave] = parse_float(r.get(c["vlr_indice"]))

    total = 0
    batch = []
    for (ide, sig, ano, periodo), valor in dedup.items():
        batch.append((ide, sig, ano, periodo, valor))
        if len(batch) >= BATCH_SIZE:
            _flush_indicadores(cur, batch)
            total += len(batch)
            batch = []
    if batch:
        _flush_indicadores(cur, batch)
        total += len(batch)
    print(f"  indicadores: {total} registros ({len(rows) - total} duplicados/descartados)")


def main():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            print("Baixando atributos dos conjuntos...")
            _, atributos = fetch_csv_rows(URLS["atributos"])

            print("Baixando indicadores (2020-2029)...")
            _, indicadores = fetch_csv_rows(URLS["indicadores"])

            print("Baixando de-para conjunto-município...")
            _, municipio = fetch_csv_rows(URLS["municipio"])

            print("Gravando conjuntos (mesclando atributos + indicadores)...")
            conhecidos = load_conjuntos(
                cur,
                (atributos, COLS_ATRIBUTOS),
                (indicadores, COLS_INDICADORES),
            )
            conn.commit()

            orfaos = {
                r.get(COLS_MUNICIPIO["ide_conjunto"])
                for r in municipio
                if r.get(COLS_MUNICIPIO["ide_conjunto"])
            } - conhecidos
            if orfaos:
                print(f"Gravando {len(orfaos)} conjuntos órfãos (sem metadado)...")
                load_conjuntos_placeholder(cur, orfaos)
                conn.commit()

            print("Gravando de-para conjunto-município...")
            load_conjunto_municipio(cur, municipio)
            conn.commit()

            print("Gravando indicadores...")
            load_indicadores(cur, indicadores)
            conn.commit()

        print("\nETL INDQUAL concluído.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-headers", action="store_true",
                         help="Só baixa e mostra os cabeçalhos reais dos CSVs, sem gravar no banco")
    args = parser.parse_args()

    if args.check_headers:
        check_headers()
        sys.exit(0)

    main()