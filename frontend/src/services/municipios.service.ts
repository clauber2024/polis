import type {
  FeatureCollectionMunicipios,
  ListarMunicipiosResultado,
  MunicipioComIndicadores,
  SetorCensitario,
  SetoresCensitariosResultado,
} from '../types/api';
import { baixarArquivo, obterJson } from './http';

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
  'ivsh',
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

/**
 * GET /api/municipios/exportar (RF-047) — download de dados públicos do
 * Dashboard Público em CSV/GeoJSON, honrando os mesmos filtros do painel
 * RF-046 (estado, região, faixa de potência instalada). "período" não é
 * aceito aqui de propósito — RF-046 pede o filtro, mas o backend não tem
 * série temporal para filtrar por (ver PainelFiltrosDashboard.tsx e
 * municipios.schema.ts no backend).
 */
export async function exportarMunicipios(
  formato: 'csv' | 'geojson',
  filtros: { uf?: string; regiao?: string; potenciaMin?: number; potenciaMax?: number },
): Promise<void> {
  const dataHoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
  const params: Record<string, string> = { formato };
  if (filtros.uf) params.uf = filtros.uf;
  if (filtros.regiao) params.regiao = filtros.regiao;
  if (filtros.potenciaMin !== undefined) params.potenciaMin = String(filtros.potenciaMin);
  if (filtros.potenciaMax !== undefined) params.potenciaMax = String(filtros.potenciaMax);

  const extensao = formato === 'geojson' ? 'geojson' : 'csv';
  await baixarArquivo(
    '/api/municipios/exportar',
    params,
    `municipios-dashboard-publico-${dataHoje}.${extensao}`,
  );
}

/**
 * GET /api/municipios/:codigoIbge/relatorio (RF-058) — baixa o
 * relatório-resumo exportável em PDF do território selecionado (painel de
 * detalhe do município, RF-025). Mesmo padrão de baixarArquivo já usado em
 * exportarMunicipios (RF-047).
 */
export async function baixarRelatorioTerritorio(
  codigoIbge: string,
  nomeMunicipio: string,
): Promise<void> {
  // Remove marcas diacríticas (acentos) após NFD — faixa Unicode U+0300–U+036F
  // (Combining Diacritical Marks), via escape explícito para não depender de
  // caracteres combinantes literais neste arquivo-fonte.
  const REGEX_DIACRITICOS = /[̀-ͯ]/g;
  const slug = nomeMunicipio
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(REGEX_DIACRITICOS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  await baixarArquivo(
    `/api/municipios/${codigoIbge}/relatorio`,
    {},
    `relatorio-${slug || codigoIbge}.pdf`,
  );
}

/** Campos numéricos de SetorCensitario que chegam como STRING do Postgres — mesmo bug/correção de normalizarMunicipio acima. */
const CAMPOS_NUMERICOS_SETOR = [
  'areaKm2',
  'potenciaInstaladaKw',
  'potenciaResidencialKw',
  'numeroUcsComMmgd',
  'numeroUcsResidencial',
] as const;

function normalizarSetor(bruto: SetorCensitario): SetorCensitario {
  const setor = bruto as unknown as Record<string, unknown>;
  for (const campo of CAMPOS_NUMERICOS_SETOR) {
    const valor = setor[campo];
    if (valor === null || valor === undefined || valor === '') {
      setor[campo] = null;
    } else if (typeof valor !== 'number') {
      const convertido = Number(valor);
      setor[campo] = Number.isNaN(convertido) ? null : convertido;
    }
  }
  return bruto;
}

/**
 * GET /api/municipios/:codigoIbge/setores-censitarios (RF-043, RF-045) —
 * drill-down de granularidade fina. Hoje só São Paulo (3550308) retorna
 * setores (seed ilustrativo, migration 0021); qualquer outro município
 * responde `temGranularidadeFina: false`, o que NÃO é erro.
 */
export async function buscarSetoresCensitarios(
  codigoIbge: string,
): Promise<SetoresCensitariosResultado> {
  const resultado = await obterJson<SetoresCensitariosResultado>(
    `/api/municipios/${codigoIbge}/setores-censitarios`,
  );
  resultado.setores.forEach(normalizarSetor);
  return resultado;
}
