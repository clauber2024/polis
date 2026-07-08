/**
 * SERVICE: Autenticação (RF-009, RF-013) — fundação de RBAC (sessão 08/07/2026)
 * ============================================================================
 * Só os papéis "colaborador" e "administrador" passam por aqui — o papel
 * "público" não autentica (ver DRF.md Seção 2 e migration 0022).
 *
 * Diferente dos demais services (municipios, vaziosDeAcesso etc.), que usam
 * `sql` cru por serem consultas analíticas/geoespaciais complexas, este usa o
 * query builder do Drizzle (`db.select().from(usuarios).where(eq(...))`) —
 * é uma busca simples por chave única, sem motivo para SQL manual.
 *
 * Mensagem de erro para credencial inválida é sempre a mesma genérica
 * ("E-mail ou senha inválidos"), tanto para e-mail inexistente quanto para
 * senha errada — não vazar qual das duas informações está incorreta.
 * ============================================================================
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { usuarios, type PapelUsuario } from '../db/schema/usuarios.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import type { LoginInput } from '../schemas/auth.schema.js';

export interface UsuarioAutenticado {
  id: number;
  nome: string;
  email: string;
  papel: PapelUsuario;
}

export interface LoginResultado {
  token: string;
  usuario: UsuarioAutenticado;
}

const MENSAGEM_CREDENCIAL_INVALIDA = 'E-mail ou senha inválidos.';

export async function autenticar({ email, senha }: LoginInput): Promise<LoginResultado> {
  const [linha] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);

  if (!linha) {
    throw new AppError(401, MENSAGEM_CREDENCIAL_INVALIDA);
  }

  const senhaConfere = await bcrypt.compare(senha, linha.senhaHash);
  if (!senhaConfere) {
    throw new AppError(401, MENSAGEM_CREDENCIAL_INVALIDA);
  }

  const papel = linha.papel as PapelUsuario;
  const usuario: UsuarioAutenticado = {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    papel,
  };

  const token = jwt.sign({ sub: linha.id, papel }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

  return { token, usuario };
}
