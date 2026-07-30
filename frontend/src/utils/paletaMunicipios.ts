/**
 * Paleta de cor fixa por MUNICÍPIO, não por indicador — usada em todo
 * gráfico/tabela que compara territórios lado a lado (GraficoRadar,
 * GraficoComparacao, TabelaComparacao), para a mesma cor identificar o
 * mesmo município em qualquer visualização da tela (30/07/2026, feedback
 * do usuário: o radar já colorria por município, mas o gráfico de barras
 * colorria por indicador — duas lógicas de cor diferentes para a mesma
 * comparação, confuso ao olhar as duas juntas).
 *
 * Extraída de GraficoRadar.tsx (onde já existia e já estava correta) — não
 * é paleta nova, só virou compartilhada. Índice = posição do município no
 * array `municipios` recebido por cada componente, MESMA ordem em todo
 * lugar (vem de `resultado` em PainelAnalitico.tsx). 10 cores porque
 * SeletorMunicipios.MAXIMO_MUNICIPIOS = 10 — o módulo (%) em corMunicipio
 * protege mesmo assim, mas na prática nunca repete.
 */
export const PALETA_MUNICIPIOS = [
  '#7c3aed',
  '#0f172a',
  '#d97706',
  '#0d9488',
  '#db2777',
  '#1d4ed8',
  '#15803d',
  '#b91c1c',
  '#7f1d1d',
  '#4338ca',
];

export function corMunicipio(indice: number): string {
  return PALETA_MUNICIPIOS[indice % PALETA_MUNICIPIOS.length];
}
