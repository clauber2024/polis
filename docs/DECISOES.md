# docs/DECISOES.md — Decisões Técnicas Estruturais

Registro de decisões técnicas relevantes (arquitetura, biblioteca, framework, banco,
API, padrão de código, segurança, estrutura de pastas, autenticação, testes, deploy).
Critério e processo completo em `CLAUDE.md`, seção "🔟 Fluxo de Trabalho do Assistente
de IA" → "Decisões técnicas".

## Integração da participação da MMGD na matriz elétrica nacional (EPE/PDGD) — 2026-07-21

**Contexto:**
`GET /api/estatisticas-nacionais` (RF-005) lista "participação da solar distribuída na
matriz elétrica nacional" em `indicadoresIndisponiveis`, com o número mais recente da
EPE (7,0% em 2025) citado apenas como texto estático na Landing Page (ver
`PaginaLanding.tsx` e `estatisticasNacionais.service.ts`). Usuário pediu para integrar
essa fonte de verdade e passar a tirar snapshots periódicos, em vez de manter o número
congelado no código.

**Decisão (perguntada ao usuário via 3 perguntas antes de implementar):**
1. **Fonte**: Painel de Dados de MMGD da EPE (PDGD,
   `dashboard.epe.gov.br/apps/pdgd`, aba "Geração de Eletricidade") — painel dedicado a
   MMGD (capacidade instalada, geração, projeções), não o Balanço Energético Nacional
   completo (BEN), que é sobre energia total do país e não MMGD-específico.
2. **Captação**: download manual periódico do export do painel (botão "Baixar Dados dos
   Gráficos") + extractor Python lendo o arquivo local — mesmo padrão já usado para
   irradiação solar do INPE e Reforma Casa Brasil Solar/Caixa. Confirmado nesta sessão
   que o PDGD é uma aplicação Shiny (R), renderizada no servidor, sem HTML estático nem
   API pública documentada — não dá para fazer `requests.get()` nele como nos
   CSV/Parquet da ANEEL; tentar descobrir um endpoint JSON não documentado foi
   descartado por fragilidade (pode quebrar sem aviso a qualquer mudança do dashboard).
3. **Schema**: tabela nova e dedicada (nome a definir na implementação, ex.:
   `indicadores_energia_nacional`), NÃO vinculada a `unidades_espaciais` — é um valor
   agregado nacional por ano (`periodo_referencia`), não um dado por município; forçar
   isso no padrão espacial do resto do schema (Seção 5 do CLAUDE.md) seria
   over-engineering para uma série essencialmente escalar.

**Alternativas consideradas:**
- Fonte = BEN em vez de PDGD — descartada porque exigiria calcular a participação MMGD
  manualmente a partir do balanço geral, quando o PDGD já é especializado no assunto.
- Fonte = "as duas" (PDGD para MMGD + BEN para o total nacional, recalculando a
  participação no Atlas) — descartada por ora para não duplicar esforço antes de
  confirmar se o PDGD já expõe o percentual pronto; pode ser revisitado se o export do
  PDGD só trouxer valores absolutos.
- Captação via scraping/engenharia reversa da API interna do dashboard — descartada
  (ver acima).
- Schema reaproveitando `unidades_espaciais` com `tipo = 'pais'` — descartada por ora
  (over-engineering para um valor escalar único por ano); reavaliar se o Atlas um dia
  precisar de mais indicadores nesse mesmo nível nacional/internacional.

**Consequências:**
Sem uma URL de download estável nem confirmação do formato/colunas reais do export
(dashboard não inspecionável por HTTP simples), a extração da estrutura exata do
arquivo e da migration/schema definitivo ficou bloqueada até o usuário baixar o export
da aba "Geração de Eletricidade" do PDGD e compartilhar. Atualização deixa de ser
automática — depende de o usuário lembrar de baixar um novo export quando a EPE
atualizar o painel (frequência de atualização do PDGD não confirmada nesta sessão).

**Resultado final (mesma sessão, depois de obter os dados reais) — CORRIGE o item 1
acima:** a alternativa "as duas fontes" (marcada acima como "descartada por ora") acabou
sendo a que foi implementada, porque a inspeção real do PDGD mostrou que o percentual
pronto daquela aba ("% do Consumo Cativo BR") mede OUTRA coisa (consumo, não geração —
ver `docs/PLANO_ATUAL.md`, "Achado importante"). Para a métrica pedida de fato
("participação na geração nacional"), o PDGD só fornece o NUMERADOR (geração de MMGD em
GWh); o DENOMINADOR (geração elétrica total do Brasil) veio do BEN, Anexo X
("Total Transformação" / "Eletricidade - GWh"). Migration `0030_indicadores_energia_
nacional.sql` implementada com 2 extractors (`extrair_geracao_eletrica_nacional_epe.py`
para o BEN, `extrair_geracao_mmgd_epe_pdgd.py` para o PDGD), ambos rodados e validados
contra o banco local — participação calculada para 2025 = 7,02%, batendo com o número
oficial da EPE (7,0%) já citado na landing. Métrica secundária ("% do Consumo Cativo
BR") NÃO capturada — o gráfico não tem link de download individual no PDGD (só um botão
por aba, que serve o dataset de geração); coluna já existe na tabela para quando surgir
uma forma melhor de captar. A captação do PDGD, na prática, não usou o botão "Baixar
Dados dos Gráficos" da interface (várias tentativas geraram só page-saves `.htm`, não o
dado) — funcionou copiando a URL de download da SESSÃO ATIVA do Shiny
(`.../session/<token>/download/...`) direto do navegador do usuário, que o Claude buscou
via `curl`; não é uma URL reutilizável (expira com a sessão). A pedido do usuário, foi
redigido (e aprovado por ele) um e-mail para a EPE sugerindo API/URL estável de download
e exportação individual por gráfico — envio é responsabilidade do usuário.

---

## "Tour virtual" de achados na Landing Page — carrossel embutido vs. tour guiado na UI — 2026-07-21

**Contexto:**
Pedido do usuário: a Landing Page precisa de uma seção com os principais insights das análises
já feitas (Vazio de Acesso, correlação parcial moradia x MMGD, Reforma Casa Brasil Solar,
descompasso morfológico — ver `docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md` e
`docs/SUMARIO_EXECUTIVO_MORADIA_ENERGIA_SOLAR.md`), com opção de "tour virtual". Decisão pedida
diretamente ao usuário antes de implementar, entre duas abordagens de custo bem diferente.

**Decisão:**
Carrossel embutido na própria Landing Page (`frontend/src/components/landing/TourAchados.tsx`),
100% React/CSS, sem dependência nova. 5 passos: 2 com dado AO VIVO (resumo de
`GET /api/vazios-de-acesso` e `GET /api/analises-estatisticas` — primeiro consumidor de
frontend deste último endpoint, existia só como API desde 18/07/2026), 2 citando achados já
publicados nos relatórios (Reforma Casa Brasil Solar, descompasso morfológico/Uiramutã — não
recalculados aqui, mas os mesmos números já validados, não fabricados), e 1 de CTA para
mapa/painel analítico/ranking de vazios.

**Alternativas consideradas:**
- Tour guiado interativo destacando elementos reais da UI em várias páginas (tipo onboarding de
  produto) — mais imersivo, mas exige biblioteca nova (ex.: `react-joyride`, `driver.js`) e
  integração com várias páginas já existentes (mapa, painel analítico, vazios de acesso) —
  escopo bem maior, não escolhida.

**Consequências:**
Os 2 slides com dado ao vivo dependem de 2 requisições adicionais na Landing Page (falha
silenciosa, mesmo padrão da camada de contornos estaduais no mapa — conteúdo complementar, não
crítico). Os 2 slides com achado citado (não ao vivo) podem divergir do relatório se a base for
reprocessada — não há verificação automática de que o texto do carrossel continua batendo com
os relatórios fonte; reavaliar se algum desses números mudar numa reextração futura.

---

## Framer Motion para animação de componentes de interface — 2026-07-18

**Contexto:**
Pedido do usuário por três "componentes premium" no frontend do mapa (matriz de
dispersão IVSH × MMGD, cartão de alerta de descompasso morfológico e um alternador
animado de critério de priorização IVS/IVSH). O terceiro pede explicitamente um toggle
com transição animada e um tooltip animado explicando o efeito de ligar o IVSH. O
frontend não tinha, até esta sessão, nenhuma biblioteca de animação — as transições mais
recentes do mapa (RF-022, commit `ce3e4b8`) usam propriedades nativas `*-transition` do
MapLibre, sem lib.

**Decisão:**
Adicionar `framer-motion` (`^12.42.2`) como dependência do frontend, usada
especificamente no alternador de priorização (`AlternadorPriorizacaoIvsh.tsx`) para a
transição do toggle e a entrada/saída do tooltip. Decisão pedida diretamente ao usuário
antes de instalar (ver conversa desta sessão) — ele optou por adicionar a lib em vez de
usar só CSS/Tailwind.

**Alternativas consideradas:**
- **CSS/Tailwind puro** (`transition`, `@starting-style`, ou classes condicionais) —
  sem dependência nova, mesmo caminho já validado no RF-022; mais barato de manter, mas
  exige mais código manual para orquestrar a entrada/saída do tooltip (AnimatePresence
  resolve isso em poucas linhas). Opção recomendada por simplicidade, não escolhida.
- **Nenhuma animação** (toggle estático) — atende ao requisito funcional (trocar
  `ordenarPor`), mas não ao pedido explícito de toggle "animado" com tooltip animado.

**Consequências:**
Primeira dependência de animação do projeto — se o uso se espalhar para muitos
componentes, reavaliar se vale a pena padronizar (hoje é uso pontual, um único
componente). Bundle size adicional (~50kb gzip da lib) aceitável nesta fase (sem budget
de performance definido ainda). Não usada em nenhum componente de mapa/MapLibre — as
transições nativas do RF-022 continuam sendo o padrão ali.

## Infraestrutura estatística integrada — motor fixo materializado via ETL — 2026-07-18

**Contexto:**
`docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md`, Seção 2.2, apontou a "ausência de
infraestrutura estatística no backend hoje" — o cálculo de correlações parciais (ex.:
testar se a adoção solar é barrada pela má condição de moradia, controlando irradiação e
renda) ficava restrito a scripts exploratórios em `backend/src/etl/analises/`
(`analisar_correlacao_mmgd_renda.py`), sem persistência nem exposição via API. A
Recomendação Priorizada #3 do mesmo relatório pedia para testar formalmente esse modelo
controlado. Antes de implementar, era preciso decidir ONDE essa computação estatística
roda — decisão explicitamente pedida ao usuário (não presumida).

**Decisão:**
Motor **fixo, materializado via ETL** — um script Python roda a análise já validada
(mesmo algoritmo de correlação parcial de Spearman por resíduo de postos do script
exploratório) e grava o resultado numa tabela nova (`analises_estatisticas`, migration
`0029`); o backend Node/Express só lê e serve via `GET /api/analises-estatisticas`. Sem
novo runtime, sem nova dependência de deploy — mesmo padrão já usado no produto "ranking
público de distribuidoras" (migration `0026`, ADR abaixo). Escopo desta primeira
implementação: só a hipótese literal da Recomendação #3 (MMGD residencial per capita ~
`indice_precariedade_moradia` e `indice_seguranca_posse`, controlando **renda e
irradiação em conjunto**) — não a bateria completa de indicadores do script exploratório,
nem um motor genérico para variáveis arbitrárias.

**Alternativas consideradas:**
- **Microsserviço Python sob demanda** (FastAPI, chamado via HTTP interno pelo Node) —
  verdadeiramente dinâmico, reutiliza scipy sem reimplementar a matemática, mas introduz
  um segundo runtime em produção (hoje só Postgres existe — ver Seção 8 do CLAUDE.md,
  deploy ainda é especificação) e exige desenhar autenticação/rede interna do zero, sem
  demanda real que justifique esse custo agora.
- **Reimplementação em TypeScript** (rank + OLS por resíduo + Pearson, portado para
  Node) — evita segundo runtime, mas duplica a lógica estatística validada em duas
  linguagens (risco real de divergência silenciosa entre o número publicado no relatório
  e o que a API devolveria), e regressões mais complexas exigiriam biblioteca nova no
  Node (hoje nenhuma existe).
- **`child_process` chamando o script Python por request** — reutiliza o código exato
  sem duplicar, mas spawnar um processo Python (import de pandas/scipy) por request
  síncrono de API é frágil para uma rota pública interativa, e mistura o papel do venv
  (ferramenta de ETL/dev) com servir tráfego de produção.
- **Não implementar agora** — deixaria a Recomendação #3 (já formalmente priorizada)
  sem resposta; descartada porque a pergunta específica já estava madura o suficiente
  para materializar sem ambiguidade de escopo.

**Consequências:**
`analises_estatisticas` fica deliberadamente estreita (hoje 2 linhas) — cada hipótese
nova exige rodar/estender
`backend/src/etl/loaders/calcular_analise_estatistica_moradia_mmgd.py` e um novo
`INSERT`, não uma chamada de API parametrizada. Se o Pólis um dia precisar de análises
interativas com variáveis escolhidas pelo usuário na interface, essa é a bifurcação para
reabrir esta decisão a favor do microsserviço (opção descartada acima) — não uma
extensão natural do modelo atual. Exposição no frontend ficou fora do escopo desta
sessão (mesmo precedente do IVSH — API primeiro, UI depois, ver
`docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md`, Seção 3.1).

---

## Ranking público de distribuidoras — exibição, ponderação e nota metodológica — 2026-07-10

**Contexto:**
O produto "ranking público de distribuidoras por desempenho em conexão de MMGD +
justiça energética" foi priorizado em 06/07/2026 (ver ARQUITETURA.md, "Ideia de produto:
ranking público de distribuidoras") e validado como protótipo em
`backend/src/etl/analises/construir_ranking_distribuidoras_conexao_mmgd.py`. Antes de
portar a lógica para o backend Node/Express, faltavam 3 decisões de exibição/metodologia
registradas como pendência no próprio ARQUITETURA.md.

**Decisão:**
1. **Casos `score_apenas_tecnico=True` / `prazo_confiavel=False`**: segregação visual —
   ranking principal só com distribuidoras com os dois eixos disponíveis e prazo
   confiável; seção separada ("dados incompletos") para as demais, com selo explicando o
   motivo (sem par no INDQUAL / DatLim ausente). Nunca competem pela mesma posição
   ordinal do ranking principal.
2. **IVS médio do eixo de justiça energética**: passa a ser ponderado por população
   estimada do município (`Σ IVS×população / Σ população`), não mais média simples.
3. **Nota metodológica sobre a concentração da Equatorial fora-GO no fundo do ranking**:
   nota fixa e visível (não em tooltip) explicando que o score de justiça reflete o
   perfil social dos municípios atendidos, não é medida isolada de desempenho
   operacional da distribuidora.

**Alternativas consideradas:**
- Item 1 — mesmo ranking único com badge inline (mais simples, mas facilita leitura
  errada de quem só olha a posição); excluir do ranking público até completude do dado
  (mais seguro, mas esconde distribuidoras grandes como Cemig-D).
- Item 2 — manter média simples (mais simples, mas município pequeno pesa igual a
  grande); expor as duas métricas lado a lado (mais completo, mais complexidade de UI
  sem ganho claro).
- Item 3 — nenhuma alternativa real considerada viável: o próprio achado em
  ARQUITETURA.md já indica risco de leitura simplista sem a nota.

**Consequências:**
Item 2 depende de `populacaoEstimada` (densidade × área), já calculado no backend desde
a sessão de 10/07/2026 (RF-005) — não é mais bloqueio de dado. Itens 1 e 3 seguem o
mesmo padrão já em uso no projeto (`indicadoresIndisponiveis` do RF-005, notas de
ausência do RF-025): nunca fabricar número, sempre expor "sem dado"/contexto sensível
como categoria própria. Implementação ainda não iniciada — requer nova migration
(persistir o resumo técnico por distribuidora, hoje só em CSV local não versionado),
novo extractor Python, novo service/route/controller Node e nova página frontend.

---

## Limiar de "alta precariedade habitacional" do CartaoDescompassoMorfologico — 2026-07-20

**Contexto:**
Validação manual em navegador do `CartaoDescompassoMorfologico.tsx` (RF novo, pedido do
usuário em 18/07/2026) reportou que o card nunca aparecia, nem para os dois municípios
sugeridos como caso de teste (Uiramutã/RR, Jaboatão dos Guararapes/PE). Investigação via
`GET /api/municipios` paginado (todos os ~5.570 municípios) confirmou que **0 municípios
no país** satisfaziam a condição `indicePrecariedadeMoradia > 0,5` — o corte fixo usado
desde a implementação original. Causa raiz: `indice_precariedade_moradia` (migration
`0014`) é a média de 3 sub-índices (cortiço, parede inadequada, favela) cada um
normalizado min-max **independentemente** — matematicamente quase impossível um único
município ser o pior do Brasil nos 3 ao mesmo tempo, então o composto nacional real nunca
chega perto de 1: máximo observado 0,358 (Fernando de Noronha), mediana 0,0066. O
comentário original do componente ("0,5 é o ponto médio da distribuição observada no
país") estava factualmente errado — nunca foi verificado contra o dado real antes de
escrito.

**Decisão:**
Substituir o corte fixo por um **percentil 90 calculado no backend a partir da
distribuição nacional real** de `indice_precariedade_moradia`, exposto como
`metodologia.limiarPrecariedadeHabitacionalAlta` em `GET /api/vazios-de-acesso`
(`vaziosDeAcesso.service.ts`, reaproveitando o mesmo lazy-load que já alimenta
`medianaIrradiacao` no painel de município). O corte de "alta verticalização"
(`percentualApartamento > 50%`) foi mantido como está — não é miscalibração, é geografia
real do Brasil (municípios com maioria de apartamentos concentram-se no litoral
Sul/Sudeste, onde a irradiância tende a ficar abaixo da mediana nacional, tornando esse
ramo estruturalmente raro em combinação com "alta irradiação", não incorreto).

**Alternativas consideradas:**
- Manter 0,5 documentando o alerta como "raro/quase teórico" — descartada: hoje é
  **impossível**, não raro; manter um corte inatingível não é uma escolha de design
  válida.
- Trocar a métrica de precariedade por outra com faixa mais realista (ex.:
  `percentualPobrezaCadunico`) — descartada: mudaria o que o card mede (pobreza de renda,
  não precariedade construtiva), a pergunta original era especificamente sobre barreira
  física à instalação de telhado.
- Percentil calculado no cliente (mesmo padrão do "aviso, não oficial" já usado no
  `GraficoQuadrantes.tsx` para a mediana de amostra do modo IVSH) — descartada: aqui o
  limiar decide se um alerta real dispara (não é só uma linha de referência visual), e o
  princípio já estabelecido no projeto é que critério de disparo/classificação é sempre
  do backend, nunca recalculado no cliente.

**Consequências:**
`buscarPainelBruto()` ganhou um novo JOIN (`vw_indices_compostos_moradia_infraestrutura`)
só para alimentar o percentil — nenhuma mudança na classificação de quadrante em si. O
limiar é recalculado a cada requisição (não persistido), consistente com como
`medianaIrradiacao`/`medianaMmgdResidencialPerCapita` já funcionam no mesmo service. Se a
distribuição nacional mudar (novo Censo, nova extração), o limiar se ajusta sozinho —
mesma vantagem/risco já aceito para as medianas existentes. Validado nesta sessão: com o
novo limiar (≈0,047), Uiramutã (0,333) e Jaboatão dos Guararapes (0,224) — os dois casos
de teste originais — voltaram a disparar o card corretamente.

---

## Bbox/centro de geometria isolando o maior polígono — bug do rótulo de Espírito Santo — 2026-07-21

**Contexto:**
Usuário reportou, em teste manual no navegador, o rótulo "ESPÍRITO SANTO" aparecendo muito
longe do estado no mapa. Investigação (`docker exec ... psql`) confirmou: o município de
Vitória (3205309) tem bbox de 11,51° de largura contra ~0,7-0,8° dos vizinhos (Linhares,
São Mateus), porque seu território oficial inclui a Ilha da Trindade, ~1.140 km da costa.
`bboxDaGeometria`/`centroDaGeometria` (`frontend/src/utils/geometria.ts`) varriam TODAS as
coordenadas de um `MultiPolygon` sem distinguir partes principais de residuais — o bbox da
união estadual (`/api/estados`, RF usado pelo rótulo de UF) ia até o meio do Atlântico. O
mesmo bug afetava silenciosamente o rótulo do próprio município de Vitória e o `fitBounds`
(zoom) ao selecionar Vitória ou a UF do Espírito Santo pelo ranking/busca/filtro.

**Decisão:**
`bboxDaGeometria` passou a isolar o MAIOR polígono (por área aproximada, fórmula do
shoelace) de um `MultiPolygon` antes de varrer coordenadas — sem exceção hardcoded para
"Vitória"/"Trindade". `centroDaGeometria` herda a correção automaticamente (chama
`bboxDaGeometria`).

**Alternativas consideradas:**
- Exceção hardcoded (remover/ignorar a Ilha da Trindade especificamente para o código IBGE
  3205309) — mais simples de entender, mas frágil e não generaliza para qualquer outro
  município/estado com o mesmo padrão (parte residual muito menor e distante da principal).
- Calcular o ponto de rótulo no backend via `ST_PointOnSurface` (PostGIS) — mais robusto
  geodesicamente, mas exige mudança de contrato de API (`/api/estados`, `/api/municipios`)
  só para um problema resolvível inteiramente no cliente com a geometria já carregada;
  descartada por ora, fica como caminho se o heurístico de área no cliente não bastar.
- Não corrigir, documentar como limitação conhecida — descartada: afeta 3 pontos visíveis
  do produto (rótulo de estado, rótulo de município, zoom), não é um caso de canto raro.

**Consequências:**
`heatmapLigado`/pontos do heatmap (RF-057) também usam `centroDaGeometria` — se Vitória
algum dia for classificada como Vazio de Acesso, o ponto do heatmap também passa a cair na
cidade, não no oceano (efeito colateral positivo, não testado isoladamente). Nenhuma
mudança de contrato de API; fix inteiramente em `frontend/src/utils/geometria.ts`.

**Atualização, mesmo dia — rótulos de MUNICÍPIO tinham o mesmo problema, causa diferente:**
usuário reportou (com captura de tela) rótulos de município da região metropolitana do
Recife (Camaragibe, Paulista, Abreu e Lima) aparecendo fora dos respectivos territórios.
Causa: municípios pequenos/côncavos (comum nessa região) têm o centro do bbox caindo FORA
do próprio polígono (não é o mesmo bug de MultiPolygon disjunto do Espírito Santo — aqui é
polígono único, mas de formato irregular). O próprio código já previa essa limitação e o
caminho de correção (comentário em `centroDaGeometria`: "o caminho para um ponto
garantidamente interno seria ST_PointOnSurface no backend").
Implementado: `GET /api/municipios/exportar?formato=geojson` e `GET /api/estados` passam a
expor `properties.pontoRotulo` (PostGIS `ST_PointOnSurface`, ponto GARANTIDAMENTE dentro do
polígono) — `backend/src/services/municipios.service.ts`
(`buscarGeometriasPorCodigos`/`exportarMunicipiosGeoJson`) e `estados.service.ts` (CTE:
calcula o `ST_Union` uma vez só, `ST_PointOnSurface` roda em cima do resultado já unido,
sem recalcular). Frontend (`MapaMunicipios.tsx`, rótulos de município e de UF) usa
`f.properties.pontoRotulo` como fonte principal, com `centroDaGeometria` só como fallback
defensivo (não deveria disparar com geometria presente). Mudança de contrato de API
(`FeatureMunicipio`/`EstadoFeature` ganham `pontoRotulo`) espelhada em
`frontend/src/types/api.ts` na mesma sessão, conforme regra da Seção 4 do CLAUDE.md.
A correção de `isolarMaiorPoligono` (acima) continua necessária à parte — ela serve o
`fitBounds` (zoom), que usa a geometria inteira, não um único ponto de rótulo.

---

## Hospedagem pública temporária (pré-handoff Instituto Pólis) — 2026-07-22

**Contexto:**
Usuário precisa tirar o Atlas Solar Justo da própria máquina e publicá-lo, para
eventualmente oferecê-lo ao Instituto Pólis — mas essa conversa com o Pólis ainda não
aconteceu, então a hospedagem precisa ser temporária, fácil de transferir de posse depois,
e não pode depender da arquitetura de deploy da Seção 8 do CLAUDE.md (Docker Compose de
produção + Nginx + certbot), que continua só especificação, nunca implementada.

**Decisão:**
Railway (Postgres/PostGIS via imagem Docker `postgis/postgis:16-3.4` idêntica à local +
backend Node/Express, mesmo projeto) + Vercel (frontend estático). Conteúdo do banco vai
por **dump/restore** do Postgres local já populado (`pg_dump -Fc` / `pg_restore`), não por
replay de migrations + ETL na nuvem — evita reautenticar `gcloud` (RAIS/mortalidade
infantil via BigQuery) e rebaixar o CSV do INPE num ambiente novo. Mudanças de código
necessárias: middleware `cors` no backend (`src/app.ts`, `src/config/env.ts` —
`FRONTEND_URL`, ausente até então porque frontend/backend sempre rodaram na mesma origem
via proxy do Vite em dev).

**Alternativas consideradas:**
- Supabase (Postgres gerenciado com PostGIS habilitável) no lugar do Postgres do Railway —
  descartada por ora: versão/extensão do PostGIS pode divergir da imagem `postgis/postgis`
  usada localmente, introduzindo risco de incompatibilidade no restore justamente na
  primeira vez que o usuário faz esse tipo de deploy; usar a MESMA imagem Docker nos dois
  lados (local e Railway) elimina essa variável.
- VPS única (DigitalOcean/Hetzner) rodando o `docker-compose.yml` guase como está —
  mais parecida com a Seção 8 planejada, mas exige o usuário administrar SO/segurança/TLS
  manualmente; mais trabalho agora para um objetivo declarado como temporário.
- Reexecutar migrations + `make etl` direto contra um Postgres novo na nuvem — descartada
  como caminho principal: replicaria pré-requisitos manuais (gcloud, CSV do INPE, ~1h de
  processamento de precipitação) sem necessidade, já que o banco local já está validado e
  populado.

**Consequências:**
Handoff futuro ao Pólis vira transferência de posse de projeto (Railway: "Transfer
Project"; Vercel: "Transfer to Team"), não uma remontagem de infraestrutura. Custo
recorrente: Railway Hobby ~US$5/mês (inclui US$5 de uso; CPU/memória/egress acima disso são
cobrados à parte) e Vercel Hobby gratuito, mas restrito a uso não-comercial — compatível
com o estágio atual do projeto (protótipo/pesquisa, sem monetização). Ver
`docs/DEPLOY_TEMPORARIO.md` para o passo a passo operacional completo.

---

## Modelo (formato ADR)

## <Título da decisão> — AAAA-MM-DD

**Contexto:**
Qual problema motivou a decisão.

**Decisão:**
O que foi decidido.

**Alternativas consideradas:**
- Alternativa A — vantagens / desvantagens
- Alternativa B — vantagens / desvantagens

**Consequências:**
Impacto em manutenção, segurança, acoplamento e migração futura.
