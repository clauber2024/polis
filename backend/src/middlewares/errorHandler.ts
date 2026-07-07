/**
 * MIDDLEWARE: tratamento de erro central (CLAUDE.md, Seção 4 — "Controllers
 * devem retornar JSON consistente").
 * --------------------------------------------------------------------------
 * Todo erro da aplicação (validação zod, erro de negócio, erro de banco)
 * termina aqui, nunca vaza como stack trace cru para o cliente. Formato de
 * resposta fixo:
 *   { "erro": { "mensagem": string, "detalhes"?: unknown } }
 *
 * Erros não esperados (fora de AppError) são logados no servidor com stack
 * completo, mas expõem só uma mensagem genérica ao cliente — não vazar
 * detalhes internos (query SQL, caminho de arquivo etc.) em produção.
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

export function errorHandler(
  erro: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (erro instanceof AppError) {
    res.status(erro.statusCode).json({
      erro: {
        mensagem: erro.message,
        ...(erro.detalhes !== undefined ? { detalhes: erro.detalhes } : {}),
      },
    });
    return;
  }

  console.error('[errorHandler] Erro não tratado:', erro);
  res.status(500).json({
    erro: {
      mensagem: 'Erro interno do servidor.',
    },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    erro: {
      mensagem: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
    },
  });
}
