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
 * baixou o Parquet sozinho. Corrigido no mesmo dia: URL real confirmada
 * (curl -I, 200 OK) no Portal de Dados Abertos da ANEEL — dataset
 * "Relação de empreendimentos de Mini e Micro Geração Distribuída" —, e
 * `baixar_se_necessario` adicionado ao script, mesmo padrão de
 * `extrair_desempenho_conexao_mmgd.py`. De volta à whitelist.
 *
 * `scriptRelativo` é relativo à pasta `backend/` (não à raiz do
 * repositório) — a Railway sobe o backend com "Root Directory: backend"
 * (ver docs/DEPLOY_TEMPORARIO.md), então dentro do container não existe
 * nível acima de backend/. Ao rodar localmente na raiz do repo
 * (`python3 backend/src/etl/loaders/<script>.py`, como documentado no
 * README), é só prefixar com "backend/" — nunca um caminho vindo de input
 * do usuário.
 *
 * `irradiacao_solar_inpe` adicionada em 31/07/2026 — o docstring do script
 * dizia "Download direto, não há API" (verdade, mas irrelevante: o site do
 * LABREN é estático, o link do ZIP não muda) — URL confirmada ao vivo
 * (curl -IL, 200 OK após redirect http->https), extração do CSV de dentro
 * do ZIP feita com `zipfile` da stdlib (sem dependência nova).
 *
 * `renda_trabalho_rais` e `capital_humano_mortalidade_infantil` adicionadas
 * em 31/07/2026 — usam BigQuery, que dentro deste container SÓ autentica se
 * `GOOGLE_APPLICATION_CREDENTIALS_JSON` estiver configurada (Service
 * Account, ver `_autenticacao_bigquery.py` e docs/DEPLOY_TEMPORARIO.md,
 * Seção 10) — sem isso, o botão dispara e falha de forma visível no log
 * (erro de autenticação do Google), não é um pré-requisito manual
 * INTERATIVO como o antigo fluxo `gcloud auth` (que nunca funcionaria aqui).
 */
export const IDS_EXTRATORES_ELEGIVEIS = [
  'mmgd_aneel',
  'tarifa_distribuidoras',
  'desempenho_conexao_distribuidoras',
  'irradiacao_solar_inpe',
  'renda_trabalho_rais',
  'capital_humano_mortalidade_infantil',
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
  {
    id: 'irradiacao_solar_inpe',
    rotulo: 'Irradiação Solar (LABREN/CCST/INPE)',
    scriptRelativo: 'src/etl/loaders/extrair_irradiacao_solar_inpe.py',
  },
  {
    id: 'renda_trabalho_rais',
    rotulo: 'Renda e Trabalho — RAIS (BigQuery)',
    scriptRelativo: 'src/etl/loaders/extrair_renda_trabalho_rais.py',
  },
  {
    id: 'capital_humano_mortalidade_infantil',
    rotulo: 'Mortalidade Infantil — SIM/SINASC (BigQuery)',
    scriptRelativo: 'src/etl/loaders/extrair_capital_humano_mortalidade_infantil.py',
  },
];

const POR_ID = new Map<string, ExtractorElegivel>(EXTRACTORES_ELEGIVEIS.map((e) => [e.id, e]));

export function buscarExtractorElegivel(id: string): ExtractorElegivel | undefined {
  return POR_ID.get(id);
}
