import type { StatusBasesDeDadosResultado } from '../types/api';
import { obterJson } from './http';

/**
 * GET /api/bases-de-dados (RF-063) — status das 6 fontes primárias, 100%
 * derivado dos dados carregados no banco (cobertura por indicador "âncora"
 * de cada fonte). Endpoint público (leitura), como todas as leituras do
 * Atlas — ver DRF Seção 2.
 */
export function buscarStatusBasesDeDados(): Promise<StatusBasesDeDadosResultado> {
  return obterJson<StatusBasesDeDadosResultado>('/api/bases-de-dados');
}
