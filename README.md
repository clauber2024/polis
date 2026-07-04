# Atlas Solar Justo

> Plataforma WebGIS de visualização e análise da expansão da Micro e Minigeração Distribuída
> (MMGD) solar no Brasil, sob uma perspectiva de justiça energética.

---

## Sobre o projeto

O Atlas Solar Justo cruza dados de potencial solar, vulnerabilidade social, condição
habitacional e acesso efetivo à energia limpa para identificar onde a geração solar
distribuída cresce, quem tem acesso a essa tecnologia, quais territórios permanecem
excluídos, e onde existe maior distância entre potencial solar, vulnerabilidade social e
acesso efetivo — os chamados **vazios de acesso**.

A unidade de análise principal é o município (código IBGE de 7 dígitos), com arquitetura
preparada para evoluir a granularidades sub-municipais (setor censitário, favela/comunidade
urbana, CEP ou bairro) conforme novas fontes de dados se tornem disponíveis — ver
`unidades_espaciais` no schema do banco.

---

## Estado atual dos dados (atualizado em 04/07/2026)

| Dimensão | Cobertura | Fonte | Status |
|---|---|---|---|
| Território (municípios) | 5.573 municípios, geometria real | IBGE, Malha Municipal 2025 | ✅ Completo |
| MMGD instalada | 5.567 municípios, 50.086 MW, 8M UCs | ANEEL, snapshot jun/2026 | ✅ Completo |
| Infraestrutura Urbana | 5.570 municípios, 5 indicadores | Censo 2022/SIDRA | ✅ Completo |
| Renda e Trabalho | 5.571 municípios | RAIS, ano-base 2024 (BigQuery) | ✅ Completo |
| Capital Humano | 5.570 municípios (alfabetização + mortalidade infantil) | Censo 2022/SIDRA + SIM/SINASC-DATASUS (BigQuery, média 2022-2024) | ✅ Completo |
| Moradia | Regime de ocupação (5.570) + FCU (12.348) + ZEIS/AEIS (3.696, 4 capitais) + inadequação + MCMV/FGTS (5.111) + MCMV/OGU (4.883) | Censo 2022/SIDRA + Ministério das Cidades + portais municipais | ✅ Completo |
| Qualidade de fornecimento | 5.570 municípios, DEC/FEC oficial + DEC/FEC "real" (sem expurgo de Dia Crítico) | ANEEL, Indicadores Coletivos de Continuidade (INDQUAL) | ✅ Completo |
| Irradiação solar | 5.569 municípios, GHI médio anual | Atlas Brasileiro de Energia Solar (LABREN/CCST/INPE, 2ª ed. 2017) | ✅ Completo |
| TSEE / baixa renda (`percentual_tsee`) | — | ANEEL, Beneficiários da CDE | 🔒 Bloqueado — aguardando dado de jan/2026+ (nova subclasse "Desconto Social") |

Os índices de Infraestrutura Urbana, Renda e Trabalho, Capital Humano e Moradia são
**construções próprias do Atlas, inspiradas no IVS/IPEA**, não o IVS oficial — que só tem
cobertura municipal completa até o Censo 2010. Ver nota metodológica em cada extractor
(`backend/src/etl/loaders/`).

---

## Fontes de dados primárias

| Fonte | Indicador | Acesso |
|---|---|---|
| ANEEL/MMGD | Micro e minigeração distribuída instalada | API REST (dadosabertos.aneel.gov.br) |
| IBGE Censo 2022 | Infraestrutura urbana, alfabetização, regime de ocupação, inadequação habitacional | API SIDRA |
| IBGE Malha Municipal | Geometria dos municípios | Shapefile (geoftp.ibge.gov.br) |
| RAIS (Base dos Dados) | Renda e vínculos formais | BigQuery público |
| IBGE Favelas e Comunidades Urbanas (Censo 2022) | Territórios populares, geometria | Shapefile + SIDRA (ver `docs/PLANO_MORADIA_TERRITORIO_POPULAR.md`) |
| Ministério das Cidades | MCMV/FGTS e MCMV/OGU | CSV (portal de dados abertos) |
| Portais municipais (ZEIS/AEIS) | Segurança da posse — RJ, SP, Recife, Rio Branco | Variável por município |
| ANEEL — Indicadores Coletivos de Continuidade (INDQUAL) | Qualidade de fornecimento (DEC/FEC oficial e "real") | 3 CSVs relacionais (dadosabertos.aneel.gov.br) |
| SIM + SINASC (Base dos Dados/DATASUS) | Mortalidade infantil (Capital Humano) | BigQuery público |
| Atlas Brasileiro de Energia Solar (LABREN/CCST/INPE) | Irradiação solar (GHI) por sede municipal | CSV, licença CC BY-NC-ND (uso não-comercial) |
| ANEEL — Beneficiários da CDE | TSEE / baixa renda (`percentual_tsee`) — bloqueado | ZIP mensal (dadosabertos.aneel.gov.br) |

> O **OBEPE** (Observatório Brasileiro de Erradicação da Pobreza Energética — EPE/MME/BID) é
> referência metodológica para o Índice de Pobreza Energética Regional do Atlas, mas não é
> fonte de dado primário — ver `docs/DRF.md`, seção 14, para detalhamento.

---

## Perfis de usuário

| Perfil | Acesso |
|---|---|
| Usuário Público | Visualização pública, sem dados administrativos |
| Pesquisador/Analista | Visualização + cruzamento avançado de variáveis |
| Gestor Público | Visualização + priorização territorial |
| Parceiro Técnico | Revisão metodológica e validação de dados |
| Equipe do Projeto | Gestão de bases, notas metodológicas, comunicação |
| Administrador | Controle total da plataforma |

---

## Stack técnica

- **Backend:** Node.js 20+, TypeScript, Express, Drizzle ORM
- **Banco de dados:** PostgreSQL 16 + PostGIS 3.4 (SIRGAS 2000 / EPSG:4674)
- **ETL:** Python 3.12+ (venv isolado), pandas, geopandas, SQLAlchemy, google-cloud-bigquery
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, MapLibre GL JS (ainda não iniciado)
- **Infraestrutura:** Docker, Docker Compose (PostGIS local), Google Cloud/BigQuery (RAIS)

Detalhamento completo de padrões de código, banco de dados, deploy e Git em
[`CLAUDE.md`](./CLAUDE.md).

---

## Documentação

- [`CLAUDE.md`](./CLAUDE.md) — padrão técnico do projeto (stack, estrutura, convenções,
  deploy, exceções ao padrão oficial da empresa)
- [`docs/DRF.md`](./docs/DRF.md) — Documento de Requisitos Funcionais (80 requisitos
  funcionais + 6 transversais)
- [`docs/PLANO_MORADIA_TERRITORIO_POPULAR.md`](./docs/PLANO_MORADIA_TERRITORIO_POPULAR.md) —
  plano da dimensão Moradia (5 eixos: segurança da posse, HIS/MCMV, regime de ocupação,
  inadequação habitacional, tipologias populares)
- [`docs/PLANO_QUALIDADE_FORNECIMENTO_BDGD.md`](./docs/PLANO_QUALIDADE_FORNECIMENTO_BDGD.md) —
  plano da dimensão Qualidade de Fornecimento de Energia (FIC/DIC via BDGD/ANEEL)

---

## Como rodar localmente

```bash
git clone https://github.com/clauber2024/polis.git
cd polis

# Banco de dados (PostgreSQL + PostGIS)
docker compose up -d postgres

# Ambiente Python para o ETL (criar uma vez)
python3 -m venv backend/src/etl/venv
source backend/src/etl/venv/bin/activate
pip install pandas geopandas sqlalchemy psycopg2-binary requests google-cloud-bigquery

# Rodar as migrations (em ordem numérica, dentro de backend/src/db/migrations/)
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0000_criacao_tabelas.sql
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0001_extensoes_e_indices_espaciais.sql
# ... seguir numeração até a migration mais recente

# Popular o território (requer shapefile do IBGE — ver LEIA-ME do script)
python3 backend/src/etl/loaders/seed_municipios.py

# Popular os indicadores (cada extractor e independente)
python3 backend/src/etl/loaders/extrair_mmgd_aneel.py
python3 backend/src/etl/loaders/extrair_infraestrutura_censo.py
python3 backend/src/etl/loaders/extrair_renda_trabalho_rais.py            # requer autenticacao gcloud
python3 backend/src/etl/loaders/extrair_alfabetizacao_censo.py
python3 backend/src/etl/loaders/extrair_capital_humano_mortalidade_infantil.py  # requer autenticacao gcloud
python3 backend/src/etl/loaders/extrair_moradia_censo.py
python3 backend/src/etl/loaders/extrair_inadequacao_moradia.py
python3 backend/src/etl/loaders/extrair_mcmv_fgts.py
python3 backend/src/etl/loaders/extrair_mcmv_ogu.py
python3 backend/src/etl/loaders/seed_favelas_fcu.py
python3 backend/src/etl/loaders/extrair_favelas_fcu.py
python3 backend/src/etl/loaders/seed_zeis_sao_paulo.py
python3 backend/src/etl/loaders/seed_zeis_recife.py
python3 backend/src/etl/loaders/seed_zeis_rio_branco.py
python3 backend/src/etl/loaders/seed_aeis_rio.py
python3 backend/src/etl/loaders/extrair_irradiacao_solar_inpe.py          # requer baixar CSV do INPE antes, ver ARQUITETURA.md

# Qualidade de Fornecimento (INDQUAL/ANEEL) - schema e ETL fora do padrao loaders/,
# ver nota em CLAUDE.md secao 2. Requer aplicar schema_qualidade.sql manualmente antes:
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/etl/schema_qualidade.sql
python3 backend/src/etl/etl_indqual.py
# Depois aplicar a migration da view DEC/FEC "real":
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0011_qualidade_dec_fec_real.sql
```

O backend/frontend ainda não foram implementados nesta fase do projeto — o trabalho até aqui
se concentrou em construir e validar a camada de dados (schema + ETL).

Para a etapa de RAIS via BigQuery, é necessária autenticação prévia:
```bash
gcloud auth application-default login --no-launch-browser
gcloud auth application-default set-quota-project <seu-projeto-gcp>
```

Ver `CLAUDE.md` para a lista completa de comandos do Makefile (planejados, ainda não todos
implementados).

---

## Acesso de demonstração

Em ambiente de prototipagem, todos os perfis usam a senha `123456`. Ver a tela de login para a
lista completa de e-mails de demonstração por perfil.

⚠️ Credenciais de demonstração nunca devem ser usadas em ambiente de produção.

---

## Licença

A definir.
