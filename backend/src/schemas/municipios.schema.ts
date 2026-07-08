/**
 * SCHEMA (zod): query/params de GET /api/municipios e GET /api/municipios/:codigoIbge
 * --------------------------------------------------------------------------
 * Mesmo padrão de vaziosDeAcesso.schema.ts (validação via middleware
 * dedicado, CLAUDE.md Seção 4). Reaproveita REGIOES_VALIDAS de lá para não
 * duplicar a lista de regiões em dois arquivos.
 * --------------------------------------------------------------------------
 */

import { z } from 'zod';
import { REGIOES_VALIDAS } from './vaziosDeAcesso.schema.js';

/**
 * Critérios de ordenação disponíveis — whitelist fechada de propósito, pelo
 * mesmo motivo já documentado em vaziosDeAcesso.schema.ts (nunca aceitar
 * nome de coluna arbitrário do cliente, mesmo a ordenação sendo em memória).
 * Cobre os indicadores hoje consolidados em vw_indicadores_sociais_consolidado
 * (migrations 0014-0018) + MMGD (total e residencial, migration 0020) +
 * irradiação solar. Novos indicadores consolidados devem ser adicionados aqui
 * conforme entrarem no schema.
 */
export const CRITERIOS_ORDENACAO_MUNICIPIO = [
  'nome',
  'ivs',
  'rendaMediaDomiciliar',
  'percentualPobrezaCadunico',
  'percentualTarifaSocial',
  'taxaAlfabetizacao',
  'taxaMortalidadeInfantil',
  'tarifaEnergiaResidencial',
  'irradiacaoMediaKwhM2Dia',
  'potenciaInstaladaKw',
  'potenciaResidencialKw',
  'mmgdPer1000Hab',
  'mmgdResidencialPer1000Hab',
  'areaKm2',
] as const;

export const listarMunicipiosQuerySchema = z.object({
  uf: z
    .string()
    .trim()
    .length(2, 'uf deve ter 2 letras (ex: "PE").')
    .transform((valor) => valor.toUpperCase())
    .optional(),

  regiao: z.enum(REGIOES_VALIDAS).optional(),

  // RF-033: busca/filtro rápido por nome de município — ILIKE parcial,
  // case-insensitive, sem exigir acento exato do cliente.
  nome: z.string().trim().min(1).max(120).optional(),

  ordenarPor: z.enum(CRITERIOS_ORDENACAO_MUNICIPIO).default('nome'),

  // Default 'asc' porque o default de ordenarPor é 'nome' (ordem alfabética
  // é o que faz sentido sem indicador escolhido). Ao ordenar por um
  // indicador (RF-031: "maior para o menor"), o cliente deve passar
  // ordem=desc explicitamente — este endpoint não inverte automaticamente
  // por critério, mesma regra já fixada em vaziosDeAcesso.schema.ts.
  ordem: z.enum(['asc', 'desc']).default('asc'),

  pagina: z.coerce.number().int().min(1).default(1),

  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListarMunicipiosQuery = z.infer<typeof listarMunicipiosQuerySchema>;

export const buscarMunicipioParamsSchema = z.object({
  codigoIbge: z
    .string()
    .trim()
    .regex(/^\d{7}$/, 'codigoIbge deve ter exatamente 7 dígitos numéricos.'),
});

export type BuscarMunicipioParams = z.infer<typeof buscarMunicipioParamsSchema>;
