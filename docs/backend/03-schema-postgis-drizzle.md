# Receita: tabela Drizzle com geometria (PostGIS)

**Quando usar:** ao criar ou alterar qualquer tabela em `backend/src/db/schema/`,
especialmente uma que guarde geometria.

**Referência real:** `backend/src/db/schema/municipios.ts`,
`backend/src/db/schema/unidades_espaciais.ts`,
`backend/src/db/migrations/0001_extensoes_e_indices_espaciais.sql`.

---

## Convenções obrigatórias (CLAUDE.md, Seção 5)

```typescript
id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
```

- Nome de coluna em **snake_case em português** (`codigo_ibge`,
  `periodo_referencia`), nunca inglês/camelCase.
- Sem soft delete (`deletedAt`) — usar `ON DELETE CASCADE` na FK.
- Sem `updatedAt` por padrão — só adicionar `atualizadoEm` quando a tabela
  específica precisar (ex.: `municipios`, atualizado a cada upsert de geometria).

## Geometria: sempre `customType`, nunca o helper `geometry()` nativo

Testado: o helper nativo do Drizzle não respeita tipo + SRID combinados (gerou só
`geometry(point)`, sem SRID). Isso é grave porque um SRID errado faz o mapa desenhar
municípios na posição/escala errada. Padrão correto:

```typescript
const geometriaMultiPolygon = customType<{ data: string }>({
  dataType() {
    return 'geometry(MultiPolygon, 4674)'; // SIRGAS 2000
  },
});
// ...
geom: geometriaMultiPolygon('geom').notNull(),
```

Use o tipo geométrico mais específico possível quando ele for sempre o mesmo
(`MultiPolygon` em `municipios`, porque municípios podem ter ilhas/territórios
separados). Use `geometry(Geometry, 4674)` (genérico) só quando a tabela
legitimamente precisa aceitar mais de um tipo — caso de `unidades_espaciais`, que
pode ser polígono (setor censitário, bairro) ou ponto (CEP) dependendo do registro.

## Índice espacial (GiST): sempre migration SQL manual

`drizzle-kit` não gera índices GiST. Toda tabela com coluna de geometria precisa de
uma migration manual separada da migration gerada automaticamente:

```sql
CREATE INDEX IF NOT EXISTS idx_<tabela>_geom
  ON <tabela>
  USING GIST (geom);
```

Sem esse índice, qualquer consulta geográfica (contains, distância, bounding box)
faz varredura completa da tabela — inviável em produção com ~5.570 municípios
simultâneos no mapa (RF-017, RF-022, RF-024).

## Relacionamentos: sempre com `onDelete: 'cascade'`

```typescript
codigoIbge: char('codigo_ibge', { length: 7 })
  .notNull()
  .references(() => municipios.codigoIbge, { onDelete: 'cascade' }),
```

## Upsert idempotente, nunca insert estático

```typescript
await db.insert(table)
  .values(data)
  .onConflictDoUpdate({ target: table.id, set: data });
```

Equivalente SQL usado pelos extractors Python: `INSERT ... ON CONFLICT (...) DO
UPDATE SET ...`. Nunca `INSERT` puro — rodar o mesmo script duas vezes não pode gerar
duplicata nem erro.

## Consultas com JOIN complexo: `db.execute(sql\`...\`)`, não Query Builder

Quando o JOIN envolve CTEs (`WITH ... AS`), `DISTINCT ON`, ou lógica que o Query
Builder do Drizzle expressaria de forma menos legível, o padrão real do projeto é
usar SQL bruto via `sql` tag, mantendo o retorno tipado manualmente:

```typescript
import { sql } from 'drizzle-orm';

const resultado = await db.execute(sql`
  WITH mmgd_latest AS (
    SELECT DISTINCT ON (unidade_espacial_id) ...
    ORDER BY unidade_espacial_id, periodo_referencia DESC
  )
  SELECT ... FROM municipios m JOIN ...
`);
return resultado.rows as unknown as LinhaBruta[];
```

Ver `buscarPainelBruto` em `backend/src/services/vaziosDeAcesso.service.ts` para o
exemplo completo — inclusive o comentário explicando por que `ue.tipo = 'municipio'`
é necessário no JOIN (evitar fan-out quando a mesma unidade espacial tem múltiplos
"filhos", como favelas/ZEIS dentro do mesmo município).

## Checklist rápido para uma tabela nova

1. Colunas em snake-case português; `id` com `generatedAlwaysAsIdentity()`.
2. Geometria via `customType`, nunca o helper nativo `geometry()`.
3. Migration SQL manual para índice GiST, se houver geometria.
4. FK sempre com `onDelete: 'cascade'`.
5. Se a tabela representa um indicador (não território), referenciar
   `unidades_espaciais.id`, não `municipios.codigo_ibge` diretamente — ver
   [`04-granularidade-espacial.md`](./04-granularidade-espacial.md).
