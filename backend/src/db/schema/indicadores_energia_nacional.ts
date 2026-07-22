/**
 * SCHEMA: indicadores_energia_nacional
 * --------------------------------------------------------------------------
 * Série NACIONAL (não municipal) por ano — geração elétrica total do Brasil
 * (EPE/BEN) e geração/participação de MMGD (EPE/PDGD). Ver docs/DECISOES.md,
 * ADR "Integração da participação da MMGD na matriz elétrica nacional
 * (EPE/PDGD)". Diferente do resto do schema, NÃO referencia
 * unidades_espaciais — é um valor escalar do país, não um dado municipal.
 *
 * `geracaoMmgdGwh`/`percentualConsumoCativoAtendidoMmgd` ficam NULL até o
 * extractor de MMGD (PDGD) ser escrito — colunas já criadas para não exigir
 * nova migration depois, mesmo padrão de `analises_estatisticas` (migration
 * 0029).
 */

import { pgTable, integer, date, doublePrecision, varchar, timestamp } from 'drizzle-orm/pg-core';

export const indicadoresEnergiaNacional = pgTable('indicadores_energia_nacional', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

  periodoReferencia: date('periodo_referencia').notNull().unique(),

  geracaoEletricaNacionalGwh: doublePrecision('geracao_eletrica_nacional_gwh'),
  fonteGeracaoNacional: varchar('fonte_geracao_nacional', { length: 300 }),

  /**
   * NULL até o extractor de MMGD (PDGD) ser executado — nunca ler como zero.
   */
  geracaoMmgdGwh: doublePrecision('geracao_mmgd_gwh'),
  /**
   * % do CONSUMO cativo atendido por MMGD (demanda) — não é "participação na
   * geração nacional" (oferta, derivada como geracaoMmgdGwh /
   * geracaoEletricaNacionalGwh). Ver comentário da migration 0030.
   */
  percentualConsumoCativoAtendidoMmgd: doublePrecision('percentual_consumo_cativo_atendido_mmgd'),
  fonteMmgd: varchar('fonte_mmgd', { length: 300 }),

  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
});
