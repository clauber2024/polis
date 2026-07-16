import type { EstadosGeoJson } from '../types/api';
import { obterJson } from './http';

/**
 * GET /api/estados — contorno de cada UF (ST_Union das geometrias municipais
 * no backend, cache em memória de processo lá). Camada de REFERÊNCIA visual
 * do mapa (limite de estados por cima do choropleth, pedido do usuário em
 * 14/07/2026) — falha aqui não é bloqueante: o mapa funciona sem a camada.
 */
export function buscarEstadosGeoJson(): Promise<EstadosGeoJson> {
  return obterJson<EstadosGeoJson>('/api/estados');
}
