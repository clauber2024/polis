/**
 * Contratos da API REST do Atlas — espelhados manualmente dos tipos reais do
 * backend (backend/src/services/*.service.ts e schemas/*.schema.ts).
 * Se o backend mudar um contrato, atualizar aqui junto — não há geração
 * automática de tipos entre as duas pontas (reavaliar se a divergência
 * começar a doer; opções: pacote compartilhado ou OpenAPI).
 */

/** Formato central de erro do backend (errorHandler.ts). */
export interface ErroApi {
  erro: {
    mensagem: string;
    detalhes?: unknown;
  };
}

/** Espelho de MunicipioComIndicadores (municipios.service.ts). */
export interface MunicipioComIndicadores {
  codigoIbge: string;
  nome: string;
  uf: string;
  nomeEstado: string;
  regiao: string;
  areaKm2: number | null;
  densidadePopulacional: number | null;
  /** ESTIMADA (densidade × área) — o Atlas não guarda população absoluta. */
  populacaoEstimada: number | null;
  ivs: number | null;
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
  periodoReferenciaMmgd: string | null;
  periodoReferenciaIrradiacao: string | null;
}

export interface Paginacao {
  pagina: number;
  porPagina: number;
  totalResultados: number;
  totalPaginas: number;
}

/** Espelho de ListarMunicipiosResultado (GET /api/municipios). */
export interface ListarMunicipiosResultado {
  filtrosAplicados: {
    uf: string | null;
    regiao: string | null;
    nome: string | null;
  };
  ordenacao: {
    ordenarPor: string;
    ordem: 'asc' | 'desc';
  };
  paginacao: Paginacao;
  resultados: MunicipioComIndicadores[];
}

/**
 * Espelho de FeatureCollectionMunicipios
 * (GET /api/municipios/exportar?formato=geojson) — geometria em
 * SIRGAS 2000/EPSG:4674, que o MapLibre aceita como se fosse WGS84
 * (diferença de datum é submétrica, irrelevante para visualização web).
 */
export interface FeatureMunicipio {
  type: 'Feature';
  geometry: GeoJSON.Geometry | null;
  properties: MunicipioComIndicadores;
}

export interface FeatureCollectionMunicipios {
  type: 'FeatureCollection';
  features: FeatureMunicipio[];
}

/** Quadrantes de vazios de acesso (vaziosDeAcesso.service.ts). */
export type Quadrante =
  | 'vazio_de_acesso'
  | 'acesso_pleno'
  | 'adocao_acima_do_potencial'
  | 'baixo_potencial_baixa_adocao';

/** Espelho de MunicipioClassificado (GET /api/vazios-de-acesso). */
export interface MunicipioClassificado {
  codigoIbge: string;
  nome: string;
  uf: string;
  regiao: string;
  irradiacaoMediaKwhM2Dia: number | null;
  mmgdResidencialPer1000Hab: number | null;
  quadrante: Quadrante | null;
  quadranteRotulo: string | null;
  ivs: number | null;
  rendaMediaDomiciliar: number | null;
  percentualPobrezaCadunico: number | null;
}

/** Espelho de ListarVaziosDeAcessoResultado (GET /api/vazios-de-acesso). */
export interface ListarVaziosDeAcessoResultado {
  metodologia: {
    eixoX: string;
    eixoY: string;
    criterioQuadrante: string;
    criterioPriorizacaoPadrao: string;
    medianaNacional: {
      potencialSolarKwhM2Dia: number;
      mmgdResidencialPer1000Hab: number;
    };
  };
  notaMetodologica: string;
  avisos: {
    totalMunicipios: number;
    totalClassificados: number;
    totalExcluidosSemDado: number;
    totalPrecisaReextrairMmgd: number;
  };
  resumoPorQuadrante: Record<Quadrante, number>;
  filtrosAplicados: {
    uf: string | null;
    regiao: string | null;
    quadrante: string | null;
  };
  paginacao: Paginacao;
  resultados: MunicipioClassificado[];
}
