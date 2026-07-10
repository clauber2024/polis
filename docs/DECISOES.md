# docs/DECISOES.md — Decisões Técnicas Estruturais

Registro de decisões técnicas relevantes (arquitetura, biblioteca, framework, banco,
API, padrão de código, segurança, estrutura de pastas, autenticação, testes, deploy).
Critério e processo completo em `CLAUDE.md`, seção "🔟 Fluxo de Trabalho do Assistente
de IA" → "Decisões técnicas".

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
