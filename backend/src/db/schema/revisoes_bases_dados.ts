/**
 * SCHEMA: revisoes_bases_dados (RF-059) — ver migration 0023.
 * Status de revisão metodológica por base de dados primária, mantido pelo
 * papel Colaborador. 1 linha por base (dos 6 IDs canônicos — ver
 * src/utils/basesDeDadosCanonicas.ts). Diferente de `metadados_bases_dados`
 * (Admin, migration 0024), que é status TÉCNICO de validação de upload.
 */

import { pgTable, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios.js';

export const revisoesBasesDados = pgTable('revisoes_bases_dados', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  baseDados: varchar('base_dados', { length: 30 }).notNull().unique(),
  /** 'em_revisao' | 'validado' | 'inconsistencia_encontrada' — ver CHECK na migration. */
  status: varchar('status', { length: 30 }).notNull().default('em_revisao'),
  atualizadoPorUsuarioId: integer('atualizado_por_usuario_id').references(() => usuarios.id, {
    onDelete: 'set null',
  }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type StatusRevisaoBaseDados = 'em_revisao' | 'validado' | 'inconsistencia_encontrada';
