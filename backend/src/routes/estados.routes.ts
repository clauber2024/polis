import { Router } from 'express';
import { estadosGeoJsonController } from '../controllers/estados.controller.js';

export const estadosRouter = Router();

/**
 * GET /api/estados
 *
 * FeatureCollection GeoJSON com o contorno de cada UF (ST_Union das
 * geometrias municipais — ver src/services/estados.service.ts). Camada de
 * referência visual do mapa (limite de estados por cima do choropleth).
 * Sem query params. Cache em memória de processo após a primeira chamada.
 */
estadosRouter.get('/estados', estadosGeoJsonController);
