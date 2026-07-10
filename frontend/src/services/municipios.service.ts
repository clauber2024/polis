import type {
  FeatureCollectionMunicipios,
  ListarMunicipiosResultado,
  MunicipioComIndicadores,
} from '../types/api';
import { obterJson } from './http';

/**
 * Campos numéricos do contrato — usados para normalização abaixo.
 * IMPORTANTE (bug real encontrado em 09/07/2026): colunas `numeric` do
 * Postgres chegam no JSON da API como STRING ("4.52"), não number — o driver
 * `pg` não converte `numeric` por padrão (só float8). Sem normalizar, a
 * expressão do choropleth (`typeof == 'number'`) trata o país inteiro como
 * "sem dado" para esses indicadores, e o painel exibe NaN.
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

function normalizarMunicipio(bruto: MunicipioComIndicadores): MunicipioComIndicadores {
  const municipio = bruto as unknown as Record<string, unknown>;
  for (const campo of CAMPOS_NUMERICOS) {
    const valor = municipio[campo];
    if (valor === null || valor === undefined || valor === '') {
      municipio[campo] = null;
    } else if (typeof valor !== 'number') {
      const convertido = Number(valor);
      municipio[campo] = Number.isNaN(convertido) ? null : convertido;
    }
  }
  return bruto;
}

/**
 * GET /api/municipios/exportar?formato=geojson (RF-047) — usado aqui como
 * fonte de geometria + indicadores para o choropleth (RF-016/017). É o
 * dataset nacional completo (~5.570 features, geometria já simplificada a
 * ~10 m no seed — ver seed_municipios.py, TOLERANCIA_SIMPLIFICACAO): payload
 * grande, buscar UMA vez e reaproveitar. Se o tempo de carga virar problema
 * real, o caminho é tile vetorial ou um endpoint de geometria simplificada
 * dedicado — não buscar por página.
 */
export async function buscarGeoJsonNacional(): Promise<FeatureCollectionMunicipios> {
  const colecao = await obterJson<FeatureCollectionMunicipios>('/api/municipios/exportar', {
    formato: 'geojson',
  });
  for (const feature of colecao.features) {
    normalizarMunicipio(feature.properties);
  }
  return colecao;
}

/**
 * GET /api/municipios — busca/filtro geral, paginada. Generalizada a partir
 * de buscarMunicipiosPorNome (mantida abaixo, inalterada, para não quebrar
 * BuscaMunicipio.tsx/header) para servir também o filtro por Região/UF do
 * seletor multi-município do Painel Analítico (RF-049/050, feedback do
 * usuário: "opção de filtros para escolher os municípios").
 */
export async function buscarMunicipios(params: {
  nome?: string;
  uf?: string;
  regiao?: string;
  porPagina?: number;
}): Promise<ListarMunicipiosResultado> {
  const query: Record<string, string> = { porPagina: String(params.porPagina ?? 10) };
  if (params.nome) query.nome = params.nome;
  if (params.uf) query.uf = params.uf;
  if (params.regiao) query.regiao = params.regiao;

  const resultado = await obterJson<ListarMunicipiosResultado>('/api/municipios', query);
  resultado.resultados.forEach(normalizarMunicipio);
  return resultado;
}

/** GET /api/municipios (RF-026 etc.) — busca por nome, paginada. */
export async function buscarMunicipiosPorNome(nome: string): Promise<ListarMunicipiosResultado> {
  return buscarMunicipios({ nome, porPagina: 10 });
}

/** GET /api/municipios/:codigoIbge (RF-025) — painel de detalhe. */
export async function buscarMunicipio(codigoIbge: string): Promise<MunicipioComIndicadores> {
  return normalizarMunicipio(
    await obterJson<MunicipioComIndicadores>(`/api/municipios/${codigoIbge}`),
  );
}
