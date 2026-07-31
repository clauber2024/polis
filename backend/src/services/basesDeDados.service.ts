/**
 * SERVICE: Status das bases de dados primárias (RF-063)
 * ============================================================================
 * RF-063: "dashboard de status de cada base de dados primária (ANEEL, IBGE,
 * CadÚnico, TSEE, IVS/IPEA, INPE), com indicador de progresso" — Painel da
 * Equipe do Projeto (papel Colaborador, ver DRF Seção 2 — revisado 08/07/2026,
 * antigo P5). Este service calcula cobertura (% de municípios
 * com o dado presente) e a data do snapshot mais recente diretamente do
 * banco, sem depender de nenhuma tabela de controle manual — não existe
 * ainda workflow de revisão/aprovação (RF-059, RF-070 — Parceiro Técnico e
 * Admin) porque isso exigiria autenticação/RBAC, que continua PLANEJADO (ver
 * CLAUDE.md, "Estado Real do Projeto"). O status aqui é 100% derivado dos
 * dados já carregados: 'completo' (cobertura >= 95%), 'parcial' (0% < x <
 * 95%) ou 'bloqueado' (0%, com observação do motivo).
 *
 * Nomenclatura das 6 fontes originais segue literalmente o texto do RF-063
 * (ANEEL, IBGE, CadÚnico, TSEE, IVS/IPEA, INPE) — cada uma representada por
 * um indicador "âncora" carregado a partir dela:
 *   - ANEEL      -> mmgd_indicadores.potencia_instalada_kw (MMGD)
 *   - IBGE       -> indicadores_sociais.percentual_agua_inadequada (Censo,
 *                   bloco Infraestrutura Urbana)
 *   - CadÚnico   -> indicadores_sociais.percentual_pobreza_cadunico
 *   - TSEE       -> bloqueado (percentual_tsee nem existe no schema ainda —
 *                   ver CLAUDE.md, aguardando dado ANEEL pós-jan/2026)
 *   - IVS/IPEA   -> indicadores_sociais.ivs (índice próprio, não o IVS oficial)
 *   - INPE       -> irradiacao_solar.irradiacao_media_kwh_m2_dia
 *
 * Expandido em 21/07/2026 (pedido do usuário: "atualizar o status da base
 * de dados... com todas as bases") para as demais fontes reais que o Atlas
 * já usa, mas que RF-063 não citava literalmente (mesma lacuna já corrigida
 * na Landing Page — ver PaginaLanding.tsx, FONTES_DE_DADOS):
 *   - RAIS       -> indicadores_sociais.renda_media_domiciliar (via BigQuery)
 *   - DATASUS    -> indicadores_sociais.taxa_mortalidade_infantil (SIM+SINASC)
 *   - MCMV       -> indicadores_sociais.unidades_habitacionais_fgts OU
 *                   empreendimentos_ogu (Caixa/FGTS + Ministério das
 *                   Cidades/OGU)
 *   - ZEIS/AEIS  -> unidades_espaciais.tipo IN ('zeis','aeis') — cobertura de
 *                   só 8 municípios (São Paulo, Recife, Rio Branco, Belo
 *                   Horizonte, Contagem, Fortaleza, Salvador, Rio de Janeiro
 *                   — confirmado via consulta direta ao banco em 21/07/2026).
 *                   CORREÇÃO 30/07/2026 (esclarecimento do usuário): isto NÃO
 *                   é "alcance real da fonte" como Reforma Casa Brasil Solar
 *                   abaixo — é PECULIARIDADE DE PROCESSO: o Instituto Pólis
 *                   extrai o perímetro de ZEIS/AEIS manualmente, um município
 *                   de cada vez (sem portal/API nacional único), e o dado
 *                   PODE existir em muitos outros municípios ainda não
 *                   processados. Cobertura baixa reflete o esforço manual já
 *                   feito, não um teto real conhecido — por isso NÃO usa
 *                   `alcanceLimitadoPorDesenho` (status continua 'parcial'
 *                   pelo percentualCobertura normal), diferente de Reforma
 *                   Casa Brasil Solar.
 *   - Reforma Casa Brasil Solar -> indicadores_sociais.
 *                   numero_contratos_reforma_casa_brasil_solar (Caixa, fonte
 *                   pontual não pública, extrato nov/2025-abr/2026). Este SIM
 *                   é alcance real e fechado: o programa genuinamente só
 *                   chegou a esses municípios no período, é um fato
 *                   documentado pela própria Caixa (extrato via LAI), não uma
 *                   lacuna de esforço de extração — por isso usa
 *                   `alcanceLimitadoPorDesenho = true` (status forçado
 *                   'completo', a extração capturou 100% do que existe).
 * ============================================================================
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export type StatusFonte = 'completo' | 'parcial' | 'bloqueado';

export interface StatusFonteDados {
  id: string;
  nome: string;
  /** Órgão/instituição oficial provedora da fonte (30/07/2026, RF-063 — trilha de proveniência). */
  orgaoProvedor: string;
  /** Como o Atlas obtém o dado desta fonte (API, download direto, seed manual etc.). */
  metodoColeta: string;
  municipiosCobertos: number;
  percentualCobertura: number;
  periodoReferenciaMaisRecente: string | null;
  status: StatusFonte;
  /**
   * true quando o baixo `percentualCobertura` reflete o ALCANCE REAL do
   * fenômeno/programa na fonte (ex.: um programa que só atendeu 1.093
   * municípios, ou uma zoneamento que só 8 prefeituras publicam) — NÃO uma
   * falha/lacuna de extração (30/07/2026, correção conceitual pedida pelo
   * usuário: "integridade do dado" ≠ "alcance territorial". Quando true,
   * `status` é forçado para 'completo' mesmo com percentualCobertura baixo
   * — a extração capturou 100% do que existe, o restante é ausência real,
   * não dado faltando).
   */
  alcanceLimitadoPorDesenho: boolean;
  observacao: string | null;
}

export interface StatusBasesDeDadosResultado {
  atualizadoEm: string;
  totalMunicipios: number;
  fontes: StatusFonteDados[];
}

function calcularStatus(percentualCobertura: number): StatusFonte {
  if (percentualCobertura === 0) return 'bloqueado';
  if (percentualCobertura >= 95) return 'completo';
  return 'parcial';
}

/**
 * Cobertura de uma coluna de indicadores_sociais — conta município DISTINTO
 * (não linha) com a coluna preenchida em QUALQUER período, porque a tabela é
 * fragmentada por periodo_referencia (achado arquitetural da migration 0014:
 * um mesmo município pode ter até 4 linhas, cada uma parcialmente
 * preenchida). Sem o DISTINCT por unidade_espacial_id, um município com 2
 * linhas preenchidas seria contado 2x.
 */
async function cobrirColunaIndicadoresSociais(
  coluna: string,
): Promise<{ cobertos: number; periodo: string | null }> {
  const resultado = await db.execute(sql`
    SELECT
      COUNT(DISTINCT ue.id) FILTER (WHERE i.${sql.raw(coluna)} IS NOT NULL) AS cobertos,
      MAX(i.periodo_referencia) FILTER (WHERE i.${sql.raw(coluna)} IS NOT NULL) AS periodo
    FROM municipios m
    JOIN unidades_espaciais ue
      ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
    LEFT JOIN indicadores_sociais i ON i.unidade_espacial_id = ue.id;
  `);
  const linha = resultado.rows[0] as { cobertos: string | number; periodo: string | null };
  return { cobertos: Number(linha.cobertos), periodo: linha.periodo };
}

async function cobrirMmgd(): Promise<{ cobertos: number; periodo: string | null }> {
  const resultado = await db.execute(sql`
    WITH mmgd_latest AS (
        SELECT DISTINCT ON (unidade_espacial_id)
            unidade_espacial_id, potencia_instalada_kw, periodo_referencia
        FROM mmgd_indicadores
        ORDER BY unidade_espacial_id, periodo_referencia DESC
    )
    SELECT
      COUNT(*) FILTER (WHERE mmgd.potencia_instalada_kw IS NOT NULL) AS cobertos,
      MAX(mmgd.periodo_referencia) AS periodo
    FROM municipios m
    JOIN unidades_espaciais ue
      ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
    LEFT JOIN mmgd_latest mmgd ON mmgd.unidade_espacial_id = ue.id;
  `);
  const linha = resultado.rows[0] as { cobertos: string | number; periodo: string | null };
  return { cobertos: Number(linha.cobertos), periodo: linha.periodo };
}

async function cobrirIrradiacaoSolar(): Promise<{ cobertos: number; periodo: string | null }> {
  const resultado = await db.execute(sql`
    SELECT
      COUNT(DISTINCT irr.codigo_ibge) AS cobertos,
      MAX(irr.periodo_referencia) AS periodo
    FROM irradiacao_solar irr;
  `);
  const linha = resultado.rows[0] as { cobertos: string | number; periodo: string | null };
  return { cobertos: Number(linha.cobertos), periodo: linha.periodo };
}

/**
 * MCMV (Caixa/FGTS + Ministério das Cidades/OGU) — cobertura conta município
 * com QUALQUER uma das duas colunas preenchida (são 2 extractors/faixas de
 * financiamento diferentes, ver extrair_mcmv_fgts.py/extrair_mcmv_ogu.py),
 * não uma coluna única como cobrirColunaIndicadoresSociais assume.
 */
async function cobrirMcmv(): Promise<{ cobertos: number; periodo: string | null }> {
  const resultado = await db.execute(sql`
    SELECT
      COUNT(DISTINCT ue.id) FILTER (
        WHERE i.unidades_habitacionais_fgts IS NOT NULL OR i.empreendimentos_ogu IS NOT NULL
      ) AS cobertos,
      MAX(i.periodo_referencia) FILTER (
        WHERE i.unidades_habitacionais_fgts IS NOT NULL OR i.empreendimentos_ogu IS NOT NULL
      ) AS periodo
    FROM municipios m
    JOIN unidades_espaciais ue
      ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
    LEFT JOIN indicadores_sociais i ON i.unidade_espacial_id = ue.id;
  `);
  const linha = resultado.rows[0] as { cobertos: string | number; periodo: string | null };
  return { cobertos: Number(linha.cobertos), periodo: linha.periodo };
}

/**
 * ZEIS/AEIS (prefeituras municipais) — granularidade diferente das demais
 * fontes: não é uma coluna de `indicadores_sociais`, é presença de QUALQUER
 * unidade espacial tipo 'zeis'/'aeis' filha do município (seeds por
 * capital). Sem periodo_referencia nessa tabela — sempre null, mesmo padrão
 * já usado para TSEE bloqueado.
 */
async function cobrirZeisAeis(): Promise<{ cobertos: number; periodo: string | null }> {
  const resultado = await db.execute(sql`
    SELECT COUNT(DISTINCT m.codigo_ibge) AS cobertos
    FROM municipios m
    JOIN unidades_espaciais ze
      ON ze.municipio_pai_codigo_ibge = m.codigo_ibge AND ze.tipo IN ('zeis', 'aeis');
  `);
  const linha = resultado.rows[0] as { cobertos: string | number };
  return { cobertos: Number(linha.cobertos), periodo: null };
}

export async function buscarStatusBasesDeDados(): Promise<StatusBasesDeDadosResultado> {
  const totalResultado = await db.execute(sql`SELECT COUNT(*) AS total FROM municipios;`);
  const totalMunicipios = Number((totalResultado.rows[0] as { total: string | number }).total);

  const [mmgd, ibge, cadunico, ivs, irradiacao, rais, datasus, mcmv, zeisAeis, reformaSolar] =
    await Promise.all([
      cobrirMmgd(),
      cobrirColunaIndicadoresSociais('percentual_agua_inadequada'),
      cobrirColunaIndicadoresSociais('percentual_pobreza_cadunico'),
      cobrirColunaIndicadoresSociais('ivs'),
      cobrirIrradiacaoSolar(),
      cobrirColunaIndicadoresSociais('renda_media_domiciliar'),
      cobrirColunaIndicadoresSociais('taxa_mortalidade_infantil'),
      cobrirMcmv(),
      cobrirZeisAeis(),
      cobrirColunaIndicadoresSociais('numero_contratos_reforma_casa_brasil_solar'),
    ]);

  function montarFonte(
    id: string,
    nome: string,
    orgaoProvedor: string,
    metodoColeta: string,
    dado: { cobertos: number; periodo: string | null },
    observacao: string | null = null,
    alcanceLimitadoPorDesenho = false,
  ): StatusFonteDados {
    const percentualCobertura =
      totalMunicipios > 0 ? Number(((dado.cobertos / totalMunicipios) * 100).toFixed(1)) : 0;
    return {
      id,
      nome,
      orgaoProvedor,
      metodoColeta,
      municipiosCobertos: dado.cobertos,
      percentualCobertura,
      periodoReferenciaMaisRecente: dado.periodo,
      // Alcance limitado por desenho = extração 100% completa, mesmo com
      // baixa cobertura territorial (ver docstring de alcanceLimitadoPorDesenho).
      status: alcanceLimitadoPorDesenho ? 'completo' : calcularStatus(percentualCobertura),
      alcanceLimitadoPorDesenho,
      observacao,
    };
  }

  const fontes: StatusFonteDados[] = [
    montarFonte(
      'aneel',
      'ANEEL — Registro de Sistemas MMGD (potência instalada)',
      'ANEEL (Agência Nacional de Energia Elétrica)',
      'Download direto de arquivo público (dados abertos ANEEL/MMGD) — publicação atualizada mensalmente pela própria fonte',
      mmgd,
      'Fonte DIFERENTE da usada no Ranking de Fricção e Atrasos (Visão Setorial): aqui é o registro de sistemas MMGD instalados (potência, nº de UCs), atualizado mensalmente pela ANEEL. O ranking usa a "Fila de Conexão de MMGD" — outro dataset da ANEEL, sobre cumprimento de prazo no atendimento a pedidos, com uma janela histórica fixa (2022-2023) — ver nota naquela tela.',
    ),
    montarFonte(
      'ibge',
      'IBGE — Censo 2022 (Infraestrutura Urbana, via SIDRA)',
      'IBGE (Instituto Brasileiro de Geografia e Estatística)',
      'API pública SIDRA',
      ibge,
      'Cobertura calculada pelo indicador "% água inadequada", representativo do bloco Infraestrutura Urbana carregado do Censo.',
    ),
    montarFonte(
      'cadunico',
      'CadÚnico (MDS/SAGI)',
      'MDS/SAGI (Ministério do Desenvolvimento Social)',
      'API pública "MI Social" (Solr), atualizada mensalmente pela fonte',
      cadunico,
    ),
    montarFonte(
      'tsee',
      'TSEE — Tarifa Social de Energia Elétrica (ANEEL/CDE)',
      'ANEEL — CDE (Conta de Desenvolvimento Energético)',
      'Bloqueado — sem coleta em andamento',
      { cobertos: 0, periodo: null },
      'Bloqueado: a coluna percentual_tsee ainda não existe no schema. Aguardando dado ANEEL de Beneficiários da CDE pós-janeiro/2026 com a nova subclasse "Residencial Desconto Social" (Lei 15.235/2025).',
    ),
    montarFonte(
      'ivs_ipea',
      'IVS Consolidado (índice próprio, inspirado no IVS/IPEA)',
      'Construção própria do Atlas (metodologia inspirada no IVS/IPEA)',
      'Cálculo interno (média de 3 blocos de indicadores já carregados)',
      ivs,
      'Construção própria do Atlas (média de 3 blocos normalizados), não substitui o IVS oficial do IPEA, servindo exclusivamente como indicador interno de priorização socioterritorial.',
    ),
    montarFonte(
      'inpe',
      'INPE — Irradiação Solar (Atlas Brasileiro de Energia Solar)',
      'INPE (Instituto Nacional de Pesquisas Espaciais) — LABREN/CCST',
      'Download direto do Atlas Brasileiro de Energia Solar, 2ª edição (2017)',
      irradiacao,
    ),
    montarFonte(
      'rais',
      'RAIS — Ministério do Trabalho (Renda e Trabalho, via BigQuery)',
      'Ministério do Trabalho e Emprego (RAIS)',
      'Consulta via Google BigQuery (Base dos Dados)',
      rais,
    ),
    montarFonte(
      'datasus',
      'DATASUS — Mortalidade Infantil (SIM + SINASC)',
      'Ministério da Saúde (DATASUS)',
      'Consulta via Google BigQuery (Base dos Dados)',
      datasus,
    ),
    montarFonte(
      'mcmv',
      'Caixa/FGTS e Ministério das Cidades — Minha Casa Minha Vida',
      'Caixa Econômica Federal (FGTS) e Ministério das Cidades (OGU)',
      'Download direto de dados públicos de contratação',
      mcmv,
    ),
    montarFonte(
      'zeis_aeis',
      'Prefeituras municipais — Zonas Especiais de Interesse Social (ZEIS/AEIS)',
      'Prefeituras municipais (8 municípios extraídos até agora)',
      'Extração MANUAL, um município de cada vez — sem base nacional única para baixar de uma vez',
      zeisAeis,
      // Peculiaridade real desta fonte (30/07/2026, correção pedida pelo
      // usuário): diferente do Reforma Casa Brasil Solar (onde o programa
      // genuinamente só chegou a X municípios — fato fechado, documentado
      // pela própria Caixa), ZEIS/AEIS não tem esse teto conhecido. O
      // Instituto Pólis extrai o perímetro publicado por cada prefeitura
      // manualmente, uma de cada vez, porque não existe portal/API nacional
      // único. O dado PODE existir em muitos outros municípios ainda não
      // processados — a cobertura baixa reflete o esforço manual de extração
      // já feito até agora, não uma constatação de que ZEIS só exista nesses
      // 8 lugares. Por isso NÃO usa alcanceLimitadoPorDesenho (status seguiu
      // 'parcial' pelo percentualCobertura normal) — diferente de
      // reforma_casa_brasil_solar, que usa.
      `Base de dados íntegra para os municípios já extraídos — sem erro de carga. A cobertura de ` +
        `${zeisAeis.cobertos.toLocaleString('pt-BR')} municípios (São Paulo, Recife, Rio Branco, ` +
        `Belo Horizonte, Contagem, Fortaleza, Salvador, Rio de Janeiro) reflete o estágio atual do ` +
        `trabalho manual de extração, não uma constatação de que ZEIS/AEIS só exista nesses locais: ` +
        `o perímetro pode existir em outros municípios ainda não processados, mas cada prefeitura ` +
        `precisa ser levantada individualmente — não há fonte nacional única e estruturada para ` +
        `essa camada.`,
    ),
    montarFonte(
      'reforma_casa_brasil_solar',
      'Caixa Econômica Federal — Reforma Casa Brasil Solar',
      'Caixa Econômica Federal',
      'Extrato pontual via Lei de Acesso à Informação (fonte não pública/automatizável)',
      reformaSolar,
      `Base de dados 100% carregada para o período solicitado. A concentração em apenas ` +
        `${reformaSolar.cobertos.toLocaleString('pt-BR')} municípios reflete a limitação de ` +
        `alcance territorial real do programa (dados obtidos via extrato pontual por Lei de ` +
        `Acesso à Informação, nov/2025–abr/2026).`,
      true,
    ),
  ];

  return {
    // CLAUDE.md: exibir data/hora em America/Sao_Paulo, nunca UTC bruto.
    atualizadoEm: new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'medium',
    }),
    totalMunicipios,
    fontes,
  };
}
