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
import {
  listarVaziosDeAcesso,
  exportarVaziosDeAcessoCsv,
  classificarMunicipios,
} from '../services/vaziosDeAcesso.service.js';
import type {
  ListarVaziosDeAcessoQuery,
  ExportarVaziosDeAcessoQuery,
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
 * GET /api/vazios-de-acesso/exportar (RF-047, mesmo padrão de
 * exportarMunicipiosController) — download em CSV da classificação
 * nacional completa (todos os municípios que casam com o filtro, sem
 * paginação). Content-Type/Content-Disposition forçam download no
 * navegador, por isso não usa res.json() puro.
 */
export async function exportarVaziosDeAcessoController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as ExportarVaziosDeAcessoQuery;
    const csv = await exportarVaziosDeAcessoCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vazios-de-acesso.csv"');
    res.send(csv);
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
