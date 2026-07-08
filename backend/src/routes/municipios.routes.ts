import { Router } from 'express';
import {
  listarMunicipiosController,
  buscarMunicipioController,
  compararMunicipiosController,
} from '../controllers/municipios.controller.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  listarMunicipiosQuerySchema,
  buscarMunicipioParamsSchema,
  compararMunicipiosQuerySchema,
} from '../schemas/municipios.schema.js';

export const municipiosRouter = Router();

/**
 * GET /api/municipios (RF-016, RF-017, RF-026, RF-030 a RF-037, RF-046)
 *
 * Lista municípios com os indicadores consolidados (MMGD total e
 * residencial, irradiação solar, IVS, renda, pobreza, tarifa), com filtro
 * por uf/regiao/nome, ordenação por qualquer indicador e paginação. Ver
 * src/services/municipios.service.ts para os detalhes.
 *
 * Query params (todos opcionais): uf, regiao, nome, ordenarPor, ordem,
 * pagina, porPagina — ver schemas/municipios.schema.ts.
 */
municipiosRouter.get(
  '/municipios',
  validateRequest({ query: listarMunicipiosQuerySchema }),
  listarMunicipiosController,
);

/**
 * GET /api/municipios/comparar (RF-049, RF-050)
 *
 * Comparação lado a lado de 2 a 10 municípios (Painel Analítico,
 * Cruzamento de Variáveis). IMPORTANTE: esta rota precisa vir ANTES de
 * '/municipios/:codigoIbge' no registro — como "comparar" tem o mesmo
 * formato de path que um código IBGE (um segmento após /municipios),
 * se a rota de parâmetro fosse registrada primeiro o Express tentaria
 * casar "comparar" como se fosse um codigoIbge.
 *
 * Query params: codigos (obrigatório) — string única separada por vírgula,
 * ex: ?codigos=3550308,3106200 — ver schemas/municipios.schema.ts.
 */
municipiosRouter.get(
  '/municipios/comparar',
  validateRequest({ query: compararMunicipiosQuerySchema }),
  compararMunicipiosController,
);

/**
 * GET /api/municipios/:codigoIbge (RF-025)
 *
 * Painel de detalhe de um único município (todos os indicadores
 * consolidados). Responde 404 se o código IBGE não existir.
 */
municipiosRouter.get(
  '/municipios/:codigoIbge',
  validateRequest({ params: buscarMunicipioParamsSchema }),
  buscarMunicipioController,
);
