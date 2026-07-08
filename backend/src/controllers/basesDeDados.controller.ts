/**
 * CONTROLLER: GET /api/bases-de-dados
 * --------------------------------------------------------------------------
 * Controller fino, sem lógica de negócio (CLAUDE.md, Seção 4). Sem query
 * params/body a validar — este endpoint não recebe entrada do cliente, por
 * isso não tem um middleware validateRequest associado (diferente dos
 * outros dois recursos do backend).
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { buscarStatusBasesDeDados } from '../services/basesDeDados.service.js';

export async function statusBasesDeDadosController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const resultado = await buscarStatusBasesDeDados();
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}
