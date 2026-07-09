/**
 * CONSTANTE: os 6 IDs canônicos de base de dados primária (RF-063).
 * --------------------------------------------------------------------------
 * Extraído de `basesDeDados.service.ts` (que já hardcodava esses 6 IDs desde
 * a sessão de 07/07/2026) para ser reaproveitado pelas validações zod dos
 * novos recursos de escrita (Colaborador: revisões/observações; Admin:
 * metadados) sem duplicar a lista solta em cada schema — ver
 * migrations 0023/0024 para as tabelas que referenciam estes mesmos IDs.
 *
 * Não é uma tabela no banco (sem FK) — é uma lista fixa, assim como já era
 * em basesDeDados.service.ts. Adicionar uma 7ª fonte primária no futuro
 * exigiria atualizar esta lista + a migration de seed correspondente.
 * --------------------------------------------------------------------------
 */

export const BASES_DE_DADOS_CANONICAS = [
  'aneel',
  'ibge',
  'cadunico',
  'tsee',
  'ivs_ipea',
  'inpe',
] as const;

export type BaseDadosCanonica = (typeof BASES_DE_DADOS_CANONICAS)[number];

/**
 * IDs válidos para `metadados_bases_dados` (Admin, migration 0024) — as 6
 * bases canônicas MAIS a linha especial do RF-072 (pedido de granularidade
 * fina da ANEEL/MMGD, que não é uma "fonte" em si). Usado só na validação
 * zod de `admin.schema.ts`, para não deixar criar linhas com ID arbitrário.
 */
export const IDS_METADADOS_BASES_DADOS = [
  ...BASES_DE_DADOS_CANONICAS,
  'aneel_mmgd_granularidade_fina',
] as const;

export type IdMetadadoBaseDados = (typeof IDS_METADADOS_BASES_DADOS)[number];
