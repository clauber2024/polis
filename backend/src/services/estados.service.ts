/**
 * SERVICE: Contornos estaduais (GeoJSON) — camada de referência visual do mapa
 * ============================================================================
 * Pedido do usuário (14/07/2026): o choropleth nacional fica mais legível com
 * o limite dos estados desenhado por cima. Não existe malha estadual dedicada
 * no banco (nem precisa): o contorno de cada UF é derivado por ST_Union das
 * geometrias municipais já carregadas (seed_municipios.py, simplificadas a
 * ~10 m). SEM simplificação adicional de propósito — o resultado do union
 * casa EXATAMENTE com as divisas municipais desenhadas por baixo no MapLibre;
 * simplificar de novo criaria contornos "descolados" das divisas em zoom alto.
 *
 * Custo: o ST_Union nacional é caro (segundos), mas o resultado é estável
 * enquanto a malha municipal não mudar — por isso o cache em memória de
 * processo (calculado na primeira requisição, reutilizado nas demais).
 * Se um dia a malha municipal for re-seedada com o backend no ar, reiniciar
 * o processo para invalidar o cache.
 * ============================================================================
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

interface EstadoFeature {
  type: 'Feature';
  geometry: unknown;
  properties: {
    uf: string;
    nomeEstado: string;
    regiao: string;
    /**
     * Ponto GARANTIDAMENTE dentro do polígono (ST_PointOnSurface) — usado
     * pelo frontend para o rótulo da UF. Antes disso, o rótulo usava o
     * centro do bounding box (client-side), que caía no meio do Atlântico
     * para o Espírito Santo (Ilha da Trindade, ~1.140 km da costa, parte
     * oficial do território de Vitória) — ver docs/DECISOES.md, 21/07/2026.
     */
    pontoRotulo: [number, number] | null;
  };
}

export interface EstadosGeoJson {
  type: 'FeatureCollection';
  features: EstadoFeature[];
}

let cache: EstadosGeoJson | null = null;
let emAndamento: Promise<EstadosGeoJson> | null = null;

async function calcularEstadosGeoJson(): Promise<EstadosGeoJson> {
  // ST_MakeValid antes do union: a malha municipal foi simplificada no seed
  // (~10 m) e simplificação pode gerar polígonos tecnicamente inválidos
  // (self-intersection) — ST_Union puro aborta com TopologyException nesses
  // casos. ST_MakeValid conserta sem mudar o traçado visível.
  // CTE calcula o union UMA vez só — ST_PointOnSurface roda em cima do
  // resultado já unido, não recalcula o ST_Union (que já é caro sozinho).
  const resultado = await db.execute(sql`
    WITH uniao AS (
      SELECT
        uf,
        MIN(nome_estado) AS nome_estado,
        MIN(regiao)      AS regiao,
        ST_Union(ST_MakeValid(geom)) AS geom_uniao
      FROM municipios
      GROUP BY uf
    )
    SELECT
      uf,
      nome_estado,
      regiao,
      ST_AsGeoJSON(geom_uniao, 6) AS geometria,
      ST_AsGeoJSON(ST_PointOnSurface(geom_uniao), 6) AS ponto_rotulo
    FROM uniao
    ORDER BY uf;
  `);

  const features: EstadoFeature[] = resultado.rows.map((linha) => {
    const { uf, nome_estado, regiao, geometria, ponto_rotulo } = linha as {
      uf: string;
      nome_estado: string;
      regiao: string;
      geometria: string;
      ponto_rotulo: string | null;
    };
    const pontoRotulo = ponto_rotulo
      ? (JSON.parse(ponto_rotulo) as { coordinates: [number, number] }).coordinates
      : null;
    return {
      type: 'Feature',
      geometry: JSON.parse(geometria) as unknown,
      properties: { uf, nomeEstado: nome_estado, regiao, pontoRotulo },
    };
  });

  return { type: 'FeatureCollection', features };
}

export function buscarEstadosGeoJson(): Promise<EstadosGeoJson> {
  if (cache) return Promise.resolve(cache);
  // Deduplica requisições concorrentes durante o primeiro cálculo (caro).
  if (!emAndamento) {
    emAndamento = calcularEstadosGeoJson()
      .then((resultado) => {
        cache = resultado;
        return resultado;
      })
      .finally(() => {
        emAndamento = null;
      });
  }
  return emAndamento;
}
