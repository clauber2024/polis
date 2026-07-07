# Receita: novo endpoint REST (rota → controller → service → schema)

**Quando usar:** ao adicionar qualquer rota nova em `backend/src/`. Único endpoint
real implementado até agora (07/07/2026): `GET /api/vazios-de-acesso` — todo o padrão
abaixo foi extraído dele.

**Referência real:**
`backend/src/routes/vaziosDeAcesso.routes.ts`,
`backend/src/controllers/vaziosDeAcesso.controller.ts`,
`backend/src/services/vaziosDeAcesso.service.ts`,
`backend/src/schemas/vaziosDeAcesso.schema.ts`.

---

## As 4 camadas, e o que cada uma NÃO deve fazer

```
routes/*.routes.ts        → só declara o path HTTP + qual schema valida + qual controller responde
schemas/*.schema.ts        → só contrato zod (o que é um input válido)
controllers/*.controller.ts → só lê req já validado, chama o service, devolve JSON ou next(erro)
services/*.service.ts      → TODA a lógica de negócio mora aqui
```

Regra central (CLAUDE.md, Seção 4): **lógica de negócio nunca no controller.** Um
controller correto é sempre deste tamanho:

```typescript
export async function listarVaziosDeAcessoController(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as ListarVaziosDeAcessoQuery;
    const resultado = await listarVaziosDeAcesso(query);
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}
```

Se um controller precisa de `if`s de regra de negócio, isso é sinal de que a lógica
vazou da camada errada — mover para o service.

## Passo a passo para um endpoint novo

1. **Schema zod** (`schemas/<recurso>.schema.ts`): declarar o contrato de
   query/body/params. Usar `z.enum([...])` para qualquer campo que vire critério de
   filtro/ordenação — nunca aceitar nome de coluna arbitrário do cliente, mesmo que a
   ordenação seja feita em memória (não SQL dinâmico):

   ```typescript
   export const CRITERIOS_ORDENACAO = ['ivs', 'rendaMediaDomiciliar', ...] as const;
   ordenarPor: z.enum(CRITERIOS_ORDENACAO).default('ivs'),
   ```

   Usar `z.coerce.number()` para números vindos de query string (sempre chegam como
   string).

2. **Service** (`services/<recurso>.service.ts`): toda a lógica — busca no banco
   (Drizzle, `sql\`...\`` quando o JOIN é complexo, ver receita
   [`03-schema-postgis-drizzle.md`](./03-schema-postgis-drizzle.md)), cálculo,
   classificação, paginação. O service exporta tipos (`export interface
   ResultadoX`) que o controller e os testes reaproveitam.

3. **Controller** (`controllers/<recurso>.controller.ts`): esqueleto fixo acima —
   ler `req.query`/`req.body` já validado, chamar o service, `res.json(...)`,
   `catch` repassa para `next(erro)`.

4. **Rota** (`routes/<recurso>.routes.ts`): compõe schema + middleware +
   controller:

   ```typescript
   vaziosDeAcessoRouter.get(
     '/vazios-de-acesso',
     validateRequest({ query: listarVaziosDeAcessoQuerySchema }),
     listarVaziosDeAcessoController,
   );
   ```

5. Registrar o router em `routes/index.ts`:

   ```typescript
   router.use(vaziosDeAcessoRouter);
   ```

## Validação: `validateRequest` (middleware genérico, não reescrever por rota)

`backend/src/middlewares/validateRequest.ts` já resolve validação de
`query`/`body`/`params` para qualquer rota nova — nunca escrever `schema.parse(...)`
manualmente dentro de um controller:

```typescript
router.get('/recurso', validateRequest({ query: meuSchema }), meuController);
```

Em caso de falha, o middleware lança `AppError(400, ...)` com `error.flatten()` do
zod como `detalhes` — o controller nunca vê um erro de validação.

## Erros: sempre `AppError`, nunca `throw new Error(...)` cru

Qualquer erro esperado (recurso não encontrado, filtro inválido, regra de negócio
violada) deve ser lançado como `AppError(statusCode, mensagem, detalhes?)`
(`backend/src/utils/AppError.ts`). Um `Error` genérico sempre vira 500 no
`errorHandler` central — isso é intencional (erro inesperado deve ser tratado como
bug, não como resposta HTTP normal).

Formato de resposta de erro, fixo para toda a API (`errorHandler.ts`):

```json
{ "erro": { "mensagem": "...", "detalhes": { "opcional": "..." } } }
```

Nunca vazar stack trace ou detalhe interno (query SQL, caminho de arquivo) para
erros não esperados — só a mensagem genérica "Erro interno do servidor."

## Paginação e ordenação — padrão já validado

Ver `listarVaziosDeAcesso` (`vaziosDeAcesso.service.ts`) para o padrão de paginação
em memória (filtra → ordena → pagina) e o tratamento de valores nulos na ordenação
(nulos sempre vão para o fim, independente da direção `asc`/`desc` — não faz sentido
"nulo é o menor/maior valor").

## Checklist rápido para um endpoint novo

1. Schema zod com whitelist fechada para qualquer campo de ordenação/filtro.
2. Controller sem `if` de regra de negócio — só delega ao service.
3. Toda lógica de negócio no service, com tipos exportados.
4. Erros esperados sempre como `AppError`, nunca `Error` genérico.
5. Rota registrada em `routes/index.ts`.
