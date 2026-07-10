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
- **Backend Node.js/Express + Drizzle ORM (TypeScript)** — schema e migrations
  implementados; endpoints de leitura + fundação de auth/RBAC implementados,
  endpoints de escrita **em construção** (ver Estado Real do Projeto, abaixo).

Por isso, esta é uma exceção justificada e documentada, nos termos previstos pelo próprio
Official Project Standard ("seguido em todos os projetos, salvo exceção justificada e
documentada"). Tudo que é **agnóstico de stack** no padrão oficial (CLAUDE.md, padrão de Git,
checklist de produção, regra de timezone, idempotência, tratamento de erro/modal) é mantido
como diretriz. O que muda é exclusivamente o que depende de Laravel/PHP/MySQL.

---

## Estado Real do Projeto (atualizado em 09/07/2026)

**Implementado e validado com dados reais:**
- **Backend Node/Express — primeiro endpoint real (07/07/2026):**
  `GET /api/vazios-de-acesso` (RF-055/056/057), reimplementando no backend a
  metodologia antes só validada em
  `backend/src/etl/analises/identificar_vazios_de_acesso.py` (ver
  ARQUITETURA.md, secao "Identificacao e ranking de Vazios de Acesso").
  Estrutura minima: `backend/package.json`, `tsconfig.json`,
  `src/{index,app}.ts`, `src/config/env.ts`, `src/db/client.ts`,
  `src/{routes,controllers,services,schemas,middlewares,utils}/`. Zod para
  validacao de query params, tratamento de erro central (`errorHandler.ts`,
  formato `{ erro: { mensagem, detalhes? } }`).
  **Bloqueio real encontrado e resolvido**: a metodologia validada usa MMGD
  RESIDENCIAL per capita (nao o total), mas essa quebra por classe de
  consumo so existia em memoria no script Python (lida direto do Parquet
  bruto da ANEEL, dado nao versionado) - o backend Node nao tinha como
  reproduzir isso so com o banco. Decisao (usuario): expandir
  `extrair_mmgd_aneel.py` para persistir `potencia_residencial_kw` e
  `numero_ucs_residencial` em `mmgd_indicadores` (migration 0020), em vez do
  endpoint usar MMGD total com nota de divergencia. **Requer rodar a
  migration 0020 e re-executar `extrair_mmgd_aneel.py` no banco local antes
  do endpoint refletir os numeros validados em ARQUITETURA.md** (1.451
  municipios, 26,1%) - ate isso rodar, municipios cujo snapshot de MMGD e
  anterior a migration 0020 ficam fora da classificacao (ver campo
  `avisos.totalPrecisaReextrairMmgd` na resposta da API).
  **Drift de schema corrigido nesta sessao**: `indicadores_sociais.ts`
  (Drizzle) nao tinha a coluna `percentual_pobreza_cadunico`, que existe no
  banco desde a migration 0013 (`ALTER TABLE`) - adicionada ao `.ts`.
  Drift semelhante em `taxa_mortalidade_infantil` (migration 0012) **NAO foi
  corrigido** (fora do escopo desta sessao, nao usado pelo endpoint novo) -
  ciente para quando for necessario.
- **Fundacao de autenticacao/RBAC (08/07/2026):** o DRF.md foi revisado na
  mesma sessao, reduzindo os 6 perfis originais (P1-P6) a 3 papeis reais -
  `Publico` (sem login), `Colaborador` (funde antigos P4 Parceiro Tecnico +
  P5 Equipe do Projeto) e `Administrador` (antigo P6) - ver DRF.md Secao 2
  para o raciocinio completo (so P4/P5/P6 tinham escrita real; P1/P2/P3 so
  diferiam em quais telas apareciam). Implementado: migration 0022
  (`usuarios`, com CHECK `papel IN ('colaborador','administrador')` em vez de
  enum nativo do Postgres), `POST /api/auth/login` e `/logout`
  (`src/routes/auth.routes.ts`), middlewares `requireAutenticacao`/
  `requirePapel` (`src/middlewares/auth.ts`), hash de senha via `bcryptjs`
  (custo 10, nao `bcrypt` nativo - evita dependencia de compilacao nativa/
  node-gyp num projeto que ja teve dor de cabeca com `node_modules`
  corrompido), JWT via `jsonwebtoken` (`JWT_SECRET`/`JWT_EXPIRES_IN` em
  `src/config/env.ts`, com default de dev local pelo mesmo motivo do
  `DATABASE_URL` - projeto ainda sem deploy de producao). Seed de 2 contas de
  demonstracao (`colaborador@atlassolarjusto.dev` /
  `admin@atlassolarjusto.dev`, senha `123456` conforme RT-003 do DRF) direto
  na migration, idempotente via `ON CONFLICT (email) DO UPDATE`.
  **Escopo daquela sessao foi só a fundacao** - os endpoints de escrita
  seguiram em sessao separada, ver bloco abaixo.
- **Endpoints de escrita do Colaborador e Painel Admin (08/07/2026):**
  migrations 0023 (Colaborador: `revisoes_bases_dados` RF-059,
  `observacoes_bases_dados` RF-060, `sugestoes_indicadores` RF-061,
  `notas_metodologicas` RF-064/065/066 com historico via multiplas linhas,
  `materiais_comunicacao` RF-067) e 0024 (Admin: `metadados_bases_dados`
  RF-071/072/073, `aprovacoes_indicadores` RF-074, `versoes_publicadas`
  RF-075, `usuarios.ativo` RF-076). Rotas: `src/routes/colaborador.routes.ts`
  e `admin.routes.ts`, protegidas por `requireAutenticacao` +
  `requirePapel(...)`. Leituras (`GET`) sao publicas (papel Publico ve tudo,
  ver DRF.md Secao 2); somente escrita exige login.
  **Decisao do usuario sobre RF-070** ("upload de bases"): implementado so
  como workflow/status (metadados + aprovacao + versionamento) - NAO
  recebimento de arquivo via API, porque a carga real de dado sempre passa
  pelos scripts Python (`extrair_*.py`, fora da API Node). Se um dia for
  necessario aceitar upload de arquivo de verdade, isso e um escopo
  separado (nova dependencia tipo multer + storage), nao implementado aqui.
  **Guard de "ultimo administrador"** em `admin.service.ts`
  (`garantirNaoUltimoAdministrador`): nenhuma operacao de
  `PATCH`/`DELETE /admin/usuarios` pode deixar o sistema sem nenhum
  administrador ativo, nem um usuario pode remover a propria conta.
  **AINDA NAO VALIDADO** no ambiente do usuario nesta sessao - ver bloco
  "Como rodar o que existe hoje" para os passos de migration/typecheck/teste
  pendentes antes de considerar isso pronto.
- Schema do banco: `municipios`, `unidades_espaciais`, `mmgd_indicadores`,
  `indicadores_sociais`, `irradiacao_solar`, `indicadores_climaticos`, `usuarios`
  (fundacao de auth, migration 0022), `revisoes_bases_dados`,
  `observacoes_bases_dados`, `sugestoes_indicadores`, `notas_metodologicas`,
  `materiais_comunicacao` (escrita Colaborador, migration 0023),
  `metadados_bases_dados`, `aprovacoes_indicadores`, `versoes_publicadas`
  (escrita Admin, migration 0024) via Drizzle (`backend/src/db/schema/`) + tabelas
  `qualidade_conjuntos`, `qualidade_indicadores`,
  `qualidade_conjunto_municipio` criadas FORA do Drizzle, via
  `backend/src/etl/schema_qualidade.sql` (ver nota de inconsistencia arquitetural na
  Secao 2)
- Migrations incrementais 0000 a 0024 - ver `backend/src/db/migrations/`. Numeracao
  formal NAO cobre o schema de qualidade (criado fora do sistema de migrations ate a
  migration 0011, que so adiciona as views DEC/FEC "real" em cima do schema ja existente).
  0014-0017: indices compostos + views consolidadas (`vw_indicadores_sociais_consolidado`,
  `vw_indices_compostos_moradia_infraestrutura`), IVS (`vw_ivs_consolidado`),
  `percentual_apartamento` - ver ARQUITETURA.md, secao "Analise de correlacao MMGD x
  Indicadores Sociais" (06/07/2026) - e RDPC (`renda_per_capita_rdpc`,
  `percentual_baixa_renda_rdpc`, migration 0017), achado colateral da investigacao de
  onus excessivo com aluguel, ver ARQUITETURA.md secao "Decisoes de fontes" (06/07/2026).
  0018: `tarifa_energia_residencial` (TUSD+TE, ANEEL, sentido AMBIGUO), teste do
  mecanismo tarifa para o caso Centro-Oeste x Irradiacao Solar - ver ARQUITETURA.md,
  secao "Teste do mecanismo tarifa" e "Extensao do teste de tarifa para todas as
  distribuidoras" (06/07/2026). 0019: criacao de `indicadores_climaticos`
  (`precipitacao_max_mes_mm`, MERGE/CPTEC-INPE, zonal statistics) - primeiro indicador
  climatico formal do Atlas, formalizado apos a linha de investigacao "Queima de
  equipamentos" confirmar sinal robusto em escala nacional (ver ARQUITETURA.md, secao
  "RESULTADO FINAL - COBERTURA NACIONAL", 08/07/2026). Vento (ERA5) NAO foi formalizado -
  sinal nao se sustentou em escala nacional, permanece exploratorio em `analises/`.
  0020: `potencia_residencial_kw` e `numero_ucs_residencial` em
  `mmgd_indicadores` (sessao 07/07/2026, ver bloco "Backend Node/Express" acima).
  0021: seed piloto de setores censitarios de Sao Paulo (RF-045). 0022: tabela
  `usuarios` (fundacao de auth/RBAC, ver bloco "Fundacao de autenticacao/RBAC"
  acima). 0023: tabelas de escrita do Colaborador (RF-059 a RF-067). 0024:
  tabelas do Admin + `usuarios.ativo` (RF-070 a RF-077) - ver bloco "Endpoints
  de escrita do Colaborador e Painel Admin" acima.
- 20 extractors Python funcionais em `backend/src/etl/loaders/` (territorio, MMGD/ANEEL,
  Infraestrutura Urbana/Censo, Renda e Trabalho/RAIS via BigQuery, Alfabetizacao/Censo,
  Mortalidade Infantil/SIM+SINASC via BigQuery, Moradia/Censo, Tipo de Domicilio/Censo,
  RDPC/Censo, Inadequacao Habitacional, MCMV/FGTS, MCMV/OGU, Favelas/FCU (seed + extract),
  ZEIS/AEIS por capital - SP, Recife, Rio Branco, Rio de Janeiro -, Irradiacao Solar/INPE,
  Tarifa Residencial/ANEEL, Precipitacao Mensal/MERGE-CPTEC-INPE) + 2 scripts fora do
  padrao `loaders/`: `backend/src/etl/etl_indqual.py` e
  `backend/src/etl/schema_qualidade.sql` (Qualidade de Fornecimento/ANEEL - ver nota na
  Secao 2)
- Banco PostgreSQL+PostGIS local via `docker-compose.yml`, sem variante de producao ainda
- Todas as 8 dimensoes de dados planejadas no DRF estao completas: Territorio, MMGD,
  Infraestrutura Urbana, Renda e Trabalho, Moradia, Qualidade de Fornecimento, Capital
  Humano, Irradiacao Solar. Unico indicador pendente por bloqueio externo (nao por falta
  de trabalho): `percentual_tsee` (Beneficiarios da CDE/ANEEL), aguardando dado de
  jan/2026+ com a nova subclasse "Residencial Desconto Social" - ver ARQUITETURA.md.
  **Alem das 8 dimensoes originais do DRF**: `indicadores_climaticos` (precipitacao
  mensal) e uma 9a dimensao NAO prevista no DRF original, nascida de uma investigacao
  organica (clima x ressarcimento por danos eletricos) - ver ARQUITETURA.md para o
  historico completo. Nao remover das 8 originais do DRF nem misturar com elas.
- **Makefile de desenvolvimento (09/07/2026):** criado na raiz do projeto, empacotando
  os comandos ate entao so documentados manualmente no README ("Como rodar
  localmente") - `make up`/`down`/`db`/`migrate`/`seed`/`etl`/`etl-source
  SOURCE=<nome>`/`fresh`/`dev`/`typecheck`/`build`. `make migrate` reproduz a ordem
  exata do README, incluindo aplicar `schema_qualidade.sql` antes da migration 0011
  (ver nota de inconsistencia arquitetural na Secao 2). `make etl` roda os 22
  extractors de `loaders/` na ordem documentada, mas nao cobre os pre-requisitos
  manuais (auth `gcloud`, download do CSV do INPE) - eles seguem exigindo
  intervencao manual, so ficaram documentados como comentario no Makefile. Escopo
  desta sessao foi **so os comandos de desenvolvimento** - `up-prod`/`deploy`/
  `deploy-rebuild`/`deploy-first`/`shell`/`lint` continuam NAO implementados (ver
  Secao 7 e Secao 8, que continuam so especificacao). **AINDA NAO VALIDADO** no
  ambiente do usuario nesta sessao (bash sandbox nao consegue montar o caminho WSL
  do projeto) - pedir para o usuario rodar `make help`, `make migrate` e
  `make typecheck` no WSL dele antes de considerar isso pronto.
- **Frontend — fundação + mapa interativo (09/07/2026):** primeira sessão do
  frontend. Scaffold Vite + React 19 + TypeScript + Tailwind v4 (via
  `@tailwindcss/vite`) + React Router em `frontend/`, com estrutura sob
  `frontend/src/` (`pages/`, `components/`, `services/`, `types/`, `utils/` —
  as pastas vazias que existiam direto em `frontend/` foram substituídas por
  essa estrutura padrão do Vite; podem ser removidas, git nunca as versionou).
  Implementado: mapa MapLibre GL (RF-016/017 parcial) com choropleth por
  indicador (8 indicadores, classes por quintis calculadas no cliente),
  destaque do quadrante Vazio de Acesso (RF-055/056 — contorno roxo, dado
  buscado paginado do endpoint, ~8 requisições de 200), painel de detalhe do
  município clicado (RF-025, direto das properties do GeoJSON, sem nova
  requisição) e legenda. Decisões: (1) geometria vem de
  `GET /api/municipios/exportar?formato=geojson` (RF-047) — payload nacional
  único, aceitável porque o seed já simplifica a ~10 m
  (TOLERANCIA_SIMPLIFICACAO); se a carga ficar lenta, o caminho é tile
  vetorial/endpoint dedicado, não paginação; (2) classificação de vazios
  SEMPRE do backend, nunca recalculada no cliente (depende de medianas
  nacionais + regras de exclusão); (3) sem basemap externo (fundo neutro) —
  evita dependência de servidor de tiles de terceiros nesta fase; (4) tipos da
  API espelhados manualmente em `frontend/src/types/api.ts` (sem geração
  automática — reavaliar se divergir); (5) proxy `/api` → localhost:3000 no
  Vite (`vite.config.ts`); (6) dois bugs reais encontrados na validação, com
  correção no frontend: colunas `numeric` do Postgres chegam como STRING no
  JSON da API (driver `pg` não converte `numeric`, só `float8`) →
  normalização numérica central em `municipios.service.ts`
  (`normalizarMunicipio`); e o MapLibre descarta properties NULAS na
  conversão interna GeoJSON→tile vetorial → o clique no mapa devolve só o
  `codigoIbge` e a página resolve o município no GeoJSON original (nunca ler
  indicadores das properties de um feature clicado). Makefile ganhou
  `front`/`front-typecheck`/`front-build`. VALIDADO ponta a ponta no ambiente
  do usuario em 09/07/2026.
- **Frontend — busca por município no header (09/07/2026, RF-026):** campo de
  busca com autocomplete no header (`frontend/src/components/BuscaMunicipio.tsx`
  — fora de `components/mapa/` de propósito, não é componente de mapa),
  reutilizando o service já existente `buscarMunicipiosPorNome`
  (`GET /api/municipios?nome=`, debounce 300 ms, teclado com setas/Enter/Esc,
  `onMouseDown` nas opções para a seleção não ser engolida pelo clique-fora).
  Decisões: (1) seleção vira navegação para `/?municipio=<codigoIbge>` — a
  `PaginaMapa` consome o parâmetro como comando **one-shot** (seleciona o
  município no GeoJSON já carregado, abre o painel RF-025, seta o foco do mapa
  e REMOVE o parâmetro da URL com `replace`); isso desacopla header/página,
  permite repetir a mesma busca e dá deep-link de graça
  (ex.: `/?municipio=3550308` já abre enquadrado em São Paulo); (2)
  `MapaMunicipios` ganhou prop `foco: FocoMunicipio | null` — objeto
  `{ codigoIbge }`, não string, para busca repetida re-disparar o efeito de
  voo; (3) `fitBounds` no bbox da geometria (helper `bboxDaGeometria`,
  recursivo, sem turf) em vez de `flyTo` com zoom fixo — municípios variam de
  ~3 km² a ~150.000 km². **RF-033 NÃO entrou** (filtro dentro do painel de
  ranking — o painel de ranking RF-031/032 ainda não existe). Na validação da
  mesma sessão entraram dois ajustes: (a) contorno de município trocado de
  branco puro para cinza translúcido (`#64748b`, opacity 0.4) — branco sumia
  nas classes claras do choropleth; (b) **notas de ausência justificada de
  dado** no painel RF-025 (`frontend/src/utils/notasAusencia.ts` +
  `PainelMunicipio`): "—" ganha justificativa quando a ausência é documentada
  — TSEE aguardando ANEEL jan/2026+ (todos os municípios), os 4 casos sem
  irradiação no Atlas INPE 2017 (Fernando de Noronha, 2 corpos d'água/RS e
  Boa Esperança do Norte/MT 5101837, instalado 01/01/2025, desmembrado de
  Sorriso e Nova Ubiratã), quebra MMGD residencial nula com total presente
  (snapshot pré-migration 0020), e nota geral no topo do painel para os 4
  municípios especiais. Regra do catálogo: só ausência documentada
  (docstrings dos extractors/ARQUITETURA.md) — "—" sem nota é lacuna a
  investigar. É metadado de apresentação, por isso vive no frontend (como
  utils/indicadores.ts); se o backend um dia servir isso, migrar. (c) campo
  `descricao` em IndicadorMapa/LinhaIndicador (legenda + painel) para
  esclarecimento metodológico: rótulo do CadÚnico corrigido de "Pobreza
  (CadÚnico)" para "Pobreza entre famílias do CadÚnico" — o denominador é
  famílias CADASTRADAS, não população (métrica 2 do extrair_cadunico.py; o
  rótulo antigo induzia a leitura "% do município em pobreza") — e irradiação
  ganhou a contextualização que o extractor EXIGE em qualquer exibição
  (média climatológica 1999–2015 + citação LABREN/CCST/INPE, condição de
  licenciamento). (d) **mudança de contrato da API** (backend + espelho
  frontend juntos, regra da Seção 4): `municipios.service.ts` (backend) agora
  expõe `populacaoEstimada` (densidade × área, arredondada — o Atlas não
  guarda população absoluta; era calculada só internamente para o per capita
  de MMGD) e `percentualCadunico` (cobertura, métrica 1 do extractor, já
  existia na view consolidada mas não no SELECT) — novas linhas no painel
  RF-025 ("População (estimada)" no grupo Território e "População no
  CadÚnico" nos sociais, ambas com descricao). **AINDA NAO
  VALIDADO** no ambiente do usuario: rodar `make front-typecheck` e testar no
  navegador (busca, voo, painel, deep-link, repetir a mesma busca, notas de
  ausência em 5101837 e na linha TSEE) antes de considerar pronto.

- **Frontend — painel de ranking estadual (09/07/2026, RF-030 a RF-036):**
  `frontend/src/components/mapa/PainelRanking.tsx` (só renderização, dado via
  props) + integração na `PaginaMapa` (botão nos controles, painel à esquerda
  do mapa). Ranking calculado NO CLIENTE a partir do GeoJSON já carregado —
  é ordenação simples, não metodologia; o badge "Vazio de Acesso" (RF-032)
  usa SEMPRE a classificação do backend (mesmo fetch lazy do destaque,
  refatorado em `garantirVaziosCarregados`). RF-033 (filtro por nome dentro
  do painel) preserva a posição real — filtrar não renumera. RF-035 reusa a
  mecânica foco+painel da busca do header. Barra do RF-032: normalização
  min–max dentro da UF (leitura "distância do pior da UF"), não posição.
  **Exclusões documentadas**: RF-034 só parcial — "ranking por variação no
  período" NÃO implementado (a API só serve o snapshot mais recente de cada
  indicador; exigiria endpoint histórico); RF-037 (bloco IPER do estado) NÃO
  implementado — depende do RF-080, bloqueado pelo TSEE (ver ARQUITETURA.md).
  **AINDA NAO VALIDADO** no ambiente do usuario.

**NAO implementado ainda** (apesar de descrito em secoes deste documento como padrao):
- Backend Node/Express: endpoints de LEITURA (`GET /api/vazios-de-acesso`,
  `/api/municipios` + variantes, `/api/bases-de-dados`, export CSV/GeoJSON/XLSX,
  relatorio PDF), fundacao de auth (`POST /api/auth/login`/`logout`, RBAC 3 papeis) e
  endpoints de ESCRITA do Colaborador/Admin (RF-059 a RF-077, migrations 0023/0024 - ver
  acima) implementados, mas **ainda nao validados no ambiente do usuario nesta sessao**.
  RF-070 ("upload de bases") implementado so como workflow/status, NAO recebimento de
  arquivo via API - decisao explicita do usuario, ver bloco acima.
- Frontend React - INICIADO em 09/07/2026 (fundação + mapa, ver bloco acima), mas ainda
  falta a maior parte: landing page, painel analítico/comparação (RF-049/050), telas de
  login e painéis Colaborador/Admin (consumindo a auth já existente), export/relatório
  pela interface, drill-down de setores censitários (RF-043/045) e o painel tipo
  heatmap (RF-057). Busca por município no header (RF-026) e painel de ranking
  estadual (RF-030 a RF-036, com exclusões documentadas) implementados em
  09/07/2026 — ver blocos acima.
- Makefile de deploy/producao - `make up-prod`, `make deploy`, `make deploy-rebuild`,
  `make deploy-first`, `make shell`, `make lint` continuam **especificacao**, nao
  implementados (ver Secao 7). Os comandos de desenvolvimento (`make up`, `make
  migrate`, `make etl`, etc.) foram implementados em 09/07/2026 - ver bloco acima.
- Deploy/producao (Nginx, certbot, scheduler, `docker-compose.prod.yml`) - arquitetura
  especificada mas nunca implementada nem testada
- Upload de arquivo real (multer/storage) para o Painel Admin - decisao explicita do
  usuario foi NAO implementar isso agora (ver bloco acima); carga de dado continua via
  ETL Python
- Cruzamento MMGD x indicadores sociais (identificacao de "vazios de acesso") -
  classificacao/ranking (item 3) ja tem endpoint real (acima); RF-057 (painel tipo
  heatmap) continua pendente - e exibicao/frontend, nao calculo

**Como rodar o que existe hoje:** ver `README.md`, secao "Como rodar localmente" - ETL via
execucao direta de scripts Python (`python3 backend/src/etl/loaders/extrair_X.py`) ou
`make etl`; backend via `make dev` (requer `backend/.env` com `DATABASE_URL` e as
migrations ja aplicadas - ver README); frontend via `make front` (dev server Vite na
porta 5173, com o backend rodando na 3000). Makefile de desenvolvimento existe desde
09/07/2026 (ver Secao 7).

---

## 1️⃣ Stack Oficial do Projeto

### 🔹 Backend (schema, leitura, auth e escrita do Colaborador/Admin implementados — ver Estado Real do Projeto)
- Node.js 20+ (LTS)
- TypeScript 5+
- Express
- Drizzle ORM
- Zod (validação de request, middleware dedicado)
- PostgreSQL 16 + PostGIS 3.4
- JWT (autenticação) — IMPLEMENTADO (fundação, 08/07/2026): `jsonwebtoken` + `bcryptjs`,
  3 papéis (Público sem login, Colaborador, Administrador — ver Estado Real do Projeto)
- REST JSON API — leitura (`vazios-de-acesso`, `municipios`, `bases-de-dados`, exports),
  auth (`login`/`logout`) e escrita do Colaborador/Admin (RF-059 a RF-077) implementados;
  upload de arquivo real (RF-070) PLANEJADO (decisão: só workflow/status por enquanto)

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

### 🔹 Frontend (fundação + mapa implementados em 09/07/2026 — ver Estado Real do Projeto)
- React 19
- TypeScript 5+
- Vite
- Tailwind CSS v4 (plugin `@tailwindcss/vite`, sem tailwind.config — tema default)
- React Router (react-router-dom v7)
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
- Makefile — comandos de desenvolvimento implementados (09/07/2026, ver Seção 7);
  comandos de deploy/produção continuam PLANEJADOS

---

## 2️⃣ Estrutura Real do Projeto

```
/
├── backend/
│   ├── package.json               (IMPLEMENTADO 07/07/2026 - Node 20+, TS 5+, Express,
│   │                                Drizzle, zod, pg. Scripts: dev/build/start/typecheck)
│   ├── tsconfig.json               (IMPLEMENTADO 07/07/2026 - ES2022, NodeNext, strict)
│   └── src/
│       ├── index.ts                (IMPLEMENTADO - entrypoint, sobe o Express)
│       ├── app.ts                  (IMPLEMENTADO - monta app: middlewares, rotas, error handler)
│       ├── config/
│       │   └── env.ts              (IMPLEMENTADO - leitura central de process.env)
│       ├── db/
│       │   ├── client.ts           (IMPLEMENTADO - instancia Drizzle, driver `pg`)
│       │   ├── schema/            (Drizzle schema - IMPLEMENTADO)
│       │   │   ├── municipios.ts
│       │   │   ├── unidades_espaciais.ts
│       │   │   ├── mmgd_indicadores.ts   (+ potenciaResidencialKw/numeroUcsResidencial, migration 0020)
│       │   │   ├── indicadores_sociais.ts (+ percentualPobrezaCadunico, drift da migration 0013 corrigido 07/07/2026)
│       │   │   ├── irradiacao_solar.ts
│       │   │   ├── indicadores_climaticos.ts
│       │   │   ├── usuarios.ts     (NOVO 08/07/2026 - fundacao de auth/RBAC,
│       │   │   │   papel via CHECK 'colaborador'|'administrador', migration 0022;
│       │   │   │   + coluna ativo na migration 0024)
│       │   │   ├── revisoes_bases_dados.ts    (NOVO 08/07/2026 - RF-059, migration 0023)
│       │   │   ├── observacoes_bases_dados.ts (NOVO 08/07/2026 - RF-060, migration 0023)
│       │   │   ├── sugestoes_indicadores.ts   (NOVO 08/07/2026 - RF-061, migration 0023)
│       │   │   ├── notas_metodologicas.ts     (NOVO 08/07/2026 - RF-064/065/066, migration 0023)
│       │   │   ├── materiais_comunicacao.ts   (NOVO 08/07/2026 - RF-067, migration 0023)
│       │   │   ├── metadados_bases_dados.ts   (NOVO 08/07/2026 - RF-071/072/073, migration 0024)
│       │   │   ├── aprovacoes_indicadores.ts  (NOVO 08/07/2026 - RF-074, migration 0024)
│       │   │   ├── versoes_publicadas.ts      (NOVO 08/07/2026 - RF-075, migration 0024)
│       │   │   └── index.ts
│       │   └── migrations/        (SQL incremental - IMPLEMENTADO, 0000 a 0024)
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
│       │       ├── 0017_indicadores_sociais_rdpc.sql
│       │       ├── 0018_indicadores_sociais_tarifa_residencial.sql
│       │       ├── 0019_criacao_indicadores_climaticos.sql
│       │       ├── 0020_mmgd_indicadores_residencial.sql  (NOVO 07/07/2026 - ver "Backend
│       │       │   Node/Express" em Estado Real do Projeto)
│       │       ├── 0021_seed_piloto_setores_censitarios_sp.sql
│       │       ├── 0022_criacao_usuarios_auth.sql  (NOVO 08/07/2026 - fundacao de
│       │       │   auth/RBAC, ver "Fundacao de autenticacao/RBAC" em Estado Real do Projeto)
│       │       ├── 0023_colaborador_escrita.sql    (NOVO 08/07/2026 - RF-059 a RF-067)
│       │       └── 0024_admin_escrita.sql          (NOVO 08/07/2026 - RF-070 a RF-077
│       │             + usuarios.ativo)
│       ├── types/
│       │   └── express.d.ts        (NOVO 08/07/2026 - augmentation de `Request.usuario`)
│       ├── middlewares/            (IMPLEMENTADO 07/07/2026)
│       │   ├── validateRequest.ts  (validação zod genérica, por query/body/params)
│       │   ├── errorHandler.ts     (JSON de erro consistente + notFoundHandler)
│       │   └── auth.ts             (NOVO 08/07/2026 - requireAutenticacao/requirePapel)
│       ├── routes/                 (IMPLEMENTADO 07/07/2026)
│       │   ├── index.ts            (agrega routers sob /api)
│       │   ├── vaziosDeAcesso.routes.ts
│       │   ├── municipios.routes.ts
│       │   ├── basesDeDados.routes.ts
│       │   ├── auth.routes.ts      (NOVO 08/07/2026 - POST /auth/login, /logout)
│       │   ├── colaborador.routes.ts (NOVO 08/07/2026 - RF-059 a RF-067)
│       │   └── admin.routes.ts       (NOVO 08/07/2026 - RF-070 a RF-077)
│       ├── controllers/            (IMPLEMENTADO 07/07/2026)
│       │   ├── vaziosDeAcesso.controller.ts
│       │   ├── auth.controller.ts    (NOVO 08/07/2026)
│       │   ├── colaborador.controller.ts (NOVO 08/07/2026)
│       │   └── admin.controller.ts       (NOVO 08/07/2026)
│       ├── services/                (IMPLEMENTADO 07/07/2026 - lógica de negócio isolada aqui)
│       │   ├── vaziosDeAcesso.service.ts  (RF-055/056/057 - ver docstring do arquivo
│       │   │   para a metodologia completa)
│       │   ├── auth.service.ts      (NOVO 08/07/2026 - bcryptjs + jsonwebtoken)
│       │   ├── colaborador.service.ts (NOVO 08/07/2026)
│       │   └── admin.service.ts       (NOVO 08/07/2026 - inclui guard de
│       │       "ultimo administrador", ver Estado Real do Projeto)
│       ├── schemas/                 (IMPLEMENTADO 07/07/2026 - contratos zod)
│       │   ├── vaziosDeAcesso.schema.ts
│       │   ├── auth.schema.ts       (NOVO 08/07/2026 - loginSchema)
│       │   ├── colaborador.schema.ts (NOVO 08/07/2026)
│       │   └── admin.schema.ts       (NOVO 08/07/2026)
│       └── utils/
│           ├── AppError.ts
│           └── basesDeDadosCanonicas.ts (NOVO 08/07/2026 - 6 IDs de base
│               reaproveitados de basesDeDados.service.ts + IDs de metadados)
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
│           │   ├── inspecionar_metadados_sidra_rdpc.py
│           │   ├── investigar_distribuidora_regioes_problema.py
│           │   ├── investigar_fila_conexao_mmgd_centro_oeste.py
│           │   ├── investigar_tarifa_centro_oeste.py
│           │   ├── investigar_construto_posse_rural_sul.py
│           │   ├── identificar_vazios_de_acesso.py
│           │   ├── investigar_distribuidora_vazios_nordeste.py
│           │   ├── investigar_tarifa_nordeste_equatorial.py
│           │   ├── investigar_fila_conexao_mmgd_nordeste.py
│           │   ├── mapear_desempenho_conexao_mmgd_nacional.py
│           │   ├── construir_ranking_distribuidoras_conexao_mmgd.py
│           │   ├── verificar_preenchimento_indicadores_sociais.py
│           │   ├── diagnosticar_estado_geral_banco.py
│           │   ├── investigar_clima_ressarcimento_danos_eletricos.py
│           │   ├── diagnosticar_leitura_merge_grib2.py
│           │   ├── diagnosticar_leitura_era5_rajada_vento.py
│           │   ├── diagnosticar_convencao_longitude_merge.py
│           │   ├── prova_conceito_merge_precipitacao_x_inmet.py
│           │   ├── prova_conceito_era5_vento_x_inmet.py
│           │   ├── prova_conceito_zonal_statistics_merge_precipitacao.py
│           │   ├── prova_conceito_zonal_statistics_era5_vento.py
│           │   ├── escalar_merge_precipitacao_nacional.py
│           │   ├── escalar_era5_vento_nacional.py
│           │   ├── consolidar_parquets_climaticos.py
│           │   └── investigar_clima_ressarcimento_cobertura_nacional.py
│           │       (linha de investigacao "Queima de equipamentos" completa - ver
│           │        ARQUITETURA.md; vento (ERA5) NAO virou indicador formal, so chuva)
│           └── loaders/            (extractors - IMPLEMENTADO, 20 scripts)
│               ├── seed_municipios.py
│               ├── extrair_mmgd_aneel.py       (ATUALIZADO 07/07/2026 - agora tambem
│               │   classifica e persiste potencia_residencial_kw/numero_ucs_residencial,
│               │   migration 0020, ver "Backend Node/Express" em Estado Real do Projeto)
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
│               ├── extrair_tarifa_distribuidoras.py
│               ├── validar_aneel_real.py
│               └── extrair_precipitacao_mensal_merge.py
├── frontend/                       (INICIADO 09/07/2026 - fundação + mapa interativo)
│   ├── package.json                (React 19, react-router-dom 7, maplibre-gl 5,
│   │                                Tailwind v4. Scripts: dev/build/typecheck/preview)
│   ├── vite.config.ts              (plugins react + tailwindcss; proxy /api → :3000)
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json  (strict, project refs)
│   ├── index.html
│   └── src/
│       ├── main.tsx                (entrypoint - StrictMode + BrowserRouter)
│       ├── App.tsx                 (rotas + cabeçalho; só "/" → PaginaMapa por ora)
│       ├── index.css               (@import "tailwindcss" + altura 100%)
│       ├── pages/
│       │   └── PaginaMapa.tsx      (busca dados via services, estado da página)
│       ├── components/
│       │   └── mapa/               (isolados de lógica de negócio - CLAUDE.md Seção 4)
│       │       ├── MapaMunicipios.tsx  (MapLibre: choropleth + destaque de vazios)
│       │       ├── Legenda.tsx
│       │       └── PainelMunicipio.tsx (detalhe do município clicado, RF-025)
│       ├── services/               (todo fetch passa por aqui, nunca em componente)
│       │   ├── http.ts             (cliente central, trata { erro: { mensagem } })
│       │   ├── municipios.service.ts
│       │   └── vaziosDeAcesso.service.ts
│       ├── types/
│       │   └── api.ts              (espelho manual dos contratos do backend)
│       └── utils/
│           ├── formatadores.ts     (Intl pt-BR)
│           └── indicadores.ts      (catálogo de camadas choropleth + quintis)
├── docker/                         (PLANEJADO - Dockerfiles de producao nao existem)
├── docs/
│   ├── DRF.md
│   ├── PLANO_MORADIA_TERRITORIO_POPULAR.md
│   ├── PLANO_QUALIDADE_FORNECIMENTO_BDGD.md
│   └── backend/                    (NOVO 07/07/2026 - biblioteca de receitas
│       praticas do backend, formato inspirado no Claude Cookbook oficial da
│       Anthropic, conteudo proprio do Atlas - ver README.md da pasta para o
│       indice, e Secao 4 abaixo para como ela se relaciona com este documento)
├── ARQUITETURA.md                   (estado dos dados, decisoes de fonte, fila de trabalho)
├── CLAUDE.md
├── README.md
├── Makefile                          (NOVO 09/07/2026 - comandos de desenvolvimento
│                                       implementados: up/down/db/migrate/seed/etl/
│                                       etl-source/fresh/dev/typecheck/build. Deploy/
│                                       up-prod/shell/lint continuam PLANEJADOS, ver
│                                       Secao 7)
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

> 📚 **[`docs/backend/`](./docs/backend/README.md)** é a biblioteca de receitas
> práticas que acompanha esta seção — formato inspirado no [Claude Cookbook oficial
> da Anthropic](https://github.com/anthropics/claude-cookbooks) (receitas curtas:
> problema → código real → por quê), mas com conteúdo 100% próprio do Atlas. Esta
> seção diz **a regra**; `docs/backend/` mostra **o exemplo de trabalho**, com o
> código real do repositório e as armadilhas já encontradas. Consultar antes de
> escrever um extractor novo, um endpoint novo, ou uma tabela com geometria.

### 🔹 React — IMPLEMENTADO (fundação + mapa, 09/07/2026)
- Apenas componentes funcionais, hooks, props tipadas via `interface`
- Services isolados em `src/services/`, nenhuma chamada `fetch` direta em componentes
  (cliente central em `src/services/http.ts`, que converte o formato de erro do backend
  `{ erro: { mensagem } }` em exceção tipada `ErroDeApi`)
- Componentes de mapa isolados de lógica de negócio: `MapaMunicipios.tsx` só renderiza o
  que recebe por props (GeoJSON, indicador, quebras de classe, códigos a destacar) —
  busca de dado e metodologia ficam na página/services
- Nomes de arquivos/componentes/variáveis em português, mesmo padrão do backend
  (`PaginaMapa`, `buscarTodosVaziosDeAcesso`)
- Tipos da API espelhados manualmente em `src/types/api.ts` — atualizar JUNTO com
  qualquer mudança de contrato no backend

### 🔹 Backend (Node/Express) — leitura, auth e escrita do Colaborador/Admin implementados (upload de arquivo real PLANEJADO)
- Controllers devem retornar JSON consistente
- Validação via middleware dedicado (ex: zod)
- Lógica de negócio em Services, nunca no controller
- Acesso a dados isolado via Drizzle
- Rotas que exigem papel: `requireAutenticacao` seguido de `requirePapel(...)` na cadeia
  da rota (`src/middlewares/auth.ts`) — nunca checar `req.usuario.papel` manualmente
  dentro do controller

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

## 7️⃣ Makefile — comandos de desenvolvimento IMPLEMENTADOS (09/07/2026); deploy continua PLANEJADO

⚠️ Os comandos de **deploy/produção** abaixo (`up-prod`, `deploy`, `deploy-rebuild`,
`deploy-first`) continuam sem implementação — dependem de servidor/domínio de produção
que ainda não existe (ver Seção 8). `shell` e `lint` também não existem: o backend não é
containerizado hoje (roda via `npm run dev` direto no host) e não há ferramenta de lint
configurada no projeto. `send` (commit/push interativo) também não foi implementado.

Os comandos de **desenvolvimento** abaixo existem de fato no `Makefile` da raiz do
projeto e reproduzem os passos antes só documentados manualmente no README ("Como rodar
localmente"):

```
make up                              # sobe o Postgres/PostGIS local (docker compose)
make down                            # derruba os containers (mantém o volume)
make db                              # abre client psql interativo no container
make migrate                         # aplica as migrations 0000-0024 na ordem certa
                                      # (inclui schema_qualidade.sql antes da 0011 -
                                      # ver Seção 2, "INCONSISTÊNCIA ARQUITETURAL")
make seed                            # popula o território (seed_municipios.py)
make etl                             # roda a pipeline ETL completa, ordem do README
make etl-source SOURCE=mmgd_aneel    # roda um extractor específico (casa por substring)
make fresh                           # reseta o banco (down -v + up + migrate + seed)
make dev                             # roda o backend em modo watch (npm run dev)
make typecheck                       # roda tsc --noEmit no backend
make build                           # builda o backend (tsc)
make front                           # roda o frontend em modo dev (Vite, porta 5173)
make front-typecheck                 # roda tsc -b no frontend
make front-build                     # builda o frontend (tsc -b && vite build)
```

Ainda **não implementados** (ver justificativa acima e Seção 8):
```
make up-prod
make deploy
make deploy-rebuild
make deploy-first
make send
make shell
make lint
```

**Limitação conhecida de `make etl`:** não cobre pré-requisitos manuais já documentados
no README — autenticação `gcloud application-default login` (RAIS e mortalidade
infantil, via BigQuery) e download manual do CSV de irradiação solar do INPE antes de
`extrair_irradiacao_solar_inpe.py`. Esses passos continuam exigindo intervenção manual;
o Makefile só os documenta em comentário, não os automatiza.

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
