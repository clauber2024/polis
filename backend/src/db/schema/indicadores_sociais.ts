/**
 * SCHEMA: indicadores_sociais (v2 — corrigida)
 * --------------------------------------------------------------------------
 * Mesma correção da mmgd_indicadores: agora aponta para unidades_espaciais.id.
 *
 * Isso é especialmente relevante aqui porque, conforme o seu próprio DRF
 * registra: "indicadores sociais (IVS, CadÚnico, renda) que já existem em
 * granularidade de setor censitário devem continuar disponíveis nessa
 * granularidade desde já, mesmo que a MMGD ainda não acompanhe" — ou seja,
 * essa tabela pode (e já deveria) ter linhas com unidade_espacial_id apontando
 * para setores censitários DESDE JÁ, mesmo antes de qualquer dado de MMGD fino
 * existir. A modelagem antiga não suportava isso de forma limpa; esta suporta.
 * --------------------------------------------------------------------------
 */

import {
  pgTable,
  varchar,
  doublePrecision,
  date,
  timestamp,
  uniqueIndex,
  integer,
} from 'drizzle-orm/pg-core';
import { unidadesEspaciais } from './unidades_espaciais';

export const indicadoresSociais = pgTable(
  'indicadores_sociais',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

    unidadeEspacialId: varchar('unidade_espacial_id', { length: 40 })
      .notNull()
      .references(() => unidadesEspaciais.id, { onDelete: 'cascade' }),

    periodoReferencia: date('periodo_referencia').notNull(),

    ivs: doublePrecision('ivs'),

    /**
     * Quando populado pelo extractor da RAIS: é a média de
     * valor_remuneracao_media dos vínculos FORMAIS ativos em 31/12 — ou seja,
     * renda do TRABALHO FORMAL, não "renda domiciliar" no sentido amplo
     * (que incluiria informalidade, aposentadoria, benefícios sociais, etc.).
     * O nome da coluna ficou genérico desde a v1 do schema; o significado
     * real depende de qual extractor a populou — documentar isso é
     * responsabilidade da camada de apresentação/API, não deste comentário
     * sozinho.
     */
    rendaMediaDomiciliar: doublePrecision('renda_media_domiciliar'),

    percentualCadunico: doublePrecision('percentual_cadunico'),
    percentualTarifaSocial: doublePrecision('percentual_tarifa_social'),

    // --- Dimensão Infraestrutura Urbana (inspirada no IVS/IPEA, construída
    // a partir do Censo 2022 via SIDRA — ver nota metodológica no DRF/CLAUDE.md
    // sobre esta NÃO ser o IVS oficial, que só existe em nível municipal até 2010) ---

    /** % da população residente em domicílios rurais (Tabela SIDRA 9923) */
    percentualPopulacaoRural: doublePrecision('percentual_populacao_rural'),

    /** % de domicílios sem ligação à rede geral de distribuição de água (Tabela SIDRA 6803) */
    percentualAguaInadequada: doublePrecision('percentual_agua_inadequada'),

    /** % de domicílios sem esgotamento por rede geral/pluvial/fossa ligada à rede (Tabela SIDRA 6805) */
    percentualEsgotoInadequado: doublePrecision('percentual_esgoto_inadequado'),

    /** % de domicílios sem coleta de lixo direta ou indireta (Tabela SIDRA 6892) */
    percentualLixoInadequado: doublePrecision('percentual_lixo_inadequado'),

    /** Habitantes por km², calculado a partir da população do Censo 2022 e municipios.area_km2 */
    densidadePopulacional: doublePrecision('densidade_populacional'),

    // --- Dimensão Renda e Trabalho (inspirada no IVS/IPEA, construída a
    // partir da RAIS via BigQuery — ver nota metodológica no extractor sobre
    // esta fonte captar SOMENTE o mercado de trabalho FORMAL) ---

    /** % de vínculos formais (RAIS) em relação à população do município */
    percentualVinculosFormais: doublePrecision('percentual_vinculos_formais'),

    // --- Dimensão Capital Humano (inspirada no IVS/IPEA, PARCIAL — cobre
    // apenas alfabetização via Censo 2022. Mortalidade infantil/expectativa
    // de vida ficam pendentes: exigem dados do DATASUS/SIM, que não tem API
    // REST simples como o IBGE — requer parsing de arquivos .dbc binários
    // via biblioteca pysus ou similar. Ver nota no extractor de alfabetização.) ---

    /** Taxa de alfabetização das pessoas de 15 anos ou mais (%) — Tabela SIDRA 9543 */
    taxaAlfabetizacao: doublePrecision('taxa_alfabetizacao'),

    // --- Dimensão Moradia, Território Popular e Barreiras Habitacionais à
    // MMGD — Eixo 3 (regime de ocupação) e parte do Eixo 5 (% cortiço).
    // Tese: acesso à MMGD depende não só de renda, mas de regime de
    // ocupação/segurança da posse — o modelo atual favorece proprietários.
    // Fonte: Tabela SIDRA 9928, Censo 2022. Ver docs/PLANO_MORADIA_TERRITORIO_POPULAR.md ---

    /** % de domicílios próprios de algum morador (Tabela SIDRA 9928) */
    percentualDomicilioProprio: doublePrecision('percentual_domicilio_proprio'),

    /** % de domicílios alugados (Tabela SIDRA 9928) */
    percentualDomicilioAlugado: doublePrecision('percentual_domicilio_alugado'),

    /** % de domicílios cedidos/emprestados (Tabela SIDRA 9928) — proxy parcial de coabitação */
    percentualDomicilioCedido: doublePrecision('percentual_domicilio_cedido'),

    /** % de domicílios em casa de cômodos ou cortiço (Tabela SIDRA 9928) — Eixo 5 */
    percentualCortico: doublePrecision('percentual_cortico'),

    /**
     * % de domicílios com material de parede inadequado (Eixo 4) — Tabela
     * SIDRA 9928, classificação 137. "Inadequado" = soma de: taipa sem
     * revestimento, madeira aproveitada de tapume/embalagens/andaimes,
     * outro material, sem parede. NÃO inclui alvenaria sem revestimento
     * nem madeira para construção (materiais legítimos, não precariedade
     * em si). O componente "existência de energia elétrica", presente no
     * índice oficial "Adequação da Moradia" (Censo 2010), NÃO foi incluído
     * aqui: o IBGE não divulgou tabela equivalente para o Censo 2022,
     * provavelmente por o acesso à eletricidade já estar quase
     * universalizado (~99,8%, PNAD 2019) e ter perdido poder discriminativo
     * entre municípios.
     */
    percentualParedeInadequada: doublePrecision('percentual_parede_inadequada'),

    /** % da população residente em Favelas e Comunidades Urbanas (Tabela SIDRA 9888) */
    percentualPopulacaoFavela: doublePrecision("percentual_populacao_favela"),
    
    /** Número absoluto de Favelas e Comunidades Urbanas no município (Tabela SIDRA 9883) */
    numeroFavelasComunidades: integer("numero_favelas_comunidades"),

    /** Total de unidades habitacionais MCMV financiadas pelo FGTS, acumulado historico (2009-2025) */
    unidadesHabitacionaisFgts: integer("unidades_habitacionais_fgts"),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    unidadePeriodoUnico: uniqueIndex('indicadores_sociais_unidade_periodo_idx').on(
      tabela.unidadeEspacialId,
      tabela.periodoReferencia,
    ),
  }),
);
