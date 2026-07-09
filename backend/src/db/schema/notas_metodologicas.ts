/**
 * SCHEMA: notas_metodologicas (RF-064/065/066) — ver migration 0023.
 * Notas metodológicas COM HISTÓRICO — cada linha é uma nova versão (nunca
 * UPDATE); a mais recente por `topico` é a "atual". `forcaAchado` é a escala
 * de estrelas do RF-066 (1-5, opcional).
 */

import { pgTable, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios.js';

export const notasMetodologicas = pgTable('notas_metodologicas', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Texto livre — ex: "obepe_indice_pobreza_energetica_regional", "granularidade_mmgd". */
  topico: varchar('topico', { length: 80 }).notNull(),
  conteudo: text('conteudo').notNull(),
  /** RF-066: "força dos achados" (estrelas), 1-5, opcional. */
  forcaAchado: integer('forca_achado'),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});
