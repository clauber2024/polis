/**
 * SCHEMA: indicadores_sociais (v2 — corrigida)
 * --------------------------------------------------------------------------
 * Mesma correção da mmgd_indicadores: agora aponta para unidades_espaciais.id.
 *
 * Isso é especialmente relevante aqui porque, conforme o seu próprio DRF
 * registra: "indicadores sociais (IVS, CadÚnico, renda) que já existem em
 * granularidade de setor censitário devem continuar disponíveis nessa
 * granularidade desde já, mesmo que a MMGD ainda não acompanhe" — ou seja,
 * essa tabela pode (e já deveria) ter linhas com unidade_espacial_id apontando
 * para setores censitários DESDE JÁ, mesmo antes de qualquer dado de MMGD fino
 * existir. A modelagem antiga não suportava isso de forma limpa; esta suporta.
 * --------------------------------------------------------------------------
 */

import {
  pgTable,
  varchar,
  doublePrecision,
  date,
  timestamp,
  uniqueIndex,
  integer,
} from 'drizzle-orm/pg-core';
import { unidadesEspaciais } from './unidades_espaciais';

export const indicadoresSociais = pgTable(
  'indicadores_sociais',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

    unidadeEspacialId: varchar('unidade_espacial_id', { length: 40 })
      .notNull()
      .references(() => unidadesEspaciais.id, { onDelete: 'cascade' }),

    periodoReferencia: date('periodo_referencia').notNull(),

    ivs: doublePrecision('ivs'),
    rendaMediaDomiciliar: doublePrecision('renda_media_domiciliar'),
    percentualCadunico: doublePrecision('percentual_cadunico'),
    percentualTarifaSocial: doublePrecision('percentual_tarifa_social'),

    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    unidadePeriodoUnico: uniqueIndex('indicadores_sociais_unidade_periodo_idx').on(
      tabela.unidadeEspacialId,
      tabela.periodoReferencia,
    ),
  }),
);
