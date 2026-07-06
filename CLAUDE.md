## Checagem obrigatória de sincronização (início de toda sessão)

ANTES de qualquer outra ação nesta sessão (ler arquivos, propor mudanças,
rodar migrations, etc.), rode SEMPRE:

```bash
git fetch origin
git log HEAD..origin/main --oneline
```

Se aparecer QUALQUER commit remoto que não está local, PARE e informe o
usuário antes de prosseguir — não presuma que o estado local reflete o
estado real do projeto. Este projeto é trabalhado em múltiplas sessões
paralelas (Claude Code + conversas normais), e divergências não detectadas
cedo já causaram retrabalho de reconciliação (ver histórico de commits
04-06/07/2026).

# 🚀 Project Standard — Atlas Solar Justo
### Exceção documentada ao Official Project Standard da empresa

> Revisado em 04/07/2026. Esta versao corrige divergencias entre o padrao
> originalmente escrito e a pratica real do projeto, identificadas apos
> varias sessoes de implementacao da camada de dados. Onde o padrao
> original descrevia algo nunca implementado (Makefile, deploy completo),
> isso foi marcado como **PLANEJADO**, nao removido - mantem-se a intencao
> para quando o projeto avancar ao backend/frontend.

---

## 0️⃣ Justificativa da Exceção

O "Official Project Standard" da empresa assume stack Laravel + PHP + MySQL, pensada para
SaaS convencionais (CRUD, multi-tenant, dashboards administrativos). O Atlas Solar Justo é
um WebGIS analítico que depende de:

- **Dados geoespaciais nativos** (geometrias, índices GiST, projeção SIRGAS 2000 / EPSG:4674)
  — recurso central do PostGIS, sem equivalente robusto no MySQL.
- **ETL Python** para extração de fontes governamentais (ANEEL, IBGE/SIDRA, RAIS via
  BigQuery), com scripts isolados por fonte.
- **Backend Node.js/Express + Drizzle ORM (TypeScript)** — schema e migrations já
  implementados; rotas/controllers ainda **NÃO implementados** (ver Estado Real do
  Projeto, abaixo).

Por isso, esta é uma exceção justificada e documentada, nos termos previstos pelo próprio
Official Project Standard ("seguido em todos os projetos, salvo exceção justificada e
documentada"). Tudo que é **agnóstico de stack** no padrão oficial (CLAUDE.md, padrão de Git,
checklist de produção, regra de timezone, idempotência, tratamento de erro/modal) é mantido
como diretriz. O que muda é exclusivamente o que depende de Laravel/PHP/MySQL.

---

## Estado Real do Projeto (atualizado em 04/07/2026)

**Implementado e validado com dados reais:**
- Schema do banco: `municipios`, `unidades_espaciais`, `mmgd_indicadores`,
  `indicadores_sociais`, `irradiacao_solar` via Drizzle (`backend/src/db/schema/`) +
  tabelas `qualidade_conjuntos`, `qualidade_indicadores`, `qualidade_conjunto_municipio`
  criadas FORA do Drizzle, via `backend/src/etl/schema_qualidade.sql` (ver nota de
  inconsistencia arquitetural na Secao 2)
- Migrations incrementais 0000 a 0017 - ver `backend/src/db/migrations/`. Numeracao
  formal NAO cobre o schema de qualidade (criado fora do sistema de migrations ate a
  migration 0011, que so adiciona as views DEC/FEC "real" em cima do schema ja existente).
  0014-0017: indices compostos + views consolidadas (`vw_indicadores_sociais_consolidado`,
  `vw_indices_compostos_moradia_infraestrutura`), IVS (`vw_ivs_consolidado`),
  `percentual_apartamento` - ver ARQUITETURA.md, secao "Analise de correlacao MMGD x
  Indicadores Sociais" (06/07/2026) - e RDPC (`renda_per_capita_rdpc`,
  `percentual_baixa_renda_rdpc`, migration 0017), achado colateral da investigacao de
  onus excessivo com aluguel, ver ARQUITETURA.md secao "Decisoes de fontes" (06/07/2026).
- 18 extractors Python funcionais em `backend/src/etl/loaders/` (territorio, MMGD/ANEEL,
  Infraestrutura Urbana/Censo, Renda e Trabalho/RAIS via BigQuery, Alfabetizacao/Censo,
  Mortalidade Infantil/SIM+SINASC via BigQuery, Moradia/Censo, Tipo de Domicilio/Censo,
  RDPC/Censo, Inadequacao Habitacional, MCMV/FGTS, MCMV/OGU, Favelas/FCU (seed + extract),
  ZEIS/AEIS por capital - SP, Recife, Rio Branco, Rio de Janeiro -, Irradiacao Solar/INPE)
  + 2 scripts fora do padrao `loaders/`: `backend/src/etl/etl_indqual.py` e
  `backend/src/etl/schema_qualidade.sql` (Qualidade de Fornecimento/ANEEL - ver nota na
  Secao 2)
- Banco PostgreSQL+PostGIS local via `docker-compose.yml`, sem variante de producao ainda
- Todas as 8 dimensoes de dados planejadas no DRF estao completas: Territorio, MMGD,
  Infraestrutura Urbana, Renda e Trabalho, Moradia, Qualidade de Fornecimento, Capital
  Humano, Irradiacao Solar. Unico indicador pendente por bloqueio externo (nao por falta
  de trabalho): `percentual_tsee` (Beneficiarios da CDE/ANEEL), aguardando dado de
  jan/2026+ com a nova subclasse "Residencial Desconto Social" - ver ARQUITETURA.md.

**NAO implementado ainda** (apesar de descrito em secoes deste documento como padrao):
- Backend Node/Express (rotas, controllers, services, autenticacao JWT) - so o schema existe
- Frontend React - nao iniciado
- Makefile - nao existe; todos os comandos deste documento (`make up`, `make etl`, etc.)
  sao **especificacao para quando o backend for construido**, nao comandos reais hoje
- Deploy/producao (Nginx, certbot, scheduler, `docker-compose.prod.yml`) - arquitetura
  especificada mas nunca implementada nem testada
- Autenticacao, 6 personas, RBAC - existem so no DRF como requisito, sem codigo
- Cruzamento MMGD x indicadores sociais (identificacao de "vazios de acesso") - proximo
  item da fila de trabalho, ver ARQUITETURA.md

**Como rodar o que existe hoje:** ver `README.md`, secao "Como rodar localmente" - e
execucao direta de scripts Python (`python3 backend/src/etl/loaders/extrair_X.py`), nao via
Makefile.

---

## 1️⃣ Stack Oficial do Projeto

### 🔹 Backend (schema implementado; rotas/controllers PLANEJADOS)
- Node.js 20+ (LTS)
- TypeScript 5+
- Express
- Drizzle ORM
- PostgreSQL 16 + PostGIS 3.4
- JWT (autenticação) — PLANEJADO, não implementado
- REST JSON API — PLANEJADO, não implementado

### 🔹 ETL (implementado)
- Python 3.12+
- Ambiente isolado via `venv` (`backend/src/etl/venv/`) — **não usar Anaconda/conda
  neste projeto**: já causou conflitos sérios de NumPy 1.x/2.x em sessões anteriores
- Bibliotecas reais em uso: `pandas`, `geopandas`, `sqlalchemy`, `psycopg2-binary`,
  `requests`, `google-cloud-bigquery`, `db-dtypes` (extractors, `backend/src/etl/loaders/`);
  `scipy` (só `backend/src/etl/analises/`, scripts de análise estatística - Spearman/
  correlação parcial, não usado nos extractors de carga)
- Execução direta via `python3 backend/src/etl/loaders/<script>.py` (sem container
  dedicado ainda — PLANEJADO ter um serviço `etl` no Docker Compose quando o projeto
  amadurecer)
- Logging via `print()` estruturado nos scripts atuais — `loguru` é a meta declarada,
  ainda não adotada na prática

### 🔹 Frontend (não iniciado)
- React 19
- TypeScript 5+
- Vite
- Tailwind CSS
- React Router
- **MapLibre GL JS** — decisão já tomada (não Leaflet): WebGL lida melhor com os ~5.570
  municípios simultâneos e com a sobreposição choropleth+heatmap exigida pelo DRF
  (RF-017, RF-022, RF-024)

### 🔹 Infraestrutura
- Docker + Docker Compose (implementado: `postgres` local)
- Google Cloud + BigQuery (implementado: autenticação via `gcloud auth
  application-default login`, usado pelo extractor de RAIS)
- Nginx, Cloudflare, certbot — PLANEJADOS, parte da arquitetura de deploy ainda não
  construída
- Git (implementado)
- Makefile — PLANEJADO, não existe ainda

---

## 2️⃣ Estrutura Real do Projeto

```
/
├── backend/
│   └── src/
│       ├── db/
│       │   ├── schema/            (Drizzle schema - IMPLEMENTADO)
│       │   │   ├── municipios.ts
│       │   │   ├── unidades_espaciais.ts
│       │   │   ├── mmgd_indicadores.ts
│       │   │   ├── indicadores_sociais.ts
│       │   │   ├── irradiacao_solar.ts
│       │   │   └── index.ts
│       │   └── migrations/        (SQL incremental - IMPLEMENTADO, 0000 a 0017)
│       │       ├── 0000_criacao_tabelas.sql
│       │       ├── 0001_extensoes_e_indices_espaciais.sql
│       │       ├── ... (0002 a 0010: infraestrutura, renda, capital humano,
│       │       │        moradia, inadequacao, favelas, unidades_espaciais tipo,
│       │       │        mcmv/fgts, mcmv/ogu - ver pasta para lista completa)
│       │       ├── 0011_qualidade_dec_fec_real.sql
│       │       ├── 0012_capital_humano_mortalidade_infantil.sql
│       │       ├── 0013_capital_humano_cadunico.sql
│       │       ├── 0014_indices_compostos_moradia_infraestrutura.sql
│       │       ├── 0015_view_ivs_consolidado.sql
│       │       ├── 0016_indicadores_sociais_tipo_domicilio.sql
│       │       └── 0017_indicadores_sociais_rdpc.sql
│       └── etl/
│           ├── venv/               (ambiente Python isolado - nao versionado)
│           ├── data/raw/           (shapefiles/CSVs baixados - nao versionado,
│           │                        inclui inpe_atlas_solar_2017/, aneel_mmgd/,
│           │                        malha_municipal_2025/)
│           ├── schema_qualidade.sql   (FORA do padrao Drizzle - ver nota abaixo)
│           ├── etl_indqual.py         (FORA do padrao loaders/ - ver nota abaixo)
│           ├── analises/           (scripts de analise exploratoria, SOMENTE LEITURA,
│           │                        fora do padrao loaders/ de proposito - nao
│           │                        carregam dado, so consultam/diagnosticam. Ver
│           │                        ARQUITETURA.md, secao "Analise de correlacao MMGD
│           │                        x Indicadores Sociais", 06/07/2026)
│           │   ├── analisar_correlacao_mmgd_renda.py
│           │   ├── diagnosticar_outliers_regionais.py
│           │   ├── inspecionar_colunas_mmgd_parquet.py
│           │   ├── inspecionar_metadados_sidra_9928.py
│           │   ├── inspecionar_metadados_sidra_aluguel.py
│           │   └── inspecionar_metadados_sidra_rdpc.py
│           └── loaders/            (extractors - IMPLEMENTADO, 18 scripts)
│               ├── seed_municipios.py
│               ├── extrair_mmgd_aneel.py
│               ├── extrair_infraestrutura_censo.py
│               ├── extrair_renda_trabalho_rais.py
│               ├── extrair_alfabetizacao_censo.py
│               ├── extrair_capital_humano_mortalidade_infantil.py
│               ├── extrair_moradia_censo.py
│               ├── extrair_tipo_domicilio_censo.py
│               ├── extrair_rdpc_censo.py
│               ├── extrair_inadequacao_moradia.py
│               ├── extrair_mcmv_fgts.py
│               ├── extrair_mcmv_ogu.py
│               ├── extrair_cadunico.py
│               ├── seed_favelas_fcu.py
│               ├── extrair_favelas_fcu.py
│               ├── seed_zeis_sao_paulo.py
│               ├── seed_zeis_recife.py
│               ├── seed_zeis_rio_branco.py
│               ├── seed_aeis_rio.py
│               ├── extrair_irradiacao_solar_inpe.py
│               └── validar_aneel_real.py
├── frontend/                       (estrutura de pastas existe, vazia - NAO INICIADO)
│   ├── pages/
│   ├── components/
│   ├── services/
│   ├── hooks/
│   └── utils/
├── docker/                         (PLANEJADO - Dockerfiles de producao nao existem)
├── docs/
│   ├── DRF.md
│   ├── PLANO_MORADIA_TERRITORIO_POPULAR.md
│   └── PLANO_QUALIDADE_FORNECIMENTO_BDGD.md
├── ARQUITETURA.md                   (estado dos dados, decisoes de fonte, fila de trabalho)
├── CLAUDE.md
├── README.md
├── docker-compose.yml               (so servico `postgres` - IMPLEMENTADO)
└── .gitignore
```

A estrutura `etl/extractors/transformers/loaders/` do padrao original (com pastas
separadas por etapa) **nao foi adotada** - cada script de `backend/src/etl/loaders/`
contem extracao + transformacao + carga juntas, por arquivo de fonte. Reavaliar essa
divisao se o numero de extractors crescer muito e a duplicacao de logica entre eles
justificar uma camada compartilhada.

**INCONSISTENCIA ARQUITETURAL CONHECIDA - schema de Qualidade de Fornecimento:**
as tabelas `qualidade_conjuntos`, `qualidade_indicadores`, `qualidade_conjunto_municipio`
(dimensao INDQUAL/ANEEL, ver ARQUITETURA.md) foram criadas por um caminho diferente de
todo o resto do projeto: schema via `backend/src/etl/schema_qualidade.sql` (SQL puro,
sem arquivo `.ts` correspondente em `backend/src/db/schema/`) e carga via
`backend/src/etl/etl_indqual.py` (fora da pasta `loaders/`, sem seguir o padrao de
docstring metodologico + etapas numeradas dos demais extractors). A migration `0011`
(views DEC/FEC "real") foi a primeira peca formal dessa dimensao a entrar no sistema de
migrations padrao. Nao foi revertido/migrado para o padrao Drizzle+`loaders/` porque
funciona corretamente como esta e refatorar traria risco sem beneficio imediato -
mas qualquer trabalho futuro nessa dimensao deve estar ciente dessa excecao.

---

## 3️⃣ CLAUDE.md (Obrigatório)

Mantido como item do padrão: regra contra commits automáticos, acentuação em português,
stack tecnológica, estrutura de pastas, convenções de código, tratamento de erro/modal
(quando o frontend existir), e a convenção central de granularidade espacial — ver Seção
5 para como isso foi implementado na prática (`unidades_espaciais`).

---

## 4️⃣ Padrões de Código

### 🔹 React — PLANEJADO (frontend não iniciado)
- Apenas componentes funcionais, hooks, props tipadas via `interface`
- Services isolados em `/services`, nenhuma chamada `fetch` direta em componentes
- Componentes de mapa isolados de lógica de negócio

### 🔹 Backend (Node/Express) — PLANEJADO (schema existe, rotas não)
- Controllers devem retornar JSON consistente
- Validação via middleware dedicado (ex: zod)
- Lógica de negócio em Services, nunca no controller
- Acesso a dados isolado via Drizzle

### 🔹 ETL (Python) — IMPLEMENTADO, com padrão real observado nesta fase
- Cada fonte primária tem extractor próprio em `backend/src/etl/loaders/`
- Todo extractor segue o mesmo formato de saída no terminal: etapas numeradas
  (`[1/N] ...`), avisos explícitos (`[AVISO]`) para dados nulos/inválidos/descartados,
  contagem final de sucesso/falha
- **Transação por linha/município no upsert**, nunca uma transação única para todo o
  lote — bug real encontrado e corrigido no extractor de MMGD: uma única transação fazia
  qualquer erro de FK cancelar TODOS os upserts seguintes (`InFailedSqlTransaction` em
  cascata)
- Geometrias grandes devem ser transportadas como **WKB binário** (`geometry.wkb`), nunca
  WKT textual — bug real encontrado: municípios com geometria muito detalhada (ex:
  Jutaí/AM) geravam WKT de ~3 milhões de caracteres e derrubavam a conexão com o banco
- Todo extractor deve pré-filtrar códigos IBGE inexistentes na base territorial antes do
  upsert, reportando-os separadamente (não deixar a FK rejeitar silenciosamente)
- Scripts devem ser idempotentes via `ON CONFLICT ... DO UPDATE`, nunca `INSERT` puro
- Nunca usar Anaconda/conda como interpretador Python deste projeto — usar sempre o
  `venv` em `backend/src/etl/venv/`

---

## 5️⃣ Padrão de Banco de Dados (como implementado de fato)

⚠️ **Esta seção foi corrigida** — o padrão originalmente escrito aqui (camelCase,
`createdAt`/`updatedAt`/soft delete) não é o que foi implementado. O padrão real:

```typescript
id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
```

- Nomes de coluna em **snake_case em português** (`codigo_ibge`, `periodo_referencia`),
  não em inglês/camelCase
- **Sem soft delete** nas tabelas implementadas até agora (`deletedAt`) — todas usam
  `ON DELETE CASCADE` nas foreign keys
- **Sem `updatedAt`** na maioria das tabelas — `criadoEm` é o único timestamp padrão;
  adicionar `atualizadoEm` quando a tabela específica precisar (ex: `municipios` tem
  `atualizadoEm`, atualizado a cada upsert)

Relacionamentos (como implementado):
```typescript
codigoIbge: char('codigo_ibge', { length: 7 })
  .notNull()
  .references(() => municipios.codigoIbge, { onDelete: 'cascade' }),
```

Tabelas com geometria — usar `customType`, não o helper `geometry()` nativo do Drizzle
(testado: o helper nativo não respeita corretamente tipo + SRID combinados):
```typescript
const geometriaMultiPolygon = customType<{ data: string }>({
  dataType() {
    return 'geometry(MultiPolygon, 4674)'; // SIRGAS 2000
  },
});
```

Índices espaciais (GiST) **não são gerados pelo drizzle-kit** — sempre criar via migration
SQL manual, separada da migration gerada automaticamente:
```sql
CREATE INDEX idx_municipios_geom ON municipios USING GIST (geom);
```

**Granularidade espacial variável (implementado):** em vez de cada tabela de indicador
referenciar `municipios` diretamente, todas referenciam `unidades_espaciais.id`
(formato `tipo:codigo`, ex: `municipio:3550308`). Isso permite que o mesmo indicador
exista em diferentes granularidades (município hoje; setor censitário, favela/comunidade
urbana, CEP no futuro) sem alterar o schema das tabelas de indicador — só inserir novos
registros em `unidades_espaciais` com `tipo` diferente.

Seeders/extractors devem usar upsert:
```typescript
await db.insert(table)
  .values(data)
  .onConflictDoUpdate({ target: table.id, set: data });
```
(equivalente Python/SQL usado nos extractors: `INSERT ... ON CONFLICT (...) DO UPDATE SET ...`)

Nunca usar inserts estáticos que quebrem idempotência.

---

## 6️⃣ Padrão de Git (implementado e seguido)

### Branches
- `main` → único branch usado até agora (projeto em fase de dados, sem necessidade de
  `develop`/`feature` ainda)

### Commits
- Mensagens descritivas em português, multi-linha, explicando o quê E por quê (ver
  histórico do projeto para exemplos — commits documentam bugs encontrados e corrigidos,
  não só "o que foi adicionado")
- Não misturar funcionalidades não relacionadas
- `.gitignore` cobrindo Node, Python e dados brutos (`backend/src/etl/venv/`,
  `backend/src/etl/data/`) — dados baixados de fontes externas NUNCA são versionados,
  só os scripts que os baixam/processam

---

## 7️⃣ Makefile — PLANEJADO, NÃO IMPLEMENTADO

⚠️ Nenhum dos comandos abaixo existe hoje. Esta seção registra a **especificação
desejada** para quando o backend Node/Express for construído — até então, todo comando
de ETL é executado diretamente via `python3 backend/src/etl/loaders/<script>.py`, e
todo comando de banco via `docker compose exec -T postgres psql ...` (ver README.md).

```
make up            # ambiente de desenvolvimento (hot reload)
make up-prod        # ambiente de produção
make down
make migrate        # aplica migrations Drizzle
make seed
make fresh           # reseta banco + roda migrations + seed
make etl             # executa pipeline ETL completo (todos os extractors)
make etl-source SOURCE=aneel   # executa um extractor específico
make deploy
make deploy-rebuild
make deploy-first
make send            # pergunta o comentário do commit antes de enviar e dar push
make db              # abre client psql dentro do container do banco
make shell           # abre shell no container do backend
make lint
```

---

## 8️⃣ Padrão de Deploy — PLANEJADO, NÃO IMPLEMENTADO

⚠️ Toda esta seção é arquitetura especificada para uma fase futura do projeto
(quando existir backend/frontend para deployar). Nada aqui foi construído ou testado.
Mantida como referência de design.

### Arquitetura (planejada)

Produção rodaria em Docker Compose (`docker-compose.prod.yml`), separado do compose de
desenvolvimento local (hoje só `postgres`). Serviços planejados:
- **backend** — Node/Express, buildado a partir de `Dockerfile.backend.prod`
- **frontend** — build estático (Vite) servido pelo Nginx
- **etl** — container dedicado, acionado por `make etl` ou scheduler
- **scheduler** — loop de jobs periódicos (ex.: atualização mensal ANEEL/MMGD)
- **postgres** — já implementado localmente, replicar para produção
- **nginx**, **certbot** — reverse proxy + SSL

(Demais detalhes de configuração Nginx, fluxo `make send`/`make deploy`, variantes de
deploy — mantidos como na especificação original deste documento, sem alteração, por
serem desenho válido para quando esta fase começar.)

---

## 9️⃣ Checklist Pré-Produção — PLANEJADO

Mantido como meta para quando o backend/frontend existirem. Hoje, o equivalente real é a
validação de cada extractor (ver padrão na Seção 4): confirmar contagem de
sucesso/falha, rodar query de sanidade pós-carga contra casos de referência do DRF
(São Paulo, Floresta-PE, Diamantina-MG), e comparar agregados nacionais contra estatística
oficial conhecida antes de considerar um extractor validado.

---

## 🧠 Regra Estratégica da Empresa

> Estrutura primeiro. Funcionalidades depois.
> Padronização cria escala.
> Escala cria lucro.

---

## 🕐 Padrão de Timezone

Todas as datas e horários deste projeto usam UTC-3 (America/Sao_Paulo). Todos os dados de
data/hora fornecidos estarão em UTC-3. Armazenar datas com timezone consciente e sempre
exibi-las em formato UTC-3 — nunca converter para UTC ou outros fusos ao salvar ou exibir
datas ao usuário.

(Nota: os timestamps `criadoEm`/`atualizadoEm` implementados usam
`timestamp(..., { withTimezone: true })`, que armazena em UTC internamente no PostgreSQL
mas é exibido convertido — confirmar, ao construir a camada de apresentação, que a
conversão de exibição usa America/Sao_Paulo, não UTC bruto.)
