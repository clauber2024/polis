/**
 * SCHEMA (zod): contrato de request do login (RF-009).
 * --------------------------------------------------------------------------
 * Validação isolada aqui, consumida via middleware `validateRequest` (CLAUDE.md,
 * Seção 4) — o controller nunca lida com `req.body` cru.
 * --------------------------------------------------------------------------
 */

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  senha: z.string().min(1, 'Senha é obrigatória.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
