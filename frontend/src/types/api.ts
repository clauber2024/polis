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
  /**
   * Contratos da modalidade SOLAR do programa Reforma Casa Brasil (Caixa/
   * Ministério das Cidades), somados nov/2025-abr/2026. Fonte pontual, NÃO
   * pública/automatizável (extrato do SIC/Caixa) — ver
   * backend/src/etl/loaders/extrair_reforma_casa_brasil_solar.py. NULL = sem
   * contrato no período, não é lacuna de cobertura.
   */
  numeroContratosReformaCasaBrasilSolar: number | null;
  /** Valor efetivamente liberado (R$) dos mesmos contratos acima. */
  valorLiberadoReformaCasaBrasilSolar: number | null;
  /** Derivado: contratos por 10.000 habitantes (população estimada). */
  contratosReformaCasaBrasilSolarPer10000Hab: number | null;
  periodoReferenciaMmgd: string | null;
  periodoReferenciaIrradiacao: string | null;
}

// ---------------------------------------------------------------------------
// Drill-down de granularidade fina (RF-043/RF-045) — ver
// backend/src/services/setoresCensitarios.service.ts. Hoje só São Paulo
// (3550308) tem setores — seed sintético/ilustrativo da migration 0021, NÃO
// dado real da ANEEL/IBGE; qualquer outro município responde
// temGranularidadeFina: false (não é erro).
// ---------------------------------------------------------------------------

/** Espelho de SetorCensitario (setoresCensitarios.service.ts). */
export interface SetorCensitario {
  id: string;
  nomeExibicao: string;
  areaKm2: number | null;
  potenciaInstaladaKw: number | null;
  potenciaResidencialKw: number | null;
  numeroUcsComMmgd: number | null;
  numeroUcsResidencial: number | null;
  eDadoIlustrativo: boolean;
  periodoReferencia: string | null;
}

/** Espelho de SetoresCensitariosResultado (GET /api/municipios/:codigoIbge/setores-censitarios). */
export interface SetoresCensitariosResultado {
  codigoIbge: string;
  nomeMunicipio: string;
  temGranularidadeFina: boolean;
  avisoIlustrativo: string | null;
  setores: SetorCensitario[];
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
    /** RF-046 (Dashboard Público) — faixa de potência instalada, kW. */
    potenciaMin: number | null;
    potenciaMax: number | null;
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

/**
 * Espelho de CompararMunicipiosResultado (municipios.service.ts) —
 * GET /api/municipios/comparar (RF-049/050, Painel Analítico).
 */
export interface CompararMunicipiosResultado {
  codigosSolicitados: string[];
  codigosNaoEncontrados: string[];
  resultados: MunicipioComIndicadores[];
}

/**
 * Espelho de MediasMunicipios (municipios.service.ts) —
 * GET /api/municipios/medias (Painel Analítico, RF-049/050): média de
 * referência nacional/regional/estadual para contextualizar a comparação.
 */
export interface MediasMunicipios {
  escopo: 'nacional' | 'regiao' | 'uf';
  filtro: string | null;
  totalMunicipios: number;
  medias: Partial<Record<keyof MunicipioComIndicadores, number | null>>;
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

/**
 * Espelho de ClassificarMunicipiosResultado (vaziosDeAcesso.service.ts) —
 * GET /api/vazios-de-acesso/classificar (Painel Analítico, RF-049/050):
 * classificação de quadrante de um conjunto específico de municípios (não a
 * paginação nacional). `quadrante`/`quadranteRotulo` vêm `null` quando o
 * município está excluído da classificação por falta de dado — diferente de
 * "não é Vazio de Acesso" (classificado em outro quadrante).
 */
export interface ClassificarMunicipiosResultado {
  notaMetodologica: string;
  medianaNacional: {
    potencialSolarKwhM2Dia: number;
    mmgdResidencialPer1000Hab: number;
  };
  codigosNaoEncontrados: string[];
  resultados: MunicipioClassificado[];
}

// ---------------------------------------------------------------------------
// Autenticação (RF-009/013/014) — fundação de RBAC, ver CLAUDE.md "Fundação de
// autenticação/RBAC". Papel Público não autentica.
// ---------------------------------------------------------------------------

export type Papel = 'colaborador' | 'administrador';

/** Espelho do `usuario` retornado por POST /api/auth/login. */
export interface UsuarioAutenticado {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
}

/** Espelho do corpo de resposta de POST /api/auth/login. */
export interface LoginResultado {
  token: string;
  usuario: UsuarioAutenticado;
}

// ---------------------------------------------------------------------------
// Escrita do Colaborador (RF-059 a RF-067) — ver
// backend/src/services/colaborador.service.ts.
// ---------------------------------------------------------------------------

/** As 6 fontes primárias do Atlas (ver basesDeDadosCanonicas.ts no backend). */
export const BASES_DE_DADOS_CANONICAS = ['aneel', 'ibge', 'cadunico', 'tsee', 'ivs_ipea', 'inpe'] as const;
export type BaseDadosCanonica = (typeof BASES_DE_DADOS_CANONICAS)[number];

export type StatusRevisaoBaseDados = 'em_revisao' | 'validado' | 'inconsistencia_encontrada';

/** Espelho de listarRevisoesBasesDados (RF-059). */
export interface RevisaoBaseDados {
  baseDados: BaseDadosCanonica;
  status: StatusRevisaoBaseDados;
  atualizadoEm: string;
  atualizadoPorNome: string | null;
}

/** Espelho de listarObservacoesBasesDados (RF-060). */
export interface ObservacaoBaseDados {
  id: number;
  baseDados: BaseDadosCanonica;
  mensagem: string;
  criadoEm: string;
  autorNome: string | null;
}

/** Espelho de listarSugestoesIndicadores (RF-061). */
export interface SugestaoIndicador {
  id: number;
  indicador: string;
  mensagem: string;
  criadoEm: string;
  autorNome: string | null;
}

/** Espelho de listarNotasMetodologicas (RF-064/065/066). */
export interface NotaMetodologica {
  id: number;
  topico: string;
  conteudo: string;
  forcaAchado: number | null;
  criadoEm: string;
  autorNome: string | null;
}

export type StatusMaterialComunicacao = 'em_producao' | 'em_revisao' | 'publicado';

/** Espelho de listarMateriaisComunicacao (RF-067). */
export interface MaterialComunicacao {
  id: number;
  titulo: string;
  status: StatusMaterialComunicacao;
  criadoEm: string;
  atualizadoEm: string;
  autorNome: string | null;
}

// ---------------------------------------------------------------------------
// Painel Admin (RF-070 a RF-077) — ver backend/src/services/admin.service.ts.
// RF-070 (upload de arquivo real) não implementado — decisão do usuário foi
// manter a carga de dado só via ETL Python, ver CLAUDE.md.
// ---------------------------------------------------------------------------

/** As 6 bases canônicas + a linha especial de granularidade fina do MMGD (RF-072). */
export const IDS_METADADOS_BASES_DADOS = [
  ...BASES_DE_DADOS_CANONICAS,
  'aneel_mmgd_granularidade_fina',
] as const;
export type IdMetadadoBaseDados = (typeof IDS_METADADOS_BASES_DADOS)[number];

export type GranularidadeEspacial = 'municipio' | 'setor_censitario' | 'cep' | 'bairro' | 'outro';
export type StatusMetadadoBaseDados = 'pendente' | 'validado' | 'erro' | 'aguardando_liberacao';

/** Espelho de listarMetadadosBasesDados (RF-071/072/073). */
export interface MetadadoBaseDados {
  baseDados: IdMetadadoBaseDados;
  granularidadeEspacial: GranularidadeEspacial | null;
  status: StatusMetadadoBaseDados;
  observacao: string | null;
  atualizadoEm: string;
  atualizadoPorNome: string | null;
}

export type StatusAprovacaoIndicador = 'pendente' | 'aprovado' | 'rejeitado';

/** Espelho de listarAprovacoesIndicadores (RF-074). */
export interface AprovacaoIndicador {
  id: number;
  indicador: string;
  status: StatusAprovacaoIndicador;
  motivo: string | null;
  criadoEm: string;
  decididoEm: string | null;
}

/** Espelho de listarVersoesPublicadas (RF-075). */
export interface VersaoPublicada {
  id: number;
  versao: string;
  descricao: string;
  publicadoEm: string;
  publicadoPorNome: string | null;
}

/** Espelho de listarUsuarios (RF-076) — nunca inclui senhaHash. */
export interface UsuarioAdmin {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
}

// ---------------------------------------------------------------------------
// Landing Page (RF-001 a RF-008) — ver backend/src/services/estatisticasNacionais.service.ts
// ---------------------------------------------------------------------------

/** Espelho de IndicadorIndisponivel (estatisticasNacionais.service.ts). */
export interface IndicadorIndisponivel {
  id: 'participacaoMatrizNacional' | 'projecaoFuturaPotencia';
  rotulo: string;
  motivo: string;
}

/**
 * Espelho de PessoasBeneficiadasEstimativa — SEMPRE rotular como estimativa
 * na UI, nunca como contagem exata (usa numero_ucs_residencial × média
 * nacional de moradores por domicílio, IBGE Censo 2022).
 */
export interface PessoasBeneficiadasEstimativa {
  totalUcsResidenciaisBeneficiadas: number;
  mediaPessoasPorDomicilio: number;
  fonteMediaPessoasPorDomicilio: string;
  pessoasBeneficiadasEstimativa: number;
}

/**
 * Espelho de EstatisticasNacionais (GET /api/estatisticas-nacionais, RF-005).
 * Só os 3 primeiros campos são calculados de fato — os outros 3 números
 * pedidos pelo RF-005 (pessoas beneficiadas, participação na matriz nacional,
 * projeção futura) não são calculáveis com o schema atual e aparecem em
 * `indicadoresIndisponiveis`, cada um com o motivo — nunca fabricados.
 */
export interface EstatisticasNacionais {
  /** UCs beneficiadas por crédito de energia — não é contagem de instalações. Ver backend. */
  totalUcsBeneficiadas: number;
  /** Contagem real de instalações MMGD (migration 0025) — null até o extractor rodar de novo. */
  totalInstalacoesMmgd: number | null;
  potenciaTotalInstaladaKw: number;
  totalMunicipiosComMmgd: number;
  periodoReferencia: string | null;
  pessoasBeneficiadas: PessoasBeneficiadasEstimativa;
  indicadoresIndisponiveis: IndicadorIndisponivel[];
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

/**
 * Espelho de DistribuidoraRanking (GET /api/ranking-distribuidoras). Ver
 * docs/DECISOES.md, ADR "Ranking público de distribuidoras", para as 3
 * decisões de exibição que moldam este contrato: segregação visual
 * (rankingPrincipal x distribuidorasComDadosIncompletos, nunca a mesma
 * posição ordinal), IVS ponderado por população, nota metodológica fixa.
 */
export interface DistribuidoraRanking {
  distribuidora: string;
  sigAgenteIndqual: string | null;
  regiaoPrincipal: string;
  nPedidos: number;
  nRegioes: number;
  amostraPequena: boolean;
  pctConectado: number;
  prazoConfiavel: boolean;
  /** NULL quando prazoConfiavel = false — NUNCA ler como "0% no prazo". */
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

/** Espelho de RankingDistribuidorasResultado (GET /api/ranking-distribuidoras). */
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

// ---------------------------------------------------------------------------
// Contornos estaduais (GET /api/estados) — camada de referência visual do
// mapa, ver backend/src/services/estados.service.ts (ST_Union das geometrias
// municipais por UF; casa exatamente com as divisas municipais desenhadas).
// ---------------------------------------------------------------------------

/** Espelho de EstadoFeature (GET /api/estados). */
export interface EstadoFeature {
  type: 'Feature';
  geometry: GeoJSON.Geometry;
  properties: {
    uf: string;
    nomeEstado: string;
    regiao: string;
  };
}

/** Espelho de EstadosGeoJson (GET /api/estados). */
export interface EstadosGeoJson {
  type: 'FeatureCollection';
  features: EstadoFeature[];
}

// ---------------------------------------------------------------------------
// Status das bases de dados primárias (RF-063) — ver
// backend/src/services/basesDeDados.service.ts. Status 100% derivado dos
// dados carregados (cobertura por indicador "âncora" de cada fonte), sem
// tabela de controle manual.
// ---------------------------------------------------------------------------

export type StatusFonte = 'completo' | 'parcial' | 'bloqueado';

/** Espelho de StatusFonteDados (GET /api/bases-de-dados). */
export interface StatusFonteDados {
  id: string;
  nome: string;
  municipiosCobertos: number;
  percentualCobertura: number;
  periodoReferenciaMaisRecente: string | null;
  status: StatusFonte;
  observacao: string | null;
}

/** Espelho de StatusBasesDeDadosResultado (GET /api/bases-de-dados). */
export interface StatusBasesDeDadosResultado {
  /** Já formatado em America/Sao_Paulo pelo backend. */
  atualizadoEm: string;
  totalMunicipios: number;
  fontes: StatusFonteDados[];
}
