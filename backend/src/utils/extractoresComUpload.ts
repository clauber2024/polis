/**
 * Whitelist de bases que exigem upload de arquivo pela interface antes de
 * rodar o extractor (RF-070 revisitado, fase 2 — 31/07/2026). Diferente de
 * `extractoresElegiveis.ts` (fontes que baixam o próprio dado sozinhas):
 * estas fontes nunca tiveram — e provavelmente nunca vão ter — uma URL
 * pública estável (Reforma Casa Brasil Solar é um extrato pontual fornecido
 * pelo usuário, sem endpoint nenhum; ZEIS de São Paulo/Belo Horizonte e os
 * dois indicadores EPE exigem download manual confirmado nos próprios
 * scripts — PDGD é app Shiny sem endpoint estável, BEN não tem API REST).
 *
 * `arquivos` é a lista de arquivos esperados, NA ORDEM em que o frontend
 * deve enviá-los. Dois modos, por arquivo:
 * - `nomeArquivoDestino` (Reforma/ZEIS): grava dentro de uma pasta
 *   temporária compartilhada e aponta `BASE_DOWNLOADS` pra lá — usado
 *   quando o script já lia de uma pasta com nome de arquivo fixo.
 * - `envVarCaminhoCompleto` (EPE BEN/PDGD): grava num arquivo temporário
 *   avulso e aponta a variável de ambiente ESPECÍFICA pra ele — usado
 *   quando o script sempre teve seu próprio caminho isolado
 *   (`CAMINHO_XLSX`), sem conceito de pasta compartilhada.
 * Cada `ArquivoEsperado` define só UM dos dois — nunca os dois juntos.
 *
 * `scriptRelativo` é relativo à pasta `backend/` — mesmo critério de
 * `extractoresElegiveis.ts`.
 */
export const IDS_EXTRATORES_COM_UPLOAD = [
  'reforma_casa_brasil_solar',
  'zeis_sao_paulo',
  'zeis_belo_horizonte',
  'epe_ben_geracao',
  'epe_pdgd_geracao',
] as const;

export type IdExtratorComUpload = (typeof IDS_EXTRATORES_COM_UPLOAD)[number];

export type ArquivoEsperado =
  | { extensaoAceita: string; descricao: string; nomeArquivoDestino: string }
  | { extensaoAceita: string; descricao: string; envVarCaminhoCompleto: string };

export interface ExtractorComUpload {
  id: IdExtratorComUpload;
  rotulo: string;
  scriptRelativo: string;
  arquivos: readonly ArquivoEsperado[];
}

export const EXTRATORES_COM_UPLOAD: readonly ExtractorComUpload[] = [
  {
    id: 'reforma_casa_brasil_solar',
    rotulo: 'Reforma Casa Brasil Solar (extrato SIC/Caixa)',
    scriptRelativo: 'src/etl/loaders/extrair_reforma_casa_brasil_solar.py',
    arquivos: [
      {
        nomeArquivoDestino: 'SOLAR_REFORMA_CASA_BRASIL-SIC - solar.pdf',
        extensaoAceita: '.pdf',
        descricao: 'Extrato em PDF, modalidade solar (SIC/Caixa)',
      },
    ],
  },
  {
    id: 'zeis_sao_paulo',
    rotulo: 'ZEIS — São Paulo (GeoSampa)',
    scriptRelativo: 'src/etl/loaders/seed_zeis_sao_paulo.py',
    arquivos: [
      {
        nomeArquivoDestino: 'geoportal_pde2014_v_zeis_04_map_v2.geojson',
        extensaoAceita: '.geojson',
        descricao: 'ZEIS-1 (GeoSampa)',
      },
      {
        nomeArquivoDestino: 'geoportal_pde2014_v_zeis_04a_map_v2.geojson',
        extensaoAceita: '.geojson',
        descricao: 'ZEIS-2/3/4/5 (GeoSampa)',
      },
      {
        nomeArquivoDestino: 'geoportal_aiu_vl_zeis1.geojson',
        extensaoAceita: '.geojson',
        descricao: 'ZEIS-1 via Lei AIU-VL (GeoSampa)',
      },
    ],
  },
  {
    id: 'zeis_belo_horizonte',
    rotulo: 'ZEIS — Belo Horizonte',
    scriptRelativo: 'src/etl/loaders/seed_zeis_belo_horizonte.py',
    arquivos: [
      {
        // Nome fixo escolhido pra bater com o padrão glob que o script
        // procura (PADRAO_ARQUIVO = "*zoneamento_11181*.csv") — o script
        // aceita qualquer nome com essa data variável, este é só um dos
        // válidos.
        nomeArquivoDestino: 'upload_zoneamento_11181.csv',
        extensaoAceita: '.csv',
        descricao: 'Zoneamento (camada 11181), CSV com geometria em WKT',
      },
    ],
  },
  {
    id: 'epe_ben_geracao',
    rotulo: 'Geração Elétrica Nacional (EPE, BEN Anexo X)',
    scriptRelativo: 'src/etl/loaders/extrair_geracao_eletrica_nacional_epe.py',
    arquivos: [
      {
        envVarCaminhoCompleto: 'CAMINHO_XLSX_BEN',
        extensaoAceita: '.xlsx',
        descricao: 'BEN, Anexo X (unidades comerciais, GWh) — formato "tabela (tidyverse)"',
      },
    ],
  },
  {
    id: 'epe_pdgd_geracao',
    rotulo: 'Geração MMGD — PDGD (EPE)',
    scriptRelativo: 'src/etl/loaders/extrair_geracao_mmgd_epe_pdgd.py',
    arquivos: [
      {
        envVarCaminhoCompleto: 'CAMINHO_XLSX_PDGD',
        extensaoAceita: '.xlsx',
        descricao: 'PDGD, aba "Capacidade Instalada" → "Geração de Eletricidade"',
      },
    ],
  },
];

const POR_ID = new Map<string, ExtractorComUpload>(EXTRATORES_COM_UPLOAD.map((e) => [e.id, e]));

export function buscarExtractorComUpload(id: string): ExtractorComUpload | undefined {
  return POR_ID.get(id);
}
