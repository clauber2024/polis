/**
 * MIDDLEWARE: validação via zod (CLAUDE.md, Seção 4 — "Validação via
 * middleware dedicado, ex: zod").
 * --------------------------------------------------------------------------
 * Uso nas rotas:
 *   router.get('/vazios-de-acesso', validateRequest({ query: listarVaziosDeAcessoQuerySchema }), controller);
 *
 * Em caso de falha de validação, repassa um AppError(400, ...) para o
 * errorHandler central — o controller nunca precisa lidar com erro de
 * validação, só recebe req.query/req.body já validado e tipado (o parse do
 * zod substitui req[source] pelo valor COERCIDO, ex: string de query
 * convertida para number quando o schema usa z.coerce.number()).
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError.js';

type FontesValidaveis = 'query' | 'body' | 'params';

export function validateRequest(schemas: Partial<Record<FontesValidaveis, ZodTypeAny>>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const fonte of Object.keys(schemas) as FontesValidaveis[]) {
      const schema = schemas[fonte];
      if (!schema) continue;

      const resultado = schema.safeParse(req[fonte]);
      if (!resultado.success) {
        next(
          new AppError(
            400,
            `Parâmetros inválidos em "${fonte}".`,
            resultado.error.flatten(),
          ),
        );
        return;
      }

      // req.query/req.params são getters somente-leitura no Express 5, mas
      // no Express 4 (versão fixada no package.json) ainda são graváveis —
      // substituímos pelo valor já coercido/validado do zod.
      (req as unknown as Record<FontesValidaveis, unknown>)[fonte] = resultado.data;
    }
    next();
  };
}
