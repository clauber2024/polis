/**
 * Operações geométricas mínimas do frontend — sem turf/etc. de propósito
 * (mesma decisão do bbox da busca RF-026: são as únicas operações
 * geométricas necessárias e não justificam dependência nova).
 */

/**
 * Bounding box [[oeste, sul], [leste, norte]] de uma geometria GeoJSON,
 * varrendo as coordenadas recursivamente (municípios são MultiPolygon).
 * Movida de MapaMunicipios.tsx para cá em 09/07/2026 (RF-057), quando a
 * PaginaMapa também passou a precisar de geometria (centro dos municípios
 * para os pontos do heatmap).
 */
export function bboxDaGeometria(
  geometria: GeoJSON.Geometry,
): [[number, number], [number, number]] | null {
  if (!('coordinates' in geometria)) return null;
  let oeste = Infinity;
  let sul = Infinity;
  let leste = -Infinity;
  let norte = -Infinity;
  const visitar = (no: unknown): void => {
    if (!Array.isArray(no)) return;
    if (typeof no[0] === 'number' && typeof no[1] === 'number') {
      const [lng, lat] = no as [number, number];
      if (lng < oeste) oeste = lng;
      if (lng > leste) leste = lng;
      if (lat < sul) sul = lat;
      if (lat > norte) norte = lat;
      return;
    }
    no.forEach(visitar);
  };
  visitar(geometria.coordinates);
  if (!Number.isFinite(oeste) || !Number.isFinite(sul)) return null;
  return [
    [oeste, sul],
    [leste, norte],
  ];
}

/**
 * Centro do bounding box de uma geometria — NÃO é o centroide verdadeiro
 * (municípios côncavos/arquipélagos podem ter o centro do bbox fora do
 * polígono), mas para densidade kernel (heatmap, RF-057) a diferença é
 * irrelevante: o kernel espalha a contribuição por dezenas de km ao redor
 * do ponto. Se um dia for preciso um ponto GARANTIDAMENTE dentro do
 * polígono (ex: rótulo), calcular no backend com ST_PointOnSurface.
 */
export function centroDaGeometria(geometria: GeoJSON.Geometry): [number, number] | null {
  const bbox = bboxDaGeometria(geometria);
  if (!bbox) return null;
  return [(bbox[0][0] + bbox[1][0]) / 2, (bbox[0][1] + bbox[1][1]) / 2];
}
