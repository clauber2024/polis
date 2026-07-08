/**
 * CONTROLLER: POST /api/auth/login, POST /api/auth/logout (RF-009, RF-013, RF-014)
 * --------------------------------------------------------------------------
 * Controller fino (CLAUDE.md, Seção 4) — validação já rodou via
 * validateRequest + loginSchema antes de chegar aqui.
 *
 * `logout` é um no-op deliberado: o token é um JWT stateless (sem sessão
 * guardada no servidor), então não há nada para "invalidar" no backend nesta
 * fundação — o cliente descarta o token guardado. Se no futuro for
 * necessário revogar token antes da expiração (ex: usuário removido por um
 * Admin), a solução é uma blocklist de tokens revogados — fora do escopo
 * desta fundação, ver CLAUDE.md "Estado Real do Projeto".
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { autenticar } from '../services/auth.service.js';
import type { LoginInput } from '../schemas/auth.schema.js';

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const resultado = await autenticar(req.body as LoginInput);
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}

export function logoutController(_req: Request, res: Response): void {
  res.json({ mensagem: 'Logout realizado. Descarte o token no cliente.' });
}
