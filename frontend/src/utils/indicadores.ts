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
  /** Rampa sequencial claro→escuro, 5 classes (quebras por quantis em runtime). */
  cores: [string, string, string, string, string];
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
    cores: RAMPA_AMBAR,
  },
  {
    id: 'mmgdResidencialPer1000Hab',
    rotulo: 'MMGD residencial per capita',
    unidade: 'kW/1.000 hab',
    formato: 'numero',
    sentido: 'positivo',
    cores: RAMPA_AZUL,
  },
  {
    id: 'mmgdPer1000Hab',
    rotulo: 'MMGD total per capita',
    unidade: 'kW/1.000 hab',
    formato: 'numero',
    sentido: 'positivo',
    cores: RAMPA_AZUL,
  },
  {
    id: 'ivs',
    rotulo: 'Índice de Vulnerabilidade Social (IVS)',
    unidade: null,
    formato: 'numero',
    sentido: 'negativo',
    cores: RAMPA_VERMELHA,
  },
  {
    id: 'rendaMediaDomiciliar',
    rotulo: 'Renda média domiciliar',
    unidade: null,
    formato: 'moeda',
    sentido: 'positivo',
    cores: RAMPA_VERDE,
  },
  {
    id: 'percentualPobrezaCadunico',
    rotulo: 'Pobreza (CadÚnico)',
    unidade: null,
    formato: 'percentual',
    sentido: 'negativo',
    cores: RAMPA_VERMELHA,
  },
  {
    id: 'tarifaEnergiaResidencial',
    rotulo: 'Tarifa residencial (TUSD+TE)',
    unidade: 'R$/kWh',
    formato: 'numero',
    sentido: 'negativo',
    cores: RAMPA_VERMELHA,
  },
  {
    id: 'taxaAlfabetizacao',
    rotulo: 'Taxa de alfabetização',
    unidade: null,
    formato: 'percentual',
    sentido: 'positivo',
    cores: RAMPA_VERDE,
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
