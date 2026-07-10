/**
 * SCHEMA: mmgd_indicadores (v2 — corrigida)
 * --------------------------------------------------------------------------
 * O QUE MUDOU DA VERSÃO ANTERIOR:
 * Antes, esta tabela apontava direto para `municipios.codigo_ibge`, e tinha
 * dois campos extras de texto livre (granularidade_tipo, granularidade_codigo)
 * para tentar representar granularidade fina — sem nenhuma integridade real.
 *
 * Agora, ela aponta para `unidades_espaciais.id`. Isso quer dizer que UM
 * REGISTRO DE MMGD PODE PERTENCER A QUALQUER GRANULARIDADE — município hoje,
 * setor censitário/CEP/bairro no futuro — sem que esta tabela precise saber
 * qual é. Quem sabe "qual granularidade é essa" é a tabela `unidades_espaciais`
 * (campo `tipo`), não mais esta tabela. Isso resolve a pergunta original:
 * "como vai ser essa chave quando a granularidade for menor que município?"
 * Resposta: vai ser o `id` de um registro em `unidades_espaciais` do tipo
 * 'setor_censitario' (ou 'cep', ou 'bairro'), não mais um texto solto.
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

export const mmgdIndicadores = pgTable(
  'mmgd_indicadores',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

    /**
     * Chave estrangeira para unidades_espaciais.id — pode ser um município,
     * um setor censitário, um CEP ou um bairro, dependendo do que estiver
     * disponível para aquele território. Esta é a mudança central da correção.
     */
    unidadeEspacialId: varchar('unidade_espacial_id', { length: 40 })
      .notNull()
      .references(() => unidadesEspaciais.id, { onDelete: 'cascade' }),

    periodoReferencia: date('periodo_referencia').notNull(),

    potenciaInstaladaKw: doublePrecision('potencia_instalada_kw').notNull(),

    /**
     * Nº de UCs BENEFICIADAS por crédito de energia (QtdUCRecebeCredito
     * somado, não COUNT de linhas — ver extrair_mmgd_aneel.py) — pode
     * exceder o número de instalações em modalidade Compartilhada/Auto
     * consumo remoto, onde um empreendimento beneficia várias UCs. NÃO é
     * "número de sistemas/instalações conectados" (isso é
     * numeroEmpreendimentos, abaixo) — nome mantido por compatibilidade
     * (coluna já existia antes desta distinção ficar clara, ver migration
     * 0025 e ARQUITETURA.md "RF-005").
     */
    numeroUcsComMmgd: integer('numero_ucs_com_mmgd').notNull(),

    /**
     * Nº de empreendimentos (instalações/sistemas) de MMGD conectados —
     * COUNT de linhas do Parquet ANEEL por município, diferente de
     * numeroUcsComMmgd acima (que soma UCs beneficiadas, não instalações).
     * Adicionada na migration 0025. NULL para snapshots carregados antes
     * dela (precisa rodar extrair_mmgd_aneel.py novamente).
     */
    numeroEmpreendimentos: integer('numero_empreendimentos'),

    /**
     * Potência instalada (kW) apenas dos empreendimentos com
     * DscClasseConsumo = 'Residencial' na fonte ANEEL — subconjunto de
     * potenciaInstaladaKw (TOTAL, todas as classes). Adicionada na migration
     * 0020 para suportar a metodologia de "Vazio de Acesso" (RF-055/056/057,
     * ver ARQUITETURA.md), que usa MMGD RESIDENCIAL per capita como eixo Y —
     * o total mistura agronegócio/irrigação e distorce a classificação.
     * NULL para snapshots carregados antes da migration 0020 (é preciso
     * rodar extrair_mmgd_aneel.py novamente para preencher).
     */
    potenciaResidencialKw: doublePrecision('potencia_residencial_kw'),

    /**
     * Nº de UCs com MMGD (QtdUCRecebeCredito somado) apenas da classe
     * Residencial — mesmo racional de potenciaResidencialKw acima.
     */
    numeroUcsResidencial: integer('numero_ucs_residencial'),

    totalUcsMunicipio: integer('total_ucs_municipio'),

    /**
     * Continua existindo, mas agora só como sinalizador de prototipagem
     * (RF-045), não mais como parte da lógica de granularidade — essa
     * responsabilidade passou para unidades_espaciais.tipo.
     */
    eDadoIlustrativo: varchar('e_dado_ilustrativo', { length: 5 }).notNull().default('false'),

    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    /**
     * Agora a unicidade é simplesmente "uma unidade espacial não pode ter
     * dois registros de MMGD no mesmo período" — mais simples que antes,
     * porque a granularidade já está embutida em qual unidade_espacial_id
     * foi escolhida.
     */
    unidadePeriodoUnico: uniqueIndex('mmgd_unidade_periodo_idx').on(
      tabela.unidadeEspacialId,
      tabela.periodoReferencia,
    ),
  }),
);
