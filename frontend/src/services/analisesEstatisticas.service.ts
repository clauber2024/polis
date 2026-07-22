import type { AnalisesEstatisticasResultado } from '../types/api';
import { obterJson } from './http';

/**
 * GET /api/analises-estatisticas — correlações parciais materializadas
 * (eixo moradia x MMGD residencial per capita). Primeiro consumidor de
 * frontend deste endpoint (21/07/2026) — até então só existia a API
 * (docs/DECISOES.md, ADR "Infraestrutura estatística integrada").
 */
export function buscarAnalisesEstatisticas(): Promise<AnalisesEstatisticasResultado> {
  return obterJson<AnalisesEstatisticasResultado>('/api/analises-estatisticas');
}
