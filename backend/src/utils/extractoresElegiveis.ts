/**
 * Whitelist de bases que podem ser atualizadas disparando o extractor Python
 * pela interface (RF-070 revisitado, 30/07/2026 — ver docs/DECISOES.md).
 *
 * SÓ entram aqui fontes CONFIRMADAS como 100% automáticas — baixam o próprio
 * dado (requests/API pública) sem nenhum pré-requisito manual (autenticação
 * gcloud interativa, CSV/PDF baixado manualmente antes, etc.). Confirmado
 * lendo cada extractor de `backend/src/etl/loaders/` nesta sessão. As demais
 * fontes do Atlas continuam exigindo execução manual no terminal — não
 * adicionar aqui sem reconfirmar a fonte individualmente (o container do
 * backend só tem as dependências de `requirements-runtime.txt`, não
 * geopandas/BigQuery).
 *
 * `scriptRelativo` é relativo à pasta `backend/` (não à raiz do
 * repositório) — a Railway sobe o backend com "Root Directory: backend"
 * (ver docs/DEPLOY_TEMPORARIO.md), então dentro do container não existe
 * nível acima de backend/. Ao rodar localmente na raiz do repo
 * (`python3 backend/src/etl/loaders/<script>.py`, como documentado no
 * README), é só prefixar com "backend/" — nunca um caminho vindo de input
 * do usuário.
 */
export const IDS_EXTRATORES_ELEGIVEIS = [
  'mmgd_aneel',
  'tarifa_distribuidoras',
  'desempenho_conexao_distribuidoras',
] as const;

export type IdExtratorElegivel = (typeof IDS_EXTRATORES_ELEGIVEIS)[number];

export interface ExtractorElegivel {
  id: IdExtratorElegivel;
  rotulo: string;
  scriptRelativo: string;
}

export const EXTRACTORES_ELEGIVEIS: readonly ExtractorElegivel[] = [
  {
    id: 'mmgd_aneel',
    rotulo: 'MMGD (ANEEL)',
    scriptRelativo: 'src/etl/loaders/extrair_mmgd_aneel.py',
  },
  {
    id: 'tarifa_distribuidoras',
    rotulo: 'Tarifa Residencial (ANEEL)',
    scriptRelativo: 'src/etl/loaders/extrair_tarifa_distribuidoras.py',
  },
  {
    id: 'desempenho_conexao_distribuidoras',
    rotulo: 'Ranking de Distribuidoras — Conexão MMGD (ANEEL)',
    scriptRelativo: 'src/etl/loaders/extrair_desempenho_conexao_mmgd.py',
  },
];

const POR_ID = new Map<string, ExtractorElegivel>(EXTRACTORES_ELEGIVEIS.map((e) => [e.id, e]));

export function buscarExtractorElegivel(id: string): ExtractorElegivel | undefined {
  return POR_ID.get(id);
}
