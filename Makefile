# Atlas Solar Justo — Makefile
#
# Empacota os comandos de desenvolvimento hoje documentados manualmente em
# README.md ("Como rodar localmente"). Ver CLAUDE.md, Secao 7, para o historico
# desta secao (planejada ate 09/07/2026, parcialmente implementada nesta data).
#
# NAO incluido aqui (continua so especificacao — ver CLAUDE.md Secao 8,
# "Padrao de Deploy — PLANEJADO"):
#   make up-prod / make deploy / make deploy-rebuild / make deploy-first
#     -> exigem servidor/dominio de producao, que ainda nao existe.
#   make shell
#     -> o backend nao e containerizado hoje, roda via `npm run dev` direto
#        no host (nao ha container para abrir shell dentro).
#   make lint
#     -> nao ha ferramenta de lint configurada no projeto ainda.
#   make send
#     -> fluxo de commit/push interativo, nao implementado por ora.
#
# 'migrate-prod'/'db-prod' NAO fazem parte da Secao 8 (arquitetura de producao
# planejada) — sao para o deploy publico TEMPORARIO via Railway/Vercel, ver
# docs/DEPLOY_TEMPORARIO.md e o ADR em docs/DECISOES.md ("Hospedagem publica
# temporaria").

.PHONY: help up down db migrate migrate-prod db-prod seed etl etl-source fresh dev typecheck build front front-typecheck front-build

COMPOSE      := docker compose
DB_USER      := atlas
DB_NAME      := atlas_solar_justo
MIGRATIONS   := backend/src/db/migrations
LOADERS      := backend/src/etl/loaders
VENV_PY      := backend/src/etl/venv/bin/python3
PSQL_EXEC    := $(COMPOSE) exec -T postgres psql -U $(DB_USER) -d $(DB_NAME)
POSTGIS_IMG  := postgis/postgis:16-3.4

help:
	@echo "Atlas Solar Justo — comandos disponiveis:"
	@echo "  make up                              sobe o Postgres/PostGIS local"
	@echo "  make down                             derruba os containers (mantem o volume)"
	@echo "  make db                               abre um client psql interativo"
	@echo "  make migrate                          aplica todas as migrations em"
	@echo "                                         backend/src/db/migrations/*.sql, na ordem"
	@echo "                                         numerica (inclui o schema de Qualidade de"
	@echo "                                         Fornecimento antes da 0011) — pega qualquer"
	@echo "                                         migration nova automaticamente, sem editar"
	@echo "                                         este Makefile"
	@echo "  make migrate-prod DATABASE_URL_PROD=...  mesma coisa, contra o Postgres do Railway"
	@echo "                                         (deploy publico temporario, ver"
	@echo "                                         docs/DEPLOY_TEMPORARIO.md) — reative o TCP"
	@echo "                                         Proxy do Railway antes de rodar"
	@echo "  make db-prod DATABASE_URL_PROD=...    abre um psql interativo contra o Postgres"
	@echo "                                         do Railway (mesmo pre-requisito acima)"
	@echo "  make seed                              popula o territorio (seed_municipios.py)"
	@echo "  make etl                               roda a pipeline ETL completa, na ordem"
	@echo "                                          documentada no README"
	@echo "  make etl-source SOURCE=mmgd_aneel      roda um extractor especifico"
	@echo "  make fresh                             reseta o banco (down -v + up + migrate + seed)"
	@echo "  make dev                               roda o backend em modo watch (npm run dev)"
	@echo "  make typecheck                          roda tsc --noEmit no backend"
	@echo "  make build                              builda o backend (tsc)"
	@echo "  make front                              roda o frontend em modo dev (Vite, porta 5173)"
	@echo "  make front-typecheck                    roda tsc -b no frontend"
	@echo "  make front-build                        builda o frontend (tsc -b && vite build)"
	@echo ""
	@echo "Nao implementados aqui (ver CLAUDE.md Secao 8 - so especificacao):"
	@echo "  make up-prod / make deploy / make deploy-rebuild / make deploy-first / make shell / make lint"

up:
	$(COMPOSE) up -d postgres

down:
	$(COMPOSE) down

db:
	$(COMPOSE) exec postgres psql -U $(DB_USER) -d $(DB_NAME)

# Migrations 0000-0010 nao dependem de nada externo. A partir da 0011, as views
# de Qualidade de Fornecimento (DEC/FEC) dependem das tabelas qualidade_conjuntos /
# qualidade_indicadores / qualidade_conjunto_municipio, criadas FORA do sistema de
# migrations via backend/src/etl/schema_qualidade.sql (ver CLAUDE.md Secao 2,
# "INCONSISTENCIA ARQUITETURAL CONHECIDA"). Por isso ele e aplicado aqui, logo antes
# da 0011 — reproduzindo a ordem exata do README.
migrate:
	@set -e; \
	for f in $(MIGRATIONS)/*.sql; do \
		base=$$(basename $$f); \
		if [ "$$base" = "0011_qualidade_dec_fec_real.sql" ]; then \
			echo "-> backend/src/etl/schema_qualidade.sql (schema INDQUAL, fora do padrao de migrations)"; \
			$(PSQL_EXEC) < backend/src/etl/schema_qualidade.sql; \
		fi; \
		echo "-> $$f"; \
		$(PSQL_EXEC) < $$f; \
	done
	@echo "Migrations aplicadas. Falta a carga de dados: 'make etl' (ETL/loaders) e,"
	@echo "para Qualidade de Fornecimento, 'python3 backend/src/etl/etl_indqual.py' manualmente"
	@echo "(fora do padrao loaders/, ver CLAUDE.md Secao 2)."

# Mesma logica do 'migrate' acima, mas contra o Postgres remoto do deploy publico
# temporario (Railway) em vez do container local — ver docs/DEPLOY_TEMPORARIO.md.
# Roda via a MESMA imagem Docker do Postgres local ($(POSTGIS_IMG)), so pra ter
# 'psql' disponivel sem precisar instalar nada no host. Usa 'psql' puro (sem
# ON_ERROR_STOP), entao migrations ja aplicadas no dump/restore inicial vao
# gerar erros esperados ("relation/column already exists") e serem puladas —
# mesmo comportamento tolerante ja documentado no 'migrate' local contra um
# banco ja provisionado.
#
# DATABASE_URL_PROD e a URL PUBLICA do Postgres do Railway (o TCP Proxy precisa
# estar ativado em Settings -> Networking do servico postgres no Railway antes
# de rodar isso — e recomendado desativar de novo depois, ver Secao 4.4 de
# docs/DEPLOY_TEMPORARIO.md).
migrate-prod:
	@test -n "$(DATABASE_URL_PROD)" || { \
		echo "Uso: make migrate-prod DATABASE_URL_PROD=postgresql://usuario:senha@host:porta/banco"; \
		echo "(URL publica do Postgres do Railway com o TCP Proxy ativado — ver docs/DEPLOY_TEMPORARIO.md)"; \
		exit 1; \
	}
	@for f in $(MIGRATIONS)/*.sql; do \
		base=$$(basename $$f); \
		if [ "$$base" = "0011_qualidade_dec_fec_real.sql" ]; then \
			echo "-> backend/src/etl/schema_qualidade.sql (schema INDQUAL, fora do padrao de migrations)"; \
			docker run --rm -v "$(CURDIR):/repo" $(POSTGIS_IMG) \
				psql "$(DATABASE_URL_PROD)" -f /repo/backend/src/etl/schema_qualidade.sql; \
		fi; \
		echo "-> $$f"; \
		docker run --rm -v "$(CURDIR):/repo" $(POSTGIS_IMG) \
			psql "$(DATABASE_URL_PROD)" -f /repo/$$f; \
	done
	@echo "Migrations aplicadas no Postgres do Railway. Erros do tipo 'relation/column"
	@echo "already exists' sao esperados para migrations que ja vieram no dump/restore"
	@echo "inicial — confira se sobrou algum erro DIFERENTE desses antes de considerar ok."
	@echo "Lembre de desativar o TCP Proxy no Railway se so o ativou para isto."

db-prod:
	@test -n "$(DATABASE_URL_PROD)" || { \
		echo "Uso: make db-prod DATABASE_URL_PROD=postgresql://usuario:senha@host:porta/banco"; \
		exit 1; \
	}
	docker run --rm -it $(POSTGIS_IMG) psql "$(DATABASE_URL_PROD)"

seed:
	$(VENV_PY) $(LOADERS)/seed_municipios.py

# Ordem replicada do README ("Como rodar localmente"). Pre-requisitos manuais que
# este target NAO cobre:
#   - extrair_renda_trabalho_rais.py e extrair_capital_humano_mortalidade_infantil.py
#     exigem `gcloud auth application-default login` antes (BigQuery)
#   - extrair_irradiacao_solar_inpe.py exige baixar o CSV do INPE manualmente antes
#     (ver ARQUITETURA.md)
#   - extrair_tipo_domicilio_censo.py, extrair_rdpc_censo.py e
#     extrair_tarifa_distribuidoras.py exigem as migrations 0016/0017/0018 ja
#     aplicadas — rode 'make migrate' antes de 'make etl'
#   - extrair_precipitacao_mensal_merge.py (migration 0019) pode levar ~1h na
#     primeira execucao e exige cfgrib/xarray/eccodes/rasterstats no venv
#   - Qualidade de Fornecimento (INDQUAL) NAO entra aqui: schema e carga proprios,
#     fora do padrao loaders/ (ver backend/src/etl/etl_indqual.py)
#   - validar_aneel_real.py tambem fica fora: e um script de validacao/diagnostico,
#     nao faz parte da carga de dados
ETL_ORDER := \
	seed_municipios.py \
	extrair_mmgd_aneel.py \
	extrair_infraestrutura_censo.py \
	extrair_renda_trabalho_rais.py \
	extrair_alfabetizacao_censo.py \
	extrair_capital_humano_mortalidade_infantil.py \
	extrair_moradia_censo.py \
	extrair_inadequacao_moradia.py \
	extrair_mcmv_fgts.py \
	extrair_mcmv_ogu.py \
	seed_favelas_fcu.py \
	extrair_favelas_fcu.py \
	seed_zeis_sao_paulo.py \
	seed_zeis_recife.py \
	seed_zeis_rio_branco.py \
	seed_aeis_rio.py \
	extrair_irradiacao_solar_inpe.py \
	extrair_cadunico.py \
	extrair_tipo_domicilio_censo.py \
	extrair_rdpc_censo.py \
	extrair_tarifa_distribuidoras.py \
	extrair_precipitacao_mensal_merge.py

etl:
	@echo "Rodando a pipeline ETL completa (ordem documentada no README)."
	@echo "Pre-requisitos manuais: gcloud auth (RAIS/mortalidade infantil), CSV do INPE"
	@echo "ja baixado (irradiacao solar), e 'make migrate' ja rodado antes."
	@set -e; \
	for f in $(ETL_ORDER); do \
		echo "-> $$f"; \
		$(VENV_PY) $(LOADERS)/$$f; \
	done

# make etl-source SOURCE=mmgd_aneel  (casa por substring do nome do arquivo)
etl-source:
	@test -n "$(SOURCE)" || { echo "Uso: make etl-source SOURCE=<parte do nome, ex: mmgd_aneel>"; exit 1; }
	@matches=$$(ls $(LOADERS) | grep -- "$(SOURCE)"); \
	count=$$(echo "$$matches" | grep -c . || true); \
	if [ "$$count" -eq 0 ]; then \
		echo "Nenhum extractor encontrado para SOURCE=$(SOURCE) em $(LOADERS)/"; exit 1; \
	elif [ "$$count" -gt 1 ]; then \
		echo "SOURCE=$(SOURCE) casa com mais de um arquivo, seja mais especifico:"; echo "$$matches"; exit 1; \
	else \
		echo "-> $$matches"; $(VENV_PY) $(LOADERS)/$$matches; \
	fi

# Reseta o banco local do zero. NAO roda 'make etl' automaticamente (a pipeline
# completa tem pre-requisitos manuais, ver comentario acima) — só migrations +
# seed do territorio.
fresh:
	$(COMPOSE) down -v
	$(MAKE) up
	@echo "Aguardando o Postgres ficar pronto..."
	@until $(COMPOSE) exec postgres pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; do sleep 1; done
	$(MAKE) migrate
	$(MAKE) seed
	@echo "Banco resetado, migrado e territorio semeado. Rode 'make etl' para popular os indicadores."

dev:
	cd backend && npm run dev

typecheck:
	cd backend && npm run typecheck

build:
	cd backend && npm run build

# Frontend (Vite/React — iniciado em 09/07/2026). O dev server sobe na porta
# 5173 e faz proxy de /api para o backend na 3000 (ver frontend/vite.config.ts)
# — rode 'make dev' em outro terminal para o mapa ter dado.
front:
	cd frontend && npm run dev

front-typecheck:
	cd frontend && npm run typecheck

front-build:
	cd frontend && npm run build
