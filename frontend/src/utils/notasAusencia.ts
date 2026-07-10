import type { MunicipioComIndicadores } from '../types/api';

/**
 * Catálogo de ausências JUSTIFICADAS de dado, exibidas no painel do município
 * (RF-025). Regra: só entra aqui ausência documentada e confirmada — nas
 * docstrings dos extractors ou em ARQUITETURA.md. Um "—" sem nota significa
 * lacuna sem explicação conhecida (e aí é investigação, não nota).
 *
 * Isso é metadado de APRESENTAÇÃO (por que a fonte não cobre), não
 * metodologia de cálculo — por isso pode viver no frontend, como o catálogo
 * de indicadores (utils/indicadores.ts). Se o backend um dia servir essas
 * notas (ex.: junto de /api/bases-de-dados), migrar para lá.
 */

/** Campos numéricos de indicador do contrato do município. */
type CampoNumerico = {
  [K in keyof MunicipioComIndicadores]: MunicipioComIndicadores[K] extends number | null
    ? K
    : never;
}[keyof MunicipioComIndicadores];

/**
 * Nota geral do município, exibida no topo do painel. Casos especiais da
 * base territorial — ver docstring de extrair_irradiacao_solar_inpe.py.
 */
export const NOTAS_MUNICIPIO: Record<string, string> = {
  // Instalado em 01/01/2025, desmembrado de Sorriso e Nova Ubiratã (STF,
  // out/2023). Fontes anteriores à instalação não têm como cobri-lo.
  '5101837':
    'Município instalado em 01/01/2025 (desmembrado de Sorriso e Nova Ubiratã). ' +
    'Fontes anteriores a 2025 — Censo 2022, Atlas Solar 2017 (INPE), entre outras — ' +
    'não o cobrem: indicadores dessas fontes ficam sem dado.',
  '2605459':
    'Fernando de Noronha é distrito estadual (arquipélago), não município comum — ' +
    'várias fontes de indicadores municipais não o cobrem.',
  '4300001':
    'Registro de "Área Operacional" de corpo d\'água na malha do IBGE — ' +
    'não é município; fontes de indicadores não o cobrem.',
  '4300002':
    'Registro de "Área Operacional" de corpo d\'água na malha do IBGE — ' +
    'não é município; fontes de indicadores não o cobrem.',
};

/**
 * Municípios genuinamente ausentes do Atlas Solar 2017 (INPE) — os 4 casos
 * documentados no extractor (join por nome+estado, sem correspondência).
 */
const SEM_IRRADIACAO_INPE = new Set(['2605459', '4300001', '4300002', '5101837']);

const CAMPOS_MMGD_RESIDENCIAL: ReadonlySet<CampoNumerico> = new Set([
  'potenciaResidencialKw',
  'numeroUcsResidencial',
  'mmgdResidencialPer1000Hab',
] as CampoNumerico[]);

/**
 * Justificativa para um campo nulo deste município, ou null se a ausência
 * não tem explicação documentada. Chamar só quando o valor é null.
 */
export function notaAusencia(
  campo: CampoNumerico,
  municipio: MunicipioComIndicadores,
): string | null {
  // Bloqueio externo, vale para TODOS os municípios: aguardando dado da ANEEL
  // com a nova subclasse "Residencial Desconto Social" (ver ARQUITETURA.md).
  if (campo === 'percentualTarifaSocial') {
    return 'Indicador aguardando publicação da ANEEL (dados de jan/2026 em diante, com a nova subclasse "Residencial Desconto Social").';
  }

  if (campo === 'irradiacaoMediaKwhM2Dia' && SEM_IRRADIACAO_INPE.has(municipio.codigoIbge)) {
    return 'Ausente do Atlas Brasileiro de Energia Solar 2017 (LABREN/CCST/INPE), fonte deste indicador.';
  }

  // Quebra residencial nula com MMGD total presente = snapshot de MMGD
  // anterior à migration 0020 (re-extração pendente — mesmo aviso que a API
  // de Vazios de Acesso expõe em avisos.totalPrecisaReextrairMmgd).
  if (CAMPOS_MMGD_RESIDENCIAL.has(campo) && municipio.potenciaInstaladaKw !== null) {
    return 'Quebra por classe residencial ainda não disponível para este município (snapshot de MMGD anterior à re-extração — pendente).';
  }

  return null;
}

export type { CampoNumerico };
