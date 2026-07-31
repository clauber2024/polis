# Dockerfile do backend do Atlas Solar Justo — Node/Express + um runtime
# Python enxuto, só pra permitir o backend disparar os extractors da
# whitelist (src/utils/extractoresElegiveis.ts) como subprocesso (RF-070
# revisitado, 30/07/2026 — ver docs/DECISOES.md). Antes desta mudança a
# Railway detectava o Node sozinha (Nixpacks, sem Dockerfile) — isso não
# empacotava Python nenhum, então nenhum extractor conseguia rodar a partir
# da API.
#
# Contexto de build = esta pasta (backend/), não a raiz do repo — o serviço
# na Railway já usa "Root Directory: backend" (ver docs/DEPLOY_TEMPORARIO.md),
# então este Dockerfile e seus caminhos COPY são relativos a backend/, e
# dentro do container /app É o conteúdo de backend/ (não existe nível acima
# tipo /app/backend).
#
# NÃO instala o requirements.txt completo do ETL (geopandas/BigQuery) — só
# requirements-runtime.txt, o suficiente pros 3 extractors elegíveis hoje.
# Os demais extractors (RAIS/Mortalidade Infantil via BigQuery — que também
# rodariam aqui se algum dia entrarem na whitelist, ver
# _autenticacao_bigquery.py —, Irradiação INPE, Reforma Casa Brasil Solar,
# ZEIS de SP/BH) continuam exigindo execução manual no ambiente de
# desenvolvimento — não rodam neste container.

FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN python3 -m venv src/etl/venv \
    && src/etl/venv/bin/pip install --no-cache-dir -r src/etl/requirements-runtime.txt

ENV PYTHON_EXECUTABLE=/app/src/etl/venv/bin/python
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/index.js"]
