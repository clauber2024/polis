/**
 * SCHEMA: materiais_comunicacao (RF-067) — ver migration 0023.
 * Área de preparação de conteúdo para relatórios/comunicação pública, com
 * status, mantida pelo papel Colaborador.
 */

import { pgTable, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios.js';

export const materiaisComunicacao = pgTable('materiais_comunicacao', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  titulo: varchar('titulo', { length: 160 }).notNull(),
  /** 'em_producao' | 'em_revisao' | 'publicado' — ver CHECK na migration. */
  status: varchar('status', { length: 20 }).notNull().default('em_producao'),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type StatusMaterialComunicacao = 'em_producao' | 'em_revisao' | 'publicado';
