import { Router } from 'express';
import { estatisticasNacionaisController } from '../controllers/estatisticasNacionais.controller.js';

export const estatisticasNacionaisRouter = Router();

/**
 * GET /api/estatisticas-nacionais (RF-005, Landing Page)
 *
 * Agregados nacionais em destaque — ver services/estatisticasNacionais.service.ts
 * para quais dos 6 números pedidos pelo RF-005 são calculados de verdade
 * (sistemas MMGD, potência total, municípios com MMGD) e quais são expostos
 * como indisponíveis, com o motivo (`indicadoresIndisponiveis`).
 */
estatisticasNacionaisRouter.get('/estatisticas-nacionais', estatisticasNacionaisController);
