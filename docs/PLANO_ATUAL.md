# docs/PLANO_ATUAL.md — Acompanhamento da Tarefa em Andamento

Documento de trabalho para tarefas com várias etapas. Ver `CLAUDE.md`, seção "🔟 Fluxo
de Trabalho do Assistente de IA" → "Início de sessão", para quando e como manter isto
atualizado. Ao concluir a tarefa, este arquivo pode ser limpo/reiniciado para a próxima.

> Tarefa anterior ("3 componentes premium" — matriz IVSH×MMGD, cartão de descompasso
> morfológico, alternador IVS/IVSH): implementação e typecheck concluídos em
> 2026-07-21, teste manual no navegador ainda pendente do usuário (ver seções abaixo,
> mantidas como histórico). Este arquivo passa a acompanhar a tarefa nova abaixo.

## Objetivo (tarefa atual, 2026-07-21)

Integrar ao Atlas a participação da MMGD na matriz elétrica nacional (EPE/PDGD), hoje
só citada como texto estático na Landing Page, com snapshots periódicos reais no banco.
Ver ADR completo em `docs/DECISOES.md`, "Integração da participação da MMGD na matriz
elétrica nacional (EPE/PDGD) — 2026-07-21": fonte = PDGD (painel dedicado de MMGD da
EPE, `dashboard.epe.gov.br/apps/pdgd`, aba "Geração de Eletricidade"); captação =
download manual periódico + extractor Python (painel é uma app Shiny/R, sem API
pública); schema = tabela nova dedicada, não vinculada a `unidades_espaciais` (valor
nacional agregado por ano, não municipal).

### Achado importante (inspeção do conteúdo renderizado do PDGD, 2026-07-21)

O usuário colou o conteúdo textual completo do dashboard `dashboard.epe.gov.br/apps/pdgd`
(app Shiny, confirma que não é raspável por HTTP simples). Achado central: a aba
"Geração de Eletricidade" do PDGD calcula nativamente um percentual, mas é **"percentual
do consumo dos consumidores cativos atendido por MMGD"** (demanda — denominador = consumo
medido SAMP/ANEEL + geração autoconsumida de MMGD), **não** "participação da MMGD na
geração elétrica nacional" (oferta — denominador = geração total do país, que é o que o
7,0%/BEN citado hoje na landing mede). São métricas diferentes.

Decisão do usuário (perguntado via AskUserQuestion): guardar **as duas**, lado a lado, na
tabela nova, cada uma explicitamente rotulada com o que mede (nunca apresentar uma como
se fosse a outra — mesmo princípio já usado no RF-005/`numero_ucs_com_mmgd`, ver CLAUDE.md
"Correção de rótulo em RF-005"). Achado colateral: a aba "Capacidade Instalada" do PDGD
usa a MESMA fonte bruta que `extrair_mmgd_aneel.py` já processa
(`dadosabertos.aneel.gov.br/dataset/relacao-de-empreendimentos-de-geracao-distribuida`) —
não precisamos da EPE para capacidade instalada, só para geração estimada (metodologia
própria da EPE, sem equivalente no Atlas).

### Botão de atalho no Painel Admin (21/07/2026)

A pedido do usuário, criado `CartaoAtualizacaoIndicadoresExternos.tsx` (Painel Admin,
só papel Administrador) — links que abrem os dashboards da EPE na aba/anexo certo, sem
disparar upload/ETL pela interface (RF-070 continua não permitindo isso). Corrigidos 2
erros nesta sessão: link do BEN estava com âncora errada (corrigido para
`.../livro/pt/anexo_9.html` e `anexo_10.html`, um por anexo); e a âncora do PDGD
(`#shiny-tab-geracao1`) não troca de aba de verdade (Shiny não segue hash da URL) — texto
do card corrigido para instruir o clique manual na aba.

### Captação dos dados reais (21/07/2026) — CONCLUÍDA para a métrica principal

Depois de várias tentativas (usuário baixando via navegador gerava só page-saves `.htm`,
não o dado de verdade), a captação funcionou por dois caminhos:
- **BEN**: usuário baixou os dois Anexos (IX em mil tep, X em unidades comerciais/GWh)
  direto do dashboard, formato "tabela" — funcionou de primeira. Linha usada:
  `grupo='Total Transformação'`, `fonte='Eletricidade - GWh'` = geração elétrica bruta
  total do Brasil (pública + autoprodutores).
- **PDGD**: usuário conseguiu copiar a URL de download **da sessão ativa do Shiny**
  (`.../session/<token>/download/geracao-download_output`) e colou no chat — o Claude
  buscou o arquivo direto via `curl` (funciona só enquanto a sessão do navegador do
  usuário continua aberta; não é uma URL estável/reutilizável). Deu 129.507 linhas
  desagregadas (subsistema/UF/classe/fonte/modalidade/subgrupo/distribuidora/segmento/
  mini_micro/ano_operação/autoc_inj) — somando `energia_gwh_div` por `ano_operacao`
  (autoconsumo + injeção) chega no total nacional de MMGD por ano.

**Validação forte**: participação calculada para 2025 = geração MMGD (54.482,6 GWh) /
geração nacional (775.895,9 GWh) = **7,02%** — bate com o número oficial da EPE (7,0%,
BEN 2026) já citado na landing como referência externa. Cross-check positivo.

**Métrica secundária ("% do Consumo Cativo BR") NÃO capturada** — o gráfico
correspondente na aba "Geração de Eletricidade" do PDGD não tem link de download
individual (usuário confirmou só existir um link "Baixar Dados dos Gráficos" na página,
que serve o dataset de geração, não o de consumo cativo); tentativa via
DevTools→Inspecionar só mostrou o SVG do gráfico (ggiraph), não uma URL de dado.
Decisão (usuário, 21/07/2026): parar de perseguir essa métrica secundária — a coluna
`percentual_consumo_cativo_atendido_mmgd` já existe na tabela (migration 0030), fica
`NULL` até surgir uma forma melhor de capturar (ex.: API futura da EPE — ver bloco
"Mensagem para a EPE" abaixo).

**Mensagem para a EPE (21/07/2026)**: a pedido do usuário, elaborado um e-mail
solicitando à EPE (1) API/URL estável de download para o PDGD (hoje só existe download
via sessão Shiny efêmera) e (2) exportação de dados individual por gráfico (faltando
para "% do Consumo Cativo BR") — aprovado pelo usuário no chat, envio é responsabilidade
dele (fora do escopo de ações do Claude).

## Status final desta tarefa

**Implementado e validado no banco local nesta sessão:**
- Migration `0030_indicadores_energia_nacional.sql` — tabela nova, NÃO vinculada a
  `unidades_espaciais` (valor nacional por ano). Aplicada via `docker exec polis_postgres
  psql`.
- Schema Drizzle `indicadores_energia_nacional.ts`, exportado em `schema/index.ts`.
- Dois extractors novos, cada um rodado 2x (idempotência confirmada, 0 falhas):
  `extrair_geracao_eletrica_nacional_epe.py` (BEN, 56 anos 1970–2025) e
  `extrair_geracao_mmgd_epe_pdgd.py` (PDGD, 13 anos 2013–2025).
  `openpyxl`/`et-xmlfile` adicionados ao venv e a `requirements.txt`.
- `estatisticasNacionais.service.ts` — novo campo `participacaoMatrizNacional`
  (`ParticipacaoMatrizNacional | null`), calculado como
  `geracaoMmgdGwh / geracaoEletricaNacionalGwh` do ano mais recente com AMBOS os lados
  carregados. Removido `participacaoMatrizNacional` de `indicadoresIndisponiveis` (só
  `projecaoFuturaPotencia` continua lá).
- Frontend: `types/api.ts` (espelho), `PaginaLanding.tsx` — 6º cartão de KPI em "O Brasil
  em números" (era 5), card "Em breve" da participação removido, texto de "Referências
  metodológicas" reescrito de "não calculamos isso" para "cross-check com o que já
  calculamos" (mostra o percentual do Atlas ao lado do 7,0% da EPE).
- `CartaoAtualizacaoIndicadoresExternos.tsx` (Painel Admin) — atalhos para os dashboards
  da EPE, corrigidos nesta sessão (ver bloco acima).

**NÃO feito nesta sessão:**
- `npx tsc --noEmit` (backend) e `npx tsc -b` (frontend) — confirmado que este ambiente
  não tem `node` nativo no Linux (só via interop com `node.exe` do Windows, que quebra
  em caminho UNC ao entrar no diretório do projeto) — exceção já documentada no
  CLAUDE.md, Seção 10, agora com a causa raiz confirmada.
- Teste manual no navegador da landing (novo cartão, texto novo de referências).
- `percentual_consumo_cativo_atendido_mmgd` — pendente, ver acima.

## Próximo passo

Pedir para o usuário rodar `make typecheck` e `make front-typecheck` no terminal dele, e
depois testar a landing no navegador (`make dev` + `make front`) — conferir o 6º cartão
de KPI e o texto novo de "Referências metodológicas".

---

## Histórico — tarefa anterior ("3 componentes premium")

## Objetivo

Usuário trouxe um prompt pronto (escrito para outra IA) pedindo 3 "componentes
premium" novos no frontend, com Recharts/Framer Motion/Glassmorphism. Antes de
executar, o prompt foi avaliado contra o código real (pedido explícito do usuário:
"avalie antes de executar").

## Achados da avaliação (antes de implementar)

1. O Componente 1 pedido (matriz IVSH × MMGD com 4 "quadrantes oficiais" com nomes
   novos) reabria um problema já resolvido: `GraficoQuadrantes.tsx` já existe, com os
   eixos REAIS da metodologia (irradiação × MMGD), depois que um protótipo anterior
   (Gemini/AI Studio, 14/07) tentou plotar MMGD × IVS com quadrantes inventados e foi
   explicitamente rejeitado.
2. O Componente 2 pedido (radar de descompasso morfológico) dependia de
   `indice_precariedade_moradia`/`percentual_apartamento`, que a API não expunha em
   `GET /api/municipios/:codigoIbge`.
3. `framer-motion` não estava no stack do frontend.

Perguntado ao usuário (AskUserQuestion) como resolver os 3 pontos — respostas: evoluir
o componente existente (não criar um novo com quadrantes inventados); expandir o
contrato da API primeiro; adicionar `framer-motion` mesmo (com ADR).

## Decisões tomadas

- Ver `docs/DECISOES.md`, ADR "Framer Motion para animação de componentes de
  interface — 2026-07-18".
- Limiares do cartão de descompasso morfológico documentados no próprio componente
  (não fabricados): irradiação = mediana nacional REAL (mesma da classificação de
  Vazios de Acesso); precariedade = índice > 0,5 (ponto médio do índice já normalizado
  0–1 nacionalmente); verticalização = percentual_apartamento > 50% (maioria dos
  domicílios).
- Bug real encontrado e corrigido durante a averiguação: `MunicipioClassificado`
  (`frontend/src/types/api.ts`) não tinha o campo `ivsh`, que o backend já retorna
  desde a migration 0028 — drift de contrato real, não relacionado ao pedido original.

## Arquivos modificados/criados nesta sessão

- `backend/src/services/municipios.service.ts` — LEFT JOIN em
  `vw_indices_compostos_moradia_infraestrutura`; novos campos
  `indicePrecariedadeMoradia`/`percentualApartamento` em `GET /api/municipios` e
  `/:codigoIbge` (e, por consequência automática, nos exports CSV/XLSX/GeoJSON, que
  derivam colunas dinamicamente).
- `frontend/src/types/api.ts` — espelho dos 2 campos novos + campo `ivsh` que faltava
  em `MunicipioClassificado` (correção de drift).
- `frontend/package.json` — dependência `framer-motion` adicionada (`npm install`
  executado nesta sessão).
- `docs/DECISOES.md` — novo ADR do Framer Motion.
- `frontend/src/components/vazios-de-acesso/AlternadorPriorizacaoIvsh.tsx` (novo) —
  Componente 3, toggle animado IVS/IVSH com tooltip; ligado em
  `frontend/src/pages/PaginaVaziosDeAcesso.tsx` (`ordenarPor` dinâmico + coluna IVSH
  condicional na tabela).
- `frontend/src/components/painel-analitico/GraficoQuadrantes.tsx` — Componente 1,
  evoluído com um segundo modo de eixo X (IVSH), mantendo cor/quadrante sempre da
  classificação oficial do backend; linha de mediana do modo IVSH é explicitamente
  rotulada como estatística da amostra, não critério oficial.
- `frontend/src/components/mapa/CartaoDescompassoMorfologico.tsx` (novo) — Componente
  2, alerta no painel de detalhe do município; ligado em
  `frontend/src/components/mapa/PainelMunicipio.tsx` (nova prop `medianaIrradiacao`) e
  `frontend/src/pages/PaginaMapa.tsx` (novo `useEffect` que reaproveita
  `garantirVaziosCarregados` — já idempotente — ao selecionar um município).

## Validação

- `npx tsc --noEmit` (backend): limpo, executado diretamente nesta sessão.
- `npx tsc -b` (frontend): limpo, executado diretamente nesta sessão.
- **NÃO feito nesta sessão**: teste manual no navegador (nenhum dos 3 componentes foi
  visualmente conferido rodando `make dev` + `make front`) — fica para quando o
  usuário abrir a aplicação. Em especial, conferir: o alternador IVSH em
  `/vazios-de-acesso`, o toggle de eixo no scatter do Painel Analítico (precisa
  carregar a classificação nacional completa primeiro, botão já existente) e o cartão
  vermelho no painel de município (precisa de um município com irradiação alta +
  precariedade/verticalização alta simultaneamente — não confirmado ainda se existe
  algum caso real que dispare o alerta).

## Próximo passo

Usuário testar manualmente no navegador. Se algum dos 3 componentes nunca disparar
com dado real (em especial o cartão de descompasso morfológico, que depende de uma
combinação específica), verificar se os limiares documentados acima são adequados ou
se precisam de ajuste — não são um critério estatístico validado, são um ponto de
partida transparente.
