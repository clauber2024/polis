/**
 * CONTROLLER: GET /api/municipios/:codigoIbge/relatorio
 * --------------------------------------------------------------------------
 * Controller fino (CLAUDE.md, Seção 4). A validação de codigoIbge reaproveita
 * buscarMunicipioParamsSchema (mesmo schema do detalhe do município) — é o
 * mesmo formato de parâmetro, sem necessidade de um schema próprio.
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { gerarRelatorioTerritorioPdf } from '../services/relatorioTerritorio.service.js';
import type { BuscarMunicipioParams } from '../schemas/municipios.schema.js';

export async function relatorioTerritorioController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { codigoIbge } = req.params as unknown as BuscarMunicipioParams;
    const pdf = await gerarRelatorioTerritorioPdf(codigoIbge);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${codigoIbge}.pdf"`);
    res.send(pdf);
  } catch (erro) {
    next(erro);
  }
}
