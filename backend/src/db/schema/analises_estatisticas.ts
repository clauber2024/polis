/**
 * SCHEMA: analises_estatisticas
 * --------------------------------------------------------------------------
 * Resultados materializados de análises estatísticas (correlação parcial de
 * Spearman por resíduo de postos) que respondem hipóteses específicas já
 * formuladas no projeto - hoje, a Recomendação #3 de
 * docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md. NÃO é um motor genérico de
 * correlação/regressão sob demanda - decisão documentada em
 * docs/DECISOES.md, ADR "Infraestrutura estatística integrada".
 *
 * Uma linha por par (variavelX, variavelY) testado. Ver
 * backend/src/etl/loaders/calcular_analise_estatistica_moradia_mmgd.py para
 * a metodologia completa.
 */

import {
  pgTable,
  varchar,
  text,
  integer,
  doublePrecision,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const analisesEstatisticas = pgTable(
  'analises_estatisticas',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

    variavelX: varchar('variavel_x', { length: 80 }).notNull(),
    rotuloVariavelX: varchar('rotulo_variavel_x', { length: 200 }).notNull(),
    sentidoEsperado: varchar('sentido_esperado', { length: 20 }).notNull(),

    variavelY: varchar('variavel_y', { length: 80 }).notNull(),

    /** Conjunto de colunas usadas como controle SIMULTANEAMENTE na correlação parcial. */
    variaveisControle: text('variaveis_controle').array().notNull(),

    metodo: varchar('metodo', { length: 60 }).notNull(),

    n: integer('n').notNull(),
    rhoBruto: doublePrecision('rho_bruto'),
    pValorBruto: doublePrecision('p_valor_bruto'),

    /**
     * NULL quando a amostra (após remover linhas com dado faltante) ficou
     * abaixo do mínimo confiável - nunca deve ser lido como zero.
     */
    rhoParcial: doublePrecision('rho_parcial'),
    pValorParcial: doublePrecision('p_valor_parcial'),

    nRegioesTestadas: integer('n_regioes_testadas'),
    nRegioesMesmoSinal: integer('n_regioes_mesmo_sinal'),

    /**
     * Leitura qualitativa de nRegioesMesmoSinal/nRegioesTestadas. Correlação
     * (mesmo parcial) NUNCA estabelece causalidade - ver nota metodológica
     * sempre exposta junto com qualquer leitura desta tabela via API.
     */
    veredito: varchar('veredito_robustez', { length: 80 }),

    calculadoEm: timestamp('calculado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    parUnico: uniqueIndex('analises_estatisticas_par_unico_idx').on(
      tabela.variavelX,
      tabela.variavelY,
    ),
  }),
);
