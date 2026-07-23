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

## Estado atual dos dados (atualizado em 23/07/2026)

| Dimensão | Cobertura | Fonte | Status |
|---|---|---|---|
| Território (municípios) | 5.573 municípios, geometria real | IBGE, Malha Municipal 2025 | ✅ Completo |
| MMGD instalada | 5.567 municípios, 50.086 MW, 8M UCs (quebra Residencial persistida em `mmgd_indicadores` desde a migration 0020 — Rural/Outras seguem disponíveis só via Parquet bruto); `numero_empreendimentos` (migration 0025) criado mas ainda `NULL` até o extractor rodar de novo | ANEEL, snapshot único jun/2026 | ✅ Completo para o snapshot atual — ⚠️ só 1 `periodo_referencia` carregado (schema já suporta série temporal, mas nunca foi reexecutado com um mês diferente; bloqueia filtro de período e ranking por variação) |
| Infraestrutura Urbana | 5.570 municípios, 5 indicadores + índice composto (Índice de Precariedade de Infraestrutura) | Censo 2022/SIDRA | ✅ Completo |
| Renda e Trabalho | 5.571 municípios (RAIS) + RDPC — Rendimento Domiciliar Per Capita, 5.570 municípios (renda de todas as fontes, não só trabalho formal) | RAIS ano-base 2024 (BigQuery) + Censo 2022/SIDRA 10295-10296 | ✅ Completo |
| Capital Humano | 5.570 municípios (alfabetização + mortalidade infantil) + CadÚnico (cobertura e % pobreza, 5.570 municípios, dez/2025) | Censo 2022/SIDRA + SIM/SINASC-DATASUS (BigQuery, média 2022-2024) + MDS/SAGI (Solr "MI Social") | ✅ Completo |
| Moradia | Regime de ocupação (5.570) + FCU (12.348) + ZEIS/AEIS (**4.778 em 8 municípios**: RJ, SP, Recife, Rio Branco, Contagem, Salvador, Fortaleza, Belo Horizonte) + inadequação + MCMV/FGTS (5.111) + MCMV/OGU (4.883) + % tipo apartamento (5.570) + Reforma Casa Brasil Solar (1.093 municípios, 3.253 contratos, R$ 61.377.571,09 liberados, migration 0027) + índices compostos (Precariedade Habitacional, Segurança da Posse, Cobertura de Investimento Habitacional, e o novo **IVSH** — ver abaixo) | Censo 2022/SIDRA + Ministério das Cidades + portais municipais + Caixa/SIC (extrato pontual, não pública) | ✅ Completo — 2 dos 5 eixos do plano original seguem sem fonte nacional (ZEIS fora das 8 capitais/municípios já cobertos; MCMV/HIS além do já carregado) e inadequação habitacional completa só existe para o Censo 2010, não recalculada para 2022 (ver `docs/PLANO_MORADIA_TERRITORIO_POPULAR.md`) |
| Qualidade de fornecimento | 5.570 municípios, DEC/FEC oficial + DEC/FEC "real" (sem expurgo de Dia Crítico) + ranking público de 52 distribuidoras por desempenho de conexão MMGD (`desempenho_conexao_distribuidoras`, migration 0026) | ANEEL, Indicadores Coletivos de Continuidade (INDQUAL) + Atendimento a pedidos de conexão MMGD | ✅ Completo |
| Irradiação solar | 5.569 municípios, GHI médio anual (média climatológica 1999-2015) | Atlas Brasileiro de Energia Solar (LABREN/CCST/INPE, 2ª ed. 2017) | ✅ Completo |
| Tarifa de Energia Residencial | 4.724/5.540 municípios (TUSD+TE), 116 distribuidoras | ANEEL, Tarifas de Aplicação das Distribuidoras | ✅ Completo — variável de interesse regional (Centro-Oeste), não indicador nacional robusto (ver ARQUITETURA.md) |
| IVS Consolidado (índice próprio) | ~5.571 municípios, média de 3 blocos (Infraestrutura, Renda e Trabalho, Capital Humano) | `vw_ivs_consolidado`, normalização min-max sobre dados já carregados | ✅ Completo |
| IVSH — Índice de Vulnerabilidade Sócio-Habitacional-Energética (índice próprio, novo) | 5.573 municípios, média de IVS + Precariedade Habitacional + Insegurança da Posse | `vw_ivsh_consolidado`, migration 0028 (18/07/2026) | ✅ Completo na API (`GET /api/vazios-de-acesso?ordenarPor=ivsh`) — ⚠️ sem seletor de critério na interface ainda (só backend) |
| Infraestrutura estatística integrada (análises formais, novo) | 2 pares variável-x/variável-y testados: Precariedade Habitacional (rho parcial −0,1524, robusto em 4/5 regiões) e Segurança da Posse (rho parcial −0,2976, sinal invertido, não investigado a fundo) vs. MMGD residencial per capita | `analises_estatisticas`, migration 0029 (18/07/2026), correlação parcial de Spearman materializada via ETL | ✅ Completo — `GET /api/analises-estatisticas` |
| Participação da MMGD na matriz elétrica nacional (novo) | 5 anos (2021-2025), `geracao_eletrica_nacional_gwh` completo; percentual calculado para 2025 (~7,02%) bate com o número já citado pela EPE (7,0%) | EPE — BEN Anexo X (denominador) + PDGD (numerador), migration 0030 (21-22/07/2026) | ✅ Completo para "participação na geração nacional" — ⚠️ `percentual_consumo_cativo_atendido_mmgd` (métrica distinta, ver ARQUITETURA.md) ainda vazio: extractor do numerador PDGD pendente de um segundo arquivo a baixar manualmente |
| Precipitação máxima mensal (`indicadores_climaticos`) | 5.573 municípios x 24 meses (jan/2024–dez/2025), máximo zonal (não comparável ao pico de 1 estação) | MERGE/CPTEC-INPE (GPM-IMERG V07B), migration 0019 | ✅ Completo — 9ª dimensão, fora das 8 originais do DRF, nascida da investigação "Queima de equipamentos" (ver ARQUITETURA.md) |
| TSEE / baixa renda (`percentual_tsee`) | — | ANEEL, Beneficiários da CDE | 🔒 Bloqueado — aguardando dado de jan/2026+ (nova subclasse "Desconto Social") e resolução de bug de infraestrutura no portal ANEEL (redirecionamento HTTP 302 infinito no único recurso disponível) |

Os índices de Infraestrutura Urbana, Renda e Trabalho, Capital Humano, Moradia, o IVS
Consolidado e o IVSH são **construções próprias do Atlas, inspiradas no IVS/IPEA**, não o
IVS oficial — que só tem cobertura municipal completa até o Censo 2010. Ver nota
metodológica em cada extractor (`backend/src/etl/loaders/`) e em `ARQUITETURA.md`, seção
"Índices compostos e metodologia de cruzamentos".

O piloto de setor censitário de São Paulo (migration 0021, 81 setores) é **dado
ilustrativo/sintético** — distribui o total municipal real proporcionalmente por área numa
grade artificial, não é leitura fina real do Censo. Corretamente isolado
(`e_dado_ilustrativo = 'true'`, filtro `tipo = 'municipio'` em todos os agregados
nacionais), mas é a única cobertura de "setor censitário" hoje no país inteiro.

### Deploy público temporário

Backend + Postgres na Railway e frontend na Vercel — ponte temporária (não a arquitetura
de produção definitiva descrita no CLAUDE.md), pensada para transferência de posse ao
Instituto Pólis. Ver [`docs/DEPLOY_TEMPORARIO.md`](./docs/DEPLOY_TEMPORARIO.md) para o
passo a passo e `docs/DECISOES.md` para o raciocínio.

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
| ANEEL — Atendimento a pedidos de conexão MMGD (pós Lei 14.300) | Ranking público de distribuidoras por desempenho de conexão | CSV (dadosabertos.aneel.gov.br) |
| Caixa Econômica Federal / SIC | Reforma Casa Brasil Solar (Moradia) — extrato pontual, não pública | PDF fornecido pelo usuário (não automatizável) |
| EPE — Balanço Energético Nacional (BEN), Anexo X | Geração elétrica nacional bruta (denominador da participação da MMGD na matriz) | Dashboard interativo, sem API — download manual |
| EPE — Painel de Dados de MMGD (PDGD) | Geração da MMGD e % do consumo cativo atendido (numerador) | App Shiny, sem API/URL estável — download manual |

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

- **Backend:** Node.js 20+, TypeScript, Express, Drizzle ORM — leitura (municípios, bases de
  dados, estatísticas nacionais, estados, ranking de distribuidoras, análises estatísticas,
  vazios de acesso), autenticação/RBAC (3 papéis) e escrita do Colaborador/Admin (RF-059 a
  RF-077) implementadas; upload de arquivo real (RF-070) não implementado por decisão do
  projeto (carga de dado continua só via ETL Python)
- **Banco de dados:** PostgreSQL 16 + PostGIS 3.4 (SIRGAS 2000 / EPSG:4674)
- **ETL:** Python 3.12+ (venv isolado), pandas, geopandas, SQLAlchemy, google-cloud-bigquery
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, MapLibre GL JS — landing page,
  mapa interativo (choropleth + heatmap), painéis Colaborador/Admin, painel analítico e
  ranking de distribuidoras implementados (iniciado 09/07/2026)
- **Infraestrutura:** Docker, Docker Compose (PostGIS local), Google Cloud/BigQuery (RAIS);
  deploy público temporário em Railway (backend+Postgres) + Vercel (frontend) — ver
  [`docs/DEPLOY_TEMPORARIO.md`](./docs/DEPLOY_TEMPORARIO.md)

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

# migration 0025 (numero_empreendimentos em mmgd_indicadores) + reexecutar o
# extractor de MMGD, 0026 (ranking publico de distribuidoras) + extractor
# proprio, 0027 (Reforma Casa Brasil Solar - requer PDF fornecido pelo
# usuario, nao publico), 0028 (view IVSH), 0029 (analises_estatisticas) e
# 0030 (indicadores_energia_nacional - EPE/BEN+PDGD, requer download manual):
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0025_mmgd_indicadores_numero_empreendimentos.sql
python3 backend/src/etl/loaders/extrair_mmgd_aneel.py
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0026_desempenho_conexao_distribuidoras.sql
python3 backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0027_indicadores_sociais_reforma_casa_brasil_solar.sql
python3 backend/src/etl/loaders/extrair_reforma_casa_brasil_solar.py   # requer PDF em BASE_DOWNLOADS
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0028_view_ivsh_consolidado.sql
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0029_analises_estatisticas.sql
python3 backend/src/etl/loaders/calcular_analise_estatistica_moradia_mmgd.py
docker compose exec -T postgres psql -U atlas -d atlas_solar_justo < backend/src/db/migrations/0030_indicadores_energia_nacional.sql
python3 backend/src/etl/loaders/extrair_geracao_eletrica_nacional_epe.py   # requer download manual do BEN
python3 backend/src/etl/loaders/extrair_geracao_mmgd_epe_pdgd.py           # requer download manual do PDGD
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

Login (`/login`) e painéis Colaborador (`/colaborador`) e Admin (`/admin`) implementados
em 10/07/2026, consumindo a auth e a escrita do Colaborador/Admin já existentes no
backend — sessão em Context + `localStorage` (`AuthContext.tsx`), rotas protegidas por
papel (`RotaProtegida.tsx`). Landing page ainda não existe. O backend tem endpoints de
leitura (`vazios-de-acesso`, `municipios`, `bases-de-dados`, exports), autenticação/RBAC
(`POST /api/auth/login`/`logout`, 3 papéis) e escrita do Colaborador/Admin (RF-059 a
RF-077 — revisão de bases, observações, sugestões, notas metodológicas, materiais de
comunicação, metadados técnicos, aprovação de indicadores, versionamento, gestão de
usuários), todos agora também consumidos pela interface. Upload de arquivo real
(RF-070) não foi implementado — decisão do projeto foi manter a carga de dado só via
ETL Python, com a API cobrindo apenas o workflow/status.

Validado no ambiente do usuário em 10/07/2026 (`make front-typecheck` limpo + teste
manual: login com as 2 contas de demonstração abaixo, escrita em cada seção do painel,
e RBAC — Colaborador não enxerga o link "Painel Admin" nem acessa `/admin`).

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
