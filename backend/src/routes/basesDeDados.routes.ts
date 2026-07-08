import { Router } from 'express';
import { statusBasesDeDadosController } from '../controllers/basesDeDados.controller.js';

export const basesDeDadosRouter = Router();

/**
 * GET /api/bases-de-dados (RF-063)
 *
 * Status de cobertura de cada base de dados primária (ANEEL, IBGE,
 * CadÚnico, TSEE, IVS/IPEA, INPE) — % de municípios com o dado presente,
 * data do snapshot mais recente e status derivado ('completo'/'parcial'/
 * 'bloqueado'). Ver src/services/basesDeDados.service.ts para os detalhes.
 * Sem query params.
 */
basesDeDadosRouter.get('/bases-de-dados', statusBasesDeDadosController);
