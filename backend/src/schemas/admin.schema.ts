/**
 * SCHEMA (zod): contratos de request dos endpoints do Painel Administrador
 * (RF-070 a RF-077) — ver src/routes/admin.routes.ts.
 *
 * RF-070 ("upload de arquivo"): decisão do usuário (08/07/2026) foi
 * implementar só o WORKFLOW/STATUS (esta camada), não recebimento de
 * arquivo via API — a carga real de dado continua via ETL Python.
 * --------------------------------------------------------------------------
 */

import { z } from 'zod';
import { IDS_METADADOS_BASES_DADOS } from '../utils/basesDeDadosCanonicas.js';

/** RF-071/072/073: PUT /api/admin/metadados-bases-dados/:baseDados */
export const atualizarMetadadoParamsSchema = z.object({
  baseDados: z.enum(IDS_METADADOS_BASES_DADOS),
});
export const atualizarMetadadoBodySchema = z.object({
  granularidadeEspacial: z.enum(['municipio', 'setor_censitario', 'cep', 'bairro', 'outro']).optional(),
  status: z.enum(['pendente', 'validado', 'erro', 'aguardando_liberacao']).optional(),
  observacao: z.string().trim().max(2000).optional(),
});

/** RF-074: POST /api/admin/aprovacoes-indicadores */
export const criarAprovacaoIndicadorBodySchema = z.object({
  indicador: z.string().trim().min(1, 'Indicador é obrigatório.').max(120),
});

/** RF-074: PATCH /api/admin/aprovacoes-indicadores/:id */
export const decidirAprovacaoIndicadorParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export const decidirAprovacaoIndicadorBodySchema = z.object({
  status: z.enum(['aprovado', 'rejeitado']),
  motivo: z.string().trim().max(2000).optional(),
});

/** RF-075: POST /api/admin/versoes-publicadas */
export const publicarVersaoBodySchema = z.object({
  versao: z.string().trim().min(1, 'Versão é obrigatória.').max(40),
  descricao: z.string().trim().min(1, 'Descrição é obrigatória.').max(2000),
});

/** RF-076: PATCH /api/admin/usuarios/:id */
export const atualizarUsuarioParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export const atualizarUsuarioBodySchema = z
  .object({
    nome: z.string().trim().min(1).max(120).optional(),
    papel: z.enum(['colaborador', 'administrador']).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Envie ao menos um campo para atualizar (nome, papel ou ativo).',
  });

/** RF-076: DELETE /api/admin/usuarios/:id */
export const removerUsuarioParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
