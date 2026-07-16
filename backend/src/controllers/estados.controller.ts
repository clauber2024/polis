/**
 * CONTROLLER: GET /api/estados
 * --------------------------------------------------------------------------
 * Controller fino, sem lógica de negócio (CLAUDE.md, Seção 4). Sem query
 * params/body a validar — mesmo padrão de basesDeDados.controller.ts.
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { buscarEstadosGeoJson } from '../services/estados.service.js';

export async function estadosGeoJsonController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const resultado = await buscarEstadosGeoJson();
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}
