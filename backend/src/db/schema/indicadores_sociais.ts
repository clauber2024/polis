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

    // --- Dimensão Infraestrutura Urbana (inspirada no IVS/IPEA, construída
    // a partir do Censo 2022 via SIDRA — ver nota metodológica no DRF/CLAUDE.md
    // sobre esta NÃO ser o IVS oficial, que só existe em nível municipal até 2010) ---

    /** % da população residente em domicílios rurais (Tabela SIDRA 9923) */
    percentualPopulacaoRural: doublePrecision('percentual_populacao_rural'),

    /** % de domicílios sem ligação à rede geral de distribuição de água (Tabela SIDRA 6803) */
    percentualAguaInadequada: doublePrecision('percentual_agua_inadequada'),

    /** % de domicílios sem esgotamento por rede geral/pluvial/fossa ligada à rede (Tabela SIDRA 6805) */
    percentualEsgotoInadequado: doublePrecision('percentual_esgoto_inadequado'),

    /** % de domicílios sem coleta de lixo direta ou indireta (Tabela SIDRA 6892) */
    percentualLixoInadequado: doublePrecision('percentual_lixo_inadequado'),

    /** Habitantes por km², calculado a partir da população do Censo 2022 e municipios.area_km2 */
    densidadePopulacional: doublePrecision('densidade_populacional'),

    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    unidadePeriodoUnico: uniqueIndex('indicadores_sociais_unidade_periodo_idx').on(
      tabela.unidadeEspacialId,
      tabela.periodoReferencia,
    ),
  }),
);
