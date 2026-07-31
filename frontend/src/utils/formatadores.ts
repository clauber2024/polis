/** Formatação numérica pt-BR usada em legenda, popup e painel de detalhe. */

const formatoNumero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const formatoInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const formatoMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

export type FormatoIndicador = 'numero' | 'inteiro' | 'moeda' | 'percentual';

/**
 * Formata timestamps (`criadoEm`/`atualizadoEm` etc.) em America/Sao_Paulo —
 * CLAUDE.md, "Padrão de Timezone": o backend guarda em UTC (`timestamptz`),
 * mas a exibição para o usuário é sempre UTC-3, nunca UTC bruto.
 */
const formatoDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatarDataHora(isoString: string): string {
  return formatoDataHora.format(new Date(isoString));
}

const NOMES_MES_ABREVIADOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/**
 * Formata uma coluna DATE pura (ex: `periodo_referencia`, 'YYYY-MM-DD') como
 * "mês/ano" (ex: "jun/2026") — usado nas datas-base da lente "Déficit de
 * Crédito Crítico" (26/07/2026). Parseia a string diretamente, sem passar
 * por `Date`/`timeZone`, de propósito: `periodo_referencia` é uma DATE, não
 * uma TIMESTAMPTZ (diferente de `criadoEm`/`atualizadoEm` acima) —
 * convertê-la para America/Sao_Paulo via `Date` deslocaria o dia para trás
 * (UTC-3 em cima de meia-noite UTC), uma armadilha real para datas puras,
 * não o mesmo caso de `formatarDataHora`.
 */
export function formatarMesAno(dataIso: string | null): string {
  if (!dataIso) return 'sem dado';
  const [ano, mes] = dataIso.split('-');
  const indiceMes = Number(mes) - 1;
  return `${NOMES_MES_ABREVIADOS[indiceMes] ?? mes}/${ano}`;
}

/**
 * Formata uma coluna DATE pura (`YYYY-MM-DD`) como `DD/MM/AAAA` — padrão
 * brasileiro estrito (30/07/2026, RF-063, "Base de Evidências"). Mesmo
 * cuidado de `formatarMesAno`: parseia a string diretamente, sem passar por
 * `Date`/`timeZone`, porque uma DATE pura não é uma TIMESTAMPTZ — convertê-la
 * via `Date` deslocaria o dia para trás (meia-noite UTC vira o dia anterior
 * em UTC-3).
 */
export function formatarDataBrasileira(dataIso: string | null): string {
  if (!dataIso) return 'sem dado';
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function formatarValor(
  valor: number | null | undefined,
  formato: FormatoIndicador,
): string {
  // undefined acontece de verdade: o MapLibre converte GeoJSON em tiles
  // vetoriais internamente e DESCARTA properties nulas — quem lê properties
  // de um feature clicado recebe undefined, não null. NaN cobre valor
  // não-numérico que escapou da normalização do service.
  if (valor === null || valor === undefined || Number.isNaN(valor)) return 'sem dado';
  switch (formato) {
    case 'inteiro':
      return formatoInteiro.format(valor);
    case 'moeda':
      return formatoMoeda.format(valor);
    case 'percentual':
      return `${formatoNumero.format(valor)}%`;
    default:
      return formatoNumero.format(valor);
  }
}
