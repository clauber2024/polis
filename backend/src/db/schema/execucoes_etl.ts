/**
 * SCHEMA: execucoes_etl — ver migration 0031.
 * Histórico de disparos manuais de extractor Python pela interface do
 * Painel Admin (RF-070 revisitado, 30/07/2026) — só cobre a whitelist de
 * `backend/src/utils/extractoresElegiveis.ts`.
 */

import { pgTable, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios.js';

export const execucoesEtl = pgTable('execucoes_etl', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  baseId: varchar('base_id', { length: 60 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('em_execucao'),
  iniciadoPorUsuarioId: integer('iniciado_por_usuario_id').references(() => usuarios.id, {
    onDelete: 'set null',
  }),
  iniciadoEm: timestamp('iniciado_em', { withTimezone: true }).defaultNow().notNull(),
  finalizadoEm: timestamp('finalizado_em', { withTimezone: true }),
  codigoSaida: integer('codigo_saida'),
  saidaLog: text('saida_log'),
});

export type StatusExecucaoEtl = 'em_execucao' | 'sucesso' | 'falha';
