/**
 * Operações geométricas mínimas do frontend — sem turf/etc. de propósito
 * (mesma decisão do bbox da busca RF-026: são as únicas operações
 * geométricas necessárias e não justificam dependência nova).
 */

/**
 * Área aproximada (fórmula do shoelace, em graus² — só serve para comparar
 * tamanho relativo entre anéis, não é área real em km²) do anel externo de
 * um polígono GeoJSON.
 */
function areaAproximada(anelExterno: GeoJSON.Position[]): number {
  let area = 0;
  for (let i = 0; i < anelExterno.length - 1; i++) {
    const [x1, y1] = anelExterno[i];
    const [x2, y2] = anelExterno[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/**
 * Para MultiPolygon, isola só o MAIOR polígono por área — evita que uma
 * porção minúscula e muito distante do resto do território puxe bbox/centro
 * para longe (bug real, 21/07/2026: Vitória/ES inclui oficialmente a Ilha da
 * Trindade, ~1.140 km da costa; o bbox de Vitória — e por consequência o da
 * UNIÃO do Espírito Santo em `/api/estados` — ia até o meio do Atlântico,
 * jogando o rótulo do estado e o `fitBounds` de zoom para longe do
 * território relevante). Não é uma exceção hardcoded para Vitória/Trindade —
 * qualquer MultiPolygon com uma parte residual muito menor que a principal
 * se beneficia da mesma correção. Polygon simples (1 anel) não é afetado.
 */
function isolarMaiorPoligono(geometria: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometria.type !== 'MultiPolygon' || geometria.coordinates.length <= 1) {
    return geometria;
  }
  let maior = geometria.coordinates[0];
  let maiorArea = areaAproximada(maior[0] ?? []);
  for (const poligono of geometria.coordinates.slice(1)) {
    const area = areaAproximada(poligono[0] ?? []);
    if (area > maiorArea) {
      maiorArea = area;
      maior = poligono;
    }
  }
  return { type: 'Polygon', coordinates: maior };
}

/**
 * Bounding box [[oeste, sul], [leste, norte]] de uma geometria GeoJSON,
 * varrendo as coordenadas recursivamente (municípios são MultiPolygon).
 * Movida de MapaMunicipios.tsx para cá em 09/07/2026 (RF-057), quando a
 * PaginaMapa também passou a precisar de geometria (centro dos municípios
 * para os pontos do heatmap). Isola o maior polígono antes de varrer — ver
 * `isolarMaiorPoligono`.
 */
export function bboxDaGeometria(
  geometria: GeoJSON.Geometry,
): [[number, number], [number, number]] | null {
  const alvo = isolarMaiorPoligono(geometria);
  if (!('coordinates' in alvo)) return null;
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
  visitar(alvo.coordinates);
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
