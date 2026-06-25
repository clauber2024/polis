# 🚀 Project Standard — Atlas Solar Justo
### Exceção documentada ao Official Project Standard da empresa

---

## 0️⃣ Justificativa da Exceção

O "Official Project Standard" da empresa assume stack Laravel + PHP + MySQL, pensada para
SaaS convencionais (CRUD, multi-tenant, dashboards administrativos). O Atlas Solar Justo é
um WebGIS analítico que depende de:

- **Dados geoespaciais nativos** (geometrias, índices GiST, projeção SIRGAS 2000 / EPSG:4674)
  — recurso central do PostGIS, sem equivalente robusto no MySQL.
- **ETL Python** já em produção para extração ANEEL/IBGE/CadÚnico/INPE, com logging via loguru.
- **Backend Node.js/Express + Drizzle ORM (TypeScript)**, já implementado e funcional.

Por isso, esta é uma exceção justificada e documentada, nos termos previstos pelo próprio
Official Project Standard ("seguido em todos os projetos, salvo exceção justificada e
documentada"). Tudo que é **agnóstico de stack** no padrão oficial (CLAUDE.md, padrão de Git,
checklist de produção, regra de timezone, idempotência, tratamento de erro/modal) é mantido
sem alteração. O que muda é exclusivamente o que depende de Laravel/PHP/MySQL.

---

## 1️⃣ Stack Oficial do Projeto

### 🔹 Backend
- Node.js 20+ (LTS)
- TypeScript 5+
- Express
- Drizzle ORM
- PostgreSQL 16 + PostGIS 3.4
- JWT (autenticação)
- REST JSON API

### 🔹 ETL
- Python 3.12+
- pip + requirements.txt (ambiente isolado em container próprio)
- loguru (logging estruturado)
- Execução em container Docker dedicado (`etl`), não acoplado ao runtime Node

### 🔹 Frontend
- React 19
- TypeScript 5+
- Vite
- Tailwind CSS
- React Router
- Biblioteca de mapas WebGIS (Leaflet ou MapLibre GL — a definir conforme necessidade de
  choropleth + heatmap de densidade simultâneos)

### 🔹 Infraestrutura
- Docker + Docker Compose
- Nginx como reverse proxy
- Cloudflare (quando aplicável)
- Git
- Makefile obrigatório

---

## 2️⃣ Estrutura Oficial do Projeto

```
/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middlewares/
│   │   └── db/
│   │       ├── schema/          (Drizzle schema)
│   │       └── migrations/
│   └── package.json
├── etl/
│   ├── extractors/               (ANEEL, IBGE, CadÚnico, TSEE, IVS/IPEA, INPE)
│   ├── transformers/
│   ├── loaders/
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── pages/
│   ├── components/
│   ├── services/
│   ├── hooks/
│   └── utils/
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.backend.prod
│   ├── Dockerfile.etl
│   ├── Dockerfile.frontend
│   └── nginx/
│       ├── initial.conf
│       └── production.conf
├── CLAUDE.md
├── README.md
├── Makefile
├── docker-compose.yml
├── docker-compose.prod.yml
└── package.json
```

---

## 3️⃣ CLAUDE.md (Obrigatório)

Todo projeto deve incluir um `CLAUDE.md` contendo:

- Regra proibindo commits automáticos
- Padrão de idioma (acentuação correta em português obrigatória)
- Stack tecnológica (Node/Express/Drizzle/PostgreSQL+PostGIS/Python ETL/React)
- Estrutura de pastas
- Comandos do Makefile
- Convenções de código
- Padrões de UI
- Regras de modal, toast e tratamento de erro: ao clicar fora do modal ou pressionar ESC,
  o modal deve fechar
- Tratamento de erro com mensagem clara ao usuário — nunca um simples "Error 500"
- Convenção de unidade espacial: granularidade (município, setor censitário, CEP, bairro)
  é sempre atributo do dado, nunca hardcoded em schema ou componente

Isso garante consistência ao usar IA durante o desenvolvimento.

---

## 4️⃣ Padrões de Código

### 🔹 React
- Apenas componentes funcionais
- Hooks obrigatórios
- Props tipadas via `interface`
- Services isolados em `/services`
- Nenhuma chamada `fetch` direta dentro de componentes
- Componentes de mapa isolados de lógica de negócio (camada de visualização separada de
  camada de dados)

### 🔹 Backend (Node/Express)
- Controllers devem retornar JSON consistente (mesmo formato de envelope em sucesso e erro)
- Validação de entrada via middleware dedicado (ex: zod) antes do controller
- Lógica de negócio deve viver em Services, nunca no controller
- Camada de acesso a dados isolada via Drizzle (sem SQL solto em controllers/services)

### 🔹 ETL (Python)
- Cada fonte primária (ANEEL, IBGE, CadÚnico, TSEE, IVS/IPEA, INPE) tem extractor próprio,
  isolado em `etl/extractors/`
- Logging estruturado via loguru em todas as etapas (extração, transformação, carga)
- Nenhum extractor deve gravar diretamente no banco sem passar por `loaders/`
- Scripts de ETL devem ser idempotentes (reexecutar não deve duplicar dados)

---

## 5️⃣ Padrão de Banco de Dados

Toda tabela deve incluir:

```typescript
id: serial('id').primaryKey(),
createdAt: timestamp('created_at').defaultNow().notNull(),
updatedAt: timestamp('updated_at').defaultNow().notNull(),
deletedAt: timestamp('deleted_at'), // soft delete
```

Relacionamentos:

```typescript
userId: integer('user_id')
  .references(() => users.id, { onDelete: 'cascade' })
  .notNull(),
```

Tabelas com geometria devem declarar projeção explicitamente:

```typescript
geom: geometry('geom', { type: 'MultiPolygon', srid: 4674 }), // SIRGAS 2000
```

Índices espaciais obrigatórios em colunas de geometria:

```sql
CREATE INDEX idx_municipios_geom ON municipios USING GIST (geom);
```

Seeders devem usar upsert (equivalente ao `updateOrCreate` do Laravel):

```typescript
await db.insert(table)
  .values(data)
  .onConflictDoUpdate({ target: table.id, set: data });
```

Usuário e senha de demonstração devem seguir o padrão das 6 personas já definidas no DRF
(ex.: `admin@atlassolarjusto.com.br` / `123456`), nunca usar credenciais genéricas como
`admin@admin.com`.

Nunca usar inserts estáticos que quebrem idempotência.

---

## 6️⃣ Padrão de Git

### Branches
- `main` → Produção
- `develop` → Desenvolvimento (opcional)
- `feature/xxx`
- `fix/xxx`

### Commits
- Mensagens descritivas
- Não misturar funcionalidades não relacionadas
- Padrão de idioma único por projeto (português, dado o domínio do projeto)
- Criar `.gitignore` com boas práticas para Node, Python e React

---

## 7️⃣ Makefile Obrigatório

Comandos mínimos exigidos:

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

⚠️ Nunca usar `node`, `npx drizzle-kit` ou `python` diretamente fora do Makefile.

---

## 8️⃣ Padrão de Deploy

### Arquitetura

Produção roda inteiramente em Docker Compose (`docker-compose.prod.yml`), separado do
compose de desenvolvimento local. Serviços:

- **backend** — Node/Express, buildado a partir de `Dockerfile.backend.prod` (build TypeScript
  compilado para JS, sem `ts-node` em produção).
- **frontend** — build estático (Vite) servido pelo Nginx.
- **etl** — container dedicado, não fica em execução contínua; é acionado por `make etl` ou
  por scheduler (cron container) conforme periodicidade das fontes primárias.
- **scheduler** — roda o loop de jobs periódicos (ex.: atualização mensal ANEEL/MMGD).
- **postgres** — PostgreSQL + extensão PostGIS habilitada, com healthcheck.
- **nginx** (`nginx:alpine`) — reverse proxy / servidor web, portas 80 + 443.
- **certbot** — emissão/renovação Let's Encrypt.

Todos os containers de app compartilham o mesmo `Dockerfile.backend.prod` (ou variante) e
montam o código via volume quando aplicável em dev.

### Configuração Nginx (`production.conf`)

Deve incluir:
- Redirecionamento HTTP → HTTPS (porta 80 → 301 para 443), com `/.well-known/acme-challenge/`
  aberto para o certbot.
- SSL/TLS: TLSv1.2 + TLSv1.3, cifras modernas, cache de sessão, HSTS.
- Headers de segurança: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection,
  Referrer-Policy.
- Gzip habilitado: `gzip on`, `gzip_vary on`, nível de compressão 6, cobrindo
  text/css/js/json/svg/xml.
- Fallback de SPA: `location / { try_files $uri $uri/ /index.html; }`.
- Cache longo para assets estáticos com fingerprint: `expires 1y`, `Cache-Control "public,
  immutable"`, em `/assets/` e extensões `*.(js|css|png|woff2|...)`, com `access_log off`.
- Bloqueio de dotfiles: `/.ht` e `/.env`.
- `client_max_body_size` alinhado ao limite de upload da aplicação (relevante para upload de
  bases de dados no Painel Administrativo).

Manter bootstrap em duas configurações para o primeiro deploy: `initial.conf` (somente HTTP,
sem bloco SSL) copiado para `active.conf` para o Nginx subir antes de existirem certificados;
o certbot emite o certificado; depois troca-se para o `production.conf` completo com SSL.

### Fluxo em duas fases

**Fase 1 — `make send` (código → main)**
Um único comando do diretório de trabalho até o merge em main:
1. Executa `make lint` primeiro.
2. Pergunta a mensagem de commit.
3. Cria branch com timestamp `auto/AAAAMMDD-HHMMSS`, `add -A`, commit (encerra de forma limpa
   se não houver nada para commitar).
4. Faz push e abre MR/PR via CLI (`gh`).
5. Auto-merge em main com remoção da branch de origem, depois `checkout main && pull` e remove
   a branch local.

**Fase 2 — `make deploy` (main → produção)**

`git stash` + `git pull`, depois chama `deploy-full`.

`deploy-full` — núcleo do deploy (passos com cronometragem):

Saída colorida e numerada. Acompanha tempo total e downtime de manutenção separadamente.

1. **Preparar ambiente** — corrige permissões, garante que `active.conf` do Nginx existe.
2. **Instalar dependências do backend** — `npm ci --omit=dev` dentro do container do backend.
3. **Build isolado do frontend** — `docker compose run --rm frontend sh -c "npm ci && npm run
   build"`. Aborta todo o deploy se o build falhar (não tira a aplicação do ar por causa de um
   build quebrado).
4. **Modo de manutenção** — exibe página de manutenção via flag no Nginx (ou middleware Express
   com bypass por secret, equivalente ao `artisan down --secret`). Inicia o cronômetro de
   downtime aqui.
5. **Migrations + restart**:
   - `npx drizzle-kit migrate`
   - executa pipeline ETL se houver atualização de fonte primária pendente
   - sobe infraestrutura (`up -d postgres nginx ...`) e `up -d --force-recreate backend etl
     scheduler`
   - recarrega Nginx (`nginx -s reload`)
6. **Sair do modo de manutenção** — remove a flag de manutenção. Para os cronômetros, grava
   `frontend/public/version.json` com `{ git short hash, commit date }`, imprime tempo total +
   downtime.

**Variantes de deploy**
- `make deploy` — caminho normal: `git pull` + `deploy-full`, sem rebuild de imagem.
- `make deploy-rebuild` — quando `Dockerfile.backend.prod` ou pacotes Node/Python mudaram:
  `compose build` → `up -d backend etl` → `deploy-full`.
- `make deploy-first` — subida inicial do servidor: Nginx `initial.conf`, `compose build`,
  geração de `.env` de produção, `deploy-full`.

**Desenvolvimento (hot reload, sem ciclo down/up)**
- Código montado via volume — alterações no backend são refletidas ao vivo, sem rebuild
  para edições normais.
- Frontend roda com Vite dev server em container próprio, com porta exposta e HMR ativo;
  `make up` inicia tudo e você edita-e-salva sem `make down`/`make up`.
- `make up` deve se auto-curar: `compose down --remove-orphans` seguido de `up -d`, para que
  containers obsoletos nunca bloqueiem um restart.

---

## 9️⃣ Checklist Obrigatório Pré-Produção

- ✅ `.env` configurado
- ✅ Conexão PostgreSQL + extensão PostGIS habilitada (`CREATE EXTENSION postgis;`)
- ✅ JWT funcionando
- ✅ CORS configurado
- ✅ Migrations (Drizzle) executadas
- ✅ Seeders idempotentes
- ✅ Login funcionando para as 6 personas
- ✅ Rotas protegidas por perfil funcionando (RBAC: público, pesquisador, gestor, parceiro,
  equipe, administrador)
- ✅ Pipeline ETL executando sem erros para as 6 fontes primárias
- ✅ Logs limpos (loguru no ETL, logger estruturado no backend)
- ✅ Erros tratados com JSON consistente, nunca "Error 500" cru
- ✅ Build de frontend otimizado
- ✅ Cache habilitado
- ✅ Fluxo completo de autenticação testado
- ✅ Índices GiST validados em todas as colunas de geometria
- ✅ Camadas de mapa renderizando choropleth e heatmap de densidade corretamente

---

## 🔟 Fluxo Oficial de Novo Projeto

1. Criar repositório
2. Subir template base
3. Configurar Docker
4. Criar `CLAUDE.md`
5. Criar `README.md`
6. Inicializar backend Node/Express + Drizzle
7. Configurar PostgreSQL + PostGIS
8. Inicializar React + TypeScript + Vite
9. Configurar Tailwind
10. Implementar autenticação base (JWT)
11. Criar estrutura `etl/` com extractors das fontes primárias
12. Criar Makefile
13. Push do primeiro commit estruturado

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
