import type {
  ClassificarMunicipiosResultado,
  ListarVaziosDeAcessoResultado,
  MunicipioClassificado,
} from '../types/api';
import { obterJson } from './http';

/** GET /api/vazios-de-acesso (RF-055/056) — uma página da classificação. */
export function buscarVaziosDeAcesso(
  params: Record<string, string>,
): Promise<ListarVaziosDeAcessoResultado> {
  return obterJson<ListarVaziosDeAcessoResultado>('/api/vazios-de-acesso', params);
}

/**
 * GET /api/vazios-de-acesso/classificar (Painel Analítico, RF-049/050) —
 * classificação de quadrante de um conjunto ESPECÍFICO de municípios (1 a
 * 10), não a paginação nacional usada por buscarTodosVaziosDeAcesso (essa
 * continua reservada para o destaque/heatmap do mapa, que precisam do
 * conjunto nacional completo). `quadrante`/`quadranteRotulo` vêm `null`
 * quando o município está excluído da classificação por falta de dado —
 * distinção que o Set binário de `buscarTodosVaziosDeAcesso` não permitia
 * fazer (só dizia "é Vazio de Acesso" ou não, sem diferenciar "é outro
 * quadrante" de "sem dado").
 */
export function classificarMunicipios(codigos: string[]): Promise<ClassificarMunicipiosResultado> {
  return obterJson<ClassificarMunicipiosResultado>('/api/vazios-de-acesso/classificar', {
    codigos: codigos.join(','),
  });
}

export interface VaziosDeAcessoCompleto {
  medianaNacional: ListarVaziosDeAcessoResultado['metodologia']['medianaNacional'];
  /** Percentil 90 nacional de precariedade habitacional — usado pelo CartaoDescompassoMorfologico, ver docs/DECISOES.md. */
  limiarPrecariedadeHabitacionalAlta: number;
  /** Rótulos dos eixos da classificação, como o backend os define (metodologia). */
  eixoX: string;
  eixoY: string;
  /** Ressalva do corte bivariado (renda não controlada) — o backend EXIGE que ela acompanhe qualquer exibição da classificação; o painel do heatmap (RF-057) a mostra. */
  notaMetodologica: string;
  avisos: ListarVaziosDeAcessoResultado['avisos'];
  resumoPorQuadrante: ListarVaziosDeAcessoResultado['resumoPorQuadrante'];
  resumoDescompasso: ListarVaziosDeAcessoResultado['resumoDescompasso'];
  municipios: MunicipioClassificado[];
}

/**
 * Pagina o endpoint até o fim (porPagina máx. 200 — schema do backend) com os
 * filtros dados. A classificação é feita no backend de propósito (depende de
 * medianas nacionais + regras de exclusão que não dá para reproduzir com
 * fidelidade no cliente — ver backend/src/services/vaziosDeAcesso.service.ts).
 */
async function paginarClassificacao(
  filtros: Record<string, string>,
): Promise<VaziosDeAcessoCompleto> {
  const buscarPagina = (pagina: number) =>
    buscarVaziosDeAcesso({ ...filtros, pagina: String(pagina), porPagina: '200' });

  // Primeira página revela o totalPaginas; as demais vêm em paralelo (o
  // backend local aguenta). Teto de 40 páginas (8.000 municípios) por
  // segurança, para nunca depender só de um totalPaginas defeituoso.
  const primeira = await buscarPagina(1);
  const totalPaginas = Math.min(primeira.paginacao.totalPaginas, 40);
  const restantes = await Promise.all(
    Array.from({ length: Math.max(0, totalPaginas - 1) }, (_, i) => buscarPagina(i + 2)),
  );

  const municipios: MunicipioClassificado[] = [
    ...primeira.resultados,
    ...restantes.flatMap((resultado) => resultado.resultados),
  ];

  return {
    medianaNacional: primeira.metodologia.medianaNacional,
    limiarPrecariedadeHabitacionalAlta: primeira.metodologia.limiarPrecariedadeHabitacionalAlta,
    eixoX: primeira.metodologia.eixoX,
    eixoY: primeira.metodologia.eixoY,
    notaMetodologica: primeira.notaMetodologica,
    avisos: primeira.avisos,
    resumoPorQuadrante: primeira.resumoPorQuadrante,
    resumoDescompasso: primeira.resumoDescompasso,
    municipios,
  };
}

/**
 * Busca TODOS os municípios do quadrante "Vazio de Acesso" (~1.451 →
 * ~8 requisições). Usado pelo destaque/heatmap do mapa (RF-055/056/057).
 */
export function buscarTodosVaziosDeAcesso(): Promise<VaziosDeAcessoCompleto> {
  return paginarClassificacao({ quadrante: 'vazio_de_acesso' });
}

/**
 * Busca a classificação nacional COMPLETA (todos os quadrantes, ~5,5 mil
 * municípios → ~28 requisições) — usada pelo scatter de quadrantes do Painel
 * Analítico (14/07/2026). Chamar LAZY (só quando o usuário pedir o gráfico):
 * é a maior rajada de requisições do frontend.
 */
export function buscarClassificacaoNacionalCompleta(): Promise<VaziosDeAcessoCompleto> {
  return paginarClassificacao({});
}
