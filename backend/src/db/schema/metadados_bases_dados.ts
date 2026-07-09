/**
 * SCHEMA: metadados_bases_dados (RF-071/072/073) — ver migration 0024.
 * Metadados TÉCNICOS por base (granularidade espacial, status de validação),
 * mantidos pelo papel Administrador. Diferente de `revisoes_bases_dados`
 * (Colaborador, migration 0023), que é revisão METODOLÓGICA.
 */

import { pgTable, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios.js';

export const metadadosBasesDados = pgTable('metadados_bases_dados', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  baseDados: varchar('base_dados', { length: 40 }).notNull().unique(),
  /** 'municipio' | 'setor_censitario' | 'cep' | 'bairro' | 'outro' — ver CHECK na migration. */
  granularidadeEspacial: varchar('granularidade_espacial', { length: 20 })
    .notNull()
    .default('municipio'),
  /** 'pendente' | 'validado' | 'erro' | 'aguardando_liberacao' — ver CHECK na migration. */
  status: varchar('status', { length: 30 }).notNull().default('pendente'),
  observacao: text('observacao'),
  atualizadoPorUsuarioId: integer('atualizado_por_usuario_id').references(() => usuarios.id, {
    onDelete: 'set null',
  }),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type GranularidadeEspacial = 'municipio' | 'setor_censitario' | 'cep' | 'bairro' | 'outro';
export type StatusMetadadoBaseDados = 'pendente' | 'validado' | 'erro' | 'aguardando_liberacao';
