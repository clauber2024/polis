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
- Migrations incrementais 0000 a 0029 - ver `backend/src/db/migrations/`. Numeracao
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
  de escrita do Colaborador e Painel Admin" acima. 0025: `numero_empreendimentos`
  em `mmgd_indicadores` (correção de rótulo do RF-005, ver bloco "Correção de
  rótulo em RF-005 + migration 0025" acima) - aplicada e validada no ambiente
  do usuário em 10/07/2026. 0026: tabela `desempenho_conexao_distribuidoras`
  (ranking público de distribuidoras, ver bloco correspondente). 0027:
  `numero_contratos_reforma_casa_brasil_solar` e `valor_liberado_reforma_
  casa_brasil_solar` em `indicadores_sociais` (ver bloco "Indicador Reforma
  Casa Brasil Solar" acima) - aplicada e validada nesta sessão, 17/07/2026. 0028:
  view `vw_ivsh_consolidado` (IVSH - Índice de Vulnerabilidade Socio-Habitacional-
  Energética = média de IVS + precariedade habitacional + insegurança da posse) -
  ver bloco "Auditoria analítica e IVSH" abaixo - aplicada e validada em 18/07/2026.
  0029: tabela `analises_estatisticas` (infraestrutura estatística integrada,
  resultados de correlação parcial de Spearman materializados via ETL) - ver
  bloco "Infraestrutura estatística integrada" acima - aplicada e validada em
  18/07/2026.
- 21 extractors Python funcionais em `backend/src/etl/loaders/` (territorio, MMGD/ANEEL,
  Infraestrutura Urbana/Censo, Renda e Trabalho/RAIS via BigQuery, Alfabetizacao/Censo,
  Mortalidade Infantil/SIM+SINASC via BigQuery, Moradia/Censo, Tipo de Domicilio/Censo,
  RDPC/Censo, Inadequacao Habitacional, MCMV/FGTS, MCMV/OGU, Favelas/FCU (seed + extract),
  ZEIS/AEIS por capital - SP, Recife, Rio Branco, Rio de Janeiro -, Irradiacao Solar/INPE,
  Tarifa Residencial/ANEEL, Precipitacao Mensal/MERGE-CPTEC-INPE, Reforma Casa Brasil
  Solar/Caixa - unica fonte NAO publica/automatizavel, extrato pontual fornecido pelo
  usuario, ver bloco "Indicador Reforma Casa Brasil Solar" acima) + 2 scripts fora do
  padrao `loaders/`: `backend/src/etl/etl_indqual.py` e
  `backend/src/etl/schema_qualidade.sql` (Qualidade de Fornecimento/ANEEL - ver nota na
  Secao 2). Dentro de `loaders/`, mas fora do padrao "extractor de fonte externa" -
  `calcular_analise_estatistica_moradia_mmgd.py` (18/07/2026): nao baixa/le nenhuma
  fonte nova, so computa e persiste resultado estatistico sobre dado ja no Postgres -
  ver bloco "Infraestrutura estatistica integrada" acima.
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
  CadÚnico" nos sociais, ambas com descricao). VALIDADO no ambiente do
  usuario e commitado em 09/07/2026.

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
  VALIDADO no ambiente do usuario e commitado em 09/07/2026.

- **Divergência de documentação encontrada (10/07/2026):** ao iniciar a
  sessão de login/painéis, o código já continha `PainelAnalitico.tsx` +
  `components/painel-analitico/` + `services/comparacao.service.ts`
  totalmente implementados e roteados em `App.tsx` (RF-049/050/052) — mas
  esta seção do CLAUDE.md nunca foi atualizada para refletir isso (a lista
  "NAO implementado ainda" abaixo ainda os listava como pendentes até esta
  edição). Não foi possível reconstituir em qual sessão/commit isso entrou
  (bash sandbox não acessa este projeto para `git log`, ver "Exceção
  confirmada" na Seção 10) — se for relevante, confirmar com o usuário e
  registrar a data real depois. Mantido aqui como alerta: **não confiar cegamente
  na lista de pendências deste arquivo sem checar o código**, exatamente a
  situação que a checagem de sincronização do topo deste arquivo tenta evitar
  (mas para docs desatualizadas, não para git).
- **Frontend — login + painéis Colaborador/Admin (10/07/2026, RF-009/013/014,
  RF-059 a RF-067, RF-070 a RF-077):** consumindo a fundação de auth e os
  endpoints de escrita já validados nesta mesma sessão (ver blocos "Backend
  Node/Express", "Fundação de autenticação/RBAC" e "Endpoints de escrita do
  Colaborador e Painel Admin" acima). Implementado: `AuthContext.tsx`
  (sessão em Context + `localStorage`, chave `atlas.sessao` — JWT stateless,
  sem endpoint de refresh nesta fundação), `RotaProtegida.tsx` (redireciona
  para `/login` sem sessão, para `/` com sessão mas papel não autorizado),
  `PaginaLogin.tsx` — **inclui RF-011/012** (painel "Perfis de demonstração"
  com as duas contas do seed, clique preenche e-mail/senha automaticamente;
  identificado em 13/07/2026 como divergência de documentação — já estava
  implementado e commitado em `834202f` desde esta sessão, só não constava
  na lista de pendências abaixo até esta correção; badge de papel é só texto,
  sem ícone gráfico — não bloqueante do RF-011, reavaliar se algum dia
  importar), `services/auth.service.ts` +
  `services/colaborador.service.ts` + `services/admin.service.ts` (espelhando
  1:1 os 14 endpoints de escrita já testados via curl), `PainelColaborador.tsx`
  (5 cartões: revisões de bases RF-059, observações RF-060, sugestões RF-061,
  notas metodológicas com histórico RF-064/065/066, materiais de comunicação
  RF-067) e `PainelAdmin.tsx` (4 cartões: metadados técnicos RF-071/072/073,
  fila de aprovação de indicadores RF-074, versões publicadas RF-075, gestão
  de usuários RF-076). Decisões: (1) `http.ts` ganhou `enviarJson` genérico
  (POST/PUT/PATCH/DELETE com `Authorization: Bearer` opcional) e `obterJson`
  ganhou parâmetro `token` opcional — sem quebrar as chamadas existentes;
  (2) o guard de "último administrador"/"não remover a própria conta"
  (RF-076) é tratado 100% no backend — `CartaoGestaoUsuarios.tsx` só exibe a
  mensagem de erro que a API devolver, nunca reproduz a regra no cliente
  (mesmo princípio já usado para a classificação de Vazios de Acesso); (3)
  `formatarDataHora` novo em `utils/formatadores.ts` (America/Sao_Paulo, ver
  "Padrão de Timezone" — os timestamps de revisão/observação/nota/versão
  agora exibidos usam isso, não `Date` bruto). VALIDADO no ambiente do
  usuário em 10/07/2026 (`make front-typecheck` limpo + teste manual no
  navegador: login com as duas contas de demonstração, escrita nos cartões
  de Colaborador/Admin, e RBAC — Colaborador não vê "Painel Admin" nem
  acessa `/admin`).
- **Frontend — heatmap de Vazios de Acesso (09/07/2026, RF-057):** camada
  `heatmap` do MapLibre no mapa existente (não um segundo mapa) + painel-legenda
  `frontend/src/components/mapa/PainelHeatmapVazios.tsx`. Decisões (usuário):
  (1) **modo EXCLUSIVO**, não sobreposição — ligar o heatmap esmaece o
  choropleth para fundo neutro (`COR_FUNDO_MODO_HEATMAP`) e troca a Legenda
  pelo painel do heatmap; cores das duas camadas misturadas eram ilegíveis;
  (2) **peso = IVS** (critério de priorização padrão do RF-056), normalizado
  min–max NO CLIENTE dentro do conjunto de vazios, com piso
  `PESO_MINIMO_HEATMAP = 0.2` (IVS nulo/mínimo não pode pesar 0 — o município
  continua sendo um vazio classificado). Normalização é apresentação (mesma
  régua da barra do ranking); a CLASSIFICAÇÃO segue 100% do backend, mesmo
  fetch lazy (`garantirVaziosCarregados`). Pontos = centro do bbox de cada
  município (`frontend/src/utils/geometria.ts` — `bboxDaGeometria` movida de
  `MapaMunicipios.tsx` para lá + `centroDaGeometria`; centro de bbox pode cair
  fora de polígono côncavo, irrelevante para densidade kernel — se um dia
  precisar de ponto garantido dentro, é ST_PointOnSurface no backend). O
  painel-legenda exibe a `notaMetodologica` do endpoint (o backend exige que
  ela acompanhe qualquer exibição da classificação — campo novo em
  `VaziosDeAcessoCompleto`, frontend/services). Rampa violeta (mesma
  identidade do destaque/badges). Camada criada lazy; desligar só esconde
  (`visibility: none`). VALIDADO no ambiente do usuario em 09/07/2026
  (typecheck limpo + teste visual: esmaecer/restaurar, concentração no
  Nordeste, convivência com o destaque).
- **Landing Page + Dashboard Público (10/07/2026, RF-001 a RF-008, RF-046 a
  RF-048):** primeira landing institucional do Atlas — até esta sessão "/"
  ia direto para o mapa (não existia landing nenhuma). Backend: novo
  endpoint `GET /api/estatisticas-nacionais` (RF-005,
  `backend/src/services/estatisticasNacionais.service.ts` +
  controller/route dedicados) — dos 6 números pedidos pelo RF-005, só 3 são
  calculáveis com o schema atual (sistemas MMGD conectados, potência total
  instalada, municípios com presença de MMGD, agregados via SQL sobre a
  mesma CTE `mmgd_latest` já validada em municipios.service.ts); os outros 3
  ("pessoas beneficiadas por créditos de energia", "participação da solar
  distribuída na matriz elétrica nacional", "projeção futura de potência")
  exigem dado que o Atlas não tem (recorte de beneficiários de geração
  compartilhada da ANEEL; total de geração nacional do Brasil como
  denominador; modelo de projeção) — expostos em
  `indicadoresIndisponiveis`, cada um com o motivo, NUNCA fabricados (mesmo
  princípio já usado no RF-034/TSEE). Também no backend: filtro de faixa de
  potência instalada (`potenciaMin`/`potenciaMax`, RF-046) adicionado a
  `listarMunicipiosQuerySchema` — propaga automaticamente para
  `GET /api/municipios` e `GET /api/municipios/exportar` (RF-047) por
  herdarem o mesmo schema base. **RF-046 também pede filtro por "período",
  NÃO implementado** — decisão do usuário (10/07/2026): documentar como
  exclusão (mesma limitação já registrada para RF-034), não simular um
  filtro que não filtra nada de verdade. **CORREÇÃO importante (mesma
  sessão)**: a frase "o schema só guarda o snapshot mais recente, sem série
  temporal" é IMPRECISA — verificado que `mmgd_indicadores` tem chave única
  em `(unidade_espacial_id, periodo_referencia)`, não em `unidade_espacial_id`
  sozinho (migration 0000) — o schema comporta múltiplos períodos por
  município; os services é que sempre pegam só o mais recente via
  `DISTINCT ON`. Ver ARQUITETURA.md, seção "RF-005 (Landing Page) — 3
  indicadores nacionais ainda não calculados", para o achado completo e o
  próximo passo (checar quantos períodos distintos já existem de fato antes
  de prometer o filtro/projeção).
  Frontend: `pages/PaginaLanding.tsx` (RF-001 a RF-008 — hero com 2 CTAs,
  seção explicativa, indicadores nacionais com badge "Em breve" honesto
  para os 3 indisponíveis, fontes de dados, Referências Metodológicas
  separada citando o OBEPE sem listá-lo como fonte primária — RF-007/
  RT-005/RF-078 — e footer). **Reestruturação de rotas**: "/" virou a
  landing pública; o mapa/dashboard migrou de "/" para "/mapa"; App.tsx
  ganhou `LayoutApp` (header interno com nav/busca/sessão, antes inline no
  próprio `App()`) envolvendo todas as rotas exceto a landing via
  `<Outlet/>` do react-router-dom v7. Ajustes de consequência: `BuscaMunicipio`
  navega para `/mapa?municipio=...` (antes `/?municipio=...`),
  `RotaProtegida` redireciona papel não autorizado para `/mapa` (antes
  `/`), `PaginaLogin` usa `/mapa` como destino default pós-login (antes
  `/`). Novo `components/mapa/PainelFiltrosDashboard.tsx` (RF-046: UF,
  região, faixa de potência, período desabilitado com tooltip explicando a
  exclusão) + botões de download CSV/GeoJSON (RF-047, reaproveitando
  `baixarArquivo` de `services/http.ts`, já existente desde a sessão do
  Painel Analítico mas ainda não usado por nenhuma tela até agora). Filtro
  aplicado CLIENT-SIDE sobre o GeoJSON nacional já carregado (mesma
  arquitetura de "buscar uma vez, filtrar localmente" já usada em
  PainelRanking) — nova prop `codigosVisiveis` em `MapaMunicipios.tsx`
  esconde (não esmaece) municípios fora do filtro via `setFilter` do
  MapLibre nas camadas de preenchimento E contorno; independente do
  destaque/heatmap de Vazios de Acesso, de propósito (fora do escopo do
  RF-046). Painel de Filtros e o Ranking estadual (RF-030) são mantidos
  mutuamente exclusivos (mesma largura, mesmo lado esquerdo do mapa).
  VALIDADO no ambiente do usuário em 10/07/2026 (`make typecheck` e
  `make front-typecheck` limpos, sem erro em nenhum dos dois — bash sandbox
  não roda esses comandos direto, ver Seção 10, "Exceção confirmada").
  Teste manual no navegador (landing, filtros, download) ainda não feito
  nesta sessão — fica para quando o usuário abrir a aplicação.
- **Correção de rótulo em RF-005 + migration 0025 (10/07/2026):** ao investigar
  pedido do usuário para viabilizar os 3 indicadores indisponíveis da landing
  (ver ARQUITETURA.md, seção "RF-005"), foi confirmado por inspeção real do
  Parquet ANEEL/MMGD que `numero_ucs_com_mmgd` (coluna existente desde a
  migration 0000) **nunca** representou "sistemas/instalações conectados" —
  sempre foi soma de `QtdUCRecebeCredito` (UCs beneficiadas por crédito de
  energia, que excede o número de instalações em modalidade Compartilhada/
  Auto consumo remoto). O card "Sistemas MMGD conectados" da landing (mesma
  sessão, implementado antes desta correção) exibia o número certo com o
  rótulo errado. Corrigido: `GET /api/estatisticas-nacionais` agora expõe
  `totalUcsBeneficiadas` (renomeado) e `totalInstalacoesMmgd` (novo — COUNT
  real de instalações, coluna `numero_empreendimentos`, migration `0025_mmgd_
  indicadores_numero_empreendimentos.sql`, valor que `extrair_mmgd_aneel.py`
  já calculava via `groupby(...).count()` mas descartava antes do INSERT).
  **Efeito colateral positivo**: `totalUcsBeneficiadas` já é, na prática, o
  dado bruto que o RF-005 item 4 ("pessoas beneficiadas por créditos de
  energia") pede — só falta decidir um fator de conversão UC→pessoas (ex.:
  média de moradores por domicílio, IBGE), documentado como estimativa.
  VALIDADO no ambiente do usuário em 10/07/2026: migration 0025 aplicada
  (`make migrate`, sem erro nela própria — os `ERROR`s no log pertencem a
  migrations antigas re-executadas contra um banco já provisionado, ruído
  conhecido e pré-existente, não regressão desta sessão) e
  `extrair_mmgd_aneel.py` reexecutado com sucesso: 4.523.648 instalações
  agregadas nacionalmente (`numero_empreendimentos`) contra 8.063.052 UCs
  beneficiadas por crédito (`numero_ucs_com_mmgd`) — confirma a proporção
  ~1,78 já observada na inspeção direta do Parquet. `make typecheck` e
  `make front-typecheck` limpos.
  **"Pessoas beneficiadas" (RF-005 item 4) resolvido na mesma sessão, como
  ESTIMATIVA** (decisão do usuário): `numero_ucs_residencial` (subconjunto
  RESIDENCIAL, não o total) × 2,79 pessoas/domicílio (IBGE, Censo 2022) —
  exposto em `pessoasBeneficiadas.pessoasBeneficiadasEstimativa`, removido
  de `indicadoresIndisponiveis`. Landing sempre rotula "(estimativa)" de
  forma visível, nunca escondida em tooltip. Ver ARQUITETURA.md "RF-005"
  para a fonte completa do fator de conversão.
- **Frontend — relatório PDF (RF-058) e drill-down de setores censitários
  (RF-043/RF-045), 13/07/2026:** os dois endpoints de backend já existiam
  (`GET /municipios/:codigoIbge/relatorio` e `/setores-censitarios`) sem
  interface — fechado nesta sessão. Ambos em `PainelMunicipio.tsx` (RF-025):
  (1) botão "Baixar relatório-resumo (PDF)" logo abaixo do cabeçalho,
  reaproveitando `baixarArquivo` de `services/http.ts` (mesmo padrão de
  RF-047/052) — nova função `baixarRelatorioTerritorio` em
  `municipios.service.ts`; (2) seção colapsável "Ver detalhamento interno" no
  fim do painel, só renderizada quando o backend confirma
  `temGranularidadeFina` (hoje só São Paulo, 3550308 — seed ilustrativo da
  migration 0021) — busca lazy por município via nova função
  `buscarSetoresCensitarios`, falha silenciosa (ausência de granularidade
  fina não é erro, RF-043). Ao expandir, mostra o aviso "Cenário ilustrativo"
  (RF-045) e a lista de setores ordenada por potência instalada com barra
  proporcional, mesmo padrão visual do `PainelRanking.tsx` (posição implícita
  pela ordenação, não numerada — RF-043 não define indicador padrão de
  ordenação, potência total foi a escolha mais direta de justificar).
  Novos tipos `SetorCensitario`/`SetoresCensitariosResultado` em
  `types/api.ts`, incluindo a mesma correção de campos `numeric` do Postgres
  chegando como string (`normalizarSetor`, mesmo bug de `normalizarMunicipio`
  já documentado acima). VALIDADO no ambiente do usuário em 13/07/2026
  (`make front-typecheck` limpo + teste manual: download do PDF num
  município qualquer, expansão do detalhamento em São Paulo).
- **Frontend — adaptação de layout do protótipo AI Studio, fases 2/3
  (14/07/2026):** o usuário gerou um protótipo visual no Google AI Studio
  (repo `clauber2024/Atlas-Solar` no GitHub — Gemini, dados 100% mockados,
  mapa D3 com 18 municípios-ponto) e pediu para adaptar o layout de lá ao
  frontend real. Decisão de escopo (usuário): adotar SÓ o visual/estrutura
  de telas; NUNCA a substância fabricada pelo Gemini — em particular o
  "Índice de Vazio de Acesso 0-100 com pesos 35/30/20/15" do protótipo é
  INVENTADO (a metodologia real segue sendo medianas nacionais + exclusões,
  no backend), assim como "esforço energético", "cobertura estimada" e o
  threshold "GHI > 5.0". Implementado nesta sessão: (1) header do
  `LayoutApp` (App.tsx) — logo com quadrado violeta + subtítulo mono, abas
  com `NavLink` (sublinhado violeta na rota ativa), links de Painel
  Colaborador/Admin como badges âmbar/vermelho; (2) `PaginaMapa`
  reestruturada no padrão de 3 colunas do protótipo — sub-header (seletor
  de indicador com label mono + "Nota Científica" exibindo
  `indicador.descricao` + toggle de heatmap em botão violeta + checkbox de
  destaque + avisos operacionais) e corpo `flex` com sidebar fixa em ABAS
  (Ranking | Filtros, substituindo os painéis mutuamente exclusivos
  abertos por botões flutuantes sobre o mapa) + mapa + `PainelMunicipio`
  como coluna direita (inalterado); (3) `PainelRanking`/
  `PainelFiltrosDashboard` viraram conteúdo de aba — perderam `aoFechar`/
  largura própria; o fetch lazy dos badges de vazio (RF-032) migrou de
  "abrir o ranking" para "escolher uma UF" (nova prop `aoEscolherUf`).
  MapLibre, deep links (`?municipio=`), classificação de vazios no backend
  e notas de ausência: intocados.
  **Divergências de documentação encontradas nesta sessão** (mesma classe
  do alerta de 10/07): (a) a "fase 1" dessa adaptação (fontes
  Inter/Space Grotesk/JetBrains Mono + tokens no `index.css`) e o restyle
  da landing/painéis JÁ estavam feitos e commitados por sessão de
  12/07/2026 que não atualizou este arquivo; (b) a rota e página
  `/ranking-distribuidoras` (`PaginaRankingDistribuidoras.tsx`) não tinha
  registro aqui — reconstituída via `docs/PLANO_ATUAL.md` (versão anterior
  a 14/07): é o frontend da tarefa "ranking público de distribuidoras" de
  10/07/2026 (migration 0026 + `GET /api/ranking-distribuidoras`, backend
  validado); o `make front-typecheck` daquela página constava como
  pendente lá — cobre-se junto com a validação desta sessão.
  Complemento na mesma sessão (pedido do usuário): **zoom por estado** —
  escolher UF no ranking OU no filtro enquadra o estado no mapa;
  `FocoMunicipio` virou `FocoMapa` (`{ codigoIbge } | { uf }`), bbox da UF =
  união dos bboxes dos municípios dela (GeoJSON já carregado).
  VALIDADO no ambiente do usuário em 14/07/2026 (`make front-typecheck` +
  teste manual do roteiro completo, confirmado pelo usuário).
- **Frontend — ideias do protótipo `atlas-mmgd-solar` (14/07/2026, mesma
  sessão da adaptação de layout):** segundo protótipo do usuário (gerado
  com Manus — stack MySQL/tRPC/Google Maps NÃO adotada, conflita com o
  padrão do projeto; só as ideias de produto). Decisões do usuário: manter
  o header superior (NÃO migrar para a sidebar escura do protótipo) e
  implementar 3 features: (1) **scatter de quadrantes** no Painel Analítico
  (`GraficoQuadrantes.tsx`, SVG próprio, sem lib nova) — com os EIXOS REAIS
  da metodologia (irradiação × MMGD residencial per capita, medianas do
  backend), NÃO o "MMGD × IVS" do protótipo (IVS é priorização RF-056, não
  eixo); classificação município a município 100% do backend via
  `buscarClassificacaoNacionalCompleta()` (paginação completa, ~28
  requisições, LAZY por botão), eixo Y truncado no p97,5 só para exibição
  (aviso explícito); (2) **ranking nacional de Vazios de Acesso**
  (`PaginaVaziosDeAcesso.tsx`, rota `/vazios-de-acesso`) — paginação
  server-side na ordenação de priorização padrão do backend (IVS
  decrescente), filtro por UF, nota metodológica sempre visível; (3)
  **status das bases** (`PaginaStatusDados.tsx`, rota `/status-dados`) —
  primeira interface do RF-063, em cima de `GET /api/bases-de-dados` (novo
  espelho `basesDeDados.service.ts` no frontend + tipos em `api.ts`).
  Refactor colateral: `buscarTodosVaziosDeAcesso` virou wrapper de
  `paginarClassificacao()` (mesma lógica, agora parametrizada);
  `VaziosDeAcessoCompleto` ganhou `eixoX`/`eixoY`. Header ganhou os links
  "Vazios de Acesso" e "Dados" ("Ranking de Distribuidoras" encurtado para
  "Distribuidoras"). Score composto 40/40/20 de distribuidoras do
  protótipo NÃO adotado (pesos inventados; nosso ranking tem ADR próprio).
  "Diagnóstico por IA por município" registrado como ideia, sem decisão.
  VALIDADO no ambiente do usuário em 14/07/2026 (typecheck + teste manual
  do scatter, /vazios-de-acesso e /status-dados, confirmado pelo usuário).
- **Limite de estados no mapa (14/07/2026, mesma sessão):** camada de
  referência com o contorno das UFs por cima do choropleth (pedido do
  usuário — "facilita a visualização"). Backend: `GET /api/estados`
  (`estados.service.ts` + controller/route) — FeatureCollection com o
  contorno de cada UF via `ST_Union` das geometrias municipais, SEM
  simplificação adicional de propósito (o union casa exatamente com as
  divisas municipais desenhadas por baixo; simplificar de novo descolaria
  os traços em zoom alto). ST_Union nacional é caro (segundos) → cache em
  memória de processo, calculado na primeira requisição (reiniciar o
  backend invalida). Frontend: `estados.service.ts` (espelho) + camada
  `line` em `MapaMunicipios.tsx` (`CAMADA_ESTADOS`, slate-700, largura por
  zoom), inserida ABAIXO do destaque violeta de Vazios de Acesso de
  propósito; busca em paralelo com o GeoJSON nacional, falha silenciosa
  (camada de referência, não bloqueante).
  **Rótulos de município por zoom (mesma sessão):** symbol layer
  (`CAMADA_ROTULOS`) com o nome do município aparecendo a partir do zoom 6
  (tamanho crescente com o zoom, colisão resolvida pelo MapLibre). Pontos =
  centro do bbox (mesmo helper/ressalva do heatmap). Texto em MapLibre exige
  servidor de glyphs — estilo ganhou `glyphs:
  demotiles.maplibre.org/font/...` (endpoint público da própria MapLibre;
  mesma classe de dependência leve das Google Fonts do index.css — a decisão
  "sem basemap externo" é sobre TILES, não fontes; alternativa futura é
  servir PBFs do backend). Rótulos ficam POR CIMA do heatmap (beforeId) e
  acompanham o filtro do Dashboard Público (RF-046). Fonte usada:
  "Open Sans Semibold" — se os rótulos não aparecerem na validação, checar
  no console se o fontstack existe no endpoint.
  **Validação parcial (15/07/2026):** typecheck limpo e rótulos de município
  OK, mas o limite estadual NÃO apareceu na primeira validação — correção
  aplicada: `ST_MakeValid(geom)` antes do `ST_Union` (geometria municipal
  simplificada no seed pode ser inválida → TopologyException, que a falha
  silenciosa do frontend engole). Na mesma sessão (15/07, pedidos do
  usuário): `CAMADA_ESTADO_DESTACADO` — contorno slate-900 mais grosso na
  UF escolhida no ranking/filtro (estado `ufDestacada` na PaginaMapa;
  `aoEscolherUf` agora também é chamado com '' para limpar) — e
  `CAMADA_ROTULOS_ESTADOS` — nome do estado (uppercase, centro do bbox da
  UF) no zoom amplo, com maxzoom = minzoom dos rótulos de município (6):
  aproximou, saem estados e entram municípios.
  VALIDADO no ambiente do usuário em 15/07/2026 (curl do endpoint devolvendo
  GeoJSON + teste visual completo, confirmado pelo usuário).
  **Contorno do município selecionado (15/07/2026, mesma sessão):**
  `CAMADA_MUNICIPIO_DESTACADO` — mesma solução do destaque de estado, agora
  para o município selecionado (clique/busca/ranking): line slate-900
  engrossando com o zoom, ACIMA do destaque violeta de Vazios (é a seleção
  ativa do usuário). Prop `codigoDestacado` em MapaMunicipios, alimentada
  por `municipioSelecionado` na PaginaMapa — some ao fechar o painel.
  VALIDADO no ambiente do usuário em 17/07/2026 (teste manual no navegador:
  selecionar por clique/busca/ranking engrossa o contorno, fechar o painel
  remove — ver bloco abaixo, mesma sessão de validação).
- **Seleção de estado por clique no mapa (16/07/2026, RF-027/028) e transições
  visuais suaves ao alternar camadas (16/07/2026, RF-022):** dois commits
  (`e82eea1`, `ce3e4b8`) feitos em sessão que não atualizou este arquivo —
  reconstituídos por inspeção de `git log`/`git show` em 17/07/2026 (mesma
  classe de divergência de documentação já registrada acima em 10/07 e
  14/07; **não é o mesmo problema que a checagem de sincronização do topo
  deste arquivo cobre** — não havia commit remoto ausente, o histórico local
  e remoto estavam iguais, só este arquivo ficou desatualizado). RF-027/028:
  abaixo do zoom 6 (visão nacional), clicar num estado seleciona a UF —
  enquadra o estado, destaca o contorno (`CAMADA_ESTADO_DESTACADO`,
  reaproveitada) e muda a sidebar para a aba Ranking com o dropdown
  pré-selecionado. Implementado via `CAMADA_ESTADOS_FILL` (fill transparente,
  `opacity: 0.001`, `maxzoom: 6`) sobre `FONTE_ESTADOS`, capturando cliques
  antes do handler de clique de município (que retorna cedo abaixo do mesmo
  zoom — o `maxzoom` da camada de estado é o árbitro de qual clique
  "ganha"). `PainelRanking` virou componente controlado (`ufSelecionada`
  como prop, substitui o `useState` interno) para o clique no mapa e o
  dropdown do painel atualizarem o mesmo estado sem duplicação — unificados
  em `aoEscolherUfRanking` na `PaginaMapa`. RF-022: transições nativas do
  MapLibre via propriedades `*-transition` no paint (sem interpolação manual
  nem `requestAnimationFrame`, exceto o fade-in inicial do heatmap, que
  precisa de um frame para o layer existir no canvas antes do
  `setPaintProperty`) — `fill-color-transition`/`fill-opacity-transition` no
  choropleth (500ms/300ms, cobre troca de indicador e o esmaecimento ao
  ligar o heatmap) e `heatmap-opacity-transition` (400ms) no heatmap, que
  trocou de `setLayoutProperty('visibility')` para `setPaintProperty
  ('heatmap-opacity', 0 | 0.8)` — `visibility` não anima, opacidade sim.
  **VALIDADO no ambiente do usuário em 17/07/2026**: `make front-typecheck` e
  `make typecheck` (backend) limpos, ambos executados diretamente nesta sessão
  (o bash sandbox conseguiu montar o caminho do projeto desta vez — WSL nativo,
  não UNC do Windows; reavaliar se a exceção da Seção 10 ainda se aplica em
  sessões futuras). Backend (`make dev`) e frontend (`make front`) subidos e
  testados manualmente pelo usuário no navegador: contorno de seleção de
  município, clique em estado (enquadra + destaca contorno + abre aba Ranking
  com UF pré-selecionada) e transições suaves de indicador/heatmap — os três
  confirmados funcionando.
- **Indicador Reforma Casa Brasil Solar (17/07/2026):** primeira fonte do
  Atlas que NÃO é pública/automatizável — o usuário forneceu um PDF (extrato
  pontual do sistema interno da Caixa, SIC), não uma URL de dado aberto.
  Motivação: capítulo "Atlas das experiências de MMGD solar" (Instituto
  Pólis, relatório que o usuário está redigindo como consultor) cita o
  programa Reforma Casa Brasil como pista para responder "quem tem acesso à
  tecnologia solar". Migration `0027_indicadores_sociais_reforma_casa_
  brasil_solar.sql`: `numero_contratos_reforma_casa_brasil_solar` e
  `valor_liberado_reforma_casa_brasil_solar` em `indicadores_sociais`
  (+ `vw_indicadores_sociais_consolidado` atualizada). Extractor novo
  `backend/src/etl/loaders/extrair_reforma_casa_brasil_solar.py` (dependência
  nova no venv: `pypdf`, ver `requirements.txt`) — lê o PDF direto de
  `BASE_DOWNLOADS` (mesmo padrão dos `seed_zeis_*`), casa município por
  nome+UF normalizado (sem código IBGE na fonte; 2 exceções de grafia via
  alias explícito — ver docstring do extractor) e agrega os 6 meses cobertos
  (nov/2025–abr/2026) num total único por município, sem série temporal
  (mesmo padrão de `unidades_habitacionais_fgts`). Rodado e validado contra o
  banco local nesta sessão: 1.093 municípios, 3.253 contratos, R$
  61.377.571,09 liberados — bate exatamente com o PDF; idempotência
  confirmada (2 execuções, mesma contagem). Backend: `municipios.service.ts`
  expõe as duas colunas + derivado `contratosReformaCasaBrasilSolarPer10000Hab`
  (per capita, mesmo padrão de `mmgdPer1000Hab`, necessário porque o valor
  absoluto favoreceria cidades grandes). Frontend: nova camada de mapa
  "Acesso ao Reforma Casa Brasil Solar" (`utils/indicadores.ts`, usa o
  per-capita) + novo grupo "Acesso a financiamento" no painel RF-025
  (`PainelMunicipio.tsx`, valores absolutos) + nota explícita em
  `notasAusencia.ts` (município sem contrato no período fica `null`, mas
  isso não é lacuna de cobertura como as demais notas desta função — é
  ausência real de contrato no recorte de 6 meses de uma fonte pontual).
  Um segundo PDF fornecido junto ("Reforma casa brasil - geral.pdf", todas as
  modalidades, 333 páginas) NÃO foi ingerido — decisão do usuário, escopo
  limitado à modalidade solar. Ver ARQUITETURA.md, seção "Decisões de
  fontes", para o achado completo (inclusive as 2 exceções de casamento de
  nome). VALIDADO nesta sessão: migration aplicada, extractor executado com
  0 falhas, `make typecheck`/`make front-typecheck` limpos (rodados direto
  nesta sessão), endpoint `GET /api/municipios/:codigoIbge` testado ao vivo
  (curl) confirmando os novos campos. Teste manual no navegador (nova camada
  de mapa, novo grupo do painel) ainda NÃO foi feito nesta sessão — fica para
  quando o usuário abrir a aplicação.
- **Auditoria analítica moradia×solar e IVSH (18/07/2026):** a pedido do
  usuário, produzido `docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md` — auditoria
  do motor de dados sob a lente de moradia como eixo transversal do acesso à
  MMGD (contexto: capítulo "Atlas das experiências de MMGD solar", Instituto
  Pólis). A auditoria corrigiu 3 premissas desatualizadas com base em leitura
  direta do código (não do enunciado do pedido): ZEIS/AEIS já cobre 8
  municípios, não 4 (commit `9c29c8e`, já presente no histórico antes desta
  sessão); o piloto de setor censitário de São Paulo (migration 0021) é
  SINTÉTICO — distribui um total municipal real proporcionalmente por área
  numa grade artificial, não é uma leitura fina real do Censo; e o
  cruzamento MCMV × Reforma Casa Brasil Solar só é possível em nível
  municipal-agregado (a fonte da migration 0027 não tem chave de
  indivíduo/domicílio). Achado central: o IVS Consolidado (`vw_ivs_
  consolidado`, migration 0015) EXCLUI moradia por decisão de arquitetura
  documentada (evitar endogeneidade ao testar "MMGD x moradia") — o que
  significa que a priorização padrão de Vazios de Acesso (RF-056) não
  captura vulnerabilidade habitacional. Rodadas nesta sessão, direto contra
  o banco local, 3 consultas analíticas replicando fielmente a metodologia
  de `vaziosDeAcesso.service.ts` (medianas nacionais, mesma regra de
  exclusão de município pendente de reextração de MMGD): confirmaram que
  precariedade habitacional (`indice_precariedade_moradia`, migration 0014)
  e o quadrante Vazio de Acesso são dimensões PARCIALMENTE INDEPENDENTES —
  municípios com contrato Reforma Casa Brasil Solar têm ~51-70% mais
  precariedade habitacional média que os sem contrato, mas isso não se
  traduz em maior presença no quadrante Vazio de Acesso (que na verdade é
  proporcionalmente MENOR nos municípios com contrato — 20,8% vs 27,3% —,
  e quando ocorre recebe 31% menos recurso per capita que nos municípios já
  bem servidos). Ver o relatório para as 3 tabelas completas. A partir
  desse achado, implementado nesta mesma sessão o **IVSH** (Índice de
  Vulnerabilidade Sócio-Habitacional-Energética) — migration 0028
  (`vw_ivsh_consolidado` = média de IVS + precariedade habitacional +
  insegurança da posse), SEM alterar `vw_ivs_consolidado` nem `vw_indices_
  compostos_moradia_infraestrutura` existentes — e novo valor `ivsh` em
  `CRITERIOS_ORDENACAO` (`vaziosDeAcesso.schema.ts`) + campo `ivsh` em
  `MunicipioClassificado`/`buscarPainelBruto` (`vaziosDeAcesso.service.ts`),
  disponível via `GET /api/vazios-de-acesso?ordenarPor=ivsh`. VALIDADO nesta
  sessão: migration aplicada no banco local (5.573 municípios com IVSH
  calculado), `npx tsc --noEmit` do backend limpo, endpoint testado ao vivo
  com o backend rodando localmente (`npm run dev` + curl, processo encerrado
  ao final do teste). **NÃO implementado nesta sessão**: nenhuma mudança de
  frontend — `ivsh` existe na API mas ainda não há seletor de critério de
  priorização na interface (o frontend usa sempre o padrão do backend, que
  continua sendo `ivs`, não `ivsh`).
- **Verificação das "rotas de leitura pendentes" do DRF + 2 lacunas reais
  fechadas (18/07/2026):** pedido do usuário partiu da premissa de que só
  `GET /api/vazios-de-acesso` existia como leitura real — checado o código
  em `backend/src/routes/` e isso está desatualizado: municípios (detalhe,
  lista com filtros, comparação, exportação CSV/GeoJSON/XLSX, médias de
  referência, relatório PDF, setores censitários), bases de dados,
  estatísticas nacionais, estados e ranking de distribuidoras já são leitura
  real e pública. Das lacunas genuínas remanescentes, verificadas por
  inspeção direta do banco local (`docker exec polis_postgres psql`) nesta
  sessão: **RF-034 (ranking por variação no período) permanece IMPOSSÍVEL de
  implementar com dado real hoje, confirmado (não só assumido)** —
  `mmgd_indicadores` e `irradiacao_solar` têm 1 único `periodo_referencia`
  cada; `indicadores_sociais` tem 6 valores distintos de `periodo_referencia`
  (2022-01-01 a 2026-07-06), mas são timestamps de EXECUÇÃO de extractores
  diferentes carregando COLUNAS diferentes (Censo 2022, CadÚnico, Reforma
  Casa Brasil Solar etc.), não medições repetidas do mesmo indicador — a
  view `vw_indicadores_sociais_consolidado` já faz `MAX(coluna)` por
  `unidade_espacial_id` corretamente para lidar com isso, mas não existe
  nenhum indicador com 2+ medições reais no tempo para calcular variação.
  Implementar RF-034 agora exigiria fabricar uma "variação" sempre igual a
  zero — mantido como exclusão documentada, não pendência de código.
  Implementado de fato nesta sessão: (1) **RF-010** — link "Esqueci minha
  senha" em `PaginaLogin.tsx`, com aviso honesto (não existe fluxo de
  recuperação por e-mail no protótipo) em vez de simular um envio que nunca
  chegaria a lugar nenhum; (2) **RF-062/066** — `CartaoNotasMetodologicas.tsx`
  (Painel Colaborador) já era, na prática, o "visualizador de documentação
  metodológica" pedido pelo RF-062 (GET `/api/notas-metodologicas` é
  público), só não estava rotulado como tal — cabeçalho atualizado para
  citar RF-062 explicitamente; "força do achado" trocou de número plano
  (`força 3/5`) para escala visual de estrelas (RF-066 pede exatamente
  "escala de estrelas ou barras"). VALIDADO nesta sessão: `npx tsc -b` do
  frontend limpo. Teste manual no navegador (link de senha, estrelas no
  cartão de notas) ainda NÃO feito — fica para quando o usuário abrir a
  aplicação.
- **Infraestrutura estatística integrada (18/07/2026):** implementação da
  Recomendação Priorizada #3 de `docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md`
  ("testar formalmente o modelo controlado de MMGD residencial per capita
  sobre `indice_precariedade_moradia`, controlando irradiação e renda").
  Decisão de escopo pedida explicitamente ao usuário antes de implementar
  (não presumida) — ver `docs/DECISOES.md`, ADR "Infraestrutura estatística
  integrada": motor **fixo, materializado via ETL** (mesmo padrão do
  "ranking público de distribuidoras", migration `0026`), não microsserviço
  Python sob demanda nem reimplementação em TypeScript nem motor genérico
  para variáveis arbitrárias. Migration `0029_analises_estatisticas.sql`
  cria a tabela `analises_estatisticas` (uma linha por par
  variável-x/variável-y testado).
  Script novo `backend/src/etl/loaders/calcular_analise_estatistica_moradia_
  mmgd.py` — reutiliza o algoritmo de correlação parcial de Spearman por
  resíduo de postos já validado em
  `backend/src/etl/analises/analisar_correlacao_mmgd_renda.py`, mas
  controlando **renda e irradiação simultaneamente** (controle conjunto que
  o script exploratório não fazia) e lendo `potencia_residencial_kw` direto
  do Postgres (migration `0020`) em vez de reprocessar o Parquet bruto da
  ANEEL. Testa as 2 variáveis do eixo moradia (`indice_precariedade_moradia`,
  `indice_seguranca_posse`) contra `mmgd_potencia_residencial_per_1000_hab`,
  com checagem de robustez regional (sinal mantido em quantas das 5
  regiões). **Bug real encontrado e corrigido nesta sessão**: `psycopg2` não
  adapta `numpy.float64` (retorno nativo de scipy/numpy) — o valor caía no
  fallback `repr()` do SQLAlchemy e gerava SQL inválido
  (`np.float64(0.1524)` lido como referência a um schema `np`); corrigido
  convertendo para `float()` nativo antes do upsert. Backend: novo endpoint
  público `GET /api/analises-estatisticas`
  (`analisesEstatisticas.service/controller/routes.ts`, mesmo padrão sem
  query params de `rankingDistribuidoras.*`, envelope sempre com
  `metodologia` + `notaMetodologica`). **Resultado real (n=5.570
  municípios)**: Precariedade Habitacional confirma a hipótese do Pólis
  (rho parcial −0,1524, robusto em 4/5 regiões, efeito não diluído por
  renda/irradiação); Segurança da Posse teve sinal invertido face ao
  esperado (rho parcial −0,2976, não investigado a fundo) — achado
  reportado com transparência, não suavizado, ver
  `docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md`, "Registro de Implementação —
  Infraestrutura Estatística" para a leitura completa e o próximo passo
  sugerido. VALIDADO nesta sessão: migration aplicada no banco local, script
  rodado 2x (idempotência confirmada via `ON CONFLICT (variavel_x,
  variavel_y) DO UPDATE`), `npx tsc --noEmit` do backend limpo, endpoint
  testado ao vivo (`npm run dev` + curl, processo encerrado ao final).
  **NÃO feito nesta sessão**: nenhuma mudança de frontend (mesmo precedente
  do IVSH — API primeiro, UI depois).
- **Auditoria de blindagem contra mau uso de proxies (18/07/2026):** a
  pedido do usuário, revisão de ponta a ponta da política de "ausência
  justificada de dado" (`frontend/src/utils/notasAusencia.ts`, citada no
  próprio `docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md`, Seção 4) e do
  isolamento do piloto sintético de setores censitários de São Paulo
  (migration 0021, `e_dado_ilustrativo = 'true'`). **Confirmado como já
  correto** (nenhuma mudança necessária): todo service que agrega
  `mmgd_indicadores` em nível municipal/nacional (`municipios.service.ts`,
  `vaziosDeAcesso.service.ts`, `estatisticasNacionais.service.ts`,
  `basesDeDados.service.ts`, e o script Python
  `calcular_analise_estatistica_moradia_mmgd.py`) filtra
  `ue.tipo = 'municipio'` no JOIN com `unidades_espaciais` — as 28+ linhas
  sintéticas por setor de São Paulo nunca contaminam nenhum agregado
  nacional nem o cálculo de correlação estatística; e
  `setoresCensitarios.service.ts` já expõe `eDadoIlustrativo` por setor +
  `avisoIlustrativo` agregado, nunca fabricando o aviso quando não há dado
  ilustrativo. **Bug real encontrado e corrigido** nesta auditoria:
  `DetalhamentoSetores` (dentro de `PainelMunicipio.tsx`, drill-down
  RF-043) usava `potenciaInstaladaKw ?? 0` tanto na ordenação quanto no
  cálculo da barra proporcional — um setor sem potência medida (`null`)
  virava visualmente "setor com potência ≈0" (barra de 2% de largura) em
  vez de "sem dado", violando a mesma regra que `formatarValor` já respeita
  no rótulo textual ao lado (`'sem dado'`) e que `ordenarMunicipios` já
  respeita em `municipios.service.ts` (nulo sempre por último, nunca tratado
  como extremo). Corrigido: ordenação com nulo explicitamente por último
  (mesmo padrão do backend) e a barra não é mais renderizada quando o valor
  é nulo (em vez de aparecer com largura mínima falsa). Hoje é um cenário
  teórico (todas as linhas do piloto SP têm valor preenchido pela migration
  0021), mas o componente já está correto para quando setores reais/parciais
  da ANEEL existirem. VALIDADO nesta sessão: `npx tsc -b` do frontend e
  `npx tsc --noEmit` do backend limpos (nenhum arquivo de backend alterado,
  rodado só como checagem de linha de base). Teste manual no navegador
  ainda NÃO feito nesta sessão.

**NAO implementado ainda** (apesar de descrito em secoes deste documento como padrao):
- Backend Node/Express: endpoints de LEITURA (`GET /api/vazios-de-acesso`,
  `/api/municipios` + variantes, `/api/bases-de-dados`, export CSV/GeoJSON/XLSX,
  relatorio PDF), fundacao de auth (`POST /api/auth/login`/`logout`, RBAC 3 papeis) e
  endpoints de ESCRITA do Colaborador/Admin (RF-059 a RF-077, migrations 0023/0024 - ver
  acima) implementados, mas **ainda nao validados no ambiente do usuario nesta sessao**.
  RF-070 ("upload de bases") implementado so como workflow/status, NAO recebimento de
  arquivo via API - decisao explicita do usuario, ver bloco acima.
- Frontend React - INICIADO em 09/07/2026 (fundação + mapa, ver bloco acima).
  Landing page (RF-001 a RF-008) e download CSV/GeoJSON pela interface
  (RF-047) implementados em 10/07/2026 — ver bloco "Landing Page + Dashboard
  Público" acima, typecheck validado (teste manual no navegador ainda
  pendente). Painel analítico/comparação
  (RF-049/050/052) já estava implementado no código antes desta sessão (10/07/2026),
  mas sem registro aqui — ver bloco "Divergência de documentação encontrada" acima.
  Busca por município no header (RF-026), painel de ranking estadual (RF-030 a
  RF-036, com exclusões documentadas), heatmap de Vazios de Acesso (RF-057,
  09/07/2026), login + painéis Colaborador/Admin (RF-009 a RF-014, RF-059 a
  RF-067, RF-070 a RF-077, 10/07/2026 — validado no ambiente do usuário, ver
  bloco acima), relatório-resumo em PDF (RF-058) e drill-down de setores
  censitários (RF-043/RF-045, 13/07/2026 — validado no ambiente do usuário,
  ver bloco acima) implementados — ver blocos acima.
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
  heatmap) implementado no frontend e validado em 09/07/2026 (ver bloco acima) -
  dimensao completa: classificacao, ranking e heatmap

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
│       │   │   ├── mmgd_indicadores.ts   (+ potenciaResidencialKw/numeroUcsResidencial, migration 0020;
│       │   │   │   + numeroEmpreendimentos, migration 0025 — ver "Correção de rótulo" acima)
│       │   │   ├── indicadores_sociais.ts (+ percentualPobrezaCadunico, drift da migration 0013 corrigido 07/07/2026;
│       │   │   │   + numeroContratosReformaCasaBrasilSolar/valorLiberadoReformaCasaBrasilSolar, migration 0027)
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
│       │   └── migrations/        (SQL incremental - IMPLEMENTADO, 0000 a 0028)
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
│       │       ├── 0024_admin_escrita.sql          (NOVO 08/07/2026 - RF-070 a RF-077
│       │       │     + usuarios.ativo)
│       │       ├── 0025_mmgd_indicadores_numero_empreendimentos.sql (NOVO
│       │       │     10/07/2026 - contagem real de instalações MMGD, ver
│       │       │     "Correção de rótulo" em Estado Real do Projeto)
│       │       ├── 0026_desempenho_conexao_distribuidoras.sql (ranking
│       │       │     público de distribuidoras, ver ARQUITETURA.md)
│       │       ├── 0027_indicadores_sociais_reforma_casa_brasil_solar.sql
│       │       │     (NOVO 17/07/2026 - ver "Indicador Reforma Casa Brasil
│       │       │     Solar" em Estado Real do Projeto)
│       │       └── 0028_view_ivsh_consolidado.sql (NOVO 18/07/2026 - view
│       │             `vw_ivsh_consolidado`, ver "Auditoria analítica moradia
│       │             ×solar e IVSH" em Estado Real do Projeto)
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
│       │   ├── admin.routes.ts       (NOVO 08/07/2026 - RF-070 a RF-077)
│       │   └── estatisticasNacionais.routes.ts (NOVO 10/07/2026 - RF-005, Landing Page)
│       ├── controllers/            (IMPLEMENTADO 07/07/2026)
│       │   ├── vaziosDeAcesso.controller.ts
│       │   ├── auth.controller.ts    (NOVO 08/07/2026)
│       │   ├── colaborador.controller.ts (NOVO 08/07/2026)
│       │   ├── admin.controller.ts       (NOVO 08/07/2026)
│       │   └── estatisticasNacionais.controller.ts (NOVO 10/07/2026)
│       ├── services/                (IMPLEMENTADO 07/07/2026 - lógica de negócio isolada aqui)
│       │   ├── vaziosDeAcesso.service.ts  (RF-055/056/057 - ver docstring do arquivo
│       │   │   para a metodologia completa)
│       │   ├── auth.service.ts      (NOVO 08/07/2026 - bcryptjs + jsonwebtoken)
│       │   ├── colaborador.service.ts (NOVO 08/07/2026)
│       │   ├── admin.service.ts       (NOVO 08/07/2026 - inclui guard de
│       │   │   "ultimo administrador", ver Estado Real do Projeto)
│       │   └── estatisticasNacionais.service.ts (NOVO 10/07/2026 - RF-005: 3
│       │       agregados reais + indicadoresIndisponiveis documentados, ver
│       │       Estado Real do Projeto)
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
│               ├── extrair_precipitacao_mensal_merge.py
│               └── extrair_reforma_casa_brasil_solar.py (NOVO 17/07/2026 -
│                     unica fonte NAO publica/automatizavel, ver Estado Real
│                     do Projeto)
├── frontend/                       (INICIADO 09/07/2026 - fundação + mapa interativo)
│   ├── package.json                (React 19, react-router-dom 7, maplibre-gl 5,
│   │                                Tailwind v4. Scripts: dev/build/typecheck/preview)
│   ├── vite.config.ts              (plugins react + tailwindcss; proxy /api → :3000)
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json  (strict, project refs)
│   ├── index.html
│   └── src/
│       ├── main.tsx                (entrypoint - StrictMode + BrowserRouter)
│       ├── App.tsx                 (rotas: "/" landing pública + LayoutApp
│       │                            envolvendo /mapa, /painel-analitico, /login,
│       │                            /colaborador, /admin — NOVO 10/07/2026, antes
│       │                            "/" ia direto pro mapa, ver Estado Real do Projeto)
│       ├── index.css               (@import "tailwindcss" + altura 100%)
│       ├── pages/
│       │   ├── PaginaLanding.tsx   (NOVO 10/07/2026 - RF-001 a RF-008)
│       │   └── PaginaMapa.tsx      (busca dados via services, estado da página;
│       │                            agora também dono do estado de filtros RF-046)
│       ├── components/
│       │   ├── BuscaMunicipio.tsx  (busca do header, RF-026 - fora de mapa/ de propósito;
│       │   │                        navega para /mapa?municipio=..., antes /?municipio=...)
│       │   └── mapa/               (isolados de lógica de negócio - CLAUDE.md Seção 4)
│       │       ├── MapaMunicipios.tsx  (MapLibre: choropleth + destaque + heatmap RF-057
│       │       │   + filtro RF-046 via prop codigosVisiveis, NOVO 10/07/2026)
│       │       ├── Legenda.tsx
│       │       ├── PainelMunicipio.tsx (detalhe do município clicado, RF-025)
│       │       ├── PainelRanking.tsx   (ranking estadual, RF-030 a RF-036)
│       │       ├── PainelHeatmapVazios.tsx (painel-legenda do heatmap, RF-057)
│       │       └── PainelFiltrosDashboard.tsx (NOVO 10/07/2026 - RF-046/047,
│       │           painel controlado, ver Estado Real do Projeto)
│       ├── services/               (todo fetch passa por aqui, nunca em componente)
│       │   ├── http.ts             (cliente central, trata { erro: { mensagem } };
│       │   │                        baixarArquivo() finalmente usado por RF-047)
│       │   ├── municipios.service.ts (+ exportarMunicipios, NOVO 10/07/2026)
│       │   ├── vaziosDeAcesso.service.ts
│       │   └── estatisticasNacionais.service.ts (NOVO 10/07/2026 - RF-005)
│       ├── types/
│       │   └── api.ts              (espelho manual dos contratos do backend)
│       └── utils/
│           ├── formatadores.ts     (Intl pt-BR)
│           ├── geometria.ts        (bbox + centro de bbox, RF-026/057 - sem turf)
│           ├── indicadores.ts      (catálogo de camadas choropleth + quintis)
│           └── notasAusencia.ts    (ausência justificada de dado, painel RF-025)
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
make migrate                         # aplica as migrations 0000-0025 na ordem certa
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

## 🔟 Fluxo de Trabalho do Assistente de IA

### Princípio geral
Aja como responsável técnico da tarefa, não apenas como quem dá instruções para o
usuário executar. Leia arquivos, pesquise o código, edite e rode comandos diretamente
sempre que tiver acesso e segurança para isso — não peça para o usuário fazer
manualmente o que você pode fazer.

**Exceção confirmada neste projeto:** comandos de `git`, `make migrate`/`typecheck`/
`build`/`etl` e afins devem ser pedidos para o usuário rodar no WSL dele — o bash
sandbox não consegue montar o caminho WSL do projeto
(`\\wsl.localhost\ubuntu\home\clauber\projetos\atlas-solar-justo`, erro "UNC paths are
not supported"), confirmado em múltiplas sessões. O `Read`/`Edit`/`Write` de arquivos
funciona normalmente nesse caminho — só `git`/build/migrations via shell é que não. Fora
essa exceção, prefira agir diretamente.

Antes de uma alteração relevante, explique em poucas linhas: o que vai fazer, quais
arquivos serão afetados, riscos, e como vai validar. Para ações destrutivas ou
irreversíveis, credenciais, produção, exclusão de dados ou migrations, peça confirmação
antes de executar.

### Início de sessão
Além da checagem de sincronização obrigatória (topo deste arquivo): leia este
`CLAUDE.md`, consulte `ARQUITETURA.md` / `docs/PLANO_ATUAL.md` / `DESAFIOS.md` conforme
a tarefa, e examine a estrutura real do projeto antes de propor mudanças. Não assuma que
uma informação antiga (inclusive deste próprio arquivo) continua válida sem conferir o
estado atual do código.

Em tarefas com várias etapas, mantenha `docs/PLANO_ATUAL.md` atualizado: objetivo,
decisões tomadas, arquivos modificados, etapas concluídas, próximo passo, bloqueios e
comandos de validação. Atualize ao concluir etapas relevantes, sem registrar detalhes
desnecessários da conversa.

### Sessões longas
Sugira iniciar uma nova sessão quando uma etapa importante for concluída, o assunto
mudar claramente, o contexto acumulado prejudicar a precisão, ou houver repetição/perda
de informação importante. Antes de sugerir, registre em `docs/PLANO_ATUAL.md` o
necessário para a continuação, e ofereça um prompt curto de retomada.

### Memória e aprendizado
- `CLAUDE.md` — regras permanentes, arquitetura, convenções, forma de trabalho.
- `DESAFIOS.md` — problemas recorrentes, limitações conhecidas, soluções validadas
  (formato na subseção seguinte).
- `docs/DECISOES.md` — decisões técnicas estruturais relevantes (formato ADR).
- Skills (`.claude/skills/`) — quando o aprendizado for um procedimento reutilizável e
  bem definido (ex.: `etl-atlas`, já existente). Verifique o conteúdo atual antes de
  alterar uma skill, e preserve o que continuar válido.

Registre só o que for recorrente, específico deste projeto, útil em sessões futuras, não
óbvio ao examinar o código, e confirmado durante o trabalho. Não registre hipóteses
ainda não verificadas, detalhes temporários, ou histórico completo da conversa.

### Registro de desafios (`DESAFIOS.md`)
Formato por entrada: Nome do desafio / Contexto / Sintoma / Causa confirmada / Solução
validada / Prevenção / Arquivos ou componentes relacionados. Só marque a causa como
"confirmada" quando ela realmente foi verificada — caso contrário, registre como
hipótese ainda não confirmada.

### Decisões técnicas (`docs/DECISOES.md`)
Para escolhas relevantes de arquitetura, biblioteca, framework, banco, API, padrão de
código, segurança, estrutura de pastas, autenticação, testes ou deploy: apresente de 2 a
4 alternativas realmente viáveis, com vantagens, desvantagens, complexidade, impacto em
manutenção/segurança, aderência ao que já existe (Seção 1️⃣) e custo de migração futura.
Termine com uma recomendação clara, priorizando simplicidade, segurança, manutenção,
baixo acoplamento, reutilização e compatibilidade com o stack já em uso — não introduza
biblioteca nova quando o stack atual já resolve. Registre decisões estruturais em
`docs/DECISOES.md`, formato ADR quando fizer sentido (contexto, decisão, alternativas
consideradas, consequências, data).

### Escolha do modelo
Ao considerar qual modelo é mais adequado para o próximo passo: capacidade maior para
arquitetura, decisões de alto impacto, depuração complexa, análise de segurança e
refatorações amplas; equilibrado para implementação normal, testes, revisão de código e
documentação; rápido/econômico para buscas simples, alterações mecânicas, formatação e
tarefas repetitivas de baixo risco. Quando fizer diferença, mencione a troca em uma
frase — não interrompa uma tarefa simples só para sugerir isso.

### Execução e validação
Depois de alterar código, rode os testes/lint/typecheck relevantes quando o ambiente
permitir (ver exceção do bash sandbox acima) e diga claramente o que foi de fato
executado com sucesso versus o que ainda precisa ser rodado pelo usuário. Nunca afirme
que algo foi testado quando o comando correspondente não foi executado com sucesso.

### Formato das respostas
Durante o trabalho, responda de forma objetiva. Ao concluir uma etapa, informe: o que
foi feito, quais arquivos foram alterados, como foi validado, o que falta, e se há
alguma decisão pendente. Evite repetir longamente o pedido, narrar cada ação trivial,
apresentar planos genéricos sem examinar o projeto, ou afirmar sucesso sem validação.

Quando houver algo que dependa exclusivamente de uma decisão do usuário, feche a
resposta com um bloco separado:

```
## ⚠️ PENDENTE
**Decisão necessária:** ...
**Opções:** ...
**Recomendação:** ...
**Impacto da espera:** ...
```

Não use esse bloco para algo que você mesmo pode resolver examinando o projeto.

Quando não houver nenhuma ação técnica nem decisão pendente, finalize a resposta com
`✅ SESSÃO FINALIZADA` — usar somente quando a tarefa estiver concluída, as validações
possíveis já tiverem sido executadas, não houver bloqueios, não houver decisão aguardando
resposta do usuário, e o contexto necessário para o futuro já estiver documentado.

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
