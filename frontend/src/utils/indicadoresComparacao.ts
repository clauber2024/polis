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
  /**
   * Versão abreviada do rótulo (30/07/2026, correção de bug real de
   * clipping no GraficoRadar.tsx — small multiples): os rótulos completos
   * são longos demais para o eixo de um radar compacto ("Índice de
   * Vulnerabilidade Social (IVS)" = 39 caracteres) e SVG não quebra linha
   * sozinho — nenhuma margem razoável resolve isso sozinha quando o texto
   * é mais largo que o próprio card. Colocado aqui (não numa tabela de
   * tradução solta em GraficoRadar.tsx) para nunca dessincronizar do
   * rótulo completo — se o `rotulo` mudar, `rotuloCurto` está ao lado,
   * lembrando de revisar. Opcional: quem não usa radar (tabela, gráfico de
   * barras) continua usando `rotulo` normalmente.
   */
  rotuloCurto?: string;
  unidade: string | null;
  formato: FormatoIndicador;
  sentido: 'positivo' | 'negativo';
  descricao?: string;
}

export const INDICADORES_COMPARAVEIS: IndicadorComparavel[] = [
  {
    id: 'mmgdResidencialPer1000Hab',
    rotulo: 'MMGD residencial per capita',
    rotuloCurto: 'MMGD per capita',
    unidade: 'kW/1.000 hab',
    formato: 'numero',
    sentido: 'positivo',
  },
  {
    id: 'rendaMediaDomiciliar',
    rotulo: 'Renda média domiciliar',
    rotuloCurto: 'Renda média',
    unidade: null,
    formato: 'moeda',
    sentido: 'positivo',
  },
  {
    id: 'percentualPobrezaCadunico',
    rotulo: 'Pobreza entre famílias do CadÚnico',
    rotuloCurto: 'Pobreza CadÚnico',
    unidade: null,
    formato: 'percentual',
    sentido: 'negativo',
    descricao:
      'Percentual das famílias cadastradas no CadÚnico classificadas em pobreza ou ' +
      'extrema pobreza — não é percentual da população do município.',
  },
  {
    id: 'ivs',
    rotulo: 'Índice de Vulnerabilidade Social (IVS)',
    rotuloCurto: 'IVS',
    unidade: null,
    formato: 'numero',
    sentido: 'negativo',
  },
  {
    id: 'irradiacaoMediaKwhM2Dia',
    rotulo: 'Potencial solar (irradiação média)',
    rotuloCurto: 'Irradiação solar',
    unidade: 'kWh/m²·dia',
    formato: 'numero',
    sentido: 'positivo',
    descricao:
      'Média climatológica de longo prazo (satélite, 1999–2015), não um ano específico. ' +
      'Fonte: Atlas Brasileiro de Energia Solar 2017, LABREN/CCST/INPE.',
  },
];
