# Receita: como documentar uma decisão de dado ou metodologia

**Quando usar:** ao escrever qualquer script, schema, service, ou migration onde uma
escolha não-óbvia foi feita sobre como tratar um dado (nulo, agregação, unidade,
classificação, filtro).

**Referência real:** o cabeçalho de `backend/src/etl/loaders/extrair_mmgd_aneel.py`,
a docstring de `backend/src/services/vaziosDeAcesso.service.ts`, e `ARQUITETURA.md`.

---

## Por que isto é uma receita própria

Este projeto lida com dado real, de fontes externas heterogêneas (ANEEL, IBGE,
BigQuery), cruzando geografia com indicadores sociais. Toda decisão de "o que fazer
com este caso estranho" é uma decisão metodológica que, se não for registrada,
**vira uma pergunta repetida** em toda sessão futura (ou pior: alguém toma a decisão
oposta sem saber que já foi decidido antes). O código deste projeto já resolve isso
de um jeito específico e consistente — vale documentar o padrão em si.

## O padrão: comentário em 3 partes

```
DECISÃO / POR QUE X, NÃO Y:
--------------------------------------------------------------------------
[1. O que foi observado/testado com o dado real — não uma suposição]
[2. Por que a alternativa óbvia foi descartada]
[3. Qual é a consequência prática dessa escolha, e onde ela aparece no sistema]
```

Exemplo real (`extrair_mmgd_aneel.py`):

```python
"""
DECISÃO IMPORTANTE — POR QUE SNAPSHOT ÚNICO, NÃO HISTÓRICO MENSAL:
--------------------------------------------------------------------------
O arquivo da ANEEL é um SNAPSHOT do estado atual acumulado (toda a base tem
o mesmo AnmPeriodoReferencia), não um log de eventos de conexão com data
variável por linha. A coluna DthAtualizaCadastralEmpreend existe, mas
representa "última atualização cadastral", não "data de conexão real" —
usar isso para reconstruir uma série histórica mensal seria uma inferência
metodologicamente frágil. Por isso, este extractor grava apenas o período
de referência do snapshot atual.
"""
```

Note a estrutura: fato observado (mesma `AnmPeriodoReferencia` em toda a base) → por
que a alternativa (reconstruir histórico a partir da data de atualização cadastral)
foi rejeitada → o que o código faz de fato.

## Onde cada tipo de decisão deve morar

| Tipo de decisão | Onde documentar |
|---|---|
| Como um único extractor trata um caso de dado (nulo, outlier, unidade) | Docstring/comentário no próprio arquivo do extractor |
| Metodologia que atravessa múltiplos arquivos (ex.: cálculo de um índice composto, critério de classificação usado em mais de um endpoint) | `ARQUITETURA.md`, na seção correspondente — e um comentário no código apontando para lá |
| Decisão que muda o padrão oficial do projeto (stack, estrutura) | `CLAUDE.md` |
| Estado atual de o que está implementado vs. planejado | `CLAUDE.md`, seção "Estado Real do Projeto" |

Regra prática: se a resposta para "por que este código faz X e não Y" exigir mais de
uma frase, ela pertence a um comentário formal (bloco de decisão), não a um comentário
de uma linha solto no meio do código.

## Nunca decidir um tratamento de nulo silenciosamente

Um exemplo real de nuance que só existe porque foi documentada: em
`vaziosDeAcesso.service.ts`, `potencia_residencial_kw` é tratado como `0` quando o
município não tem NENHUM registro de MMGD (ausência de instalação é dado válido), mas
como `null` quando o registro existe só que ainda não foi re-extraído após a
migration 0020 (dado genuinamente desconhecido, não pode virar 0 silenciosamente).
Essa distinção só é possível porque o código verifica explicitamente qual dos dois
casos está ocorrendo (`mmgdRegistroExiste === null` vs. `potenciaResidencialKw ===
null`) — e o comentário ao lado explica por que a distinção importa.

## Nota metodológica exposta na própria resposta da API

Quando uma limitação metodológica afeta a interpretação de um resultado (ex.: "este
corte não controla renda"), ela deve aparecer **na resposta da API**, não só em
comentário de código — ver campo `notaMetodologica` em
`ListarVaziosDeAcessoResultado` (`vaziosDeAcesso.service.ts`). Quem consome a API
(frontend, outro sistema, pesquisador) precisa da ressalva no mesmo lugar onde recebe
o dado, não escondida em um arquivo-fonte que talvez nunca leia.

## Checklist rápido

1. A decisão foi testada/observada no dado real, não suposta?
2. O comentário explica a alternativa descartada, não só a escolha feita?
3. Se a metodologia atravessa mais de um arquivo, ela está em `ARQUITETURA.md` (não
   só espalhada em comentários locais)?
4. Se a limitação afeta como alguém deve interpretar o resultado, ela está também na
   resposta da API — não só no código-fonte?
