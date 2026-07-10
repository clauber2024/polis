/**
 * CONTROLLER: GET /api/ranking-distribuidoras
 * --------------------------------------------------------------------------
 * Sem query params - controller fino, só chama o service e devolve JSON
 * (mesmo padrão de estatisticasNacionais.controller.ts).
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { calcularRankingDistribuidoras } from '../services/rankingDistribuidoras.service.js';

export async function rankingDistribuidorasController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const resultado = await calcularRankingDistribuidoras();
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}
