/**
 * SCHEMA: indicadores_climaticos
 * --------------------------------------------------------------------------
 * Primeiro indicador climático formal do Atlas — precipitação máxima mensal,
 * fonte MERGE/CPTEC-INPE (satélite GPM-IMERG V07B fundido com rede de
 * pluviômetros), grade nacional 0,1° (~11 km). Formalizado em 08/07/2026
 * após uma linha de investigação completa (ver ARQUITETURA.md, "Queima de
 * equipamentos" e "PESQUISA DE VIABILIDADE - cobertura nacional") que testou
 * a hipótese de clima x ressarcimento por danos elétricos e confirmou sinal
 * robusto (rho parcial +0,19, controlando renda, robusto nas 5 regiões e 3
 * tercis de urbanização, cobertura nacional real — 5.571 de 5.573
 * municípios) para PRECIPITAÇÃO especificamente. Vento (ERA5/rajada) NÃO
 * foi formalizado — o sinal enfraqueceu e ficou inconsistente por região em
 * escala nacional (ver ARQUITETURA.md), permanece só em
 * `backend/src/etl/analises/` como exploratório.
 *
 * ESTA TABELA É GENUINAMENTE PERIÓDICA (diferente de indicadores_sociais,
 * onde cada coluna normalmente só tem valor em UM período/vintage de
 * medição): cada município tem um valor DISTINTO de precipitação a cada mês
 * — mesmo espírito de mmgd_indicadores, não o de indicadores_sociais.
 *
 * O VALOR ARMAZENADO É UM MÁXIMO ZONAL, NÃO O PICO DE UMA ESTAÇÃO:
 * `precipitacao_max_mes_mm` é o MÁXIMO diário de precipitação (acumulado
 * 24h) dentre TODOS os pixels de grade do MERGE que tocam o polígono do
 * município (zonal statistics via `rasterstats`, `all_touched=True`),
 * agregado ao longo do mês. Isso NÃO é diretamente comparável em magnitude
 * ao pico de uma única estação meteorológica (INMET) — é um máximo
 * espacial+temporal sobre todo o território do município, mecanicamente
 * maior que um máximo de 1 ponto só, especialmente em municípios grandes.
 * Ver ARQUITETURA.md, seção "Zonal statistics... Implicação prática
 * importante" para a explicação completa. Para o propósito deste indicador
 * (expor exposição a evento climático extremo em qualquer parte do
 * município), essa é a escolha metodologicamente correta, não um defeito.
 * --------------------------------------------------------------------------
 */

import {
  pgTable,
  varchar,
  integer,
  doublePrecision,
  date,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { unidadesEspaciais } from './unidades_espaciais.js';

export const indicadoresClimaticos = pgTable(
  'indicadores_climaticos',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

    unidadeEspacialId: varchar('unidade_espacial_id', { length: 40 })
      .notNull()
      .references(() => unidadesEspaciais.id, { onDelete: 'cascade' }),

    /** Primeiro dia do mês de referência (ex.: 2024-01-01 para janeiro/2024) */
    periodoReferencia: date('periodo_referencia').notNull(),

    /**
     * Precipitação máxima do mês, em mm — zonal max (ver docstring acima),
     * fonte MERGE/CPTEC-INPE. NULL quando nenhum dia do mês pôde ser lido
     * (ex.: falha de download ou leitura persistente após retry).
     */
    precipitacaoMaxMesMm: doublePrecision('precipitacao_max_mes_mm'),

    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    unidadePeriodoUnico: uniqueIndex('indicadores_climaticos_unidade_periodo_idx').on(
      tabela.unidadeEspacialId,
      tabela.periodoReferencia,
    ),
  }),
);
