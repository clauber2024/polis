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
  exportarMunicipiosCsv,
  exportarMunicipiosGeoJson,
  exportarComparacaoCsv,
  exportarComparacaoXlsx,
} from '../services/municipios.service.js';
import type {
  ListarMunicipiosQuery,
  BuscarMunicipioParams,
  CompararMunicipiosQuery,
  ExportarMunicipiosQuery,
  ExportarComparacaoQuery,
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

/**
 * RF-047: download de dados públicos (CSV ou GeoJSON, conforme
 * ?formato=). Diferente dos outros controllers, não usa res.json() puro —
 * define Content-Type/Content-Disposition pra forçar download no navegador.
 */
export async function exportarMunicipiosController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as ExportarMunicipiosQuery;

    if (query.formato === 'csv') {
      const csv = await exportarMunicipiosCsv(query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="municipios.csv"');
      res.send(csv);
      return;
    }

    const geojson = await exportarMunicipiosGeoJson(query);
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="municipios.geojson"');
    res.json(geojson);
  } catch (erro) {
    next(erro);
  }
}

/**
 * RF-052: exportação da tabela de comparação do Painel Analítico (CSV ou
 * XLSX, conforme ?formato=).
 */
export async function exportarComparacaoController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { codigos, formato } = req.query as unknown as ExportarComparacaoQuery;

    if (formato === 'csv') {
      const csv = await exportarComparacaoCsv(codigos);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="comparacao-municipios.csv"');
      res.send(csv);
      return;
    }

    const xlsx = await exportarComparacaoXlsx(codigos);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="comparacao-municipios.xlsx"');
    res.send(Buffer.from(xlsx));
  } catch (erro) {
    next(erro);
  }
}
