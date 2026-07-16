# docs/PLANO_ATUAL.md — Acompanhamento da Tarefa em Andamento

Documento de trabalho para tarefas com várias etapas. Ver `CLAUDE.md`, seção "🔟 Fluxo
de Trabalho do Assistente de IA" → "Início de sessão", para quando e como manter isto
atualizado. Ao concluir a tarefa, este arquivo pode ser limpo/reiniciado para a próxima.

> Tarefa anterior (ranking público de distribuidoras, 10/07/2026): concluída — backend
> validado ponta a ponta; a validação do frontend (`make front-typecheck` +
> /ranking-distribuidoras no navegador) constava pendente aqui e foi absorvida pela
> validação da tarefa atual, abaixo.

## Objetivo

Adaptar o layout do protótipo visual `clauber2024/Atlas-Solar` (Google AI Studio/Gemini,
dados mockados) ao frontend real, mantendo toda a lógica validada. Escopo aprovado pelo
usuário (14/07/2026): fases 1–3 (design system, navbar/landing, dashboard do mapa).

## Regra de ouro desta linha de trabalho

Adotar SÓ visual/estrutura do protótipo, NUNCA a substância fabricada pelo Gemini:
"IVA 0-100 com pesos 35/30/20/15", "esforço energético", "cobertura estimada",
"GHI > 5.0" e IVS "do IPEA" são invenções do protótipo — a metodologia real permanece a
do backend (medianas nacionais + exclusões).

## Estado

- Fase 1 (design system) — já estava feita (sessão paralela de 12/07, `index.css`).
- Fase 2 (navbar + landing) — landing já feita em 12/07; header do `LayoutApp`
  finalizado em 14/07 (logo violeta + subtítulo mono, `NavLink` com sublinhado ativo,
  badges âmbar/vermelho para Colaborador/Admin).
- Fase 3 (dashboard do mapa) — feita em 14/07: sub-header de indicador (label mono +
  "Nota Científica" com `indicador.descricao` + toggle de heatmap violeta + checkbox de
  destaque + avisos) e corpo em 3 colunas com sidebar fixa em abas Ranking | Filtros;
  `PainelRanking`/`PainelFiltrosDashboard` viraram conteúdo de aba (sem `aoFechar`);
  fetch lazy dos badges de vazio agora dispara ao escolher UF (prop `aoEscolherUf`).
  MapLibre, deep links, classificação no backend e notas de ausência: intocados.
- Zoom por estado (pedido do usuário, 14/07): escolher UF no ranking OU no filtro
  enquadra o estado no mapa. `FocoMunicipio` virou `FocoMapa`
  (`{ codigoIbge } | { uf }`, MapaMunicipios.tsx); bbox da UF = união dos bboxes
  dos municípios dela (GeoJSON já carregado, sem geometria estadual dedicada);
  `aoEscolherUf` agora recebe a sigla.

## Segunda leva na mesma sessão — ideias do protótipo `atlas-mmgd-solar`

Decisões do usuário: manter header superior (não migrar para sidebar escura);
implementar scatter de quadrantes + ranking nacional de vazios + status das bases.
Correção metodológica importante: o scatter usa os EIXOS REAIS (irradiação × MMGD
residencial per capita, medianas do backend), não o "MMGD × IVS" do protótipo.
Score 40/40/20 de distribuidoras NÃO adotado (pesos inventados; ADR próprio já existe).

## Arquivos modificados (14/07/2026)

- `frontend/src/App.tsx` (header do LayoutApp; + rotas/links /vazios-de-acesso e /status-dados)
- `frontend/src/pages/PaginaMapa.tsx` (sub-header + corpo em 3 colunas; zoom por UF)
- `frontend/src/components/mapa/PainelRanking.tsx` (aba; `aoFechar` → `aoEscolherUf(uf)`)
- `frontend/src/components/mapa/PainelFiltrosDashboard.tsx` (aba; sem `aoFechar`)
- `frontend/src/components/mapa/MapaMunicipios.tsx` (`FocoMunicipio` → `FocoMapa`, bbox de UF)
- `frontend/src/services/vaziosDeAcesso.service.ts` (`paginarClassificacao` + `buscarClassificacaoNacionalCompleta` + eixoX/eixoY)
- `frontend/src/services/basesDeDados.service.ts` (NOVO — GET /api/bases-de-dados)
- `frontend/src/types/api.ts` (+ StatusFonte/StatusFonteDados/StatusBasesDeDadosResultado)
- `frontend/src/components/painel-analitico/GraficoQuadrantes.tsx` (NOVO — scatter SVG)
- `frontend/src/pages/PainelAnalitico.tsx` (seção lazy do scatter nacional)
- `frontend/src/pages/PaginaVaziosDeAcesso.tsx` (NOVO — ranking nacional)
- `frontend/src/pages/PaginaStatusDados.tsx` (NOVO — RF-063, primeira interface)
- `CLAUDE.md` (registro das duas levas + divergências de documentação)

## Validação

Tudo acima VALIDADO pelo usuário em 14/07/2026 (typecheck + teste manual completo).

## Terceira leva — limite de estados no mapa (14/07/2026)

Backend `GET /api/estados` (ST_Union das geometrias municipais por UF, sem
simplificação extra, cache em memória de processo) + camada `line` slate-700 em
`MapaMunicipios.tsx`, abaixo do destaque violeta. Arquivos novos:
`backend/src/{services,controllers,routes}/estados.*`, `frontend/src/services/estados.service.ts`;
modificados: `backend/src/routes/index.ts`, `frontend/src/types/api.ts`,
`frontend/src/components/mapa/MapaMunicipios.tsx`, `frontend/src/pages/PaginaMapa.tsx`.

## Quarta leva — rótulos de município por zoom (14/07/2026)

Symbol layer com nome do município a partir do zoom 6 (tamanho cresce com o
zoom). Estilo ganhou `glyphs` do endpoint público da MapLibre (demotiles) —
fonte "Open Sans Semibold". Pontos = centro do bbox (`centroDaGeometria`).
Rótulos por cima do heatmap e acompanhando o filtro RF-046. Só
`MapaMunicipios.tsx` modificado.

Validação parcial (15/07/2026): typecheck backend+frontend limpos; rótulos de
município OK; **limite estadual NÃO apareceu** — correção aplicada:
`ST_MakeValid(geom)` antes do `ST_Union` (geometria simplificada no seed pode
ser inválida → TopologyException, engolida pela falha silenciosa do frontend).

## Quinta leva — destaque do estado selecionado + rótulos de estados (15/07/2026)

- `CAMADA_ESTADO_DESTACADO` (line slate-900, mais grossa): contorno da UF
  escolhida no ranking OU no filtro; limpa ao voltar para "Selecione…"/limpar
  filtro. Estado `ufDestacada` na PaginaMapa; `aoEscolherUf` agora é chamado
  também com '' (para limpar).
- `CAMADA_ROTULOS_ESTADOS` (symbol, maxzoom 6): nome do estado em uppercase no
  zoom amplo, no centro do bbox de cada UF; sai quando os rótulos de município
  entram (minzoom 6).

VALIDADO pelo usuário em 15/07/2026 (endpoint com ST_MakeValid + teste visual).

## Sexta leva — contorno do município selecionado (15/07/2026)

`CAMADA_MUNICIPIO_DESTACADO` em MapaMunicipios (prop `codigoDestacado`, vinda de
`municipioSelecionado` na PaginaMapa): linha slate-900 engrossando com o zoom,
acima do destaque violeta. Some ao fechar o painel do município.

**Validação pendente (usuário, no WSL):**
1. `make front-typecheck`
2. No navegador: selecionar município por clique, pela busca do header e pelo
   ranking → contorno engrossa; fechar o painel → contorno some; conviver com
   o destaque de estado (selecionar UF + município ao mesmo tempo).

## Bloqueios e pendências

Nenhum bloqueio. Fase 4 (página Metodologia, tour guiado, FAQ na landing) ficou FORA do
escopo aprovado — só se o usuário pedir.
