# docs/PLANO_ATUAL.md — Acompanhamento da Tarefa em Andamento

Documento de trabalho para tarefas com várias etapas. Ver `CLAUDE.md`, seção "🔟 Fluxo
de Trabalho do Assistente de IA" → "Início de sessão", para quando e como manter isto
atualizado. Ao concluir a tarefa, este arquivo pode ser limpo/reiniciado para a próxima.

## Objetivo
Painel Analítico / Cruzamento de Variáveis (RF-049, RF-050, RF-052) — frontend
consumindo os endpoints de comparação/exportação que já existiam no backend
(`GET /api/municipios/comparar`, `GET /api/municipios/comparar/exportar`).

## Decisões tomadas
(10/07/2026)
- **Tabela + gráfico de barras** (não só tabela) — usuário escolheu incluir
  visualização gráfica nesta primeira versão. Nova dependência: `recharts`
  `^3.9.0` (única versão com suporte nativo a React 19, sem override de
  `react-is` — confirmado via busca antes de fixar a versão).
- **5 indicadores comparáveis**, não os 7 do RF-049: excluídos IPER (decisão
  explícita do usuário) e Tarifa Social/TSEE (mesma exclusão, aplicada por
  mim — `percentual_tarifa_social` é a MESMA coluna/indicador chamado
  `percentual_tsee` em ARQUITETURA.md, existe desde a migration 0000 mas
  nenhum extractor a popula; bloqueada pelo dataset "Beneficiários da
  CDE"/ANEEL até jan/2026+ — mesmo bloqueio documentado para IPER, então
  apliquei o mesmo critério sem repetir a pergunta ao usuário).
- **Gráfico em small multiples** (um BarChart por indicador), não um gráfico
  único com todos os indicadores — unidades incompatíveis (R$, %, kWh/m²·dia,
  kW/1.000 hab) tornariam uma escala única ilegível.
- **Tabela: linhas = indicadores, colunas = municípios** — layout "lado a
  lado" do RF-050, e escala melhor com poucos municípios (até 10) e poucos
  indicadores (até 5) do que o inverso.
- **Fora do escopo desta sessão** (não implementado): RF-051 ("Gerar leitura
  analítica", texto-resumo automático) e RF-053 (dispersão/série temporal).

## Arquivos modificados
- `frontend/package.json` — `+recharts`
- `frontend/src/types/api.ts` — `+CompararMunicipiosResultado`
- `frontend/src/services/http.ts` — `+baixarArquivo` (download de blob)
- `frontend/src/services/comparacao.service.ts` — novo (compararMunicipios, exportarComparacao)
- `frontend/src/utils/indicadoresComparacao.ts` — novo (catálogo de 5 indicadores)
- `frontend/src/components/painel-analitico/SeletorMunicipios.tsx` — novo
- `frontend/src/components/painel-analitico/TabelaComparacao.tsx` — novo
- `frontend/src/components/painel-analitico/GraficoComparacao.tsx` — novo
- `frontend/src/pages/PainelAnalitico.tsx` — novo
- `frontend/src/App.tsx` — rota `/painel-analitico` + link no header

## Etapas concluídas
- Implementação completa dos 6 itens originais (tabela + gráfico + export).
- Validação visual confirmou funcionamento; usuário pediu 2 ajustes extras:
  1. Badge "Vazio de Acesso" na tabela (RF-055/056) — feito, linha extra na
     TabelaComparacao + fetch lazy de `buscarTodosVaziosDeAcesso`.
  2. Linhas/colunas de média de referência (nacional/regional/estadual) —
     feito, ver detalhes abaixo.

### Médias de referência (10/07/2026)
- **Novo endpoint backend**: `GET /api/municipios/medias?uf=|regiao=` —
  `calcularMediasMunicipios` em `municipios.service.ts`, reaproveita
  `buscarPainelBruto` (mesma query de sempre) e agrega EM MEMÓRIA (mesma
  decisão já documentada em `buscarEFiltrarMunicipios` — "~5.570 linhas,
  trivial em RAM"). Campos elegíveis para média = `CRITERIOS_ORDENACAO_MUNICIPIO`
  (schema) menos `'nome'`. Sem filtro = média nacional; `uf` tem prioridade
  sobre `regiao` se os dois vierem (não deve acontecer no uso normal do
  frontend, que só manda um por vez). Arquivos: `schemas/municipios.schema.ts`
  (`mediasMunicipiosQuerySchema`), `services/municipios.service.ts`
  (`calcularMediasMunicipios` + interface `MediasMunicipios`),
  `controllers/municipios.controller.ts` (`mediasMunicipiosController`),
  `routes/municipios.routes.ts` (rota registrada ANTES de `:codigoIbge`,
  mesmo motivo de `/comparar` e `/exportar`).
- **Frontend**: coluna extra na tabela (itálico, "Média Nacional" sempre;
  "Média {Região}"/"Média {UF}" só quando TODOS os municípios comparados
  compartilham a mesma região/UF — comparação feita sobre `resultado`, isto é,
  depois do backend confirmar os municípios, não sobre a seleção bruta) +
  `ReferenceLine` (Recharts) nos gráficos, mesma lógica condicional. Linha
  "Vazio de Acesso" não se aplica a médias (mostra "—", são agregados, não
  municípios classificáveis). Arquivos: `types/api.ts` (`MediasMunicipios`),
  `services/comparacao.service.ts` (`buscarMediasMunicipios`),
  `components/painel-analitico/TabelaComparacao.tsx` (prop `colunasMedia`,
  tipo `ColunaMedia` exportado), `GraficoComparacao.tsx` (mesma prop, um
  `ReferenceLine` por coluna de média com cor/traço próprios),
  `pages/PainelAnalitico.tsx` (3 `useEffect` — nacional uma vez,
  regional/estadual chaveados por `regiaoComum`/`ufComum` derivados de
  `resultado`).

### Terceira rodada de ajustes (10/07/2026, feedback pós-validação visual)
Três pedidos do usuário:
1. **Filtro de municípios no seletor** — `SeletorMunicipios.tsx` ganhou
   selects de Região e Estado (novo `utils/estados.ts`, 27 UFs hardcoded —
   dado fixo, mesmo padrão do `REGIOES_VALIDAS` do backend). Campo de nome
   virou opcional, refina dentro do filtro. `municipios.service.ts` (frontend)
   generalizado: `buscarMunicipios(params)` substitui a lógica interna de
   `buscarMunicipiosPorNome` (mantida, inalterada, para não quebrar
   `BuscaMunicipio.tsx`/header).
2. **Contraste das linhas de referência** — paleta trocada em
   `GraficoComparacao.tsx` (era slate/teal/fuchsia, ficava apagada; agora
   quase-preto/roxo/rosa, `strokeWidth={2}`).
3. **Sobreposição de linhas/legendas** — rótulos inline do `ReferenceLine`
   (que colidiam quando as médias ficavam próximas) foram REMOVIDOS; virou
   uma legenda única (SVG simples) acima da grade de gráficos, compartilhada
   por todos os indicadores.

### Quarta rodada (10/07/2026, bug real + solução de dado ausente)
Usuário reportou: municípios sem o indicador de Vazio de Acesso ficavam
"como que carregando". Investigação encontrou DOIS problemas reais, não um:

1. **Bug de loading eterno** (mesmo padrão já documentado no CLAUDE.md para
   `PaginaMapa`/`garantirVaziosCarregados`): o `useEffect` de
   `carregandoVazios`/`codigosVazios` tinha esses dois estados nas próprias
   deps, e o efeito os setava — o cleanup cancelava o fetch em andamento
   antes dele terminar, travando `carregandoVazios=true` para sempre.
   Corrigido: efeito agora chaveado só por `codigos.join(',')` +
   `podeComparar` (mesmo padrão seguro do efeito de `compararMunicipios`).
2. **Ambiguidade real de dado** (causa por trás do "não tem o indicador"):
   o Set anterior (`buscarTodosVaziosDeAcesso`) só continha o quadrante
   "vazio_de_acesso" — um município fora dele podia ser "outro quadrante" OU
   "sem dado" (excluído por falta de MMGD residencial/irradiação), e a tela
   não distinguia. Corrigido com um **endpoint novo**,
   `GET /api/vazios-de-acesso/classificar?codigos=...`
   (`classificarMunicipios` em `vaziosDeAcesso.service.ts`, reaproveita
   `buscarPainelBruto`/`classificarPainel` — as mesmas funções de
   `classificarMunicipioIndividual`/RF-058 — mas para 1-10 códigos de uma vez
   em vez de paginar o país inteiro). Frontend: `TabelaComparacao` agora
   mostra o QUADRANTE real (badge colorido, `utils/quadrantes.ts`) ou
   "Sem dado" (nunca mais "Não" para caso ambíguo). Filtro pedido pelo
   usuário: em vez de filtro PREVENTIVO no seletor (caro — exigiria
   classificar ~5.570 municípios só pra filtrar o autocomplete), virou ação
   CORRETIVA — quando a comparação revela municípios sem dado, aparece um
   aviso com botão "Remover da comparação".

## Próximo passo
Teste visual completo (`make dev` + `make front`, abrir `/painel-analitico`):
filtros de região/estado, contraste/legenda do gráfico, e o caso de
município sem classificação (ex.: um dos 4 municípios especiais documentados
em `notasAusencia.ts`, ou qualquer um com MMGD pré-migration 0020) — deve
mostrar "Sem dado" e o botão de remoção, nunca mais "carregando" travado.
Depois, commit.

## Bloqueios e pendências
Nenhum bloqueio técnico conhecido. Falta rodar typecheck do BACKEND (mudou
de novo: rota `/api/vazios-de-acesso/classificar`) e do frontend, e o teste
visual acima. Bash sandbox não monta o caminho WSL do projeto (limitação já
conhecida, ver CLAUDE.md), por isso não pude rodar isso eu mesmo.

Histórico da validação anterior (tabela/gráfico/export, sem as médias): typecheck
e build do frontend rodados pelo usuário em 10/07/2026, limpos. Um erro de
tipo real foi encontrado e corrigido nessa rodada: o `formatter` do Tooltip
do Recharts v3 espera `ValueType | undefined`, não `number | null` como eu
tinha anotado em `GraficoComparacao.tsx` — corrigido com inferência de tipo +
checagem `typeof valor === 'number'` em runtime. Aviso não-bloqueante do
Vite: bundle de produção ~1,7 MB minificado (MapLibre + Recharts) —
code-splitting fica como melhoria futura, não urgente.

## Comandos de validação
```bash
# backend (mudou: novo endpoint /api/municipios/medias)
cd ~/projetos/atlas-solar-justo
make typecheck

# frontend
cd ~/projetos/atlas-solar-justo/frontend
npx tsc -b
npm run build

# rodar os dois (terminais separados) e testar:
make dev      # backend, terminal 1
make front    # frontend, terminal 2
```
Validação visual sugerida: abrir `/painel-analitico`, selecionar 2-3
municípios do MESMO estado (para ver a coluna "Média {UF}" aparecer) e depois
trocar um deles por um de outro estado/região (a coluna estadual e depois a
regional devem sumir, só a nacional continua). Conferir a linha "Vazio de
Acesso" e os botões de exportação CSV/XLSX.
