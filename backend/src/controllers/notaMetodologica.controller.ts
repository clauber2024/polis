/**
 * CONTROLLER: GET /api/nota-metodologica
 * --------------------------------------------------------------------------
 * Controller fino (CLAUDE.md, Seção 4) — sem parâmetros, sem validação zod.
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { gerarNotaMetodologicaPdf } from '../services/notaMetodologica.service.js';

export async function notaMetodologicaController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const pdf = await gerarNotaMetodologicaPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="nota-metodologica-atlas-solar-justo.pdf"');
    res.send(pdf);
  } catch (erro) {
    next(erro);
  }
}
