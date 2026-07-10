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
