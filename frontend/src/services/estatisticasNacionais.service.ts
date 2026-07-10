import type { EstatisticasNacionais } from '../types/api';
import { obterJson } from './http';

/** GET /api/estatisticas-nacionais (RF-005, Landing Page). Sem parâmetros. */
export async function buscarEstatisticasNacionais(): Promise<EstatisticasNacionais> {
  return obterJson<EstatisticasNacionais>('/api/estatisticas-nacionais');
}
