import type { MunicipioComIndicadores } from '../types/api';
import type { FormatoIndicador } from './formatadores';

/**
 * Catálogo de indicadores do Painel Analítico / Cruzamento de Variáveis
 * (RF-049). O DRF lista 7 variáveis: MMGD solar, Renda, CadÚnico, Tarifa
 * Social, IVS, Potencial Solar e Índice de Pobreza Energética Regional
 * (IPER). Só 5 entram aqui — as outras 2 dependem do mesmo bloqueio externo:
 *
 * - IPER (RF-080) depende de TSEE, IVS/IPEA, IBGE e CadÚnico juntos — o
 *   índice composto continua bloqueado enquanto TSEE não existir (ver
 *   ARQUITETURA.md, "Índice de Pobreza Energética Regional").
 * - Tarifa Social é o MESMO indicador TSEE (`percentual_tarifa_social` no
 *   banco, coluna existente desde a migration 0000 mas nunca populada por
 *   nenhum extractor) — bloqueado pelo dataset "Beneficiários da CDE"/ANEEL
 *   (subclasse "Residencial Desconto Social" só fatura a partir de jan/2026 +
 *   bug de redirecionamento no portal da ANEEL, ver ARQUITETURA.md seção
 *   "Bloqueado"). Incluir aqui mostraria uma coluna/gráfico 100% "sem dado"
 *   para todo o país — mesmo critério já aplicado ao IPER.
 *
 * Reavaliar esta lista quando o bloqueio do TSEE for resolvido (ver
 * CLAUDE.md, "Estado Real do Projeto").
 */
export interface IndicadorComparavel {
  id: keyof MunicipioComIndicadores;
  rotulo: string;
  unidade: string | null;
  formato: FormatoIndicador;
  sentido: 'positivo' | 'negativo';
  descricao?: string;
  /** Cor das barras deste indicador no gráfico (RF-050). */
  cor: string;
}

export const INDICADORES_COMPARAVEIS: IndicadorComparavel[] = [
  {
    id: 'mmgdResidencialPer1000Hab',
    rotulo: 'MMGD residencial per capita',
    unidade: 'kW/1.000 hab',
    formato: 'numero',
    sentido: 'positivo',
    cor: '#1d4ed8',
  },
  {
    id: 'rendaMediaDomiciliar',
    rotulo: 'Renda média domiciliar',
    unidade: null,
    formato: 'moeda',
    sentido: 'positivo',
    cor: '#15803d',
  },
  {
    id: 'percentualPobrezaCadunico',
    rotulo: 'Pobreza entre famílias do CadÚnico',
    unidade: null,
    formato: 'percentual',
    sentido: 'negativo',
    descricao:
      'Percentual das famílias cadastradas no CadÚnico classificadas em pobreza ou ' +
      'extrema pobreza — não é percentual da população do município.',
    cor: '#b91c1c',
  },
  {
    id: 'ivs',
    rotulo: 'Índice de Vulnerabilidade Social (IVS)',
    unidade: null,
    formato: 'numero',
    sentido: 'negativo',
    cor: '#7f1d1d',
  },
  {
    id: 'irradiacaoMediaKwhM2Dia',
    rotulo: 'Potencial solar (irradiação média)',
    unidade: 'kWh/m²·dia',
    formato: 'numero',
    sentido: 'positivo',
    descricao:
      'Média climatológica de longo prazo (satélite, 1999–2015), não um ano específico. ' +
      'Fonte: Atlas Brasileiro de Energia Solar 2017, LABREN/CCST/INPE.',
    cor: '#d97706',
  },
];
