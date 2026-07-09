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

## Estado atual dos dados (atualizado em 08/07/2026)

| Dimensão | Cobertura | Fonte | Status |
|---|---|---|---|
| Território (municípios) | 5.573 municípios, geometria real | IBGE, Malha Municipal 2025 | ✅ Completo |
| MMGD instalada | 5.567 municípios, 50.086 MW, 8M UCs (quebra Residencial persistida em `mmgd_indicadores` desde a migration 0020, 07/07/2026 — Rural/Outras seguem disponíveis só via Parquet bruto) | ANEEL, snapshot jun/2026 | ✅ Completo |
| Infraestrutura Urbana | 5.570 municípios, 5 indicadores + índice composto (Índice de Precariedade de Infraestrutura) | Censo 2022/SIDRA | ✅ Completo |
| Renda e Trabalho | 5.571 municípios (RAIS) + RDPC — Rendimento Domiciliar Per Capita, 5.570 municípios (renda de todas as fontes, não só trabalho formal) | RAIS ano-base 2024 (BigQuery) + Censo 2022/SIDRA 10295-10296 | ✅ Completo |
| Capital Humano | 5.570 municípios (alfabetização + mortalidade infantil) + CadÚnico (cobertura e % pobreza, 5.570 municípios, dez/2025) | Censo 2022/SIDRA + SIM/SINASC-DATASUS (BigQuery, média 2022-2024) + MDS/SAGI (Solr "MI Social") | ✅ Completo |
| Moradia | Regime de ocupação (5.570) + FCU (12.348) + ZEIS/AEIS (3.696, 4 capitais) + inadequação + MCMV/FGTS (5.111) + MCMV/OGU (4.883) + % tipo apartamento (5.570) + índices compostos (Precariedade Habitacional, Segurança da Posse, Cobertura de Investimento Habitacional) | Censo 2022/SIDRA + Ministério das Cidades + portais municipais | ✅ Completo |
| Qualidade de fornecimento | 5.570 municípios, DEC/FEC oficial + DEC/FEC "real" (sem expurgo de Dia Crítico) | ANEEL, Indicadores Coletivos de Continuidade (INDQUAL) | ✅ Completo |
| Irradiação solar | 5.569 municípios, GHI médio anual (média climatológica 1999-2015) | Atlas Brasileiro de Energia Solar (LABREN/CCST/INPE, 2ª ed. 2017) | ✅ Completo |
| Tarifa de Energia Residencial | 4.724/5.540 municípios (TUSD+TE), 116 distribuidoras | ANEEL, Tarifas de Aplicação das Distribuidoras | ✅ Completo — variável de interesse regional (Centro-Oeste), não indicador nacional robusto (ver ARQUITETURA.md) |
| IVS Consolidado (índice próprio) | ~5.571 municípios, média de 3 blocos (Infraestrutura, Renda e Trabalho, Capital Humano) | `vw_ivs_consolidado`, normalização min-max sobre dados já carregados | ✅ Completo |
| Precipitação máxima mensal (`indicadores_climaticos`) | 5.573 municípios x 24 meses (jan/2024–dez/2025), máximo zonal (não comparável ao pico de 1 estação) | MERGE/CPTEC-INPE (GPM-IMERG V07B), migration 0019 | ✅ Completo — 9ª dimensão, fora das 8 originais do DRF, nascida da investigação "Queima de equipamentos" (ver ARQUITETURA.md) |
| TSEE / baixa renda (`percentual_tsee`) | — | ANEEL, Beneficiários da CDE | 🔒 Bloqueado — aguardando dado de jan/2026+ (nova subclasse "Desconto Social") e resolução de bug de infraestrutura no portal ANEEL |

Os índices de Infraestrutura Urbana, Renda e Trabalho, Capital Humano, Moradia e o IVS
Consolidado são **construções próprias do Atlas, inspiradas no IVS/IPEA**, não o IVS
oficial — que só tem cobertura municipal completa até o Censo 2010. Ver nota metodológica
em cada extractor (`backend/src/etl/loaders/`) e em `ARQUITETURA.md`, seção "Índices
compostos e metodologia de cruzamentos".

### Análise exploratória: cruzamento MMGD x indicadores sociais

Scripts em `backend/src/etl/analises/` (somente leitura, não fazem parte da carga de
dados) testam a correlação entre adoção de MMGD residencial per capita e os indicadores
sociais acima (Spearman + parcial controlando renda, com sensibilidade por região e
urbanização). Ver `ARQUITETURA.md`, seção "Análise de correlação MMGD x Indicadores
Sociais", para a metodologia completa e o histórico de hipóteses testadas nos dois casos
regionais que mais destoaram do padrão nacional (Segurança da Posse no Sul — caso
encerrado após 6 hipóteses descartadas; Irradiação Solar no Centro-Oeste — parcialmente
explicado por tarifa histórica mais baixa da distribuidora local).

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
| MDS/SAGI ("MI Social") | CadÚnico — cobertura e % pobreza (Capital Humano) | API Solr pública (aplicacoes.mds.gov.br/sagi/servicos/misocial) |
| IBGE Censo 2022/SIDRA (tabelas 10295, 10296) | RDPC — Rendimento Domiciliar Per Capita e % baixa renda | API SIDRA |
| IBGE Censo 2022/SIDRA (tabela 9928) | % Tipo de domicílio Apartamento (Moradia) | API SIDRA |
| ANEEL — Tarifas de Aplicação das Distribuidoras | Tarifa de Energia Residencial (TUSD+TE) | CSV, atualizado semanalmente (dadosabertos.aneel.gov.br) |
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

- **Backend:** Node.js 20+, TypeScript, Express, Drizzle ORM (1 endpoint real desde 07/07/2026 — `GET /api/vazios-de-acesso`; demais rotas do DRF ainda não implementadas)
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
- [`docs/backend/`](./docs/backend/README.md) — biblioteca de receitas práticas do
  backend (ETL Python, API Express, schema PostGIS/Drizzle), formato inspirado no
  Claude Cookbook oficial da Anthropic

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
python3 backend/src/etl/loaders/extrair_cadunico.py
python3 backend/src/etl/loaders/extrair_tipo_domicilio_censo.py           # requer migration 0016 aplicada antes
python3 backend/src/etl/loaders/extrair_rdpc_censo.py                     # requer migration 0017 aplicada antes
python3 backend/src/etl/loaders/extrair_tarifa_distribuidoras.py          # requer migration 0018 aplicada antes

# Qualidade de Fornecimento (INDQUAL/ANEEL) - schema e ETL fora do padrao loaders/,
# ver nota em CLAUDE.md secao 2. Requer aplicar schema_qualidade.sql manualmente antes:
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/etl/schema_qualidade.sql
python3 backend/src/etl/etl_indqual.py
# Depois aplicar as migrations que dependem do INDQUAL/indicadores consolidados ja carregados
# (rodar em ordem numerica, 0011 a 0018 - ver backend/src/db/migrations/):
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0011_qualidade_dec_fec_real.sql
# ... seguir numeracao ate 0018_indicadores_sociais_tarifa_residencial.sql

# Analise exploratoria (opcional, so leitura - nao faz parte da carga de dados,
# requer scipy: pip install scipy --break-system-packages, ver ARQUITETURA.md):
python3 backend/src/etl/analises/analisar_correlacao_mmgd_renda.py

# migration 0019 (indicadores_climaticos - precipitacao maxima mensal, MERGE/CPTEC-INPE,
# primeiro indicador climatico formal do Atlas, ver ARQUITETURA.md "RESULTADO FINAL -
# COBERTURA NACIONAL") + extractor formal, que reusa a logica ja validada em
# analises/escalar_merge_precipitacao_nacional.py. Requer cfgrib, xarray, eccodes,
# rasterstats (pip install, sem conda - ver docstring do script). Idempotente com
# checkpoint por mes no banco (roda de novo pula meses ja completos); rodada inicial
# completa (2024-2025, todos os municipios) pode levar cerca de 1h:
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0019_criacao_indicadores_climaticos.sql
python3 backend/src/etl/loaders/extrair_precipitacao_mensal_merge.py

# migration 0020 (persiste a quebra MMGD Residencial - necessaria para o
# endpoint de Vazios de Acesso abaixo) + re-executar o extractor de MMGD:
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0020_mmgd_indicadores_residencial.sql
python3 backend/src/etl/loaders/extrair_mmgd_aneel.py

# migration 0022 (tabela usuarios - fundacao de autenticacao/RBAC, 3 papeis:
# Publico sem login, Colaborador, Administrador - ver CLAUDE.md "Fundacao de
# autenticacao/RBAC"). Ja semeia as 2 contas de demonstracao (ver secao
# "Acesso de demonstracao" abaixo), idempotente via ON CONFLICT:
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0022_criacao_usuarios_auth.sql

# migration 0023 (escrita do Colaborador - RF-059 a RF-067) e 0024 (Painel
# Admin - RF-070 a RF-077 + usuarios.ativo). Ver CLAUDE.md "Endpoints de
# escrita do Colaborador e Painel Admin":
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0023_colaborador_escrita.sql
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0024_admin_escrita.sql
```

### Backend (Node/Express)

```bash
cd backend
cp .env.example .env   # ajuste DATABASE_URL e defina JWT_SECRET se necessario
npm install
npm run dev             # http://localhost:3000 - GET /health, GET /api/vazios-de-acesso,
                         # GET /api/municipios, GET /api/bases-de-dados,
                         # POST /api/auth/login, POST /api/auth/logout
```

Testar o login (requer migration 0022 aplicada):
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@atlassolarjusto.dev","senha":"123456"}'
```

Testar escrita do Colaborador/Admin (requer migrations 0023/0024 aplicadas — guarde o
`token` retornado pelo login acima em `$TOKEN`):
```bash
TOKEN="<token retornado pelo login>"

# RF-059/060 — status de revisão + observação (Colaborador ou Admin)
curl http://localhost:3000/api/bases-de-dados/revisoes
curl -X PUT http://localhost:3000/api/bases-de-dados/aneel/revisao \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"validado"}'
curl -X POST http://localhost:3000/api/bases-de-dados/aneel/observacoes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mensagem":"Teste de observação"}'

# RF-076 — gestão de usuários (só Administrador)
curl http://localhost:3000/api/admin/usuarios -H "Authorization: Bearer $TOKEN"
```

Testar com token do papel Colaborador em uma rota só-Admin (ex: `GET /api/admin/usuarios`)
deve retornar `403`.

Requer a migration 0020 aplicada e `extrair_mmgd_aneel.py` executado (ver acima) para o
endpoint `GET /api/vazios-de-acesso` refletir os numeros ja validados em ARQUITETURA.md
(secao "Identificacao e ranking de Vazios de Acesso") — sem isso, municipios com snapshot
de MMGD anterior a migration 0020 ficam fora da classificacao (ver campo
`avisos.totalPrecisaReextrairMmgd` na resposta).

### Frontend (React + Vite)

Iniciado em 09/07/2026 — mapa interativo (MapLibre GL) com choropleth de indicadores por
município (RF-016/017) e destaque do quadrante Vazio de Acesso (RF-055/056), consumindo
os endpoints de leitura do backend. Requer o backend rodando na porta 3000 (o Vite faz
proxy de `/api` — ver `frontend/vite.config.ts`).

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
npm run typecheck       # tsc -b
npm run build           # tsc -b && vite build
```

Telas de login/painéis (Colaborador/Admin), landing page e painel analítico ainda não
existem no frontend. O backend tem endpoints de leitura (`vazios-de-acesso`,
`municipios`, `bases-de-dados`, exports), autenticação/RBAC (`POST /api/auth/login`/
`logout`, 3 papéis) e escrita do Colaborador/Admin (RF-059 a RF-077 — revisão de bases,
observações, sugestões, notas metodológicas, materiais de comunicação, metadados
técnicos, aprovação de indicadores, versionamento, gestão de usuários). Upload de
arquivo real (RF-070) não foi implementado — decisão do projeto foi manter a carga de
dado só via ETL Python, com a API cobrindo apenas o workflow/status.

Para a etapa de RAIS via BigQuery, é necessária autenticação prévia:
```bash
gcloud auth application-default login --no-launch-browser
gcloud auth application-default set-quota-project <seu-projeto-gcp>
```

Desde 09/07/2026 há um `Makefile` na raiz do projeto com os comandos de desenvolvimento
acima já empacotados: `make up`, `make down`, `make db`, `make migrate`, `make seed`,
`make etl`, `make etl-source SOURCE=<nome>`, `make fresh`, `make dev`, `make typecheck`,
`make build`, `make front`, `make front-typecheck`, `make front-build`. Ver `CLAUDE.md`,
Seção 7, para o detalhe de cada um e para os comandos de deploy/produção que continuam
só especificação (`up-prod`, `deploy*`, `shell`, `lint`).

---

## Acesso de demonstração

O papel Público não autentica (ver CLAUDE.md, DRF.md Seção 2). As 2 contas autenticadas,
semeadas pela migration 0022, usam a senha `123456` (RT-003 do DRF):

| Papel | E-mail |
|---|---|
| Colaborador | `colaborador@atlassolarjusto.dev` |
| Administrador | `admin@atlassolarjusto.dev` |

Não há tela de login ainda (frontend não implementado) — testar via `POST /api/auth/login`
(ver exemplo `curl` acima).

⚠️ Credenciais de demonstração nunca devem ser usadas em ambiente de produção.

---

## Licença

A definir.
