/**
 * Whitelist de bases que podem ser atualizadas disparando o extractor Python
 * pela interface (RF-070 revisitado, 30/07/2026 — ver docs/DECISOES.md).
 *
 * SÓ entram aqui fontes CONFIRMADAS como 100% automáticas — baixam o próprio
 * dado (requests/API pública) sem nenhum pré-requisito manual (autenticação
 * gcloud interativa, CSV/PDF/Parquet baixado manualmente antes, etc.). As
 * demais fontes do Atlas continuam exigindo execução manual no terminal —
 * não adicionar aqui sem reconfirmar a fonte individualmente (o container do
 * backend só tem as dependências de `requirements-runtime.txt`, não
 * geopandas/BigQuery).
 *
 * CRITÉRIO DE CONFIRMAÇÃO (revisado 31/07/2026 — MMGD foi incluído por
 * engano na primeira versão desta whitelist, ver histórico do commit
 * f992db7): não basta o script NÃO mencionar "manual"/"gcloud" — é preciso
 * checar se ele tem, de fato, uma função de download (`requests.get`) do
 * PRÓPRIO dado, versus só ler um arquivo local que se assume já existir
 * (`CAMINHO_PARQUET`/`CAMINHO_LOCAL` sem lógica de `baixar_se_necessario`).
 * `extrair_mmgd_aneel.py` falhou em produção justamente por isso — nunca
 * baixou o Parquet sozinho, sempre exigiu o arquivo já estar em
 * `backend/src/etl/data/raw/` (não versionado). Removido da whitelist até
 * confirmar uma URL de download estável da ANEEL pra esse dataset
 * especificamente (nenhuma foi verificada ainda — não adivinhar).
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
