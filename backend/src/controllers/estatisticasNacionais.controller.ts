/**
 * CONTROLLER: GET /api/estatisticas-nacionais (RF-005, Landing Page)
 * --------------------------------------------------------------------------
 * Sem query params — controller fino, só chama o service e devolve JSON
 * (mesmo padrão de municipios.controller.ts).
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { calcularEstatisticasNacionais } from '../services/estatisticasNacionais.service.js';

export async function estatisticasNacionaisController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const resultado = await calcularEstatisticasNacionais();
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}
