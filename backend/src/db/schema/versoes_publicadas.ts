/**
 * SCHEMA: versoes_publicadas (RF-075) — ver migration 0024.
 * Controle de versionamento dos mapas/dados publicados, do papel Administrador.
 */

import { pgTable, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios.js';

export const versoesPublicadas = pgTable('versoes_publicadas', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  versao: varchar('versao', { length: 40 }).notNull().unique(),
  descricao: text('descricao').notNull(),
  publicadoPorUsuarioId: integer('publicado_por_usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  publicadoEm: timestamp('publicado_em', { withTimezone: true }).defaultNow().notNull(),
});
