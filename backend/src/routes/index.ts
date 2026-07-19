/**
 * ROTAS: agrega todos os routers da API sob /api (montado em src/app.ts).
 * Cada novo recurso ganha seu próprio arquivo de rotas aqui.
 */

import { Router } from 'express';
import { vaziosDeAcessoRouter } from './vaziosDeAcesso.routes.js';
import { municipiosRouter } from './municipios.routes.js';
import { basesDeDadosRouter } from './basesDeDados.routes.js';
import { authRouter } from './auth.routes.js';
import { colaboradorRouter } from './colaborador.routes.js';
import { adminRouter } from './admin.routes.js';
import { estatisticasNacionaisRouter } from './estatisticasNacionais.routes.js';
import { rankingDistribuidorasRouter } from './rankingDistribuidoras.routes.js';
import { estadosRouter } from './estados.routes.js';
import { analisesEstatisticasRouter } from './analisesEstatisticas.routes.js';

export const router = Router();

router.use(vaziosDeAcessoRouter);
router.use(municipiosRouter);
router.use(basesDeDadosRouter);
router.use(authRouter);
router.use(colaboradorRouter);
router.use(adminRouter);
router.use(estatisticasNacionaisRouter);
router.use(rankingDistribuidorasRouter);
router.use(estadosRouter);
router.use(analisesEstatisticasRouter);
