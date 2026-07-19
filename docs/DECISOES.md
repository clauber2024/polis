# docs/DECISOES.md — Decisões Técnicas Estruturais

Registro de decisões técnicas relevantes (arquitetura, biblioteca, framework, banco,
API, padrão de código, segurança, estrutura de pastas, autenticação, testes, deploy).
Critério e processo completo em `CLAUDE.md`, seção "🔟 Fluxo de Trabalho do Assistente
de IA" → "Decisões técnicas".

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
