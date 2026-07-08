/**
 * CONTROLLER: GET /api/municipios/:codigoIbge/setores-censitarios
 * --------------------------------------------------------------------------
 * Controller fino (CLAUDE.md, Seção 4). Reaproveita buscarMunicipioParamsSchema
 * (mesma validação de codigoIbge usada no detalhe do município).
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { buscarSetoresCensitarios } from '../services/setoresCensitarios.service.js';
import type { BuscarMunicipioParams } from '../schemas/municipios.schema.js';

export async function setoresCensitariosController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { codigoIbge } = req.params as unknown as BuscarMunicipioParams;
    const resultado = await buscarSetoresCensitarios(codigoIbge);
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}
