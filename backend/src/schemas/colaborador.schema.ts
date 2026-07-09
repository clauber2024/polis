/**
 * SCHEMA (zod): contratos de request dos endpoints de escrita do Colaborador
 * (RF-059 a RF-067) — ver src/routes/colaborador.routes.ts.
 * --------------------------------------------------------------------------
 */

import { z } from 'zod';
import { BASES_DE_DADOS_CANONICAS } from '../utils/basesDeDadosCanonicas.js';

const baseDadosParamsSchema = z.object({
  baseDados: z.enum(BASES_DE_DADOS_CANONICAS),
});

/** RF-059: PUT /api/bases-de-dados/:baseDados/revisao */
export const atualizarRevisaoParamsSchema = baseDadosParamsSchema;
export const atualizarRevisaoBodySchema = z.object({
  status: z.enum(['em_revisao', 'validado', 'inconsistencia_encontrada']),
});

/** RF-060: POST /api/bases-de-dados/:baseDados/observacoes */
export const criarObservacaoParamsSchema = baseDadosParamsSchema;
export const criarObservacaoBodySchema = z.object({
  mensagem: z.string().trim().min(1, 'Mensagem é obrigatória.').max(4000),
});

/** RF-061: POST /api/indicadores/sugestoes */
export const criarSugestaoBodySchema = z.object({
  indicador: z.string().trim().min(1, 'Indicador é obrigatório.').max(120),
  mensagem: z.string().trim().min(1, 'Mensagem é obrigatória.').max(4000),
});

/** RF-061 (leitura): GET /api/indicadores/sugestoes?indicador=... */
export const listarSugestoesQuerySchema = z.object({
  indicador: z.string().trim().min(1).max(120).optional(),
});

/** RF-064/065/066: POST /api/notas-metodologicas */
export const criarNotaMetodologicaBodySchema = z.object({
  topico: z.string().trim().min(1, 'Tópico é obrigatório.').max(80),
  conteudo: z.string().trim().min(1, 'Conteúdo é obrigatório.').max(8000),
  forcaAchado: z.coerce.number().int().min(1).max(5).optional(),
});

/** RF-064 (leitura): GET /api/notas-metodologicas?topico=... */
export const listarNotasMetodologicasQuerySchema = z.object({
  topico: z.string().trim().min(1).max(80).optional(),
});

/** RF-067: POST /api/materiais-comunicacao */
export const criarMaterialComunicacaoBodySchema = z.object({
  titulo: z.string().trim().min(1, 'Título é obrigatório.').max(160),
  status: z.enum(['em_producao', 'em_revisao', 'publicado']).optional(),
});

/** RF-067: PATCH /api/materiais-comunicacao/:id */
export const atualizarMaterialComunicacaoParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export const atualizarMaterialComunicacaoBodySchema = z.object({
  status: z.enum(['em_producao', 'em_revisao', 'publicado']),
});
