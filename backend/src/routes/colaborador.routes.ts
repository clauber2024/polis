import { Router } from 'express';
import { validateRequest } from '../middlewares/validateRequest.js';
import { requireAutenticacao, requirePapel } from '../middlewares/auth.js';
import {
  atualizarRevisaoParamsSchema,
  atualizarRevisaoBodySchema,
  criarObservacaoParamsSchema,
  criarObservacaoBodySchema,
  criarSugestaoBodySchema,
  listarSugestoesQuerySchema,
  criarNotaMetodologicaBodySchema,
  listarNotasMetodologicasQuerySchema,
  criarMaterialComunicacaoBodySchema,
  atualizarMaterialComunicacaoParamsSchema,
  atualizarMaterialComunicacaoBodySchema,
} from '../schemas/colaborador.schema.js';
import {
  listarRevisoesBasesDadosController,
  atualizarRevisaoBaseDadosController,
  listarObservacoesBasesDadosController,
  criarObservacaoBaseDadosController,
  listarSugestoesIndicadoresController,
  criarSugestaoIndicadorController,
  listarNotasMetodologicasController,
  criarNotaMetodologicaController,
  listarMateriaisComunicacaoController,
  criarMaterialComunicacaoController,
  atualizarMaterialComunicacaoController,
} from '../controllers/colaborador.controller.js';

export const colaboradorRouter = Router();

/** Escrita do Colaborador/Admin (papel Público nunca chega aqui — ver DRF.md Seção 2). */
const requireColaboradorOuAdmin = [requireAutenticacao, requirePapel('colaborador', 'administrador')];

// RF-059 — status de revisão metodológica por base de dados (lista as 6 bases de uma vez)
colaboradorRouter.get('/bases-de-dados/revisoes', listarRevisoesBasesDadosController);
colaboradorRouter.put(
  '/bases-de-dados/:baseDados/revisao',
  ...requireColaboradorOuAdmin,
  validateRequest({ params: atualizarRevisaoParamsSchema, body: atualizarRevisaoBodySchema }),
  atualizarRevisaoBaseDadosController,
);

// RF-060 — observações sobre inconsistências
colaboradorRouter.get(
  '/bases-de-dados/:baseDados/observacoes',
  validateRequest({ params: criarObservacaoParamsSchema }),
  listarObservacoesBasesDadosController,
);
colaboradorRouter.post(
  '/bases-de-dados/:baseDados/observacoes',
  ...requireColaboradorOuAdmin,
  validateRequest({ params: criarObservacaoParamsSchema, body: criarObservacaoBodySchema }),
  criarObservacaoBaseDadosController,
);

// RF-061 — sugestões de melhoria em indicadores
colaboradorRouter.get(
  '/indicadores/sugestoes',
  validateRequest({ query: listarSugestoesQuerySchema }),
  listarSugestoesIndicadoresController,
);
colaboradorRouter.post(
  '/indicadores/sugestoes',
  ...requireColaboradorOuAdmin,
  validateRequest({ body: criarSugestaoBodySchema }),
  criarSugestaoIndicadorController,
);

// RF-064/065/066 — notas metodológicas com histórico
colaboradorRouter.get(
  '/notas-metodologicas',
  validateRequest({ query: listarNotasMetodologicasQuerySchema }),
  listarNotasMetodologicasController,
);
colaboradorRouter.post(
  '/notas-metodologicas',
  ...requireColaboradorOuAdmin,
  validateRequest({ body: criarNotaMetodologicaBodySchema }),
  criarNotaMetodologicaController,
);

// RF-067 — materiais de comunicação
colaboradorRouter.get('/materiais-comunicacao', listarMateriaisComunicacaoController);
colaboradorRouter.post(
  '/materiais-comunicacao',
  ...requireColaboradorOuAdmin,
  validateRequest({ body: criarMaterialComunicacaoBodySchema }),
  criarMaterialComunicacaoController,
);
colaboradorRouter.patch(
  '/materiais-comunicacao/:id',
  ...requireColaboradorOuAdmin,
  validateRequest({
    params: atualizarMaterialComunicacaoParamsSchema,
    body: atualizarMaterialComunicacaoBodySchema,
  }),
  atualizarMaterialComunicacaoController,
);
