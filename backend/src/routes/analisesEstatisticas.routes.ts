import { Router } from 'express';
import { analisesEstatisticasController } from '../controllers/analisesEstatisticas.controller.js';

export const analisesEstatisticasRouter = Router();

/**
 * GET /api/analises-estatisticas
 *
 * Resultados materializados de análises estatísticas (correlação parcial de
 * Spearman) que respondem hipóteses específicas já formuladas no projeto —
 * hoje, o eixo moradia (Precariedade Habitacional / Segurança da Posse) x
 * MMGD residencial, controlando renda e irradiação. Ver
 * services/analisesEstatisticas.service.ts para a metodologia completa e
 * docs/DECISOES.md para a decisão de escopo (motor fixo, não sob demanda).
 */
analisesEstatisticasRouter.get('/analises-estatisticas', analisesEstatisticasController);
