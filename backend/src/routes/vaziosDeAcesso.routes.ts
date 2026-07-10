import { Router } from 'express';
import {
  listarVaziosDeAcessoController,
  classificarMunicipiosController,
} from '../controllers/vaziosDeAcesso.controller.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  listarVaziosDeAcessoQuerySchema,
  classificarMunicipiosQuerySchema,
} from '../schemas/vaziosDeAcesso.schema.js';

export const vaziosDeAcessoRouter = Router();

/**
 * GET /api/vazios-de-acesso (RF-055, RF-056, RF-057)
 *
 * Classifica todos os municípios em 4 quadrantes (irradiação solar x MMGD
 * residencial per capita, mediana nacional) e permite filtrar/priorizar os
 * "Vazios de Acesso". Ver src/services/vaziosDeAcesso.service.ts para a
 * metodologia completa.
 *
 * Query params (todos opcionais): uf, regiao, quadrante, ordenarPor, ordem,
 * pagina, porPagina — ver schemas/vaziosDeAcesso.schema.ts.
 */
vaziosDeAcessoRouter.get(
  '/vazios-de-acesso',
  validateRequest({ query: listarVaziosDeAcessoQuerySchema }),
  listarVaziosDeAcessoController,
);

/**
 * GET /api/vazios-de-acesso/classificar (Painel Analítico, RF-049/050)
 *
 * Classificação de quadrante de 1 a 10 municípios específicos (?codigos=
 * 3550308,3106200) — não pagina o país inteiro. Path com 2 segmentos, não
 * conflita com '/vazios-de-acesso' (rota estática de 1 segmento).
 */
vaziosDeAcessoRouter.get(
  '/vazios-de-acesso/classificar',
  validateRequest({ query: classificarMunicipiosQuerySchema }),
  classificarMunicipiosController,
);
