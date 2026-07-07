/**
 * SCHEMA (zod): query params de GET /api/vazios-de-acesso
 * --------------------------------------------------------------------------
 * Validação via middleware dedicado (CLAUDE.md, Seção 4). `ordenarPor` é uma
 * whitelist fechada de propósito — nunca aceitar nome de coluna arbitrário
 * vindo do cliente, mesmo a ordenação sendo feita em memória (não SQL
 * dinâmico) aqui, para manter o contrato da API estável e previsível.
 * --------------------------------------------------------------------------
 */

import { z } from 'zod';

export const REGIOES_VALIDAS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const;

export const QUADRANTES_VALIDOS = [
  'vazio_de_acesso',
  'acesso_pleno',
  'adocao_acima_do_potencial',
  'baixo_potencial_baixa_adocao',
] as const;

export const CRITERIOS_ORDENACAO = [
  'ivs',
  'rendaMediaDomiciliar',
  'percentualPobrezaCadunico',
  'irradiacaoMediaKwhM2Dia',
  'mmgdResidencialPer1000Hab',
] as const;

export const listarVaziosDeAcessoQuerySchema = z.object({
  uf: z
    .string()
    .trim()
    .length(2, 'uf deve ter 2 letras (ex: "PE").')
    .transform((valor) => valor.toUpperCase())
    .optional(),

  regiao: z.enum(REGIOES_VALIDAS).optional(),

  quadrante: z.enum(QUADRANTES_VALIDOS).optional(),

  ordenarPor: z.enum(CRITERIOS_ORDENACAO).default('ivs'),

  // IVS é NEGATIVO (maior = mais vulnerável) — o default 'desc' prioriza os
  // municípios mais vulneráveis primeiro, mesmo critério padrão já usado no
  // script de validação (priorizar_vazios_de_acesso, RF-056). Se o cliente
  // trocar ordenarPor para um indicador POSITIVO (ex: rendaMediaDomiciliar),
  // o sentido de "melhor primeiro" muda — a API não inverte isso
  // automaticamente, é responsabilidade de quem consome saber o sentido de
  // cada indicador (mesma regra já fixada no restante do Atlas).
  ordem: z.enum(['asc', 'desc']).default('desc'),

  pagina: z.coerce.number().int().min(1).default(1),

  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListarVaziosDeAcessoQuery = z.infer<typeof listarVaziosDeAcessoQuerySchema>;
