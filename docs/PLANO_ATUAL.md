# docs/PLANO_ATUAL.md — Acompanhamento da Tarefa em Andamento

Documento de trabalho para tarefas com várias etapas. Ver `CLAUDE.md`, seção "🔟 Fluxo
de Trabalho do Assistente de IA" → "Início de sessão", para quando e como manter isto
atualizado. Ao concluir a tarefa, este arquivo pode ser limpo/reiniciado para a próxima.

## Objetivo

Portar o protótipo de ranking público de distribuidoras
(`backend/src/etl/analises/construir_ranking_distribuidoras_conexao_mmgd.py`) para uma
versão real: persistência no Postgres, endpoint Node/Express, página frontend.

## Decisões tomadas

Ver `docs/DECISOES.md`, ADR "Ranking público de distribuidoras — exibição, ponderação e
nota metodológica" (10/07/2026): segregação visual dos casos incompletos, IVS ponderado
por população, nota metodológica fixa sobre Equatorial fora-GO.

## Arquivos modificados

- `backend/src/db/migrations/0026_desempenho_conexao_distribuidoras.sql` (novo)
- `backend/src/db/schema/desempenho_conexao_distribuidoras.ts` (novo)
- `backend/src/db/schema/index.ts` (export adicionado)
- `backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py` (novo)
- `docs/DECISOES.md` (ADR registrado)
- `ARQUITETURA.md` (seção "Ideia de produto: ranking público de distribuidoras" atualizada)

## Etapas concluídas

1. Registro das 3 decisões de exibição/metodologia em `docs/DECISOES.md`.
2. Migration 0026: tabela `desempenho_conexao_distribuidoras` (resumo técnico nacional
   por distribuidora, com `sig_agente_indqual` já resolvido pelo crosswalk).
3. Extractor `extrair_desempenho_conexao_mmgd.py`: baixa as 5 regiões ANEEL, agrega por
   distribuidora, resolve crosswalk com INDQUAL, faz upsert na tabela nova.
   **EXECUTADO E VALIDADO no ambiente do usuário (10/07/2026)**: migration 0026 aplicada
   sem erro, extractor rodou as 5 regiões (54,3M linhas), 52 distribuidoras persistidas,
   48/52 casadas com o INDQUAL (10 sem prazo confiável, 4 sem par no INDQUAL: Forcel,
   João Cesa, Nova Palma, Santa Maria — distribuidoras pequenas, mesmo achado já
   registrado no protótipo). `make typecheck` limpo.
4. `rankingDistribuidoras.service.ts` + `rankingDistribuidoras.controller.ts` +
   `rankingDistribuidoras.routes.ts` (`GET /api/ranking-distribuidoras`) — eixo de
   justiça (IVS ponderado por população estimada) calculado em SQL via CTE, juntando
   `desempenho_conexao_distribuidoras.sig_agente_indqual` com
   `qualidade_conjunto_municipio` + `qualidade_conjuntos` + população/IVS de
   `vw_indicadores_sociais_consolidado`. Implementa as 3 decisões do ADR: segregação
   visual (`rankingPrincipal` vs `distribuidorasComDadosIncompletos`, com
   `motivosDadosIncompletos` explícito), ponderação por população, nota metodológica
   fixa (`notaMetodologicaJustica`) sobre Equatorial fora-GO/vulnerabilidade regional.
   Registrado em `routes/index.ts`. **EXECUTADO E VALIDADO no ambiente do usuário
   (10/07/2026)**: `make typecheck` limpo, `curl /api/ranking-distribuidoras` retornou
   JSON com números reais (não strings — driver `pg` ok). Resultado bate com o que já
   estava documentado no protótipo: Cemig-D, as 5 subsidiárias Equatorial fora-GO,
   Celesc-Dis e Energisa RO em `distribuidorasComDadosIncompletos` por
   `prazo_confiavel=false`; Forcel/João Cesa/Nova Palma/Santa Maria por falta de par no
   INDQUAL; ~9 distribuidoras pequenas do Sul (Demei, Dmed, Mux Energia, Hidropan, Eflul,
   Cooperaliança, Cocel, RGE, Chesp, CPFL Santa Cruz) por falta de cobertura em
   `qualidade_conjunto_municipio`.

## Próximo passo

Frontend escrito: `types/api.ts` (DistribuidoraRanking/RankingDistribuidorasResultado),
`services/rankingDistribuidoras.service.ts`, `pages/PaginaRankingDistribuidoras.tsx`
(ranking principal + seção "Dados incompletos" + nota metodológica fixa e visível),
rota `/ranking-distribuidoras` + link no header registrados em `App.tsx`.
**AINDA NÃO EXECUTADO/VALIDADO** — pedir para o usuário rodar `make front-typecheck` e
testar visualmente (`make front`, abrir /ranking-distribuidoras).

## Bloqueios e pendências

Nenhuma. Tarefa concluída, validada ponta a ponta e a pendência de investigação também
fechada (10/07/2026) — ver ARQUITETURA.md, "Ideia de produto: ranking público de
distribuidoras", para o achado completo: causa confirmada para as 13 distribuidoras que
seguem sem eixo de justiça (área de concessão compartilhada — comportamento correto da
regra de desambiguação, não bug) e correção real do crosswalk para Forcel/João
Cesa/Nova Palma/Santa Maria (script de diagnóstico
`backend/src/etl/analises/investigar_cobertura_indqual_ranking_distribuidoras.py`).

## Comandos de validação

```
make typecheck
make dev
curl http://localhost:3000/api/ranking-distribuidoras | jq
```
