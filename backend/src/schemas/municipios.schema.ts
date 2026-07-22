/**
 * SCHEMA (zod): query/params de GET /api/municipios, GET /api/municipios/comparar
 * e GET /api/municipios/:codigoIbge
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
  'ivsh',
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
  'numeroContratosReformaCasaBrasilSolar',
  'valorLiberadoReformaCasaBrasilSolar',
  'contratosReformaCasaBrasilSolarPer10000Hab',
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

  // RF-046 (Dashboard Público): filtro por faixa de potência instalada
  // (potencia_instalada_kw, MMGD total — mesmo campo já usado em
  // CRITERIOS_ORDENACAO_MUNICIPIO). "período" também é pedido no RF-046, mas
  // NÃO foi implementado: o modelo de dados só guarda o snapshot mais recente
  // de cada indicador (sem série temporal) — mesma limitação já documentada
  // para RF-034 (ranking por variação no período). Decisão do usuário
  // (10/07/2026): documentar como exclusão, não simular.
  potenciaMin: z.coerce.number().min(0).optional(),
  potenciaMax: z.coerce.number().min(0).optional(),

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

/**
 * RF-049/RF-050: Cruzamento de Variáveis / comparação de "dois ou mais
 * municípios simultaneamente". Aceita `?codigos=3550308,3106200,...` — string
 * única separada por vírgula (não array de query params) pra manter a URL
 * simples de montar/copiar/colar no frontend. Deduplica antes de validar
 * tamanho mínimo, pra não deixar o cliente burlar o mínimo de 2 repetindo o
 * mesmo código.
 */
export const compararMunicipiosQuerySchema = z.object({
  codigos: z
    .string()
    .trim()
    .min(1, 'informe pelo menos 2 códigos IBGE separados por vírgula (ex: "3550308,3106200").')
    .transform((valor) =>
      Array.from(new Set(valor.split(',').map((codigo) => codigo.trim()).filter((codigo) => codigo.length > 0))),
    )
    .pipe(
      z
        .array(z.string().regex(/^\d{7}$/, 'cada código IBGE deve ter exatamente 7 dígitos numéricos.'))
        .min(2, 'informe pelo menos 2 códigos IBGE distintos para comparar.')
        .max(10, 'no máximo 10 municípios por comparação.'),
    ),
});

export type CompararMunicipiosQuery = z.infer<typeof compararMunicipiosQuerySchema>;

/**
 * RF-047: download de dados públicos em CSV/GeoJSON (Dashboard Público).
 * Reaproveita os mesmos filtros/ordenação de listarMunicipiosQuerySchema,
 * removendo paginação de propósito — exportação sempre traz TODOS os
 * municípios que casarem o filtro, não uma página.
 */
export const exportarMunicipiosQuerySchema = listarMunicipiosQuerySchema
  .omit({ pagina: true, porPagina: true })
  .extend({
    formato: z.enum(['csv', 'geojson'], {
      errorMap: () => ({ message: 'formato deve ser "csv" ou "geojson".' }),
    }),
  });

export type ExportarMunicipiosQuery = z.infer<typeof exportarMunicipiosQuerySchema>;

/**
 * RF-052: exportação de tabelas do Painel Analítico (CSV/XLSX) — mesma
 * comparação de compararMunicipiosQuerySchema, só adicionando o formato de
 * saída.
 */
export const exportarComparacaoQuerySchema = compararMunicipiosQuerySchema.extend({
  formato: z.enum(['csv', 'xlsx'], {
    errorMap: () => ({ message: 'formato deve ser "csv" ou "xlsx".' }),
  }),
});

export type ExportarComparacaoQuery = z.infer<typeof exportarComparacaoQuerySchema>;

/**
 * Painel Analítico (RF-049/050): médias de referência (nacional, regional ou
 * estadual) para contextualizar a comparação de municípios. `uf` e `regiao`
 * são mutuamente exclusivos por convenção do service (uf tem prioridade se os
 * dois vierem, mas o cliente normal só manda um por vez); nenhum dos dois =
 * média nacional (todos os ~5.570 municípios).
 */
export const mediasMunicipiosQuerySchema = z.object({
  uf: z
    .string()
    .trim()
    .length(2, 'uf deve ter 2 letras (ex: "PE").')
    .transform((valor) => valor.toUpperCase())
    .optional(),

  regiao: z.enum(REGIOES_VALIDAS).optional(),
});

export type MediasMunicipiosQuery = z.infer<typeof mediasMunicipiosQuerySchema>;
