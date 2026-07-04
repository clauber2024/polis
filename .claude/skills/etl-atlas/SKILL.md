---
name: etl-atlas
description: Padrões obrigatórios para escrever extractors ETL do Atlas Solar Justo (projeto Polis). Use sempre que o usuário pedir para criar, revisar ou corrigir um extractor, loader, script de carga, pipeline ETL, ou qualquer código Python que insira dados no PostgreSQL/PostGIS do Atlas — incluindo cargas de ANEEL, IBGE/SIDRA, RAIS, DATASUS, INPE, INDQUAL, BDGD, MCMV ou Ministério das Cidades, mesmo que a palavra "extractor" não apareça.
---

# ETL Atlas Solar Justo — Padrões de Extractor

Padrões obrigatórios para código de carga do projeto Polis, extraídos de bugs reais
encontrados e corrigidos. Fonte de verdade completa: `CLAUDE.md` na raiz do repo.

## Estrutura e ambiente

- Extractors vivem em `backend/src/etl/loaders/`, um por fonte primária, com
  extração + transformação + carga no mesmo arquivo (padrão do projeto)
- Nomenclatura: `extrair_<fonte>_<origem>.py` (ex: `extrair_mmgd_aneel.py`)
- Dados brutos baixados vão em `backend/src/etl/data/raw/` (não versionado)
- Venv isolado: `backend/src/etl/venv/` — NUNCA Anaconda (conflitos NumPy 1.x/2.x já ocorreram)
- Bibliotecas em uso: pandas, geopandas, sqlalchemy, psycopg2-binary, requests,
  google-cloud-bigquery, db-dtypes
- BigQuery: autenticar com gcloud auth application-default login --no-launch-browser
- WSL2: nunca criar arquivos longos via heredoc (truncamento); usar Python open().write()

## Banco

- PostgreSQL 16 + PostGIS 3.4, SIRGAS 2000 (EPSG:4674)
- Colunas em snake_case em português (`codigo_ibge`, `periodo_referencia`)
- Indicadores referenciam `unidades_espaciais.id` (formato `tipo:codigo`,
  ex: `municipio:3550308`), nunca `municipios` diretamente — granularidade é atributo do dado
- Tabelas: `municipios`, `unidades_espaciais`, `mmgd_indicadores`,
  `indicadores_sociais`, `irradiacao_solar`

## Padrões obrigatórios (cada um veio de um bug real)

### 1. Transação POR município/linha no upsert
Nunca transação única para o lote inteiro. Bug real (extractor MMGD): um erro de FK
cancelava todos os upserts seguintes (InFailedSqlTransaction em cascata).

### 2. Idempotência via ON CONFLICT DO UPDATE
Nunca INSERT puro. O extractor deve rodar N vezes sem duplicar.

### 3. Geometria como WKB binário, nunca WKT
Bug real: Jutaí/AM gerava WKT de ~3 milhões de caracteres e derrubava a conexão.
Usar `geometry.wkb` / `shapely.wkb.dumps`, SRID 4674.

### 4. Remover dimensão Z de fontes ArcGIS antes do dump

    from shapely.ops import transform
    geom_2d = transform(lambda x, y, z=None: (x, y), geom)

### 5. Pré-filtrar códigos IBGE inexistentes ANTES do upsert
Comparar contra a base territorial e reportar os descartados separadamente —
nunca deixar a FK rejeitar silenciosamente.

### 6. Normalização de códigos IBGE
Banco usa 7 dígitos. CSVs do Ministério das Cidades usam 6 (sem verificador):
mapear via `codigo_ibge[:6]`. Nunca assumir o formato da fonte.

### 7. IBGE/SIDRA: categorias específicas, nunca [all]

### 8. Formato de saída no terminal (padrão de todos os extractors)
- Etapas numeradas: `[1/N] ...`
- Avisos explícitos: `[AVISO]` para dados nulos/inválidos/descartados
- Contagem final de sucesso/falha

## Regras por fonte

| Fonte | Regra |
|---|---|
| BDGD | Não processar `.gdb` bruto se existir agregado (INDQUAL para FIC/DIC) |
| TSEE/baixa renda | Dataset "Beneficiários da CDE"; capturar DUAS subclasses: "Residencial Baixa Renda" e "Residencial Desconto Social" (Lei 15.235/2025) |
| Censo 2022 | Não usar para acesso à eletricidade (dado inexistente) |
| RAIS | BigQuery/Base dos Dados |

## Validação pós-carga (antes de considerar o extractor pronto)

- Query de sanidade contra os casos de referência do DRF: São Paulo,
  Floresta-PE, Diamantina-MG
- Comparar agregados nacionais contra estatística oficial conhecida
- Checklist: transação por município + ON CONFLICT + WKB/4674/sem Z +
  pré-filtro IBGE + log `[1/N]`/`[AVISO]`/contagem final + roda no venv do projeto