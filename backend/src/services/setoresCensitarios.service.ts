/**
 * SERVICE: Drill-down de setores censitários (RF-043, RF-045)
 * ============================================================================
 * RF-043: "botão 'Ver detalhamento interno' para municípios com dado
 * sub-municipal disponível, abrindo ranking drill-down das sub-regiões".
 * RF-045: "simular, exclusivamente para fins de prototipagem, um cenário
 * piloto de dado sub-municipal para São Paulo (SP), em granularidade de
 * setor censitário, sinalizado com texto... 'Cenário ilustrativo'".
 *
 * Hoje, SÓ São Paulo tem setores censitários (seed sintético da migration
 * 0021 — ver comentário completo lá). Qualquer outro município retorna
 * `setores: []`/`temGranularidadeFina: false` — não é erro, é o estado
 * normal enquanto a granularidade fina real da ANEEL não é liberada (ver
 * RF-072, CLAUDE.md).
 * ============================================================================
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { buscarMunicipioPorCodigoIbge } from './municipios.service.js';

export interface SetorCensitario {
  id: string;
  nomeExibicao: string;
  areaKm2: number | null;
  potenciaInstaladaKw: number | null;
  potenciaResidencialKw: number | null;
  numeroUcsComMmgd: number | null;
  numeroUcsResidencial: number | null;
  eDadoIlustrativo: boolean;
  periodoReferencia: string | null;
}

export interface SetoresCensitariosResultado {
  codigoIbge: string;
  nomeMunicipio: string;
  temGranularidadeFina: boolean;
  avisoIlustrativo: string | null;
  setores: SetorCensitario[];
}

const AVISO_ILUSTRATIVO_RF045 =
  'Cenário ilustrativo — dado piloto aguardando granularidade real da ANEEL. Distribuição ' +
  'sintética entre setores censitários, calculada proporcionalmente por área a partir do ' +
  'dado municipal real; não reflete a localização efetiva da MMGD dentro do município.';

interface LinhaSetorBruta {
  id: string;
  nomeExibicao: string;
  areaKm2: number | null;
  potenciaInstaladaKw: number | null;
  potenciaResidencialKw: number | null;
  numeroUcsComMmgd: number | null;
  numeroUcsResidencial: number | null;
  eDadoIlustrativo: string | null;
  periodoReferencia: string | null;
}

/**
 * RF-025/RF-043/RF-045: lança AppError(404) (via buscarMunicipioPorCodigoIbge,
 * reaproveitado de municipios.service.ts) se o código IBGE não existir.
 * Município existente sem setores cadastrados NÃO é erro — retorna array
 * vazio, é o caso normal para ~5.572 dos ~5.573 municípios hoje.
 */
export async function buscarSetoresCensitarios(
  codigoIbge: string,
): Promise<SetoresCensitariosResultado> {
  const municipio = await buscarMunicipioPorCodigoIbge(codigoIbge);

  const resultado = await db.execute(sql`
    WITH mmgd_latest AS (
      SELECT DISTINCT ON (unidade_espacial_id)
        unidade_espacial_id, potencia_instalada_kw, numero_ucs_com_mmgd,
        potencia_residencial_kw, numero_ucs_residencial, periodo_referencia,
        e_dado_ilustrativo
      FROM mmgd_indicadores
      ORDER BY unidade_espacial_id, periodo_referencia DESC
    )
    SELECT
      ue.id                              AS "id",
      ue.nome_exibicao                   AS "nomeExibicao",
      ue.area_km2                        AS "areaKm2",
      mmgd.potencia_instalada_kw         AS "potenciaInstaladaKw",
      mmgd.potencia_residencial_kw       AS "potenciaResidencialKw",
      mmgd.numero_ucs_com_mmgd           AS "numeroUcsComMmgd",
      mmgd.numero_ucs_residencial        AS "numeroUcsResidencial",
      mmgd.e_dado_ilustrativo            AS "eDadoIlustrativo",
      mmgd.periodo_referencia            AS "periodoReferencia"
    FROM unidades_espaciais ue
    LEFT JOIN mmgd_latest mmgd ON mmgd.unidade_espacial_id = ue.id
    WHERE ue.municipio_pai_codigo_ibge = ${codigoIbge} AND ue.tipo = 'setor_censitario'
    ORDER BY ue.id;
  `);

  const linhas = resultado.rows as unknown as LinhaSetorBruta[];

  const setores: SetorCensitario[] = linhas.map((linha) => ({
    id: linha.id,
    nomeExibicao: linha.nomeExibicao,
    areaKm2: linha.areaKm2,
    potenciaInstaladaKw: linha.potenciaInstaladaKw,
    potenciaResidencialKw: linha.potenciaResidencialKw,
    numeroUcsComMmgd: linha.numeroUcsComMmgd,
    numeroUcsResidencial: linha.numeroUcsResidencial,
    eDadoIlustrativo: linha.eDadoIlustrativo === 'true',
    periodoReferencia: linha.periodoReferencia,
  }));

  const temAlgumIlustrativo = setores.some((setor) => setor.eDadoIlustrativo);

  return {
    codigoIbge: municipio.codigoIbge,
    nomeMunicipio: municipio.nome,
    temGranularidadeFina: setores.length > 0,
    avisoIlustrativo: temAlgumIlustrativo ? AVISO_ILUSTRATIVO_RF045 : null,
    setores,
  };
}
