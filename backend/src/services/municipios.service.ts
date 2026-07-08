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
import { db } from '../db/client.js';
import { AppError } from '../utils/AppError.js';
import type { ListarMunicipiosQuery } from '../schemas/municipios.schema.js';

export interface MunicipioComIndicadores {
  codigoIbge: string;
  nome: string;
  uf: string;
  nomeEstado: string;
  regiao: string;
  areaKm2: number | null;
  densidadePopulacional: number | null;
  ivs: number | null;
  rendaMediaDomiciliar: number | null;
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
  rendaMediaDomiciliar: number | null;
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
      vsc.renda_media_domiciliar          AS "rendaMediaDomiciliar",
      vsc.percentual_pobreza_cadunico     AS "percentualPobrezaCadunico",
      vsc.percentual_tarifa_social        AS "percentualTarifaSocial",
      vsc.taxa_alfabetizacao              AS "taxaAlfabetizacao",
      vsc.taxa_mortalidade_infantil       AS "taxaMortalidadeInfantil",
      vsc.tarifa_energia_residencial      AS "tarifaEnergiaResidencial",
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

  return {
    ...linha,
    mmgdPer1000Hab,
    mmgdResidencialPer1000Hab,
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

export async function listarMunicipios(
  query: ListarMunicipiosQuery,
): Promise<ListarMunicipiosResultado> {
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

  const ordenado = ordenarMunicipios(municipios, query.ordenarPor, query.ordem);

  const totalResultados = ordenado.length;
  const totalPaginas = Math.max(1, Math.ceil(totalResultados / query.porPagina));
  const inicio = (query.pagina - 1) * query.porPagina;
  const resultados = ordenado.slice(inicio, inicio + query.porPagina);

  return {
    filtrosAplicados: {
      uf: query.uf ?? null,
      regiao: query.regiao ?? null,
      nome: query.nome ?? null,
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
