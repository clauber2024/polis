/**
 * SCHEMA: irradiacao_solar
 * --------------------------------------------------------------------------
 * Guarda o potencial/irradiação solar (fonte: INPE), em kWh/m²/dia.
 *
 * ATENÇÃO — esta tabela é DIFERENTE das outras duas (mmgd_indicadores e
 * indicadores_sociais) numa forma importante: irradiação solar é um fenômeno
 * FÍSICO E CONTÍNUO no espaço — o sol não "respeita" fronteira municipal.
 * Por isso, no mapa, este indicador é renderizado como HEATMAP DE DENSIDADE
 * (mancha contínua), não como choropleth (preenchimento por município) —
 * ver RF-017 e RF-020 do DRF.
 *
 * Mesmo assim, para fins de RANKING e CRUZAMENTO DE VARIÁVEIS (RF-049,
 * comparar "MMGD x Potencial Solar" por município), também guardamos um
 * VALOR MÉDIO agregado por município aqui. Ou seja: esta tabela serve dois
 * propósitos — (1) alimentar o heatmap contínuo do mapa via uma malha de
 * pontos/grade (irradiacao_grade, schema separado, mais pesado) e (2) alimentar
 * comparações tabulares simples por município, que é o que está aqui.
 * --------------------------------------------------------------------------
 */

import {
  pgTable,
  char,
  integer,
  doublePrecision,
  date,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { municipios } from './municipios';

export const irradiacaoSolar = pgTable(
  'irradiacao_solar',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

    codigoIbge: char('codigo_ibge', { length: 7 })
      .notNull()
      .references(() => municipios.codigoIbge, { onDelete: 'cascade' }),

    /** Dado do INPE costuma ser uma média anual/climatológica, não mensal */
    periodoReferencia: date('periodo_referencia').notNull(),

    /**
     * Irradiação solar média do município, em kWh/m²/dia.
     * Este é o valor agregado usado em tabelas de comparação e no ranking —
     * NÃO é o que desenha o heatmap (isso vem de uma malha de pontos mais fina,
     * fora do escopo deste schema inicial).
     */
    irradiacaoMediaKwhM2Dia: doublePrecision('irradiacao_media_kwh_m2_dia').notNull(),

    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    municipioPeriodoUnico: uniqueIndex('irradiacao_municipio_periodo_idx').on(
      tabela.codigoIbge,
      tabela.periodoReferencia,
    ),
  }),
);

/**
 * NOTA PARA DEPOIS (não é preciso resolver agora):
 * Quando você for implementar o heatmap contínuo de fato (RF-020), vai precisar
 * de uma segunda tabela tipo "irradiacao_grade", com uma geometria de Point
 * (SRID 4674) por célula de uma grade regular sobre o território brasileiro,
 * alimentada diretamente do raster do INPE. Essa tabela é mais pesada e tem
 * lógica de ETL diferente — fica para quando chegarmos na parte de ETL/mapa,
 * não precisa bloquear o schema de hoje.
 */
