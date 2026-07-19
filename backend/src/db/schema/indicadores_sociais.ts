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
import { unidadesEspaciais } from './unidades_espaciais.js';

export const indicadoresSociais = pgTable(
  'indicadores_sociais',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),

    unidadeEspacialId: varchar('unidade_espacial_id', { length: 40 })
      .notNull()
      .references(() => unidadesEspaciais.id, { onDelete: 'cascade' }),

    periodoReferencia: date('periodo_referencia').notNull(),

    /**
     * Indice de Vulnerabilidade Social - indice proprio inspirado no
     * IVS/IPEA (NAO e o IVS oficial), calculado como media de 3 blocos:
     * Infraestrutura Urbana, Renda e Trabalho, Capital Humano (cada bloco =
     * media de indicadores normalizados min-max). Moradia (seguranca da
     * posse, cortico, favela) fica FORA deste indice de proposito - e eixo
     * separado do Atlas (ver vw_indices_compostos_moradia_infraestrutura,
     * migration 0014). Ver migration 0015 e vw_ivs_consolidado para a
     * formula completa.
     */
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

    /**
     * % das famílias cadastradas no CadÚnico em situação de pobreza ou
     * extrema pobreza — coluna existente no banco desde a migration 0013
     * (`ALTER TABLE`), mas que nunca tinha sido adicionada a este schema
     * Drizzle (drift encontrado na sessão 07/07/2026, ao construir o
     * endpoint de "Vazios de Acesso" — RF-055/056/057 — que depende dela
     * para exibir contexto de vulnerabilidade no ranking). Diferente de
     * `percentualCadunico` (cobertura: % da população total cadastrada);
     * esta é sobre quem JÁ está cadastrado. Direção negativa (quanto maior,
     * pior). Ver também `percentualBaixaRendaRdpc` abaixo, proxy de pobreza
     * mais amplo (cobre toda a população, não só cadastrados).
     */
    percentualPobrezaCadunico: doublePrecision('percentual_pobreza_cadunico'),

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
     * % de domicílios do tipo "Apartamento" (Tabela SIDRA 9928, classificação
     * 125 — Tipo de domicílio, categoria 3247 "Apartamento" / total 2932).
     * Adicionada para testar a hipótese de que tipologia habitacional densa
     * (sem telhado próprio individual) é um confundidor que explica parte da
     * relação MMGD x indicadores sociais não capturado por renda nem por
     * urbanização (% população rural) — ver análise de sensibilidade
     * MMGD x indicadores sociais, casos Sul/Segurança da Posse e
     * Centro-Oeste/Irradiação Solar, backend/src/etl/analises/. NÃO inclui
     * "Casa de vila ou em condomínio" (categoria 121264) — mantido fora de
     * propósito, é um tipo distinto (unidade horizontal, ainda com alguma
     * chance de telhado individual dependendo do condomínio).
     */
    percentualApartamento: doublePrecision('percentual_apartamento'),

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
    /** Numero de empreendimentos MCMV subsidiados OGU no municipio */
    empreendimentosOgu: integer("empreendimentos_ogu"),
    /** Total de UH MCMV/OGU previstas (excluindo distratados) */
    unidadesOguPrevistas: integer("unidades_ogu_previstas"),
    /** Total de UH MCMV/OGU efetivamente entregues */
    unidadesOguEntregues: integer("unidades_ogu_entregues"),

    /**
     * RDPC (Rendimento Domiciliar Per Capita) médio, em R$ — Tabela SIDRA
     * 10295, variável 13431, Censo 2022, classificações Sexo/Cor ou raça/
     * Grupo de idade fixadas em "Total" (não quebrado por subgrupo).
     * Adicionado para complementar `renda_media_domiciliar` (RAIS): aquela
     * capta SOMENTE renda de trabalho formal; esta é renda de TODAS as
     * fontes (trabalho formal e informal, aposentadoria, benefícios sociais,
     * aluguel recebido etc.) — ver ARQUITETURA.md, seção "Decisões de
     * fontes", investigação de ônus excessivo com aluguel (sessão 06/07/2026),
     * de onde este achado colateral veio. Direção positiva (quanto maior,
     * melhor).
     */
    rendaPerCapitaRdpc: doublePrecision("renda_per_capita_rdpc"),

    /**
     * % de moradores com RDPC até 1/2 salário mínimo — Tabela SIDRA 10296,
     * variável 1013604 ("percentual do total geral"), soma das categorias
     * 9681 ("Até 1/4 de salário mínimo") + 9682 ("Mais de 1/4 a 1/2 salário
     * mínimo") da classificação 386. Proxy de pobreza monetária mais amplo
     * que `percentual_pobreza_cadunico` (que só cobre quem já está
     * cadastrado no CadÚnico) — este cobre toda a população do município.
     * Direção negativa (quanto maior, pior).
     */
    percentualBaixaRendaRdpc: doublePrecision("percentual_baixa_renda_rdpc"),

    /**
     * Tarifa de energia RESIDENCIAL (TUSD + TE somadas, R$/MWh), subgrupo B1,
     * modalidade Convencional, Tarifa de Aplicação (o que o consumidor de
     * fato paga) — vigência mais recente disponível no dataset ANEEL
     * "Tarifas de aplicação das distribuidoras de energia elétrica".
     * Resolvida por município via a mesma sig_agente já carregada pelo
     * INDQUAL (qualidade_conjuntos/qualidade_conjunto_municipio) — municípios
     * com MÚLTIPLAS distribuidoras (área de concessão dividida) ficam NULL
     * aqui, não é possível atribuir uma tarifa única.
     *
     * ACHADO que motivou esta coluna (sessão 06/07/2026, ver ARQUITETURA.md
     * "Teste do mecanismo tarifa"): EQUATORIAL GO (Goiás) teve a tarifa
     * residencial mais baixa entre EMS/EMT/EQUATORIAL GO em TODOS os anos de
     * 2010 a 2024, revertendo só em 2025-2026 — retorno financeiro mais
     * fraco de instalar MMGD residencial é uma explicação econômica
     * plausível para a adoção mais baixa em Goiás. Esta coluna generaliza o
     * teste para TODAS as distribuidoras do país, não só as 3 do
     * Centro-Oeste.
     *
     * SENTIDO AMBÍGUO — NÃO é indicador de vulnerabilidade como os demais
     * desta tabela: tarifa mais alta é ruim para o consumidor em geral, mas
     * é o incentivo ESPERADO POSITIVO para adoção de MMGD (mais economia por
     * kWh gerado = payback mais curto). Não inverter o valor armazenado;
     * a interpretação de sentido é responsabilidade da camada de análise.
     */
    tarifaEnergiaResidencial: doublePrecision("tarifa_energia_residencial"),

    /**
     * Número de contratos da modalidade SOLAR do programa Reforma Casa
     * Brasil (Caixa/Ministério das Cidades), somado nov/2025-abr/2026
     * (Faixa 1 + Faixa 2, renda familiar bruta mensal até R$9.600).
     *
     * FONTE NÃO É PÚBLICA/AUTOMATIZÁVEL — diferente dos demais indicadores
     * desta tabela: veio de um extrato pontual do sistema interno da Caixa
     * (SIC), fornecido manualmente pelo usuário (não há URL pública para
     * reproduzir/atualizar esta carga). Ver
     * backend/src/etl/loaders/extrair_reforma_casa_brasil_solar.py.
     * Motivação: capítulo "Atlas das experiências de MMGD solar" (Instituto
     * Pólis) sobre "quem tem acesso à tecnologia solar" — ver migration 0027.
     *
     * NULL = sem contrato registrado no período (município não aparece no
     * extrato) — NÃO é o mesmo que zero documentado, mesmo tratamento já
     * dado a `unidadesHabitacionaisFgts` para municípios sem MCMV/FGTS.
     */
    numeroContratosReformaCasaBrasilSolar: integer("numero_contratos_reforma_casa_brasil_solar"),

    /**
     * Valor efetivamente liberado (R$, campo VR_LIBERADO da fonte, não o
     * valor apenas contratado) dos mesmos contratos de
     * `numeroContratosReformaCasaBrasilSolar` — mesma fonte/limitações.
     */
    valorLiberadoReformaCasaBrasilSolar: doublePrecision("valor_liberado_reforma_casa_brasil_solar"),

    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (tabela) => ({
    unidadePeriodoUnico: uniqueIndex('indicadores_sociais_unidade_periodo_idx').on(
      tabela.unidadeEspacialId,
      tabela.periodoReferencia,
    ),
  }),
);
