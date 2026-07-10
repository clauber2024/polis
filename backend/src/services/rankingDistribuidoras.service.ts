/**
 * SERVICE: Ranking público de distribuidoras por desempenho em conexão de
 * MMGD + justiça energética
 * ============================================================================
 * Reimplementação, no backend Node/Express, da metodologia validada em
 * `backend/src/etl/analises/construir_ranking_distribuidoras_conexao_mmgd.py`
 * (PROTÓTIPO DE VALIDAÇÃO — ver ARQUITETURA.md, "Ideia de produto: ranking
 * público de distribuidoras") e nas 3 decisões de exibição/metodologia
 * registradas em `docs/DECISOES.md`, ADR "Ranking público de distribuidoras
 * — exibição, ponderação e nota metodológica" (10/07/2026).
 *
 * EIXO TÉCNICO: lido diretamente de `desempenho_conexao_distribuidoras`
 * (persistido por `backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py`
 * — resumo nacional por distribuidora, com `sig_agente_indqual` já resolvido
 * pelo crosswalk). NUNCA trata `pct_dentro_do_prazo IS NULL` (quando
 * `prazo_confiavel = false`) como "0% no prazo" — ver ARQUITETURA.md,
 * "ACHADO CRITICO PARA ESTE PRODUTO".
 *
 * EIXO JUSTIÇA ENERGÉTICA: IVS médio dos municípios atendidos pela
 * distribuidora, PONDERADO POR POPULAÇÃO ESTIMADA (decisão do ADR, item 2 —
 * antes era média simples no protótipo). Município com área de concessão
 * dividida (mais de uma distribuidora no schema INDQUAL) fica de fora —
 * atribuição ambígua, mesmo critério já usado no protótipo
 * (`investigar_distribuidora_regioes_problema.py`, prefixo "MULTIPLA(...)").
 * População estimada = densidade populacional x área (mesmo método já usado
 * em `vaziosDeAcesso.service.ts` e no RF-005 — o Atlas não guarda população
 * absoluta).
 *
 * SEGREGAÇÃO VISUAL (ADR, item 1): distribuidoras com os dois eixos
 * disponíveis E prazo confiável entram em `rankingPrincipal` (ordenado por
 * score composto, menor = melhor). As demais (sem par no INDQUAL, ou com
 * `prazo_confiavel = false`) entram em `distribuidorasComDadosIncompletos`,
 * cada uma com `motivosDadosIncompletos` explícito — nunca competem pela
 * mesma posição ordinal do ranking principal.
 * ============================================================================
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

interface LinhaBruta {
  id: number;
  distribuidora: string;
  sigAgenteIndqual: string | null;
  regiaoPrincipal: string;
  nPedidos: number;
  nRegioes: number;
  pctConectado: number;
  prazoConfiavel: boolean;
  pctDentroDoPrazo: number | null;
  nMunicipiosAtendidos: number | null;
  nMunicipiosComIvs: number | null;
  populacaoEstimadaComIvs: number | null;
  ivsMedioPonderadoPorPopulacao: number | null;
}

const LIMIAR_AMOSTRA_PEQUENA = 1000;

/**
 * Município -> distribuidora vem do schema INDQUAL (qualidade_conjuntos /
 * qualidade_conjunto_municipio, ver backend/src/etl/schema_qualidade.sql),
 * juntado com IVS + população estimada (vw_indicadores_sociais_consolidado +
 * municipios.area_km2, mesma CTE de vaziosDeAcesso.service.ts). Ponderação
 * por população só entre municípios com IVS calculável (município sem IVS
 * não entra no numerador nem no denominador — não pode puxar a média para
 * um valor arbitrário).
 */
async function buscarPainelBruto(): Promise<LinhaBruta[]> {
  const resultado = await db.execute(sql`
    WITH municipio_agentes AS (
        SELECT
            qcm.codigo_ibge,
            array_agg(DISTINCT qc.sig_agente) AS agentes
        FROM qualidade_conjunto_municipio qcm
        JOIN qualidade_conjuntos qc ON qc.ide_conjunto = qcm.ide_conjunto
        WHERE qc.sig_agente IS NOT NULL
        GROUP BY qcm.codigo_ibge
    ),
    municipio_distribuidora_unica AS (
        -- Município com área de concessão dividida (>1 distribuidora) fica
        -- de fora do eixo de justiça - atribuição ambígua, mesmo critério
        -- já usado no protótipo.
        SELECT codigo_ibge, agentes[1] AS sig_agente
        FROM municipio_agentes
        WHERE array_length(agentes, 1) = 1
    ),
    municipio_dados AS (
        SELECT
            mdu.sig_agente,
            vsc.ivs,
            vsc.densidade_populacional * m.area_km2 AS populacao_estimada
        FROM municipio_distribuidora_unica mdu
        JOIN municipios m ON m.codigo_ibge = mdu.codigo_ibge
        JOIN unidades_espaciais ue
            ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
        LEFT JOIN vw_indicadores_sociais_consolidado vsc ON vsc.unidade_espacial_id = ue.id
    ),
    justica_por_distribuidora AS (
        SELECT
            sig_agente,
            COUNT(*)::int AS n_municipios,
            COUNT(*) FILTER (
                WHERE ivs IS NOT NULL AND populacao_estimada IS NOT NULL AND populacao_estimada > 0
            )::int AS n_municipios_com_ivs,
            SUM(populacao_estimada) FILTER (
                WHERE ivs IS NOT NULL AND populacao_estimada IS NOT NULL AND populacao_estimada > 0
            ) AS soma_populacao_com_ivs,
            SUM(ivs * populacao_estimada) FILTER (
                WHERE ivs IS NOT NULL AND populacao_estimada IS NOT NULL AND populacao_estimada > 0
            ) AS soma_ivs_x_populacao
        FROM municipio_dados
        GROUP BY sig_agente
    )
    SELECT
        d.id                             AS "id",
        d.distribuidora                  AS "distribuidora",
        d.sig_agente_indqual             AS "sigAgenteIndqual",
        d.regiao_principal               AS "regiaoPrincipal",
        d.n_pedidos                      AS "nPedidos",
        d.n_regioes                      AS "nRegioes",
        d.pct_conectado                  AS "pctConectado",
        d.prazo_confiavel                AS "prazoConfiavel",
        d.pct_dentro_do_prazo            AS "pctDentroDoPrazo",
        j.n_municipios                   AS "nMunicipiosAtendidos",
        j.n_municipios_com_ivs           AS "nMunicipiosComIvs",
        j.soma_populacao_com_ivs         AS "populacaoEstimadaComIvs",
        CASE WHEN j.soma_populacao_com_ivs > 0
             THEN j.soma_ivs_x_populacao / j.soma_populacao_com_ivs
             ELSE NULL END               AS "ivsMedioPonderadoPorPopulacao"
    FROM desempenho_conexao_distribuidoras d
    LEFT JOIN justica_por_distribuidora j ON j.sig_agente = d.sig_agente_indqual
    ORDER BY d.distribuidora;
  `);

  return resultado.rows as unknown as LinhaBruta[];
}

function normalizarMinMax(valores: (number | null)[]): (number | null)[] {
  const validos = valores.filter((v): v is number => v !== null);
  if (validos.length < 2) return valores.map(() => null);

  const minimo = Math.min(...validos);
  const maximo = Math.max(...validos);
  if (maximo === minimo) return valores.map((v) => (v === null ? null : 0));

  return valores.map((v) => (v === null ? null : (v - minimo) / (maximo - minimo)));
}

export interface DistribuidoraRanking {
  distribuidora: string;
  sigAgenteIndqual: string | null;
  regiaoPrincipal: string;
  nPedidos: number;
  nRegioes: number;
  amostraPequena: boolean;
  pctConectado: number;
  prazoConfiavel: boolean;
  pctDentroDoPrazo: number | null;
  nMunicipiosAtendidos: number | null;
  nMunicipiosComIvs: number | null;
  ivsMedioPonderadoPorPopulacao: number | null;
  eixoTecnico: number | null;
  eixoJustica: number | null;
  scoreComposto: number | null;
  scoreApenasTecnico: boolean;
  motivosDadosIncompletos: string[];
}

const NOTA_METODOLOGICA_JUSTICA =
  'O eixo de justiça energética é o IVS médio dos municípios atendidos por cada ' +
  'distribuidora, ponderado por população estimada. Um score composto ruim aqui pode ' +
  'refletir o perfil social da região atendida (ex.: estados do Nordeste têm IVS ' +
  'estruturalmente mais alto/pior no país), não necessariamente desempenho operacional ' +
  'isolado da distribuidora — isso é especialmente relevante para as subsidiárias do ' +
  'Grupo Equatorial fora de Goiás (MA, PI, AL, PA), concentradas na metade pior do ' +
  'ranking: parte disso é vulnerabilidade social regional, não só operação. Ver ' +
  'ARQUITETURA.md, "Ideia de produto: ranking público de distribuidoras", e ' +
  'docs/DECISOES.md para o histórico completo desta decisão.';

const NOTA_METODOLOGICA_DADOS_INCOMPLETOS =
  'Distribuidoras nesta seção têm dado insuficiente para compor o ranking principal: ' +
  'ou não têm par encontrado no schema de Qualidade de Fornecimento da ANEEL (sem eixo ' +
  'de justiça energética), ou o campo de prazo regulatório (DatLim) está praticamente ' +
  'ausente na fonte (sem eixo de prazo confiável). NUNCA leia a ausência de ' +
  'pctDentroDoPrazo como "0% no prazo" — é um vazio de dado, não desempenho ruim.';

export interface RankingDistribuidorasResultado {
  metodologia: {
    eixoTecnico: string;
    eixoJustica: string;
    composicaoScore: string;
    limiarAmostraPequena: number;
  };
  notaMetodologicaJustica: string;
  notaMetodologicaDadosIncompletos: string;
  totalDistribuidoras: number;
  rankingPrincipal: DistribuidoraRanking[];
  distribuidorasComDadosIncompletos: DistribuidoraRanking[];
}

export async function calcularRankingDistribuidoras(): Promise<RankingDistribuidorasResultado> {
  const linhas = await buscarPainelBruto();

  const baseConectado = linhas.map((l) => 1 - l.pctConectado / 100);
  const eixoConectadoNorm = normalizarMinMax(baseConectado);

  const basePrazo = linhas.map((l) =>
    l.prazoConfiavel && l.pctDentroDoPrazo !== null ? 1 - l.pctDentroDoPrazo / 100 : null,
  );
  const eixoPrazoNorm = normalizarMinMax(basePrazo);

  const distribuidoras: DistribuidoraRanking[] = linhas.map((linha, i) => {
    const conectadoNorm = eixoConectadoNorm[i];
    const prazoNorm = eixoPrazoNorm[i];

    const componentesTecnico = [conectadoNorm, prazoNorm].filter(
      (v): v is number => v !== null,
    );
    const eixoTecnico =
      componentesTecnico.length > 0
        ? componentesTecnico.reduce((a, b) => a + b, 0) / componentesTecnico.length
        : null;

    const eixoJustica = linha.ivsMedioPonderadoPorPopulacao;
    const scoreApenasTecnico = eixoJustica === null;

    const componentesScore = [eixoTecnico, eixoJustica].filter(
      (v): v is number => v !== null,
    );
    const scoreComposto =
      componentesScore.length > 0
        ? componentesScore.reduce((a, b) => a + b, 0) / componentesScore.length
        : null;

    const motivosDadosIncompletos: string[] = [];
    if (!linha.prazoConfiavel) {
      motivosDadosIncompletos.push(
        'Prazo regulatório (DatLim) praticamente ausente na fonte ANEEL para esta distribuidora — eixo técnico usa só a taxa de conexão.',
      );
    }
    if (scoreApenasTecnico) {
      motivosDadosIncompletos.push(
        linha.sigAgenteIndqual === null
          ? 'Sem par encontrado no schema de Qualidade de Fornecimento (INDQUAL) — sem eixo de justiça energética.'
          : 'Par encontrado no INDQUAL, mas nenhum município atendido tem IVS calculável — sem eixo de justiça energética.',
      );
    }

    return {
      distribuidora: linha.distribuidora,
      sigAgenteIndqual: linha.sigAgenteIndqual,
      regiaoPrincipal: linha.regiaoPrincipal,
      nPedidos: linha.nPedidos,
      nRegioes: linha.nRegioes,
      amostraPequena: linha.nPedidos < LIMIAR_AMOSTRA_PEQUENA,
      pctConectado: linha.pctConectado,
      prazoConfiavel: linha.prazoConfiavel,
      pctDentroDoPrazo: linha.pctDentroDoPrazo,
      nMunicipiosAtendidos: linha.nMunicipiosAtendidos,
      nMunicipiosComIvs: linha.nMunicipiosComIvs,
      ivsMedioPonderadoPorPopulacao: linha.ivsMedioPonderadoPorPopulacao,
      eixoTecnico,
      eixoJustica,
      scoreComposto,
      scoreApenasTecnico,
      motivosDadosIncompletos,
    };
  });

  // Segregação visual (ADR item 1): só entra no ranking principal quem tem
  // os dois eixos E prazo confiável - nunca compete pela mesma posição
  // ordinal de quem tem dado incompleto.
  const rankingPrincipal = distribuidoras
    .filter((d) => d.prazoConfiavel && !d.scoreApenasTecnico)
    .sort((a, b) => (a.scoreComposto ?? Infinity) - (b.scoreComposto ?? Infinity));

  const distribuidorasComDadosIncompletos = distribuidoras
    .filter((d) => !d.prazoConfiavel || d.scoreApenasTecnico)
    .sort((a, b) => (a.eixoTecnico ?? Infinity) - (b.eixoTecnico ?? Infinity));

  return {
    metodologia: {
      eixoTecnico:
        'Média de (1 - % conectado) e (1 - % dentro do prazo), normalizados min-max entre distribuidoras (0 = melhor, 1 = pior). Distribuidoras sem prazo confiável usam só a taxa de conexão.',
      eixoJustica:
        'IVS médio dos municípios atendidos, ponderado por população estimada (densidade x área) — 0 = melhor, 1 = pior, mesma escala do IVS Consolidado.',
      composicaoScore:
        'Média simples dos dois eixos, só quando ambos disponíveis (scoreApenasTecnico marca quando falta o eixo de justiça).',
      limiarAmostraPequena: LIMIAR_AMOSTRA_PEQUENA,
    },
    notaMetodologicaJustica: NOTA_METODOLOGICA_JUSTICA,
    notaMetodologicaDadosIncompletos: NOTA_METODOLOGICA_DADOS_INCOMPLETOS,
    totalDistribuidoras: distribuidoras.length,
    rankingPrincipal,
    distribuidorasComDadosIncompletos,
  };
}
