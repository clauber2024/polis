/**
 * CONTROLLER: GET /api/analises-estatisticas
 * --------------------------------------------------------------------------
 * Sem query params - controller fino, só chama o service e devolve JSON
 * (mesmo padrão de rankingDistribuidoras.controller.ts).
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { buscarAnalisesEstatisticas } from '../services/analisesEstatisticas.service.js';

export async function analisesEstatisticasController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const resultado = await buscarAnalisesEstatisticas();
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}
