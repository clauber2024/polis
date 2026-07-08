/**
 * CONTROLLER: GET /api/municipios e GET /api/municipios/:codigoIbge
 * --------------------------------------------------------------------------
 * Controller fino, sem lógica de negócio (CLAUDE.md, Seção 4) — só lê
 * query/params já validados pelo middleware, chama o service, e devolve
 * JSON. Erros (incluindo o 404 de município não encontrado, lançado como
 * AppError no service) são repassados ao errorHandler central via next(erro).
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import {
  listarMunicipios,
  buscarMunicipioPorCodigoIbge,
  compararMunicipios,
} from '../services/municipios.service.js';
import type {
  ListarMunicipiosQuery,
  BuscarMunicipioParams,
  CompararMunicipiosQuery,
} from '../schemas/municipios.schema.js';

export async function listarMunicipiosController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as ListarMunicipiosQuery;
    const resultado = await listarMunicipios(query);
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}

export async function buscarMunicipioController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { codigoIbge } = req.params as unknown as BuscarMunicipioParams;
    const resultado = await buscarMunicipioPorCodigoIbge(codigoIbge);
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}

export async function compararMunicipiosController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { codigos } = req.query as unknown as CompararMunicipiosQuery;
    const resultado = await compararMunicipios(codigos);
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}
