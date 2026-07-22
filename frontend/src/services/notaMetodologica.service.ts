import { baixarArquivo } from './http';

/** GET /api/nota-metodologica — PDF público com a metodologia geral do Atlas (Landing Page). */
export function baixarNotaMetodologica(): Promise<void> {
  return baixarArquivo('/api/nota-metodologica', {}, 'nota-metodologica-atlas-solar-justo.pdf');
}
