import type { MunicipioComIndicadores } from '../types/api';
import type { FormatoIndicador } from './formatadores';

/**
 * Catálogo dos indicadores que podem virar camada choropleth (RF-017) — a
 * decisão de quais indicadores viram camada de mapa é do frontend por
 * contrato (ver docstring de backend/src/services/municipios.service.ts).
 *
 * `sentido` indica como ler a escala ('negativo' = valor maior é pior, ex:
 * IVS), usado só para texto de apoio na legenda — a rampa de cor é sempre
 * claro→escuro do menor para o maior valor, sem inversão automática, mesma
 * regra do restante do Atlas (quem consome sabe o sentido de cada indicador).
 */
export interface IndicadorMapa {
  id: keyof MunicipioComIndicadores;
  rotulo: string;
  unidade: string | null;
  formato: FormatoIndicador;
  sentido: 'positivo' | 'negativo';
  /**
   * Esclarecimento metodológico exibido junto do rótulo (legenda e painel).
   * Obrigatório quando o rótulo sozinho induz a leitura errada (ex.: pobreza
   * CadÚnico — denominador é famílias cadastradas, não população) ou quando
   * a fonte exige contextualização (ex.: irradiação é média climatológica).
   */
  descricao?: string;
  /** Rampa sequencial claro→escuro, 5 classes (quebras por quantis em runtime). */
  cores: [string, string, string, string, string];
  /**
   * Metadado de proveniência exibido no tooltip de hover do mapa (adicionado
   * 12/07/2026, inspirado no protótipo visual do AI Studio). Puramente
   * apresentacional — mesmo espírito de `descricao` acima: não deriva de
   * nenhum cálculo, é só rótulo estático por indicador para dar transparência
   * de fonte/confiança ao usuário. 'Observado' = medição direta da fonte
   * primária; 'Estimado' = índice/modelo calculado a partir de outras bases.
   */
  metadados?: {
    natureza: 'Observado' | 'Estimado';
    confianca: 'Alta' | 'Média' | 'Baixa';
    fonte: string;
  };
}

const RAMPA_AMBAR: IndicadorMapa['cores'] = ['#fef3c7', '#fcd34d', '#f59e0b', '#d97706', '#92400e'];
const RAMPA_AZUL: IndicadorMapa['cores'] = ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'];
const RAMPA_VERMELHA: IndicadorMapa['cores'] = ['#fee2e2', '#fca5a5', '#ef4444', '#b91c1c', '#7f1d1d'];
const RAMPA_VERDE: IndicadorMapa['cores'] = ['#dcfce7', '#86efac', '#22c55e', '#15803d', '#14532d'];

export const INDICADORES_MAPA: IndicadorMapa[] = [
  {
    id: 'irradiacaoMediaKwhM2Dia',
    rotulo: 'Irradiação solar média',
    unidade: 'kWh/m²·dia',
    formato: 'numero',
    sentido: 'positivo',
    // O extractor EXIGE esta contextualização em qualquer exibição do dado
    // (média climatológica, não ano específico) + citação da fonte (condição
    // de licenciamento do Atlas INPE) — ver extrair_irradiacao_solar_inpe.py.
    descricao:
      'Média climatológica de longo prazo (satélite, 1999–2015), não um ano ' +
      'específico. Fonte: Atlas Brasileiro de Energia Solar 2017, LABREN/CCST/INPE.',
    cores: RAMPA_AMBAR,
    metadados: { natureza: 'Estimado', confianca: 'Alta', fonte: 'INPE — Atlas Brasileiro de Energia Solar (2017)' },
  },
  {
    id: 'mmgdResidencialPer1000Hab',
    rotulo: 'MMGD residencial per capita',
    unidade: 'kW/1.000 hab',
    formato: 'numero',
    sentido: 'positivo',
    cores: RAMPA_AZUL,
    metadados: { natureza: 'Observado', confianca: 'Alta', fonte: 'ANEEL/MMGD, cálculo próprio (per capita)' },
  },
  {
    id: 'mmgdPer1000Hab',
    rotulo: 'MMGD total per capita',
    unidade: 'kW/1.000 hab',
    formato: 'numero',
    sentido: 'positivo',
    cores: RAMPA_AZUL,
    metadados: { natureza: 'Observado', confianca: 'Alta', fonte: 'ANEEL/MMGD, cálculo próprio (per capita)' },
  },
  {
    id: 'ivs',
    rotulo: 'Índice de Vulnerabilidade Social (IVS)',
    unidade: null,
    formato: 'numero',
    sentido: 'negativo',
    cores: RAMPA_VERMELHA,
    metadados: { natureza: 'Estimado', confianca: 'Média', fonte: 'IPEA — Índice de Vulnerabilidade Social' },
  },
  {
    id: 'ivsh',
    rotulo: 'Índice de Vulnerabilidade Socio-Habitacional-Energética (IVSH)',
    unidade: null,
    formato: 'numero',
    sentido: 'negativo',
    // O IVS geral (acima) EXCLUI moradia de propósito (evita endogeneidade ao
    // testar MMGD x moradia — ver docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md).
    // O IVSH é a versão para PRIORIZAÇÃO: média de IVS + precariedade
    // habitacional + insegurança da posse (migration 0028) — não substitui o
    // IVS nas demais leituras, é um índice adicional.
    descricao:
      'Média de IVS, precariedade habitacional e insegurança da posse — índice de ' +
      'priorização que inclui moradia (o IVS acima a exclui de propósito). ' +
      'Fonte: cálculo próprio sobre IPEA/Censo, ver vw_ivsh_consolidado.',
    cores: RAMPA_VERMELHA,
    metadados: { natureza: 'Estimado', confianca: 'Média', fonte: 'Cálculo próprio — IVS + precariedade habitacional + insegurança da posse' },
  },
  {
    id: 'rendaMediaDomiciliar',
    rotulo: 'Renda média domiciliar',
    unidade: null,
    formato: 'moeda',
    sentido: 'positivo',
    cores: RAMPA_VERDE,
    metadados: { natureza: 'Observado', confianca: 'Alta', fonte: 'IBGE — Censo Demográfico' },
  },
  {
    id: 'percentualPobrezaCadunico',
    rotulo: 'Pobreza entre famílias do CadÚnico',
    unidade: null,
    formato: 'percentual',
    sentido: 'negativo',
    // Denominador é FAMÍLIAS CADASTRADAS, não população — ver docstring de
    // extrair_cadunico.py (métrica 2). Sem isso o usuário lê "% do município
    // em pobreza", que superestima muito (SP: ~39% das cadastradas).
    descricao:
      'Percentual das famílias cadastradas no CadÚnico classificadas em pobreza ou ' +
      'extrema pobreza (critérios do próprio Cadastro) — não é percentual da ' +
      'população do município. Fonte: MDS/MI Social, dez/2025.',
    cores: RAMPA_VERMELHA,
    metadados: { natureza: 'Observado', confianca: 'Alta', fonte: 'MDS/MI Social — Cadastro Único' },
  },
  {
    id: 'tarifaEnergiaResidencial',
    rotulo: 'Tarifa residencial (TUSD+TE)',
    unidade: 'R$/kWh',
    formato: 'numero',
    sentido: 'negativo',
    cores: RAMPA_VERMELHA,
    metadados: { natureza: 'Observado', confianca: 'Média', fonte: 'ANEEL — Tarifas Residenciais Homologadas' },
  },
  {
    id: 'contratosReformaCasaBrasilSolarPer10000Hab',
    rotulo: 'Acesso ao Reforma Casa Brasil Solar',
    unidade: 'contratos/10.000 hab',
    formato: 'numero',
    sentido: 'positivo',
    // Fonte pontual (extrato do SIC/Caixa, não pública/automatizável) e
    // recorte curto (6 meses) — bem diferente das demais fontes deste
    // catálogo (censitárias/administrativas de cobertura nacional contínua).
    descricao:
      'Contratos da modalidade solar do programa Reforma Casa Brasil (Caixa/Ministério ' +
      'das Cidades), por 10.000 habitantes — extrato pontual nov/2025–abr/2026, não é ' +
      'série histórica nem fonte pública automatizável.',
    cores: RAMPA_VERDE,
    metadados: {
      natureza: 'Observado',
      confianca: 'Média',
      fonte: 'Caixa Econômica Federal — Programa Reforma Casa Brasil (extrato pontual SIC)',
    },
  },
  {
    id: 'taxaAlfabetizacao',
    rotulo: 'Taxa de alfabetização',
    unidade: null,
    formato: 'percentual',
    sentido: 'positivo',
    cores: RAMPA_VERDE,
    metadados: { natureza: 'Observado', confianca: 'Alta', fonte: 'IBGE — Censo Demográfico' },
  },
];

/**
 * Quebras por quantis (5 classes) — robustas à distribuição extremamente
 * assimétrica dos indicadores municipais brasileiros (média/desvio seriam
 * dominados pelos outliers das capitais). Retorna 4 cortes internos.
 */
export function calcularQuebrasQuantis(valores: number[]): number[] {
  const ordenados = [...valores].sort((a, b) => a - b);
  if (ordenados.length === 0) return [];
  const quebras: number[] = [];
  for (const q of [0.2, 0.4, 0.6, 0.8]) {
    const indice = Math.min(ordenados.length - 1, Math.floor(q * ordenados.length));
    quebras.push(ordenados[indice]);
  }
  // Quebras duplicadas (comum quando muitos municípios têm o mesmo valor)
  // quebram a expressão 'step' do MapLibre — deduplicar com incremento mínimo.
  for (let i = 1; i < quebras.length; i++) {
    if (quebras[i] <= quebras[i - 1]) {
      quebras[i] = quebras[i - 1] + Number.EPSILON * Math.max(1, Math.abs(quebras[i - 1]));
    }
  }
  return quebras;
}
