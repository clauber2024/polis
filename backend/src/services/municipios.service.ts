/**
 * SERVICE: Listagem/ranking geral de municípios com indicadores consolidados
 * ============================================================================
 * Endpoint fundamental do backend — base de dados para RF-016/017 (camadas do
 * mapa), RF-025 (painel de detalhe ao clicar num município), RF-026 (busca),
 * RF-030 a RF-037 (ranking por estado) e RF-046 (filtros do Dashboard
 * Público). Diferente de vaziosDeAcesso.service.ts (que CLASSIFICA municípios
 * em quadrantes), este service só lista/ordena/pagina os indicadores brutos —
 * a lógica de qual indicador vira camada de mapa, cor, ranking etc. é do
 * frontend (RF-017), este endpoint só entrega o dado consolidado por
 * município.
 *
 * Reaproveita a mesma estrutura de JOIN já validada em vaziosDeAcesso.service.ts
 * (CTEs mmgd_latest/irr_latest, filtro ue.tipo = 'municipio', DISTINCT ON por
 * período mais recente) para não divergir da lógica já testada com dado real.
 * ============================================================================
 */

import { sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from '../db/client.js';
import { AppError } from '../utils/AppError.js';
import { paraCsv } from '../utils/csv.js';
import {
  CRITERIOS_ORDENACAO_MUNICIPIO,
  type ListarMunicipiosQuery,
  type ExportarMunicipiosQuery,
  type MediasMunicipiosQuery,
} from '../schemas/municipios.schema.js';

export interface MunicipioComIndicadores {
  codigoIbge: string;
  nome: string;
  uf: string;
  nomeEstado: string;
  regiao: string;
  areaKm2: number | null;
  densidadePopulacional: number | null;
  /**
   * População ESTIMADA (densidade × área) — o Atlas não guarda população
   * absoluta; mesma estimativa já usada nos per capita de MMGD (ver
   * calcularDerivados). Exibir sempre como estimativa, não como Censo.
   */
  populacaoEstimada: number | null;
  ivs: number | null;
  /**
   * IVSH — Índice de Vulnerabilidade Socio-Habitacional-Energética
   * (vw_ivsh_consolidado, migration 0028) = média de IVS + precariedade
   * habitacional + insegurança da posse. Diferente de `ivs`: inclui moradia
   * de propósito (o IVS geral a exclui para não diluir a hipótese MMGD x
   * moradia — ver docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md). Uso de
   * priorização, não substitui `ivs` nas demais telas.
   */
  ivsh: number | null;
  rendaMediaDomiciliar: number | null;
  /** Cobertura: pessoas cadastradas no CadÚnico ÷ população (Censo 2022) × 100. */
  percentualCadunico: number | null;
  percentualPobrezaCadunico: number | null;
  percentualTarifaSocial: number | null;
  taxaAlfabetizacao: number | null;
  taxaMortalidadeInfantil: number | null;
  tarifaEnergiaResidencial: number | null;
  irradiacaoMediaKwhM2Dia: number | null;
  potenciaInstaladaKw: number | null;
  potenciaResidencialKw: number | null;
  numeroUcsComMmgd: number | null;
  numeroUcsResidencial: number | null;
  mmgdPer1000Hab: number | null;
  mmgdResidencialPer1000Hab: number | null;
  /**
   * Contratos da modalidade SOLAR do programa Reforma Casa Brasil
   * (Caixa/Ministério das Cidades), somados nov/2025-abr/2026. Fonte NÃO
   * pública/automatizável (extrato pontual do SIC/Caixa) — ver migration
   * 0027 e extrair_reforma_casa_brasil_solar.py. NULL = sem contrato
   * registrado no período, não é zero documentado.
   */
  numeroContratosReformaCasaBrasilSolar: number | null;
  /** Valor efetivamente liberado (R$) dos mesmos contratos acima. */
  valorLiberadoReformaCasaBrasilSolar: number | null;
  /**
   * Derivado: contratos por 10.000 habitantes (população estimada) — mesma
   * lógica de mmgdPer1000Hab, para tornar o indicador comparável entre
   * municípios de tamanhos diferentes (o absoluto favorece cidades grandes).
   */
  contratosReformaCasaBrasilSolarPer10000Hab: number | null;
  /**
   * Índice de precariedade habitacional (vw_indices_compostos_moradia_
   * infraestrutura, migration 0014) — normalização min-max NACIONAL de
   * cortiço/parede inadequada/população em favela (0 = melhor, 1 = pior).
   * Mesmo componente usado no IVSH (migration 0028).
   */
  indicePrecariedadeMoradia: number | null;
  /**
   * % de domicílios do tipo "Apartamento" (Censo 2022, SIDRA 9928, migration
   * 0016) — proxy de tipologia habitacional densa/sem telhado próprio
   * individual, testado como barreira física ao net metering.
   */
  percentualApartamento: number | null;
  periodoReferenciaMmgd: string | null;
  periodoReferenciaIrradiacao: string | null;
}

interface LinhaBruta {
  codigoIbge: string;
  nome: string;
  uf: string;
  nomeEstado: string;
  regiao: string;
  areaKm2: number | null;
  densidadePopulacional: number | null;
  ivs: number | null;
  ivsh: number | null;
  rendaMediaDomiciliar: number | null;
  percentualCadunico: number | null;
  percentualPobrezaCadunico: number | null;
  percentualTarifaSocial: number | null;
  taxaAlfabetizacao: number | null;
  taxaMortalidadeInfantil: number | null;
  tarifaEnergiaResidencial: number | null;
  irradiacaoMediaKwhM2Dia: number | null;
  potenciaInstaladaKw: number | null;
  potenciaResidencialKw: number | null;
  numeroUcsComMmgd: number | null;
  numeroUcsResidencial: number | null;
  numeroContratosReformaCasaBrasilSolar: number | null;
  valorLiberadoReformaCasaBrasilSolar: number | null;
  indicePrecariedadeMoradia: number | null;
  percentualApartamento: number | null;
  periodoReferenciaMmgd: string | null;
  periodoReferenciaIrradiacao: string | null;
}

/**
 * SELECT compartilhado pelas duas consultas abaixo (listagem e detalhe) —
 * mantido como template único para não divergir entre as duas ao alterar uma
 * coluna. O `WHERE` de detalhe é acrescentado por buscarMunicipioBruto.
 */
const SELECT_BASE = sql`
  WITH mmgd_latest AS (
      SELECT DISTINCT ON (unidade_espacial_id)
          unidade_espacial_id,
          potencia_instalada_kw,
          numero_ucs_com_mmgd,
          potencia_residencial_kw,
          numero_ucs_residencial,
          periodo_referencia
      FROM mmgd_indicadores
      ORDER BY unidade_espacial_id, periodo_referencia DESC
  ),
  irr_latest AS (
      SELECT DISTINCT ON (codigo_ibge)
          codigo_ibge,
          irradiacao_media_kwh_m2_dia,
          periodo_referencia
      FROM irradiacao_solar
      ORDER BY codigo_ibge, periodo_referencia DESC
  )
  SELECT
      m.codigo_ibge                       AS "codigoIbge",
      m.nome                              AS "nome",
      m.uf                                AS "uf",
      m.nome_estado                       AS "nomeEstado",
      m.regiao                            AS "regiao",
      m.area_km2                          AS "areaKm2",
      vsc.densidade_populacional          AS "densidadePopulacional",
      vsc.ivs                             AS "ivs",
      ivsh.ivsh                           AS "ivsh",
      vsc.renda_media_domiciliar          AS "rendaMediaDomiciliar",
      vsc.percentual_cadunico             AS "percentualCadunico",
      vsc.percentual_pobreza_cadunico     AS "percentualPobrezaCadunico",
      vsc.percentual_tarifa_social        AS "percentualTarifaSocial",
      vsc.taxa_alfabetizacao              AS "taxaAlfabetizacao",
      vsc.taxa_mortalidade_infantil       AS "taxaMortalidadeInfantil",
      vsc.tarifa_energia_residencial      AS "tarifaEnergiaResidencial",
      vsc.numero_contratos_reforma_casa_brasil_solar AS "numeroContratosReformaCasaBrasilSolar",
      vsc.valor_liberado_reforma_casa_brasil_solar AS "valorLiberadoReformaCasaBrasilSolar",
      vsc.percentual_apartamento          AS "percentualApartamento",
      moradia.indice_precariedade_moradia AS "indicePrecariedadeMoradia",
      irr.irradiacao_media_kwh_m2_dia     AS "irradiacaoMediaKwhM2Dia",
      mmgd.potencia_instalada_kw          AS "potenciaInstaladaKw",
      mmgd.potencia_residencial_kw        AS "potenciaResidencialKw",
      mmgd.numero_ucs_com_mmgd            AS "numeroUcsComMmgd",
      mmgd.numero_ucs_residencial         AS "numeroUcsResidencial",
      mmgd.periodo_referencia             AS "periodoReferenciaMmgd",
      irr.periodo_referencia              AS "periodoReferenciaIrradiacao"
  FROM municipios m
  JOIN unidades_espaciais ue
      ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
  LEFT JOIN mmgd_latest mmgd ON mmgd.unidade_espacial_id = ue.id
  LEFT JOIN vw_indicadores_sociais_consolidado vsc ON vsc.unidade_espacial_id = ue.id
  LEFT JOIN vw_indices_compostos_moradia_infraestrutura moradia ON moradia.codigo_ibge = m.codigo_ibge
  LEFT JOIN vw_ivsh_consolidado ivsh ON ivsh.codigo_ibge = m.codigo_ibge
  LEFT JOIN irr_latest irr ON irr.codigo_ibge = m.codigo_ibge
`;

async function buscarPainelBruto(): Promise<LinhaBruta[]> {
  const resultado = await db.execute(sql`${SELECT_BASE} ORDER BY m.codigo_ibge;`);
  return resultado.rows as unknown as LinhaBruta[];
}

async function buscarMunicipioBruto(codigoIbge: string): Promise<LinhaBruta | null> {
  const resultado = await db.execute(
    sql`${SELECT_BASE} WHERE m.codigo_ibge = ${codigoIbge};`,
  );
  return (resultado.rows[0] as unknown as LinhaBruta) ?? null;
}

async function buscarMunicipiosBrutoPorCodigos(codigos: string[]): Promise<LinhaBruta[]> {
  // NOTA: `= ANY(${codigos})` (array como parâmetro único) falha em runtime —
  // "op ANY/ALL (array) requires array on right side" — o driver `pg` não
  // serializa o array JS do jeito que o Postgres espera dentro do template
  // `sql` do drizzle. `IN (...)` com `sql.join` constrói cada código como
  // parâmetro bindado separado ($1, $2, ...), forma testada e que funciona.
  const listaCodigos = sql.join(
    codigos.map((codigo) => sql`${codigo}`),
    sql`, `,
  );
  const resultado = await db.execute(
    sql`${SELECT_BASE} WHERE m.codigo_ibge IN (${listaCodigos}) ORDER BY m.codigo_ibge;`,
  );
  return resultado.rows as unknown as LinhaBruta[];
}

/**
 * Calcula população estimada (densidade x área — mesmo método já usado em
 * vaziosDeAcesso.service.ts e na migration 0014, já que o Atlas não guarda
 * população absoluta diretamente) e os indicadores per capita de MMGD
 * (total e residencial).
 */
function calcularDerivados(linha: LinhaBruta): MunicipioComIndicadores {
  const populacaoEstimada =
    linha.densidadePopulacional !== null && linha.areaKm2 !== null
      ? linha.densidadePopulacional * linha.areaKm2
      : null;

  const mmgdPer1000Hab =
    populacaoEstimada !== null && populacaoEstimada > 0 && linha.potenciaInstaladaKw !== null
      ? (linha.potenciaInstaladaKw / populacaoEstimada) * 1000
      : null;

  const mmgdResidencialPer1000Hab =
    populacaoEstimada !== null && populacaoEstimada > 0 && linha.potenciaResidencialKw !== null
      ? (linha.potenciaResidencialKw / populacaoEstimada) * 1000
      : null;

  const contratosReformaCasaBrasilSolarPer10000Hab =
    populacaoEstimada !== null &&
    populacaoEstimada > 0 &&
    linha.numeroContratosReformaCasaBrasilSolar !== null
      ? (linha.numeroContratosReformaCasaBrasilSolar / populacaoEstimada) * 10000
      : null;

  return {
    ...linha,
    // Arredondada: é estimativa (densidade × área), casas decimais passariam
    // falsa precisão de contagem censitária.
    populacaoEstimada: populacaoEstimada !== null ? Math.round(populacaoEstimada) : null,
    mmgdPer1000Hab,
    mmgdResidencialPer1000Hab,
    contratosReformaCasaBrasilSolarPer10000Hab,
  };
}

function ordenarMunicipios(
  municipios: MunicipioComIndicadores[],
  criterio: ListarMunicipiosQuery['ordenarPor'],
  ordem: ListarMunicipiosQuery['ordem'],
): MunicipioComIndicadores[] {
  const fator = ordem === 'asc' ? 1 : -1;

  return [...municipios].sort((a, b) => {
    const valorA = a[criterio];
    const valorB = b[criterio];

    // Nulos sempre no fim, independente da direção (mesma regra de
    // vaziosDeAcesso.service.ts) — nunca faz sentido nulo virar "extremo".
    if (valorA === null && valorB === null) return 0;
    if (valorA === null) return 1;
    if (valorB === null) return -1;

    if (typeof valorA === 'string' && typeof valorB === 'string') {
      return valorA.localeCompare(valorB, 'pt-BR') * fator;
    }

    return valorA < valorB ? -1 * fator : valorA > valorB ? 1 * fator : 0;
  });
}

export interface ListarMunicipiosResultado {
  filtrosAplicados: {
    uf: string | null;
    regiao: string | null;
    nome: string | null;
    potenciaMin: number | null;
    potenciaMax: number | null;
  };
  ordenacao: {
    ordenarPor: ListarMunicipiosQuery['ordenarPor'];
    ordem: ListarMunicipiosQuery['ordem'];
  };
  paginacao: {
    pagina: number;
    porPagina: number;
    totalResultados: number;
    totalPaginas: number;
  };
  resultados: MunicipioComIndicadores[];
}

/**
 * Filtro compartilhado por listarMunicipios (que pagina) e as funções de
 * exportação abaixo (que NUNCA paginam — exportação sempre traz todos os
 * municípios que casarem o filtro). Extraído aqui pra não duplicar a lógica
 * de filtro/ordenação entre os dois casos de uso.
 */
async function buscarEFiltrarMunicipios(
  query: Pick<
    ListarMunicipiosQuery,
    'uf' | 'regiao' | 'nome' | 'potenciaMin' | 'potenciaMax' | 'ordenarPor' | 'ordem'
  >,
): Promise<MunicipioComIndicadores[]> {
  const linhasBrutas = await buscarPainelBruto();
  let municipios = linhasBrutas.map(calcularDerivados);

  if (query.uf) {
    municipios = municipios.filter((m) => m.uf === query.uf);
  }
  if (query.regiao) {
    municipios = municipios.filter((m) => m.regiao === query.regiao);
  }
  if (query.nome) {
    // Filtro em memória (dataset nacional é ~5.570 linhas — trivial em RAM;
    // mesma decisão de "sem SQL dinâmico" já tomada em vaziosDeAcesso).
    const termo = query.nome.toLocaleLowerCase('pt-BR');
    municipios = municipios.filter((m) => m.nome.toLocaleLowerCase('pt-BR').includes(termo));
  }
  // RF-046 (Dashboard Público): faixa de potência instalada. Município sem
  // dado de MMGD (potenciaInstaladaKw null) é excluído por qualquer faixa —
  // "sem dado" nunca deve casar com um filtro numérico, mesma regra já usada
  // em ordenarMunicipios (nulo nunca vira extremo).
  if (query.potenciaMin !== undefined) {
    municipios = municipios.filter(
      (m) => m.potenciaInstaladaKw !== null && m.potenciaInstaladaKw >= query.potenciaMin!,
    );
  }
  if (query.potenciaMax !== undefined) {
    municipios = municipios.filter(
      (m) => m.potenciaInstaladaKw !== null && m.potenciaInstaladaKw <= query.potenciaMax!,
    );
  }

  return ordenarMunicipios(municipios, query.ordenarPor, query.ordem);
}

export async function listarMunicipios(
  query: ListarMunicipiosQuery,
): Promise<ListarMunicipiosResultado> {
  const ordenado = await buscarEFiltrarMunicipios(query);

  const totalResultados = ordenado.length;
  const totalPaginas = Math.max(1, Math.ceil(totalResultados / query.porPagina));
  const inicio = (query.pagina - 1) * query.porPagina;
  const resultados = ordenado.slice(inicio, inicio + query.porPagina);

  return {
    filtrosAplicados: {
      uf: query.uf ?? null,
      regiao: query.regiao ?? null,
      nome: query.nome ?? null,
      potenciaMin: query.potenciaMin ?? null,
      potenciaMax: query.potenciaMax ?? null,
    },
    ordenacao: {
      ordenarPor: query.ordenarPor,
      ordem: query.ordem,
    },
    paginacao: {
      pagina: query.pagina,
      porPagina: query.porPagina,
      totalResultados,
      totalPaginas,
    },
    resultados,
  };
}

/**
 * RF-025: painel de detalhe ao clicar num município no mapa. Lança
 * AppError(404) se o código IBGE não existir — o controller repassa direto
 * ao errorHandler central (nunca deixa a ausência virar undefined silencioso).
 */
export async function buscarMunicipioPorCodigoIbge(
  codigoIbge: string,
): Promise<MunicipioComIndicadores> {
  const linha = await buscarMunicipioBruto(codigoIbge);
  if (!linha) {
    throw new AppError(404, `Município não encontrado para o código IBGE: ${codigoIbge}`);
  }
  return calcularDerivados(linha);
}

export interface CompararMunicipiosResultado {
  codigosSolicitados: string[];
  codigosNaoEncontrados: string[];
  resultados: MunicipioComIndicadores[];
}

/**
 * RF-049/RF-050: comparação lado a lado de 2+ municípios (Painel Analítico,
 * Cruzamento de Variáveis). Diferente de buscarMunicipioPorCodigoIbge, NÃO
 * lança 404 para códigos individuais não encontrados — reporta em
 * `codigosNaoEncontrados` e segue com os demais, já que o objetivo é
 * comparar o que existe, não falhar a comparação inteira por um código
 * inválido/inexistente entre vários.
 */
export async function compararMunicipios(codigos: string[]): Promise<CompararMunicipiosResultado> {
  const linhasBrutas = await buscarMunicipiosBrutoPorCodigos(codigos);
  const encontrados = linhasBrutas.map(calcularDerivados);
  const porCodigo = new Map(encontrados.map((m) => [m.codigoIbge, m]));

  // Preserva a ordem pedida pelo cliente (o SQL retorna ordenado por
  // codigo_ibge, não necessariamente na ordem da query string) — importa
  // pra comparação lado a lado manter a ordem que o usuário escolheu.
  const resultados = codigos
    .map((codigo) => porCodigo.get(codigo))
    .filter((municipio): municipio is MunicipioComIndicadores => municipio !== undefined);

  const codigosNaoEncontrados = codigos.filter((codigo) => !porCodigo.has(codigo));

  return {
    codigosSolicitados: codigos,
    codigosNaoEncontrados,
    resultados,
  };
}

/** Campos numéricos elegíveis para média — reaproveita a whitelist de ordenação (CRITERIOS_ORDENACAO_MUNICIPIO), excluindo 'nome' (não numérico). */
const CAMPOS_MEDIA = CRITERIOS_ORDENACAO_MUNICIPIO.filter(
  (campo): campo is Exclude<(typeof CRITERIOS_ORDENACAO_MUNICIPIO)[number], 'nome'> =>
    campo !== 'nome',
);

export interface MediasMunicipios {
  escopo: 'nacional' | 'regiao' | 'uf';
  /** Sigla da UF ou nome da região filtrada — null quando escopo é 'nacional'. */
  filtro: string | null;
  totalMunicipios: number;
  medias: Record<(typeof CAMPOS_MEDIA)[number], number | null>;
}

/**
 * Painel Analítico (RF-049/050): média de referência para contextualizar a
 * comparação — nacional (sem filtro), regional ou estadual. Reaproveita
 * buscarPainelBruto (mesma consulta usada por listarMunicipios/exportação) e
 * filtra/agrega EM MEMÓRIA — mesma decisão já tomada em buscarEFiltrarMunicipios
 * ("dataset nacional é ~5.570 linhas — trivial em RAM"), evita duplicar SQL de
 * agregação em paralelo ao SELECT já validado. `uf` tem prioridade sobre
 * `regiao` se os dois vierem (uf implica região, mas não o contrário).
 */
export async function calcularMediasMunicipios(
  query: MediasMunicipiosQuery,
): Promise<MediasMunicipios> {
  const linhasBrutas = await buscarPainelBruto();
  let municipios = linhasBrutas.map(calcularDerivados);

  let escopo: MediasMunicipios['escopo'] = 'nacional';
  let filtro: string | null = null;

  if (query.uf) {
    municipios = municipios.filter((m) => m.uf === query.uf);
    escopo = 'uf';
    filtro = query.uf;
  } else if (query.regiao) {
    municipios = municipios.filter((m) => m.regiao === query.regiao);
    escopo = 'regiao';
    filtro = query.regiao;
  }

  const medias = Object.fromEntries(
    CAMPOS_MEDIA.map((campo) => {
      const valores = municipios
        .map((m) => m[campo])
        .filter((valor): valor is number => typeof valor === 'number');
      const media = valores.length > 0 ? valores.reduce((soma, v) => soma + v, 0) / valores.length : null;
      return [campo, media];
    }),
  ) as MediasMunicipios['medias'];

  return {
    escopo,
    filtro,
    totalMunicipios: municipios.length,
    medias,
  };
}

/**
 * RF-047: download de dados públicos (Dashboard Público) em CSV.
 */
export async function exportarMunicipiosCsv(query: ExportarMunicipiosQuery): Promise<string> {
  const municipios = await buscarEFiltrarMunicipios(query);
  return paraCsv(municipios as unknown as Record<string, unknown>[]);
}

interface FeatureMunicipio {
  type: 'Feature';
  geometry: unknown;
  properties: MunicipioComIndicadores & {
    /**
     * Ponto GARANTIDAMENTE dentro do polígono (ST_PointOnSurface, PostGIS) —
     * usado pelo frontend para posicionar o rótulo do nome do município.
     * Bug real, 21/07/2026: municípios côncavos/pequenos (ex.: região
     * metropolitana do Recife — Camaragibe, Paulista, Abreu e Lima) tinham
     * o centro do bounding box caindo FORA do próprio polígono, jogando o
     * rótulo em cima do vizinho — ver docs/DECISOES.md. `null` só se a
     * geometria for nula (não deveria ocorrer para município com registro).
     */
    pontoRotulo: [number, number] | null;
  };
}

export interface FeatureCollectionMunicipios {
  type: 'FeatureCollection';
  features: FeatureMunicipio[];
}

interface GeometriaMunicipio {
  geojson: unknown;
  pontoRotulo: [number, number] | null;
}

/**
 * Geometria (GeoJSON) de um conjunto de municípios, via ST_AsGeoJSON nativo
 * do PostGIS — evita reimplementar conversão de geometria em JS. Usa o mesmo
 * padrão `IN (...) + sql.join` de buscarMunicipiosBrutoPorCodigos (NÃO
 * `ANY(array)`, que falha em runtime — ver nota lá). Também calcula
 * `pontoRotulo` (ST_PointOnSurface) — ver docstring de FeatureMunicipio.
 */
async function buscarGeometriasPorCodigos(
  codigos: string[],
): Promise<Map<string, GeometriaMunicipio>> {
  if (codigos.length === 0) return new Map();

  const listaCodigos = sql.join(
    codigos.map((codigo) => sql`${codigo}`),
    sql`, `,
  );
  const resultado = await db.execute(sql`
    SELECT
      codigo_ibge AS "codigoIbge",
      ST_AsGeoJSON(geom) AS "geojson",
      ST_AsGeoJSON(ST_PointOnSurface(geom)) AS "pontoRotulo"
    FROM municipios
    WHERE codigo_ibge IN (${listaCodigos});
  `);

  const mapa = new Map<string, GeometriaMunicipio>();
  for (const linha of resultado.rows as Array<{
    codigoIbge: string;
    geojson: string | null;
    pontoRotulo: string | null;
  }>) {
    const ponto = linha.pontoRotulo
      ? ((JSON.parse(linha.pontoRotulo) as { coordinates: [number, number] }).coordinates)
      : null;
    mapa.set(linha.codigoIbge, {
      geojson: linha.geojson ? JSON.parse(linha.geojson) : null,
      pontoRotulo: ponto,
    });
  }
  return mapa;
}

/**
 * RF-047: download de dados públicos (Dashboard Público) em GeoJSON — cada
 * município vira um Feature, com a geometria (SIRGAS 2000/EPSG:4674, mesma
 * projeção usada em todo o Atlas — ver CLAUDE.md Seção 5) e os indicadores
 * consolidados como `properties`.
 */
export async function exportarMunicipiosGeoJson(
  query: ExportarMunicipiosQuery,
): Promise<FeatureCollectionMunicipios> {
  const municipios = await buscarEFiltrarMunicipios(query);
  const geometrias = await buscarGeometriasPorCodigos(municipios.map((m) => m.codigoIbge));

  return {
    type: 'FeatureCollection',
    features: municipios.map((municipio) => {
      const geometria = geometrias.get(municipio.codigoIbge);
      return {
        type: 'Feature',
        geometry: geometria?.geojson ?? null,
        properties: { ...municipio, pontoRotulo: geometria?.pontoRotulo ?? null },
      };
    }),
  };
}

/**
 * RF-052: exportação da tabela de comparação do Painel Analítico em CSV.
 * Reaproveita compararMunicipios (mesma lógica/ordem/codigosNaoEncontrados
 * já validada) — só serializa `resultados` como CSV.
 */
export async function exportarComparacaoCsv(codigos: string[]): Promise<string> {
  const { resultados } = await compararMunicipios(codigos);
  return paraCsv(resultados as unknown as Record<string, unknown>[]);
}

/**
 * RF-052: exportação da tabela de comparação do Painel Analítico em XLSX
 * (biblioteca `exceljs` — ver package.json). Uma única planilha, cabeçalho
 * na primeira linha com os mesmos nomes de campo do JSON da API (consistência
 * com o CSV e com o contrato do endpoint /comparar).
 */
export async function exportarComparacaoXlsx(codigos: string[]): Promise<ExcelJS.Buffer> {
  const { resultados } = await compararMunicipios(codigos);

  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet('Comparação de Municípios');

  if (resultados.length > 0) {
    const colunas = Object.keys(resultados[0]) as Array<keyof MunicipioComIndicadores>;
    planilha.columns = colunas.map((coluna) => ({ header: coluna, key: coluna, width: 22 }));
    resultados.forEach((municipio) => planilha.addRow(municipio));
    planilha.getRow(1).font = { bold: true };
  }

  return workbook.xlsx.writeBuffer();
}
