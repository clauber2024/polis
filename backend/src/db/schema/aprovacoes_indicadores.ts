/**
 * SCHEMA: aprovacoes_indicadores (RF-074) — ver migration 0024.
 * Fila de indicadores pendentes de aprovação do papel Administrador.
 */

import { pgTable, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios.js';

export const aprovacoesIndicadores = pgTable('aprovacoes_indicadores', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  indicador: varchar('indicador', { length: 120 }).notNull(),
  /** 'pendente' | 'aprovado' | 'rejeitado' — ver CHECK na migration. */
  status: varchar('status', { length: 20 }).notNull().default('pendente'),
  motivo: text('motivo'),
  criadoPorUsuarioId: integer('criado_por_usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  decididoPorUsuarioId: integer('decidido_por_usuario_id').references(() => usuarios.id, {
    onDelete: 'set null',
  }),
  decididoEm: timestamp('decidido_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type StatusAprovacaoIndicador = 'pendente' | 'aprovado' | 'rejeitado';
