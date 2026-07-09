/**
 * SCHEMA: usuarios
 * --------------------------------------------------------------------------
 * Fundação de autenticação/RBAC (sessão 08/07/2026) — ver migration
 * 0022_criacao_usuarios_auth.sql e DRF.md Seção 2 para o histórico da
 * redução de 6 perfis (P1-P6) para 3 papéis reais. Só os papéis que
 * autenticam de fato têm linha aqui: "colaborador" (funde os antigos P4
 * Parceiro Técnico + P5 Equipe do Projeto) e "administrador" (antigo P6).
 * O papel "público" nunca aparece nesta tabela — não autentica.
 *
 * `papel` é `varchar` com CHECK na migration, não um enum nativo do
 * Postgres/Drizzle — evita uma migration de tipo (`ALTER TYPE`) se um papel
 * novo for adicionado no futuro; o Drizzle só valida a string em tempo de
 * compilação via o union type abaixo.
 * --------------------------------------------------------------------------
 */

import { pgTable, integer, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const usuarios = pgTable('usuarios', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

  nome: varchar('nome', { length: 120 }).notNull(),

  /** Único — é o identificador de login (RF-009: "campos de e-mail/usuário e senha"). */
  email: varchar('email', { length: 160 }).notNull(),

  /** Hash bcrypt (bcryptjs, custo 10) — nunca senha em texto puro. Ver auth.service.ts. */
  senhaHash: text('senha_hash').notNull(),

  /** 'colaborador' | 'administrador' — ver CHECK na migration 0022. */
  papel: varchar('papel', { length: 20 }).notNull(),

  /**
   * RF-076 (migration 0024) — usuário inativo não consegue autenticar (ver
   * auth.service.ts). "Remover" (RF-076) é DELETE de verdade; "inativar" é
   * reversível via este campo.
   */
  ativo: boolean('ativo').default(true).notNull(),

  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});

/** União de papéis válidos — mesma lista do CHECK da migration 0022. */
export type PapelUsuario = 'colaborador' | 'administrador';
