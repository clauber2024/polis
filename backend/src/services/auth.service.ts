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

  // Checado DEPOIS da senha conferir (RF-076, migration 0024) — só revelamos
  // "conta desativada" pra quem já provou saber a senha; antes disso, erro
  // genérico de credencial inválida, para não vazar quais e-mails existem.
  if (!linha.ativo) {
    throw new AppError(401, 'Esta conta foi desativada. Fale com um administrador.');
  }

  const papel = linha.papel as PapelUsuario;
  const usuario: UsuarioAutenticado = {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    papel,
  };

  // jsonwebtoken@9 tipa `expiresIn` como `number | StringValue` (template
  // literal type da lib `ms`, ex: "8h"), não `string` genérico — env.jwtExpiresIn
  // vem de process.env (string solta), por isso o cast pontual abaixo.
  const opcoesToken: jwt.SignOptions = {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  };
  const token = jwt.sign({ sub: linha.id, papel }, env.jwtSecret, opcoesToken);

  return { token, usuario };
}
