# Deploy público temporário — Railway + Vercel

> Ver `docs/DECISOES.md`, seção "Hospedagem pública temporária (pré-handoff Instituto
> Pólis) — 2026-07-22", para o raciocínio e as alternativas descartadas. Este documento é
> só o passo a passo operacional.

**Objetivo:** publicar o Atlas Solar Justo (backend + banco + frontend) numa URL pública,
sem depender da própria máquina, de forma barata e fácil de transferir de posse para o
Instituto Pólis quando essa conversa acontecer. Não é a arquitetura de produção definitiva
da Seção 8 do CLAUDE.md (Nginx/certbot/`docker-compose.prod.yml`) — é uma ponte temporária.

**Arquitetura:**
- **Railway** (1 projeto, 2 serviços): Postgres/PostGIS (imagem Docker
  `postgis/postgis:16-3.4`, igual à local) + backend Node/Express.
- **Vercel** (1 projeto): frontend estático (Vite build).
- Conteúdo do banco: dump do Postgres local (já populado e validado) restaurado no
  Postgres do Railway — não replay de migrations + ETL na nuvem.

**Custo aproximado:** Railway Hobby ~US$5/mês (inclui US$5 de uso — CPU/memória/egress
acima disso são cobrados à parte). Vercel Hobby é gratuito, mas só para uso não-comercial
(compatível com o estágio atual do projeto). Confirme os valores atuais em
railway.com/pricing e vercel.com/pricing antes de assinar, pois planos mudam.

---

## 0. Pré-requisito: rodar `npm install` no backend

Nesta sessão já foram feitas 2 mudanças de código necessárias para produção (frontend e
backend em domínios diferentes exigem CORS, que não existia até agora):
- `backend/package.json` — dependência `cors` adicionada.
- `backend/src/app.ts` / `backend/src/config/env.ts` — middleware CORS + variável
  `FRONTEND_URL`.

O `npm install` para baixar o pacote `cors` de fato **precisa ser rodado por você**, no seu
terminal WSL nativo (o sandbox deste ambiente esbarra no mesmo problema de caminho UNC já
documentado no CLAUDE.md ao tentar escrever em `node_modules`):

```bash
cd backend
npm install
npm run typecheck   # deve ficar limpo
```

Depois disso, confirme localmente antes de subir para a nuvem:

```bash
make build   # cd backend && npm run build — precisa compilar sem erro
```

---

## 1. Criar conta no Railway e o projeto

1. Acesse [railway.com](https://railway.com) e crie uma conta (pode entrar com GitHub).
2. Assine o plano **Hobby** (necessário para deploys que ficam no ar — o trial gratuito é
   limitado e temporário).
3. "New Project" → **Empty Project**.

## 2. Subir o Postgres/PostGIS

Dentro do projeto:
1. "+ New" → serviço a partir de **imagem Docker** (na UI atual do Railway isso aparece
   como "Empty Service" com opção de trocar a fonte para "Docker Image" nas configurações
   do serviço — o texto exato pode variar, procure por "Deploy from Docker Image").
2. Imagem: `postgis/postgis:16-3.4` (mesma do `docker-compose.yml` local — isso evita
   qualquer incompatibilidade de versão do PostGIS no restore).
3. Renomeie o serviço para `postgres`.
4. Em **Variables**, adicione:
   ```
   POSTGRES_USER=atlas
   POSTGRES_PASSWORD=<gere uma senha forte — veja comando abaixo>
   POSTGRES_DB=atlas_solar_justo
   ```
   Gere a senha com:
   ```bash
   openssl rand -base64 24
   ```
   **Não reutilize `atlas_dev_local`** (senha de dev local) — este banco, ao menos
   temporariamente, ficará acessível pela internet (passo 4).
5. Em **Settings → Volumes**, adicione um volume montado em `/var/lib/postgresql/data`
   (sem isso, qualquer redeploy apaga os dados).
6. Deploy o serviço e aguarde ficar saudável (Railway mostra o status).

## 3. Subir o backend

1. "+ New" → **GitHub Repo** → selecione o repositório do Atlas Solar Justo (autorize o
   Railway a acessar o GitHub, se pedido).
2. Nas **Settings** do novo serviço:
   - **Root Directory**: `backend` (o repo é um monorepo — sem isso o Railway tenta
     buildar a raiz, que não é um app Node).
   - Build/start: até 30/07/2026 o Railway detectava automaticamente via Nixpacks (scripts
     `build`/`start` do `package.json`), sem Dockerfile nenhum. **Isso mudou** — ver Seção 9
     abaixo ("Trocar Nixpacks por Dockerfile"), necessário pra disparar ETL pela interface.
   - **Healthcheck Path** (opcional, mas recomendado): `/health` (já existe em
     `backend/src/app.ts:27`).
3. Em **Variables** do serviço backend:
   ```
   DATABASE_URL=postgresql://atlas:${{postgres.POSTGRES_PASSWORD}}@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/atlas_solar_justo
   JWT_SECRET=<gere um valor forte>
   JWT_EXPIRES_IN=8h
   NODE_ENV=production
   FRONTEND_URL=<preencher depois do passo 6, com a URL da Vercel>
   ```
   - `${{postgres.POSTGRES_PASSWORD}}` e `${{postgres.RAILWAY_PRIVATE_DOMAIN}}` são
     **referências de variável** do Railway ao serviço `postgres` criado no passo 2 — a UI
     oferece um seletor para isso ao digitar `${{`. Isso usa a rede privada do projeto
     (mais rápido e mais seguro do que expor o Postgres publicamente para o backend
     acessar).
   - Gere o `JWT_SECRET` com:
     ```bash
     openssl rand -hex 32
     ```
     **Nunca** use o valor padrão de dev (`dev-secret-local-nao-usar-em-producao...`) —
     ver `backend/src/config/env.ts:41`.
4. Deploy. O Railway atribui uma URL pública tipo `https://<algo>.up.railway.app` (ative
   em Settings → Networking → "Generate Domain", se não vier automático).
5. Anote essa URL — é o `VITE_API_URL` do passo 6.

Neste ponto o backend sobe, mas o banco ainda está **vazio** (só a extensão PostGIS
inicial, sem as tabelas/migrations/dados) — próximo passo.

## 4. Migrar os dados: dump local → restore no Railway

**4.1 — Exportar o banco local** (a partir da raiz do projeto, com `make up` rodando):

```bash
docker compose exec -T postgres pg_dump -U atlas -d atlas_solar_justo -Fc > atlas_dump.dump
```

Isso gera `atlas_dump.dump` (formato binário `pg_dump -Fc`) na raiz do projeto, com TODAS
as tabelas, migrations já aplicadas e dados já carregados pelo ETL.

**4.2 — Obter a URL pública do Postgres do Railway** (temporariamente):

No serviço `postgres` do Railway → Settings → Networking → habilite **"TCP Proxy"**. Ele
gera um host/porta público, algo como `roundhouse.proxy.rlwy.net:12345`. Monte a URL:

```
postgresql://atlas:<A_SENHA_DO_PASSO_2>@roundhouse.proxy.rlwy.net:12345/atlas_solar_justo
```

**4.3 — Restaurar** (usando a mesma imagem Docker, sem precisar instalar `psql`/`pg_restore`
localmente):

```bash
docker run --rm -v "$PWD":/dump postgis/postgis:16-3.4 \
  pg_restore --no-owner --no-privileges --if-exists --clean \
  -d "postgresql://atlas:<SENHA>@roundhouse.proxy.rlwy.net:12345/atlas_solar_justo" \
  /dump/atlas_dump.dump
```

É esperado aparecer 1-2 avisos do tipo `extension "postgis" already exists` (a imagem já
cria a extensão por padrão) — pode ignorar, o restante do restore continua normalmente.
Confira ao final se apareceu algum erro que **não** seja sobre a extensão já existir.

**4.4 — Depois de confirmar que os dados chegaram** (passo 5), **desative o TCP Proxy** do
Postgres em Settings → Networking. O backend continua acessando via rede privada
(`RAILWAY_PRIVATE_DOMAIN`, já configurado no passo 3) — não há motivo para o banco
continuar exposto à internet depois da migração inicial.

## 5. Testar o backend

```bash
curl https://<sua-url>.up.railway.app/health
curl https://<sua-url>.up.railway.app/api/estatisticas-nacionais
```

O primeiro deve responder `{"status":"ok"}`; o segundo, os agregados nacionais reais (se
retornar erro de conexão com o banco, confira a `DATABASE_URL` do passo 3 e se o restore do
passo 4 realmente terminou sem erros graves).

## 6. Subir o frontend na Vercel

1. Acesse [vercel.com](https://vercel.com), crie conta (GitHub) e assine — Hobby é
   gratuito.
2. "Add New" → **Project** → importe o mesmo repositório GitHub.
3. Em **Configure Project**:
   - **Root Directory**: `frontend`.
   - Framework Preset: Vercel detecta "Vite" automaticamente.
   - Build Command: `npm run build` (já é `tsc -b && vite build`, conforme
     `frontend/package.json:9`).
   - Output Directory: `dist` (padrão do Vite, detectado automaticamente).
4. Em **Environment Variables**, adicione:
   ```
   VITE_API_URL=https://<sua-url>.up.railway.app
   ```
   (sem barra no final — `frontend/src/services/http.ts:9` já concatena
   `${BASE_URL}${caminho}` e todo `caminho` já começa com `/api/...`).
5. Deploy. A Vercel dá uma URL tipo `https://<projeto>.vercel.app`.
6. Volte ao Railway (serviço backend, passo 3) e preencha `FRONTEND_URL` com essa URL da
   Vercel (ex: `https://atlas-solar-justo.vercel.app`) — sem isso o CORS bloqueia as
   chamadas do frontend em produção. Redeploy o backend após salvar a variável.

> `frontend/vercel.json` (25/07/2026) faz o *rewrite* de qualquer rota para `/index.html`
> — sem ele, a Vercel serve as rotas do React Router (`/mapa`, `/painel-analitico` etc.)
> como arquivo estático literal e devolve 404 ao acessar a URL direto ou dar refresh
> (erro `404: NOT_FOUND` da própria Vercel, não um bug do app). Se recriar o projeto do
> zero na Vercel, confirme que esse arquivo existe antes do primeiro deploy.

## 7. Teste ponta a ponta

Abra a URL da Vercel no navegador: landing page carregando os indicadores nacionais, mapa
em `/mapa` com o choropleth carregando, login funcionando com as contas de demonstração
(`colaborador@atlassolarjusto.dev` / `admin@atlassolarjusto.dev`, senha `123456` — ver
CLAUDE.md, "Fundação de autenticação/RBAC"). Se o mapa não carregar geometria, olhe o
console do navegador — geralmente é `VITE_API_URL` errado ou `FRONTEND_URL` não batendo
(CORS).

**Antes de divulgar publicamente**, considere trocar a senha das contas de demonstração
(`123456`) ou desativá-las via Painel Admin (RF-076) — elas foram pensadas para
demonstração em ambiente controlado, não exposição pública indefinida.

---

## 8. Depois do deploy inicial: continuando a desenvolver

O dia a dia de código não muda — você segue rodando `make dev`/`make front` localmente
contra o Postgres local, e todo `git push` para `main` já dispara rebuild automático no
Railway (backend) e na Vercel (frontend), pois ambos foram conectados ao GitHub nos passos
2-6 acima.

O que **não** vem junto no deploy de código: mudanças de schema (novas migrations). Para
isso, dois novos comandos no `Makefile` (mesma lógica do `make migrate` local, rodando via
a mesma imagem `postgis/postgis:16-3.4` em Docker — não precisa instalar `psql`):

```bash
# 1. Reative o TCP Proxy do Postgres no Railway (Settings → Networking do serviço
#    postgres) e copie a URL pública (mesmo passo 4.2 acima).
# 2. Rode as migrations novas contra o banco de produção:
make migrate-prod DATABASE_URL_PROD="postgresql://atlas:<SENHA>@<HOST>.proxy.rlwy.net:<PORTA>/atlas_solar_justo"

# Para inspecionar o banco de produção manualmente (psql interativo):
make db-prod DATABASE_URL_PROD="postgresql://atlas:<SENHA>@<HOST>.proxy.rlwy.net:<PORTA>/atlas_solar_justo"

# 3. Desative o TCP Proxy de novo no Railway ao terminar.
```

`make migrate-prod` roda **todas** as migrations em `backend/src/db/migrations/*.sql`
(igual ao `make migrate` local), não só as novas — é seguro rodar contra um banco que já
tem a maioria delas aplicadas: as migrations antigas vão gerar erros esperados do tipo
`relation "..." already exists` (o `psql` não para no primeiro erro, mesmo comportamento
já documentado para `make migrate` local contra um banco já provisionado) e só as
migrations realmente novas vão de fato criar algo. Confira a saída — qualquer erro que
**não** seja "já existe" merece atenção antes de considerar a migração concluída.

Nova carga de ETL (rodar um extractor de novo, por atualização de fonte) continua manual
**para a maioria das fontes**: rode o extractor localmente contra o banco local e repita o
dump/restore da Seção 4, ou aponte a `DATABASE_URL` do ambiente Python local para o TCP
Proxy do Railway temporariamente. **3 fontes são exceção** desde 30/07/2026 (RF-070
revisitado) — MMGD, Tarifa Residencial e Ranking de Distribuidoras, todas ANEEL, têm botão
de atualização direto no Painel Admin (`/admin`), que dispara o extractor no próprio
container do backend em produção. Requer a Seção 9 abaixo (Dockerfile) já aplicada.

## 9. Trocar Nixpacks por Dockerfile (Node + Python)

Necessário só se você quiser usar o botão "Atualizar agora" do Painel Admin (Seção 8) — sem
isso o backend sobe normalmente, só sem conseguir rodar extractor nenhum pela interface.

1. No serviço do backend na Railway: **Settings → Build** → troque o **Builder** de
   "Nixpacks" para **"Dockerfile"**.
2. **Dockerfile Path**: `Dockerfile` (o arquivo já existe em `backend/Dockerfile` — como o
   Root Directory do serviço já é `backend`, o caminho é relativo a essa pasta).
3. Redeploy. O build agora inclui Python 3 + as dependências de
   `backend/src/etl/requirements-runtime.txt` (só pandas/numpy/sqlalchemy/psycopg2/requests
   — não o `requirements.txt` completo de desenvolvimento, que tem geopandas/BigQuery e
   deixaria a imagem muito mais pesada sem necessidade).
4. Teste: logue como Administrador em `/admin`, clique "Atualizar agora" numa das 3 bases do
   card "Atualização de bases (ETL)", e acompanhe o status mudar de "Atualizando…" para
   "Sucesso"/"Falha" (a tela atualiza sozinha).

Só essas 3 fontes rodam neste container — as demais (RAIS/Mortalidade Infantil via
BigQuery, Irradiação INPE, Reforma Casa Brasil Solar, ZEIS de SP/BH) continuam exigindo
execução manual no ambiente de desenvolvimento (ver `backend/src/utils/
extractoresElegiveis.ts` para a lista exata e o porquê de cada exclusão).

## 10. Credencial do BigQuery (RAIS/Mortalidade Infantil)

RAIS e Mortalidade Infantil usam BigQuery, autenticado localmente via
`gcloud auth application-default login` — um fluxo interativo (abre navegador) que só
funciona numa máquina com tela, nunca dentro de um servidor. Isso não muda com o
Dockerfile da Seção 9: essas duas fontes **não** foram adicionadas à whitelist do botão de
atualização (rodá-las exigiria também inflar a imagem com `google-cloud-bigquery` e
`db-dtypes`, hoje de propósito fora do `requirements-runtime.txt`).

O código já está preparado (`backend/src/etl/loaders/_autenticacao_bigquery.py`,
importado por `extrair_renda_trabalho_rais.py` e
`extrair_capital_humano_mortalidade_infantil.py`) para funcionar em qualquer ambiente sem
`gcloud` interativo, incluindo depois de transferido para o Instituto Pólis — usando uma
**Service Account** (a forma correta de autenticar um servidor no Google Cloud, diferente
do login interativo de usuário). Passo a passo pra gerar essa credencial, sempre que for
necessário rodar uma dessas duas fontes fora da sua própria máquina:

1. No [Google Cloud Console](https://console.cloud.google.com), no projeto usado pelo
   Atlas (`GCP_PROJECT_ID`, ver `backend/src/etl/loaders/extrair_renda_trabalho_rais.py`):
   **IAM e administrador → Contas de serviço → Criar conta de serviço**.
2. Dê um nome (ex.: `atlas-etl-bigquery`) e conceda os papéis **BigQuery Data Viewer** e
   **BigQuery Job User** (só leitura — o Atlas nunca escreve no BigQuery).
3. Na conta de serviço criada: aba **Chaves → Adicionar chave → Criar nova chave → JSON**.
   Isso baixa um arquivo `.json` — **guarde com cuidado, é uma credencial** (nunca
   compartilhe fora de um cofre de senhas/variável de ambiente).
4. Abra o arquivo baixado num editor de texto, copie o conteúdo **inteiro** (é um objeto
   JSON de uma linha ou poucas linhas).
5. Na Railway, no serviço do backend → **Variables** → nova variável:
   ```
   GOOGLE_APPLICATION_CREDENTIALS_JSON=<cole o conteúdo do arquivo JSON aqui>
   ```
6. Redeploy. Ao rodar `extrair_renda_trabalho_rais.py` ou
   `extrair_capital_humano_mortalidade_infantil.py` nesse ambiente (hoje só manualmente —
   não estão na whitelist do botão), o script detecta a variável sozinho e autentica sem
   nenhuma janela/login.

Sem essa variável configurada, os dois scripts continuam funcionando normalmente **na sua
própria máquina** (fluxo `gcloud` local, nada muda) — a Service Account só é necessária
para rodar essas duas fontes fora dali.

## 11. Quando for oferecer ao Instituto Pólis

- **Railway**: Project Settings → "Transfer Project" — transfere posse (e cobrança) para
  a conta/organização do Pólis.
- **Vercel**: Project Settings → "Transfer" (ou convide a conta do Pólis como membro do
  time antes de transferir).
- Domínio próprio (ex. `atlas.institutopolis.org.br`), se o Pólis quiser: configurável em
  ambas as plataformas (CNAME), sem mudar nada do código.

## O que este caminho NÃO cobre (fica para quando a Seção 8 do CLAUDE.md for implementada)

- Nginx/certbot, `docker-compose.prod.yml`, scheduler de ETL automatizado — Railway/Vercel
  cobrem SSL e deploy automaticamente, então parte da Seção 8 fica obsoleta se este caminho
  vingar; reavaliar a seção quando/se isso virar definitivo.
- Atualização periódica dos dados (nova rodada de ETL) continua manual — ver Seção 8 acima
  (`make migrate-prod` cobre só schema, não a carga de dados em si).
- Backup automático do Postgres do Railway — configurar via Railway (planos pagos têm
  backup automático) antes de tratar este ambiente como algo que não pode perder dado.
