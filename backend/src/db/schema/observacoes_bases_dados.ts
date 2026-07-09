/**
 * SCHEMA: observacoes_bases_dados (RF-060) — ver migration 0023.
 * Registro (append-only) de observações do papel Colaborador sobre
 * inconsistências encontradas em cruzamentos de dados.
 */

import { pgTable, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios.js';

export const observacoesBasesDados = pgTable('observacoes_bases_dados', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  baseDados: varchar('base_dados', { length: 30 }).notNull(),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  mensagem: text('mensagem').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});
