/**
 * CONTROLLER: GET /api/vazios-de-acesso
 * --------------------------------------------------------------------------
 * Controller fino, propositalmente sem lógica de negócio (CLAUDE.md, Seção
 * 4: "Lógica de negócio em Services, nunca no controller") — só lê a query
 * já validada pelo middleware, chama o service, e devolve JSON. Erros são
 * repassados ao errorHandler central via next(erro).
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { listarVaziosDeAcesso, classificarMunicipios } from '../services/vaziosDeAcesso.service.js';
import type {
  ListarVaziosDeAcessoQuery,
  ClassificarMunicipiosQuery,
} from '../schemas/vaziosDeAcesso.schema.js';

export async function listarVaziosDeAcessoController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as ListarVaziosDeAcessoQuery;
    const resultado = await listarVaziosDeAcesso(query);
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}

/**
 * GET /api/vazios-de-acesso/classificar (Painel Analítico, RF-049/050)
 *
 * Classificação de quadrante de um conjunto específico de municípios — ver
 * docstring de classificarMunicipios.
 */
export async function classificarMunicipiosController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { codigos } = req.query as unknown as ClassificarMunicipiosQuery;
    const resultado = await classificarMunicipios(codigos);
    res.json(resultado);
  } catch (erro) {
    next(erro);
  }
}
