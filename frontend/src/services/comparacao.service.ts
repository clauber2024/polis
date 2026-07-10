import type { CompararMunicipiosResultado, MediasMunicipios } from '../types/api';
import { baixarArquivo, obterJson } from './http';

/**
 * Serviços do Painel Analítico (RF-049/050/052, Cruzamento de Variáveis).
 * Mesmo padrão de municipios.service.ts: nenhuma chamada fetch direta em
 * componentes (CLAUDE.md Seção 4).
 */

/**
 * GET /api/municipios/comparar?codigos=... (RF-049/050) — comparação lado a
 * lado de 2 a 10 municípios. Normaliza os mesmos campos numéricos que vêm
 * como string do Postgres (ver municipios.service.ts normalizarMunicipio) —
 * reimplementado aqui em vez de importado porque o backend devolve um
 * envelope diferente ({ resultados, codigosNaoEncontrados }), não um array
 * solto de MunicipioComIndicadores.
 */
const CAMPOS_NUMERICOS = [
  'areaKm2',
  'densidadePopulacional',
  'populacaoEstimada',
  'ivs',
  'rendaMediaDomiciliar',
  'percentualCadunico',
  'percentualPobrezaCadunico',
  'percentualTarifaSocial',
  'taxaAlfabetizacao',
  'taxaMortalidadeInfantil',
  'tarifaEnergiaResidencial',
  'irradiacaoMediaKwhM2Dia',
  'potenciaInstaladaKw',
  'potenciaResidencialKw',
  'numeroUcsComMmgd',
  'numeroUcsResidencial',
  'mmgdPer1000Hab',
  'mmgdResidencialPer1000Hab',
] as const;

function normalizarNumeros(municipio: CompararMunicipiosResultado['resultados'][number]) {
  const registro = municipio as unknown as Record<string, unknown>;
  for (const campo of CAMPOS_NUMERICOS) {
    const valor = registro[campo];
    if (valor === null || valor === undefined || valor === '') {
      registro[campo] = null;
    } else if (typeof valor !== 'number') {
      const convertido = Number(valor);
      registro[campo] = Number.isNaN(convertido) ? null : convertido;
    }
  }
  return municipio;
}

export async function compararMunicipios(
  codigos: string[],
): Promise<CompararMunicipiosResultado> {
  const resultado = await obterJson<CompararMunicipiosResultado>('/api/municipios/comparar', {
    codigos: codigos.join(','),
  });
  resultado.resultados.forEach(normalizarNumeros);
  return resultado;
}

/**
 * GET /api/municipios/medias (RF-049/050) — média de referência para
 * contextualizar a comparação. Sem params = nacional; `regiao` OU `uf` (não
 * os dois) para a média regional/estadual. Valores já vêm como number no
 * JSON (calculados em JS no backend, não SQL AVG() — não sofre o problema de
 * `numeric` do Postgres virar string, então não precisa de normalização aqui).
 */
export async function buscarMediasMunicipios(
  params: { uf?: string; regiao?: string } = {},
): Promise<MediasMunicipios> {
  const query: Record<string, string> = {};
  if (params.uf) query.uf = params.uf;
  if (params.regiao) query.regiao = params.regiao;
  return obterJson<MediasMunicipios>('/api/municipios/medias', query);
}

/**
 * GET /api/municipios/comparar/exportar (RF-052) — baixa a tabela de
 * comparação em CSV ou XLSX. Nome de arquivo inclui a data (America/Sao_Paulo,
 * padrão de timezone do projeto) para não sobrescrever downloads antigos.
 */
export async function exportarComparacao(
  codigos: string[],
  formato: 'csv' | 'xlsx',
): Promise<void> {
  const dataHoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
  await baixarArquivo(
    '/api/municipios/comparar/exportar',
    { codigos: codigos.join(','), formato },
    `comparacao-municipios-${dataHoje}.${formato}`,
  );
}
