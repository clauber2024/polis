/**
 * SCHEMA: desempenho_conexao_distribuidoras
 * --------------------------------------------------------------------------
 * Resumo tecnico nacional por distribuidora (desempenho de conexao de MMGD),
 * uma linha por distribuidora - insumo tecnico do "ranking publico de
 * distribuidoras" (ver ARQUITETURA.md, "Ideia de produto", e docs/DECISOES.md,
 * ADR "Ranking publico de distribuidoras", 10/07/2026).
 *
 * Nao referencia unidades_espaciais nem municipios diretamente - o vinculo
 * territorial (quais municipios cada distribuidora atende, para o eixo de
 * justica energetica) continua vindo do schema INDQUAL
 * (qualidade_conjunto_municipio + qualidade_conjuntos), via
 * sig_agente_indqual. Ver backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py.
 */

import {
  pgTable,
  varchar,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const desempenhoConexaoDistribuidoras = pgTable(
  'desempenho_conexao_distribuidoras',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

    /** Nome original do dataset de fila de conexao (SigAgenteDistribuicao). */
    distribuidora: varchar('distribuidora', { length: 150 }).notNull(),

    /**
     * Nome ja casado com qualidade_conjuntos.sig_agente (schema INDQUAL) -
     * crosswalk resolvido pelo extractor, nao recalculado em cada request.
     * NULL quando nao houve par encontrado - distribuidora fica no ranking
     * tecnico, mas sem eixo de justica energetica.
     */
    sigAgenteIndqual: varchar('sig_agente_indqual', { length: 60 }),

    /** Regiao onde a distribuidora tem o maior volume de pedidos. */
    regiaoPrincipal: varchar('regiao_principal', { length: 20 }).notNull(),

    nPedidos: integer('n_pedidos').notNull(),
    nRegioes: integer('n_regioes').notNull(),

    pctConectado: doublePrecision('pct_conectado').notNull(),

    /**
     * false quando o campo DatLim (prazo regulatorio) esta praticamente
     * ausente na fonte para esta distribuidora (< 50% de preenchimento
     * entre pedidos conectados) - ver ARQUITETURA.md, "ACHADO CRITICO PARA
     * ESTE PRODUTO". Quando false, pctDentroDoPrazo é NULL e NUNCA deve ser
     * lido como "0% no prazo".
     */
    prazoConfiavel: boolean('prazo_confiavel').notNull(),
    pctDentroDoPrazo: doublePrecision('pct_dentro_do_prazo'),

    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    distribuidoraUnica: uniqueIndex('desempenho_conexao_distribuidora_nome_idx').on(
      tabela.distribuidora,
    ),
  }),
);
