# Biblioteca de Receitas do Backend — Atlas Solar Justo

## O que é isto

Uma coleção de **receitas práticas** (problema → solução → por quê → armadilha já
encontrada) documentando os padrões que este projeto já usa de fato no backend
(ETL Python e API Node/Express). Cada receita cita o arquivo real do repositório de
onde o padrão foi extraído — isto não é um padrão teórico, é o que já roda em produção
de dados aqui.

**Inspiração metodológica:** o [Claude Cookbook oficial da
Anthropic](https://github.com/anthropics/claude-cookbooks) organiza o conhecimento em
receitas curtas e copiáveis (problema → código funcional → explicação), em vez de um
manual de referência exaustivo. Esta biblioteca adota esse *formato* — não o
conteúdo — porque o assunto aqui é o backend do Atlas (ETL geoespacial, PostGIS,
Express), não a API da Claude.

## Como isto se relaciona com o CLAUDE.md

O [`CLAUDE.md`](../../CLAUDE.md) define a **regra** (o padrão obrigatório do projeto:
stack, convenções, estrutura). Esta biblioteca dá o **exemplo de trabalho** (o código
real que implementa a regra, com o raciocínio por trás de cada decisão não-óbvia).
Quando as duas divergirem, o `CLAUDE.md` é a fonte da verdade — atualize a receita
correspondente aqui se isso acontecer.

## Índice

| Receita | Quando consultar |
|---|---|
| [`01-etl-extractors.md`](./01-etl-extractors.md) | Escrever ou revisar um novo extractor Python em `backend/src/etl/loaders/` |
| [`02-api-rest-camadas.md`](./02-api-rest-camadas.md) | Adicionar um novo endpoint REST (rota → controller → service → schema) |
| [`03-schema-postgis-drizzle.md`](./03-schema-postgis-drizzle.md) | Criar ou alterar uma tabela Drizzle, especialmente com geometria |
| [`04-granularidade-espacial.md`](./04-granularidade-espacial.md) | Decidir como um novo indicador deve referenciar território |
| [`05-notas-metodologicas.md`](./05-notas-metodologicas.md) | Escrever a documentação/justificativa de uma decisão de dado ou metodologia |

## Como manter esta biblioteca viva

- Toda vez que um bug real for encontrado e corrigido num padrão já documentado aqui
  (como já aconteceu com transação por linha no upsert de MMGD, ou WKT vs WKB), a
  receita correspondente deve ser atualizada com a armadilha nova.
- Novas receitas só devem ser adicionadas quando um padrão se repetir pelo menos duas
  vezes no código real — receita de uso único não compensa a manutenção.
- Esta biblioteca documenta **o que existe**, não **o que está planejado**. Padrões
  ainda não implementados (autenticação, RBAC, deploy) pertencem ao `CLAUDE.md`
  (seções marcadas PLANEJADO), não aqui.
