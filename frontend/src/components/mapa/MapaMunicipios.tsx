import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type Map as MapaMapLibre,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollectionMunicipios } from '../../types/api';
import type { IndicadorMapa } from '../../utils/indicadores';

/**
 * Componente de mapa (MapLibre GL) — SÓ renderização (CLAUDE.md Seção 4:
 * componentes de mapa isolados de lógica de negócio). Recebe o GeoJSON, o
 * indicador ativo, as quebras de classe e a lista de municípios a destacar;
 * quem busca dado e decide metodologia é a página/services.
 *
 * Sem basemap externo de propósito: o choropleth cobre todo o território de
 * interesse (Brasil) e um fundo neutro evita dependência de servidor de tiles
 * de terceiros (custo/limite de uso/chave de API) nesta fase. Reavaliar
 * quando houver caso de uso que exija contexto (ruas, relevo).
 */

export const COR_SEM_DADO = '#e2e8f0';

const FONTE = 'municipios';
const CAMADA_PREENCHIMENTO = 'municipios-preenchimento';
const CAMADA_CONTORNO = 'municipios-contorno';
const CAMADA_DESTAQUE = 'vazios-destaque';

interface MapaMunicipiosProps {
  dados: FeatureCollectionMunicipios | null;
  indicador: IndicadorMapa;
  /** Cortes internos das 5 classes (calcularQuebrasQuantis) — mesmos da legenda. */
  quebras: number[];
  /** Códigos IBGE a destacar (quadrante Vazio de Acesso) ou null para desligar. */
  codigosDestaque: string[] | null;
  /**
   * Recebe só o codigoIbge — as properties do feature clicado NÃO são
   * confiáveis para leitura de indicadores (o MapLibre descarta valores
   * nulos na conversão interna para tile vetorial); a página resolve o
   * município completo a partir do GeoJSON original.
   */
  aoClicarMunicipio: (codigoIbge: string) => void;
}

function expressaoChoropleth(
  indicador: IndicadorMapa,
  quebras: number[],
): ExpressionSpecification {
  const degraus: (string | number)[] = [indicador.cores[0]];
  quebras.forEach((quebra, i) => {
    degraus.push(quebra, indicador.cores[i + 1]);
  });
  // 'step' exige entrada numérica — o 'case' externo desvia nulos (sem dado)
  // para a cor neutra antes de o 'step' ser avaliado.
  return [
    'case',
    ['==', ['typeof', ['get', indicador.id]], 'number'],
    ['step', ['get', indicador.id], ...degraus],
    COR_SEM_DADO,
  ] as unknown as ExpressionSpecification;
}

export function MapaMunicipios({
  dados,
  indicador,
  quebras,
  codigosDestaque,
  aoClicarMunicipio,
}: MapaMunicipiosProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaMapLibre | null>(null);
  const [mapaCarregado, setMapaCarregado] = useState(false);
  // Ref para o callback — os handlers do MapLibre são registrados uma única
  // vez; sem isso capturariam a primeira versão do closure (stale closure).
  const aoClicarRef = useRef(aoClicarMunicipio);
  aoClicarRef.current = aoClicarMunicipio;

  const corChoropleth = useMemo(
    () => (quebras.length === 4 ? expressaoChoropleth(indicador, quebras) : COR_SEM_DADO),
    [indicador, quebras],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const mapa = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          { id: 'fundo', type: 'background', paint: { 'background-color': '#f8fafc' } },
        ],
      },
      // Enquadra o Brasil inteiro (SIRGAS 2000 ≈ WGS84 para fins de web).
      bounds: [
        [-74.5, -34.5],
        [-32.0, 5.6],
      ],
      fitBoundsOptions: { padding: 16 },
      attributionControl: { customAttribution: 'Malha municipal: IBGE 2025' },
    });

    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    mapa.on('load', () => setMapaCarregado(true));

    mapa.on('click', CAMADA_PREENCHIMENTO, (evento) => {
      const codigoIbge = evento.features?.[0]?.properties?.codigoIbge;
      if (typeof codigoIbge === 'string') {
        aoClicarRef.current(codigoIbge);
      }
    });
    mapa.on('mouseenter', CAMADA_PREENCHIMENTO, () => {
      mapa.getCanvas().style.cursor = 'pointer';
    });
    mapa.on('mouseleave', CAMADA_PREENCHIMENTO, () => {
      mapa.getCanvas().style.cursor = '';
    });

    mapaRef.current = mapa;
    return () => {
      mapaRef.current = null;
      setMapaCarregado(false);
      mapa.remove();
    };
  }, []);

  // Fonte + camadas, quando o estilo terminar de carregar e o dado chegar.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !dados) return;

    const fonte = mapa.getSource(FONTE) as GeoJSONSource | undefined;
    if (fonte) {
      fonte.setData(dados as unknown as GeoJSON.GeoJSON);
      return;
    }

    mapa.addSource(FONTE, { type: 'geojson', data: dados as unknown as GeoJSON.GeoJSON });
    mapa.addLayer({
      id: CAMADA_PREENCHIMENTO,
      type: 'fill',
      source: FONTE,
      paint: { 'fill-color': corChoropleth, 'fill-opacity': 0.85 },
    });
    mapa.addLayer({
      id: CAMADA_CONTORNO,
      type: 'line',
      source: FONTE,
      paint: { 'line-color': '#ffffff', 'line-width': 0.3 },
    });
    mapa.addLayer({
      id: CAMADA_DESTAQUE,
      type: 'line',
      source: FONTE,
      filter: ['boolean', false],
      paint: { 'line-color': '#7c3aed', 'line-width': 1.4 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corChoropleth é aplicado pelo efeito abaixo nas atualizações
  }, [dados, mapaCarregado]);

  // Troca de indicador → só repinta a camada (sem recriar fonte).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !mapa.getLayer(CAMADA_PREENCHIMENTO)) return;
    mapa.setPaintProperty(CAMADA_PREENCHIMENTO, 'fill-color', corChoropleth);
  }, [corChoropleth, mapaCarregado, dados]);

  // Liga/desliga o contorno de destaque dos Vazios de Acesso.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !mapa.getLayer(CAMADA_DESTAQUE)) return;
    if (codigosDestaque && codigosDestaque.length > 0) {
      mapa.setFilter(CAMADA_DESTAQUE, [
        'in',
        ['get', 'codigoIbge'],
        ['literal', codigosDestaque],
      ] as unknown as FilterSpecification);
    } else {
      mapa.setFilter(CAMADA_DESTAQUE, ['boolean', false]);
    }
  }, [codigosDestaque, mapaCarregado, dados]);

  return <div ref={containerRef} className="h-full w-full" />;
}
