/**
 * ROTAS: agrega todos os routers da API sob /api (montado em src/app.ts).
 * Cada novo recurso ganha seu próprio arquivo de rotas aqui.
 */

import { Router } from 'express';
import { vaziosDeAcessoRouter } from './vaziosDeAcesso.routes.js';
import { municipiosRouter } from './municipios.routes.js';

export const router = Router();

router.use(vaziosDeAcessoRouter);
router.use(municipiosRouter);
