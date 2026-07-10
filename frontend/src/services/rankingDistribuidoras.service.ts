import type { RankingDistribuidorasResultado } from '../types/api';
import { obterJson } from './http';

/** GET /api/ranking-distribuidoras. Sem parâmetros. */
export async function buscarRankingDistribuidoras(): Promise<RankingDistribuidorasResultado> {
  return obterJson<RankingDistribuidorasResultado>('/api/ranking-distribuidoras');
}
