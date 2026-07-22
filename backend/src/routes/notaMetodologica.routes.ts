import { Router } from 'express';
import { notaMetodologicaController } from '../controllers/notaMetodologica.controller.js';

export const notaMetodologicaRouter = Router();

/**
 * GET /api/nota-metodologica — PDF público com a metodologia geral do Atlas
 * (Vazio de Acesso, IVS/IVSH, fontes de dados, referência ao OBEPE). Pedido
 * do usuário (21/07/2026) para a Landing Page — ver
 * services/notaMetodologica.service.ts.
 */
notaMetodologicaRouter.get('/nota-metodologica', notaMetodologicaController);
