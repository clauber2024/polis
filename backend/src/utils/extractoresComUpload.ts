/**
 * Whitelist de bases que exigem upload de arquivo pela interface antes de
 * rodar o extractor (RF-070 revisitado, fase 2 — 31/07/2026). Diferente de
 * `extractoresElegiveis.ts` (fontes que baixam o próprio dado sozinhas):
 * estas 3 nunca tiveram — e provavelmente nunca vão ter — uma URL pública
 * estável (Reforma Casa Brasil Solar é um extrato pontual fornecido pelo
 * usuário, sem endpoint nenhum; ZEIS de São Paulo/Belo Horizonte exigem
 * download manual confirmado nos próprios scripts).
 *
 * `arquivos` é a lista de arquivos esperados, NA ORDEM em que o frontend
 * deve enviá-los — cada um definindo o nome EXATO que o script espera
 * encontrar dentro de `BASE_DOWNLOADS` (variável de ambiente que os 3
 * scripts passaram a aceitar em 31/07/2026, antes hardcoded para o caminho
 * local do Windows de quem desenvolveu o projeto).
 *
 * `scriptRelativo` é relativo à pasta `backend/` — mesmo critério de
 * `extractoresElegiveis.ts`.
 */
export const IDS_EXTRATORES_COM_UPLOAD = [
  'reforma_casa_brasil_solar',
  'zeis_sao_paulo',
  'zeis_belo_horizonte',
] as const;

export type IdExtratorComUpload = (typeof IDS_EXTRATORES_COM_UPLOAD)[number];

export interface ArquivoEsperado {
  nomeArquivoDestino: string;
  extensaoAceita: string;
  descricao: string;
}

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
];

const POR_ID = new Map<string, ExtractorComUpload>(EXTRATORES_COM_UPLOAD.map((e) => [e.id, e]));

export function buscarExtractorComUpload(id: string): ExtractorComUpload | undefined {
  return POR_ID.get(id);
}
