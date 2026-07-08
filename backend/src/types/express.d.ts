/**
 * TIPOS: augmentation do Express.Request para carregar o usuário autenticado.
 * --------------------------------------------------------------------------
 * `req.usuario` é preenchido pelo middleware `requireAutenticacao`
 * (src/middlewares/auth.ts) a partir do payload do JWT — controllers/services
 * downstream (ex: requirePapel, ou um controller que precise saber quem fez
 * a requisição) leem `req.usuario` já tipado, sem `as`/cast manual.
 * --------------------------------------------------------------------------
 */

import type { PapelUsuario } from '../db/schema/usuarios.js';

declare global {
  namespace Express {
    interface Request {
      usuario?: {
        id: number;
        papel: PapelUsuario;
      };
    }
  }
}

export {};
