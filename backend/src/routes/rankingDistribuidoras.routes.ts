import { Router } from 'express';
import { rankingDistribuidorasController } from '../controllers/rankingDistribuidoras.controller.js';

export const rankingDistribuidorasRouter = Router();

/**
 * GET /api/ranking-distribuidoras
 *
 * Ranking público de distribuidoras por desempenho em conexão de MMGD +
 * justiça energética. Ver services/rankingDistribuidoras.service.ts para a
 * metodologia completa (eixo técnico, eixo de justiça ponderado por
 * população, segregação de dados incompletos) e docs/DECISOES.md para as
 * decisões de exibição.
 */
rankingDistribuidorasRouter.get('/ranking-distribuidoras', rankingDistribuidorasController);
