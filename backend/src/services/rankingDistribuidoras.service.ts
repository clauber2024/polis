/**
 * SERVICE: Ranking de Fricção e Atrasos na Conexão Solar (MMGD)
 * ============================================================================
 * Reimplementação, no backend Node/Express, da metodologia validada em
 * `backend/src/etl/analises/construir_ranking_distribuidoras_conexao_mmgd.py`
 * (PROTÓTIPO DE VALIDAÇÃO) e nas 3 decisões de exibição/metodologia
 * registradas no histórico de decisões técnicas do projeto (10/07/2026).
 *
 * EIXO TÉCNICO (ÍNDICE SINTÉTICO DE FRICÇÃO): lido diretamente de
 * `desempenho_conexao_distribuidoras` (persistido por
 * `backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py` — resumo
 * nacional por distribuidora, com `sig_agente_indqual` já resolvido pelo
 * crosswalk). NUNCA trata `pct_dentro_do_prazo IS NULL` (quando
 * `prazo_confiavel = false`) como "0% no prazo" — é ausência de dado, não
 * desempenho ruim.
 *
 * EIXO JUSTIÇA (IVSH): IVSH médio dos municípios atendidos pela distribuidora,
 * ponderado por população estimada. Município com área de concessão dividida
 * (mais de uma distribuidora no schema INDQUAL) fica de fora — atribuição
 * ambígua. Ainda calculado e devolvido pela API (dado de contexto), mas
 * DESDE 30/07/2026 não determina mais a posição no ranking público — ver
 * "MUDANÇA DE ESCOPO" abaixo.
 *
 * MUDANÇA DE ESCOPO (30/07/2026, pedido explícito do usuário — pivô de
 * posicionamento de produto, reversão da tentativa anterior no mesmo dia de
 * suavizar o tom para "Matriz de Desempenho Setorial"): a página volta a ser
 * um ranking de accountability/pressão pública ("Ranking de Fricção e
 * Atrasos na Conexão Solar"), com posição ordinal explícita e destaque para
 * as piores distribuidoras. Para blindar contra contestação jurídica
 * (justificativa do próprio usuário), o critério de posição passou a ser
 * ESTRITAMENTE o desempenho regulatório operacional (eixoTecnico: conexão +
 * prazo ANEEL) — o IVSH deixou de ser usado na posição/pontuação para que
 * nenhuma distribuidora possa alegar que a vulnerabilidade socioeconômica da
 * sua área de concessão "explica" um mau desempenho técnico. Consequência
 * direta: o critério de entrada no `rankingPrincipal` também mudou — antes
 * exigia os dois eixos disponíveis, agora exige só `prazoConfiavel` (só isso
 * é necessário pra comparar "% fora do prazo" de forma justa).
 *
 * FIM DA SEGREGAÇÃO / PENALIZAÇÃO POR DADO AUSENTE (30/07/2026, pedido
 * explícito do usuário — 2ª correção de estratégia do dia): a separação
 * anterior ("ranking principal" x "dados incompletos" à parte) foi
 * revertida por decisão do usuário — na visão dele, esconder distribuidoras
 * sem dado de prazo numa seção à parte "premiava ou blindava" quem não tem
 * o campo preenchido na fonte ANEEL. Agora TODAS entram numa única lista
 * (`ranking`), e quem não tem `prazoConfiavel` recebe a PENALIDADE MÁXIMA no
 * `indiceFriccaoRanking` (valor fixo 1, o pior possível na escala 0–1) e
 * fica visível, geralmente no topo (empatada com as demais penalizadas,
 * desempate por volume de pedidos — a maior primeiro).
 *
 * RESSALVA IMPORTANTE (mudei o texto pedido pelo usuário por isso): o pedido
 * original queria rotular isso como "Opacidade Regulatória" (a distribuidora
 * sonega dado). NÃO fiz essa afirmação causal — a apuração já registrada em
 * ARQUITETURA.md ("ACHADO CRITICO PARA ESTE PRODUTO", sessão 06/07/2026)
 * mostra que a maior distribuidora do país inteiro (Cemig-D, 7,4 milhões de
 * pedidos, ~13,6% do total nacional) também tem 0% de DatLim preenchido, e
 * que o padrão atravessa vários grupos econômicos sem relação entre si — é
 * descrito lá como "problema de completude de reporte à ANEEL mais amplo",
 * não uma exceção pontual de má-fé de uma distribuidora. Afirmar
 * publicamente que uma distribuidora específica pratica "opacidade
 * regulatória" sem confirmar se a ausência é dela ou da própria base da
 * ANEEL seria uma acusação não verificada sobre uma empresa real — o texto
 * exibido ao usuário (`motivosDadosIncompletos` por distribuidora) descreve
 * o fato observável (campo ausente na fonte, penalidade aplicada) sem
 * atribuir a causa. A PENALIZAÇÃO em si (pior posição possível) foi mantida
 * exatamente como pedido — só a alegação de causa/culpa é que não entrou.
 *
 * COMPARATIVOS (mesma sessão, pedido complementar do usuário — "métricas de
 * desvio comparativo"): `resumoNacional` e os campos de desvio por
 * distribuidora usam SEMPRE `% fora do prazo` (100 - pctDentroDoPrazo) como
 * base, só entre distribuidoras com prazo confiável (mesmo motivo de nunca
 * deixar dado ausente contaminar um agregado nacional). A média nacional é
 * PONDERADA POR VOLUME de pedidos (não é média simples entre distribuidoras)
 * — uma distribuidora com poucos pedidos não pesa igual a uma com milhares.
 * O multiplicador "pior / benchmark" fica `null` quando o benchmark é
 * exatamente 0% fora do prazo (divisão por zero) — nesse caso só os campos
 * em pontos percentuais continuam válidos.
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
  nMunicipiosComIvsh: number | null;
  populacaoEstimadaComIvsh: number | null;
  ivshMedioPonderadoPorPopulacao: number | null;
}

const LIMIAR_AMOSTRA_PEQUENA = 1000;

/**
 * Município -> distribuidora vem do schema INDQUAL (qualidade_conjuntos /
 * qualidade_conjunto_municipio, ver backend/src/etl/schema_qualidade.sql),
 * juntado com IVSH + população estimada (vw_ivsh_consolidado +
 * vw_indicadores_sociais_consolidado + municipios.area_km2, mesma CTE de
 * vaziosDeAcesso.service.ts). Ponderação por população só entre municípios
 * com IVSH calculável (município sem IVSH não entra no numerador nem no
 * denominador — não pode puxar a média para um valor arbitrário).
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
            ivsh.ivsh,
            vsc.densidade_populacional * m.area_km2 AS populacao_estimada
        FROM municipio_distribuidora_unica mdu
        JOIN municipios m ON m.codigo_ibge = mdu.codigo_ibge
        JOIN unidades_espaciais ue
            ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
        LEFT JOIN vw_indicadores_sociais_consolidado vsc ON vsc.unidade_espacial_id = ue.id
        LEFT JOIN vw_ivsh_consolidado ivsh ON ivsh.codigo_ibge = mdu.codigo_ibge
    ),
    justica_por_distribuidora AS (
        SELECT
            sig_agente,
            COUNT(*)::int AS n_municipios,
            COUNT(*) FILTER (
                WHERE ivsh IS NOT NULL AND populacao_estimada IS NOT NULL AND populacao_estimada > 0
            )::int AS n_municipios_com_ivsh,
            SUM(populacao_estimada) FILTER (
                WHERE ivsh IS NOT NULL AND populacao_estimada IS NOT NULL AND populacao_estimada > 0
            ) AS soma_populacao_com_ivsh,
            SUM(ivsh * populacao_estimada) FILTER (
                WHERE ivsh IS NOT NULL AND populacao_estimada IS NOT NULL AND populacao_estimada > 0
            ) AS soma_ivsh_x_populacao
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
        j.n_municipios_com_ivsh          AS "nMunicipiosComIvsh",
        j.soma_populacao_com_ivsh        AS "populacaoEstimadaComIvsh",
        CASE WHEN j.soma_populacao_com_ivsh > 0
             THEN j.soma_ivsh_x_populacao / j.soma_populacao_com_ivsh
             ELSE NULL END               AS "ivshMedioPonderadoPorPopulacao"
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
  /** 100 - pctDentroDoPrazo, só quando prazoConfiavel - métrica de falha usada no ranking e nos comparativos. */
  pctForaDoPrazo: number | null;
  nMunicipiosAtendidos: number | null;
  nMunicipiosComIvsh: number | null;
  ivshMedioPonderadoPorPopulacao: number | null;
  /** Índice Sintético de Fricção calculado (conexão + prazo) - null/parcial quando faltam dados. Ver indiceFriccaoRanking para o valor efetivamente usado na posição. */
  eixoTecnico: number | null;
  /** true quando `!prazoConfiavel` - penalizada com o valor máximo em indiceFriccaoRanking (ver docstring do arquivo). */
  penalizadoPorDadoAusente: boolean;
  /** Valor 0-1 que define a posição no ranking (0=melhor, 1=pior): eixoTecnico quando prazoConfiavel, senão 1 (penalidade máxima). Nunca null. */
  indiceFriccaoRanking: number;
  /** IVSH - dado de contexto, NÃO usado na posição do ranking desde 30/07/2026. */
  eixoJustica: number | null;
  /** Mantido por completude - NÃO usado na posição do ranking desde 30/07/2026 (ver eixoTecnico). */
  scoreComposto: number | null;
  scoreApenasTecnico: boolean;
  /** dist.pctForaDoPrazo - média nacional ponderada por volume, em pontos percentuais. Positivo = pior que a média. */
  desvioPctForaDoPrazoPontosPercentuais: number | null;
  /** O mesmo desvio, como % relativo à média nacional (ex.: 45 = "45% acima da média"). */
  desvioPctForaDoPrazoRelativoPercentual: number | null;
  /** dist.pctForaDoPrazo - benchmark (melhor distribuidora do país), sempre >= 0. */
  distanciaDoBenchmarkPontosPercentuais: number | null;
  motivosDadosIncompletos: string[];
}

/** Resumo nacional para os cards de manchete (30/07/2026) - todos os campos são derivados de dado real, nunca fabricados. */
export interface ResumoNacionalFriccao {
  mediaNacionalPctForaDoPrazo: number;
  /** `empatados` = quantas distribuidoras compartilham exatamente esse valor extremo — 1 = sem empate. */
  benchmarkMelhorDesempenho: { distribuidora: string; pctForaDoPrazo: number; empatados: number };
  piorDesempenho: { distribuidora: string; pctForaDoPrazo: number; empatados: number };
  /** null quando o benchmark tem 0% fora do prazo (divisão por zero) - nesse caso use os campos em pontos percentuais. */
  multiplicadorPiorSobreBenchmark: number | null;
  /** % dos pedidos fora do prazo nacionais (entre distribuidoras com prazo confiável) que pertencem às 5 primeiras posições do ranking. */
  percentualDosPedidosForaDoPrazoNoTop5: number | null;
}

/**
 * Texto INSTITUCIONAL, exibido diretamente ao usuário final — nunca
 * referenciar arquivo, caminho de código ou histórico de decisão técnica
 * aqui (30/07/2026, correção de bug real: uma versão anterior citava
 * arquivos de documentação literalmente neste texto, vazando artefato de
 * desenvolvimento para o usuário final).
 */
const NOTA_METODOLOGICA_JUSTICA =
  'O IVSH (Índice de Vulnerabilidade Sócio-Habitacional-Energética) médio dos municípios ' +
  'atendidos por cada concessionária é calculado e disponibilizado como dado de contexto, ' +
  'mas não influencia a posição no ranking de fricção abaixo. A posição é determinada ' +
  'exclusivamente pelo desempenho regulatório operacional (taxa de conexão e cumprimento ' +
  'de prazo da ANEEL) — vulnerabilidade socioeconômica da região atendida não é considerada ' +
  'justificativa para atraso ou barreira de conexão.';

const NOTA_METODOLOGICA_PENALIDADE =
  'Distribuidoras cujo campo de prazo regulatório (DatLim) está ausente na fonte da ANEEL ' +
  'recebem a penalidade máxima no Índice de Fricção — sem esse campo não é possível medir o ' +
  'cumprimento de prazo, então a distribuidora fica com a pior posição possível em vez de ' +
  'ser comparada de forma incompleta ou favorecida por um vazio de dado.';

export interface RankingDistribuidorasResultado {
  metodologia: {
    eixoTecnico: string;
    eixoJustica: string;
    composicaoScore: string;
    limiarAmostraPequena: number;
  };
  notaMetodologicaJustica: string;
  notaMetodologicaPenalidade: string;
  totalDistribuidoras: number;
  /** null só quando não há nenhuma distribuidora com prazo confiável (caso degenerado, nunca visto na prática). */
  resumoNacional: ResumoNacionalFriccao | null;
  /** Lista ÚNICA (30/07/2026) - todas as distribuidoras, sem seção separada para dado ausente. Ordenada do pior pro melhor. */
  ranking: DistribuidoraRanking[];
}

interface BaseCalculada {
  linha: LinhaBruta;
  eixoTecnico: number | null;
  eixoJustica: number | null;
  scoreComposto: number | null;
  scoreApenasTecnico: boolean;
  pctForaDoPrazo: number | null;
  motivosDadosIncompletos: string[];
}

interface BaseComPrazo extends BaseCalculada {
  pctForaDoPrazo: number;
}

export async function calcularRankingDistribuidoras(): Promise<RankingDistribuidorasResultado> {
  const linhas = await buscarPainelBruto();

  const baseConectado = linhas.map((l) => 1 - l.pctConectado / 100);
  const eixoConectadoNorm = normalizarMinMax(baseConectado);

  const basePrazo = linhas.map((l) =>
    l.prazoConfiavel && l.pctDentroDoPrazo !== null ? 1 - l.pctDentroDoPrazo / 100 : null,
  );
  const eixoPrazoNorm = normalizarMinMax(basePrazo);

  // Passo 1: eixos + pctForaDoPrazo por distribuidora. Os campos de desvio
  // comparativo (média nacional, benchmark) dependem deste array inteiro já
  // calculado, então entram só no passo 3.
  const base: BaseCalculada[] = linhas.map((linha, i) => {
    const conectadoNorm = eixoConectadoNorm[i];
    const prazoNorm = eixoPrazoNorm[i];

    const componentesTecnico = [conectadoNorm, prazoNorm].filter((v): v is number => v !== null);
    const eixoTecnico =
      componentesTecnico.length > 0
        ? componentesTecnico.reduce((a, b) => a + b, 0) / componentesTecnico.length
        : null;

    const eixoJustica = linha.ivshMedioPonderadoPorPopulacao;
    const scoreApenasTecnico = eixoJustica === null;

    const componentesScore = [eixoTecnico, eixoJustica].filter((v): v is number => v !== null);
    const scoreComposto =
      componentesScore.length > 0
        ? componentesScore.reduce((a, b) => a + b, 0) / componentesScore.length
        : null;

    const pctForaDoPrazo =
      linha.prazoConfiavel && linha.pctDentroDoPrazo !== null ? 100 - linha.pctDentroDoPrazo : null;

    // Descreve o FATO observável (campo ausente, penalidade aplicada), nunca
    // a causa/culpa — a apuração em ARQUITETURA.md não confirma se a ausência
    // é falha de reporte da distribuidora ou lacuna da própria base da ANEEL
    // (a MAIOR distribuidora do país, Cemig-D, tem o mesmo problema). Ver
    // "RESSALVA IMPORTANTE" na docstring do arquivo.
    const motivosDadosIncompletos: string[] = [];
    if (!linha.prazoConfiavel) {
      motivosDadosIncompletos.push(
        'Campo de prazo regulatório (DatLim) ausente na fonte da ANEEL para esta distribuidora — ' +
          'não é possível aferir cumprimento de prazo, por isso recebe a penalidade máxima no ' +
          'Índice de Fricção. Essa ausência de campo já foi identificada em várias distribuidoras ' +
          'de grupos econômicos diferentes na mesma base nacional, incluindo a maior distribuidora ' +
          'do país (Cemig-D) — não é possível, só com este dado, determinar se a causa é uma falha ' +
          'de reporte da distribuidora à ANEEL ou uma lacuna da própria base pública.',
      );
    }

    return { linha, eixoTecnico, eixoJustica, scoreComposto, scoreApenasTecnico, pctForaDoPrazo, motivosDadosIncompletos };
  });

  // Passo 2: média nacional (ponderada por volume de pedidos) e benchmark de
  // melhor desempenho — só entre distribuidoras com prazo confiável, mesmo
  // critério já usado para não deixar dado ausente contaminar um agregado.
  const comPrazo: BaseComPrazo[] = base.filter(
    (b): b is BaseComPrazo => b.linha.prazoConfiavel && b.pctForaDoPrazo !== null,
  );

  let mediaNacionalPctForaDoPrazo: number | null = null;
  let benchmarkPctForaDoPrazo: number | null = null;
  let resumoNacional: ResumoNacionalFriccao | null = null;

  if (comPrazo.length > 0) {
    const totalPedidos = comPrazo.reduce((soma, b) => soma + b.linha.nPedidos, 0);
    mediaNacionalPctForaDoPrazo =
      totalPedidos > 0
        ? comPrazo.reduce((soma, b) => soma + b.linha.nPedidos * b.pctForaDoPrazo, 0) / totalPedidos
        : null;

    const benchmark = comPrazo.reduce((melhor, b) => (b.pctForaDoPrazo < melhor.pctForaDoPrazo ? b : melhor));
    const pior = comPrazo.reduce((piorAtual, b) => (b.pctForaDoPrazo > piorAtual.pctForaDoPrazo ? b : piorAtual));
    benchmarkPctForaDoPrazo = benchmark.pctForaDoPrazo;

    // Empates no valor extremo (30/07/2026, checado ao vivo contra o deploy em
    // produção após pergunta do usuário sobre um benchmark de 0%: 3
    // distribuidoras diferentes empatam em 0% fora do prazo no dado real).
    // `.reduce` escolhe UMA arbitrariamente (a primeira, na ordem alfabética
    // do SELECT) sem avisar que existe empate — nomear só ela como "A
    // referência do setor" seria enganoso. `empatados` deixa isso explícito
    // pro texto de manchete, sem esconder a existência do empate.
    const empatadosNoBenchmark = comPrazo.filter((b) => b.pctForaDoPrazo === benchmark.pctForaDoPrazo).length;
    const empatadosNoPior = comPrazo.filter((b) => b.pctForaDoPrazo === pior.pctForaDoPrazo).length;

    if (mediaNacionalPctForaDoPrazo !== null) {
      resumoNacional = {
        mediaNacionalPctForaDoPrazo,
        benchmarkMelhorDesempenho: {
          distribuidora: benchmark.linha.distribuidora,
          pctForaDoPrazo: benchmark.pctForaDoPrazo,
          empatados: empatadosNoBenchmark,
        },
        piorDesempenho: {
          distribuidora: pior.linha.distribuidora,
          pctForaDoPrazo: pior.pctForaDoPrazo,
          empatados: empatadosNoPior,
        },
        multiplicadorPiorSobreBenchmark:
          benchmark.pctForaDoPrazo > 0 ? pior.pctForaDoPrazo / benchmark.pctForaDoPrazo : null,
        percentualDosPedidosForaDoPrazoNoTop5: null, // preenchido no passo 4, depois do ranking ordenado existir
      };
    }
  }

  // Passo 3: campos de desvio por distribuidora, agora que média/benchmark existem.
  const distribuidoras: DistribuidoraRanking[] = base.map((b) => {
    const { linha } = b;
    const desvioPontosPercentuais =
      b.pctForaDoPrazo !== null && mediaNacionalPctForaDoPrazo !== null
        ? b.pctForaDoPrazo - mediaNacionalPctForaDoPrazo
        : null;
    const desvioRelativo =
      desvioPontosPercentuais !== null && mediaNacionalPctForaDoPrazo !== null && mediaNacionalPctForaDoPrazo > 0
        ? (desvioPontosPercentuais / mediaNacionalPctForaDoPrazo) * 100
        : null;
    const distanciaBenchmark =
      b.pctForaDoPrazo !== null && benchmarkPctForaDoPrazo !== null ? b.pctForaDoPrazo - benchmarkPctForaDoPrazo : null;

    // Penalidade máxima por dado ausente (30/07/2026) - ver "RESSALVA
    // IMPORTANTE" na docstring do arquivo: penaliza o FATO (sem prazoConfiavel
    // não dá pra medir cumprimento de prazo), nunca presume má-fé.
    const indiceFriccaoRanking = !linha.prazoConfiavel ? 1 : (b.eixoTecnico ?? 1);

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
      pctForaDoPrazo: b.pctForaDoPrazo,
      nMunicipiosAtendidos: linha.nMunicipiosAtendidos,
      nMunicipiosComIvsh: linha.nMunicipiosComIvsh,
      ivshMedioPonderadoPorPopulacao: linha.ivshMedioPonderadoPorPopulacao,
      eixoTecnico: b.eixoTecnico,
      penalizadoPorDadoAusente: !linha.prazoConfiavel,
      indiceFriccaoRanking,
      eixoJustica: b.eixoJustica,
      scoreComposto: b.scoreComposto,
      scoreApenasTecnico: b.scoreApenasTecnico,
      desvioPctForaDoPrazoPontosPercentuais: desvioPontosPercentuais,
      desvioPctForaDoPrazoRelativoPercentual: desvioRelativo,
      distanciaDoBenchmarkPontosPercentuais: distanciaBenchmark,
      motivosDadosIncompletos: b.motivosDadosIncompletos,
    };
  });

  // Lista única (30/07/2026, correção de estratégia pedida pelo usuário):
  // TODAS as distribuidoras, ordenadas do pior pro melhor por
  // indiceFriccaoRanking (que já embute a penalidade máxima pra quem não tem
  // prazoConfiavel). Desempate por volume de pedidos (maior primeiro) -
  // dentro do grupo penalizado (todas empatadas em 1), destaca primeiro quem
  // tem mais pedidos afetados, mais relevante pro objetivo de accountability.
  const ranking = distribuidoras.sort(
    (a, b) => b.indiceFriccaoRanking - a.indiceFriccaoRanking || b.nPedidos - a.nPedidos,
  );

  // Passo 4: quanto os 5 piores desempenhos REAIS de prazo (entre
  // distribuidoras com prazoConfiavel, independente da posição no ranking
  // geral - que agora pode ter penalizadas por dado ausente no topo)
  // concentram do total nacional de pedidos fora do prazo.
  if (resumoNacional) {
    const top5PorAtrasoReal = [...comPrazo].sort((a, b) => b.pctForaDoPrazo - a.pctForaDoPrazo).slice(0, 5);
    const somaForaDoPrazoTop5 = top5PorAtrasoReal.reduce(
      (soma, b) => soma + (b.linha.nPedidos * b.pctForaDoPrazo) / 100,
      0,
    );
    const somaForaDoPrazoTotal = comPrazo.reduce((soma, b) => soma + (b.linha.nPedidos * b.pctForaDoPrazo) / 100, 0);
    resumoNacional.percentualDosPedidosForaDoPrazoNoTop5 =
      somaForaDoPrazoTotal > 0 ? (somaForaDoPrazoTop5 / somaForaDoPrazoTotal) * 100 : null;
  }

  return {
    metodologia: {
      eixoTecnico:
        'Índice de Fricção (indiceFriccaoRanking): média de (1 - % conectado) e (1 - % dentro do prazo), normalizados min-max entre distribuidoras (0 = melhor, 1 = pior/mais fricção). É o critério que define a posição no ranking. Distribuidoras sem prazo confiável recebem o valor máximo (1) como penalidade, em vez de ficarem fora do ranking.',
      eixoJustica:
        'IVSH médio dos municípios atendidos, ponderado por população estimada — mantido na API como dado de contexto socioeconômico, mas NÃO utilizado na posição deste ranking.',
      composicaoScore:
        'scoreComposto (média de eixoTecnico e eixoJustica) é mantido na API por completude, mas não determina a posição no ranking — a posição usa exclusivamente indiceFriccaoRanking.',
      limiarAmostraPequena: LIMIAR_AMOSTRA_PEQUENA,
    },
    notaMetodologicaJustica: NOTA_METODOLOGICA_JUSTICA,
    notaMetodologicaPenalidade: NOTA_METODOLOGICA_PENALIDADE,
    totalDistribuidoras: distribuidoras.length,
    resumoNacional,
    ranking,
  };
}
