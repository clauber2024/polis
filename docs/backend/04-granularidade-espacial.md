# Receita: como um novo indicador deve referenciar território

**Quando usar:** ao decidir a foreign key de uma tabela de indicador nova (o
equivalente a `mmgd_indicadores`, `indicadores_sociais`, `irradiacao_solar`).

**Referência real:** `backend/src/db/schema/unidades_espaciais.ts`,
`backend/src/db/schema/mmgd_indicadores.ts`.

---

## A regra

Tabelas de indicador **nunca** referenciam `municipios.codigo_ibge` diretamente.
Todas referenciam `unidades_espaciais.id`:

```typescript
unidadeEspacialId: varchar('unidade_espacial_id', { length: 40 })
  .notNull()
  .references(() => unidadesEspaciais.id, { onDelete: 'cascade' }),
```

## Por quê

O problema original: "como representar um indicador cuja granularidade não é
município (setor censitário, favela, CEP), sem que cada tabela de indicador precise
saber lidar com múltiplas granularidades?" A primeira tentativa (campos de texto
livre `granularidade_tipo`/`granularidade_codigo` na própria tabela do indicador) não
tinha integridade real — nada garantia que aquele código existisse ou tivesse
geometria.

A solução: uma tabela "guarda-chuva" (`unidades_espaciais`) que sempre tem geometria
própria e um ID estável, no formato `tipo:codigo` (ex.: `municipio:3550308`,
`setor_censitario:355030885000123`, `cep:01310100`). Toda tabela de indicador aponta
só para esse `id` — não precisa saber se é município, setor ou CEP. Quem sabe disso é
o campo `tipo` em `unidades_espaciais`.

Isso permite o mesmo indicador existir em granularidades diferentes (município hoje;
setor censitário, favela/comunidade urbana, CEP no futuro) **sem alterar o schema**
da tabela de indicador — só inserir novos registros em `unidades_espaciais` com
`tipo` diferente.

## Convenção do formato do ID

```
município          -> "municipio:3106200"                (código IBGE)
setor censitário    -> "setor_censitario:355030885000123" (código IBGE do setor)
CEP                 -> "cep:01310100"
bairro              -> "bairro:3550308:moema"             (código IBGE do município + slug do bairro)
```

O prefixo antes do `:` sempre repete o campo `tipo` — isso é só para leitura humana
de logs/debugging, não é lido programaticamente para extrair o tipo (o campo `tipo`
existe separadamente para isso).

## Todo município tem sempre um espelho em `unidades_espaciais`

Criado junto com o registro em `municipios`, no seed territorial
(`seed_municipios.py`). Um setor censitário só ganha um registro aqui no dia em que
esse dado existir de fato — a tabela não precisa ser populada para todas as
granularidades desde o início.

## Por que `municipios` continua existindo como tabela própria

Município tem atributos que setor censitário/CEP não têm (UF, nome do estado,
região) — usados em filtros regionais (RF-046) e ranking estadual (RF-027 a RF-037).
`unidades_espaciais` não substitui `municipios`; ela referencia `municipios` como
"pai" via `municipioPaiCodigoIbge`, formando a ponte entre as duas.

## Ao escrever um JOIN contra uma tabela de indicador

Sempre filtrar por `unidades_espaciais.tipo` quando o indicador deve ser só ao nível
de município (não confundir favela/ZEIS "filhas" do mesmo município pai):

```sql
JOIN unidades_espaciais ue
  ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
```

Sem esse filtro, o JOIN causa fan-out (o mesmo município pai aparece múltiplas vezes,
uma por cada favela/ZEIS associada), inflando contagens artificialmente. Ver
`buscarPainelBruto`, `backend/src/services/vaziosDeAcesso.service.ts`, para o
exemplo real.

## Checklist rápido para um indicador novo

1. FK aponta para `unidades_espaciais.id`, nunca `municipios.codigo_ibge` direto.
2. Se o indicador só existe ao nível de município hoje, não impede o schema de
   suportar granularidade fina depois — não é preciso "prever" isso na tabela.
3. Qualquer JOIN que use essa tabela de indicador, filtrando por município, deve
   incluir `ue.tipo = 'municipio'` para evitar fan-out.
