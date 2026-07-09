/**
 * SCHEMA: sugestoes_indicadores (RF-061) — ver migration 0023.
 * Formulário (append-only) de sugestão de melhoria em indicadores
 * existentes, do papel Colaborador.
 */

import { pgTable, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios.js';

export const sugestoesIndicadores = pgTable('sugestoes_indicadores', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  indicador: varchar('indicador', { length: 120 }).notNull(),
  mensagem: text('mensagem').notNull(),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});
