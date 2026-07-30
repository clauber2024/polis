/**
 * Paleta de cor fixa por MUNICÍPIO, não por indicador — usada em todo
 * gráfico/tabela que compara territórios lado a lado (GraficoRadar,
 * GraficoComparacao, TabelaComparacao), para a mesma cor identificar o
 * mesmo município em qualquer visualização da tela (30/07/2026, feedback
 * do usuário: o radar já colorria por município, mas o gráfico de barras
 * colorria por indicador — duas lógicas de cor diferentes para a mesma
 * comparação, confuso ao olhar as duas juntas).
 *
 * Ordem reformulada em 30/07/2026 (segunda rodada — feedback do usuário
 * sobre "roxo/preto" na tabela): os 2 primeiros índices SEMPRE são
 * stone-800 (neutro escuro) e red-700/Vermelho Pólis — a comparação mais
 * comum na ferramenta é entre 2 municípios (MINIMO_MUNICIPIOS), então essa
 * dupla precisa bater com a identidade institucional (mesmo vermelho de
 * COR_QUADRANTE.vazio_de_acesso). Índices 3+ preenchem cores adicionais
 * distintas para o caso real de 3–10 municípios comparados ao mesmo tempo
 * — não removidos, só reordenados para não ficarem nos 2 primeiros
 * lugares. Índice = posição do município no array `municipios` recebido
 * por cada componente, MESMA ordem em todo lugar (vem de `resultado` em
 * PainelAnalitico.tsx). 10 cores porque SeletorMunicipios.MAXIMO_MUNICIPIOS
 * = 10 — o módulo (%) em corMunicipio protege mesmo assim, mas na prática
 * nunca repete.
 */
export const PALETA_MUNICIPIOS = [
  '#292524', // stone-800 — município 1, sempre
  '#b91c1c', // red-700 (Vermelho Pólis) — município 2, sempre
  '#7c3aed', // violet-600
  '#d97706', // amber-600
  '#0d9488', // teal-600
  '#db2777', // pink-600
  '#1d4ed8', // blue-700
  '#15803d', // green-700
  '#ea580c', // orange-600
  '#4338ca', // indigo-700
];

export function corMunicipio(indice: number): string {
  return PALETA_MUNICIPIOS[indice % PALETA_MUNICIPIOS.length];
}
