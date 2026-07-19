/**
 * SERVICE: Análises estatísticas materializadas (correlação parcial de
 * Spearman, eixo moradia x MMGD residencial)
 * ============================================================================
 * Lê os resultados gravados por
 * `backend/src/etl/loaders/calcular_analise_estatistica_moradia_mmgd.py` em
 * `analises_estatisticas` (migration 0029) — sem cálculo em tempo real. Esta
 * tabela responde hipóteses ESPECÍFICAS já formuladas (hoje, a Recomendação
 * #3 de docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md), não é um motor genérico
 * de correlação/regressão sob demanda — decisão documentada em
 * docs/DECISOES.md, ADR "Infraestrutura estatística integrada".
 *
 * Mesmo princípio já usado em `rankingDistribuidoras.service.ts` e
 * `vaziosDeAcesso.service.ts`: qualquer leitura de um resultado estatístico
 * DEVE vir acompanhada de nota metodológica explícita, nunca só o número.
 * ============================================================================
 */

import { desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { analisesEstatisticas } from '../db/schema/index.js';

export interface ResultadoAnaliseEstatistica {
  variavelX: string;
  rotuloVariavelX: string;
  sentidoEsperado: string;
  variavelY: string;
  variaveisControle: string[];
  metodo: string;
  n: number;
  rhoBruto: number | null;
  pValorBruto: number | null;
  rhoParcial: number | null;
  pValorParcial: number | null;
  nRegioesTestadas: number | null;
  nRegioesMesmoSinal: number | null;
  veredito: string | null;
  calculadoEm: string;
}

const NOTA_METODOLOGICA =
  'Correlação (mesmo parcial) NUNCA estabelece causalidade — MMGD depende de fatores não ' +
  'observados aqui (tarifa da distribuidora local, marco legal da geração distribuída à ' +
  'época da conexão, disponibilidade de crédito/financiamento, iniciativa de instaladoras ' +
  'na região). "renda_media_domiciliar" é renda do trabalho FORMAL (RAIS), não renda ' +
  'domiciliar total. rho_parcial/p_valor_parcial nulos indicam amostra insuficiente ' +
  '(abaixo do mínimo confiável), nunca devem ser lidos como ausência de associação. Ver ' +
  'docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md, Seção 2.2, e ' +
  'backend/src/etl/loaders/calcular_analise_estatistica_moradia_mmgd.py para a metodologia completa.';

export interface AnalisesEstatisticasResultado {
  metodologia: {
    descricaoMetodo: string;
    amostraMinima: number;
  };
  notaMetodologica: string;
  totalResultados: number;
  resultados: ResultadoAnaliseEstatistica[];
}

export async function buscarAnalisesEstatisticas(): Promise<AnalisesEstatisticasResultado> {
  const linhas = await db
    .select()
    .from(analisesEstatisticas)
    .orderBy(desc(analisesEstatisticas.calculadoEm), analisesEstatisticas.variavelX);

  const resultados: ResultadoAnaliseEstatistica[] = linhas.map((linha) => ({
    variavelX: linha.variavelX,
    rotuloVariavelX: linha.rotuloVariavelX,
    sentidoEsperado: linha.sentidoEsperado,
    variavelY: linha.variavelY,
    variaveisControle: linha.variaveisControle,
    metodo: linha.metodo,
    n: linha.n,
    rhoBruto: linha.rhoBruto,
    pValorBruto: linha.pValorBruto,
    rhoParcial: linha.rhoParcial,
    pValorParcial: linha.pValorParcial,
    nRegioesTestadas: linha.nRegioesTestadas,
    nRegioesMesmoSinal: linha.nRegioesMesmoSinal,
    veredito: linha.veredito,
    calculadoEm: linha.calculadoEm.toISOString(),
  }));

  return {
    metodologia: {
      descricaoMetodo:
        'Correlação parcial de Spearman por resíduo de postos: converte X, Y e cada ' +
        'controle para postos (ranks), regride (OLS) X e Y contra os controles, e calcula ' +
        'a correlação de Pearson entre os dois resíduos. Controles aplicados ' +
        'SIMULTANEAMENTE (conjunto), não um de cada vez.',
      amostraMinima: 30,
    },
    notaMetodologica: NOTA_METODOLOGICA,
    totalResultados: resultados.length,
    resultados,
  };
}
