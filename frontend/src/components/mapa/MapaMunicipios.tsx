import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type HeatmapLayerSpecification,
  type Map as MapaMapLibre,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollectionMunicipios } from '../../types/api';
import { bboxDaGeometria } from '../../utils/geometria';
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

/**
 * Fundo do choropleth quando o modo heatmap (RF-057) está ativo: as cores do
 * indicador dariam mistura ilegível com a rampa do heatmap, então o
 * preenchimento inteiro esmaece para um neutro mais claro que COR_SEM_DADO
 * (decisão de design da sessão de 09/07/2026 — modo EXCLUSIVO, não
 * sobreposição).
 */
const COR_FUNDO_MODO_HEATMAP = '#eef2f7';

/**
 * Rampa do heatmap (transparente → violeta escuro) — mesma família do
 * violeta que já identifica "Vazio de Acesso" no destaque e nos badges
 * (#7c3aed), para manter a identidade visual do conceito.
 */
export const RAMPA_HEATMAP: [number, string][] = [
  [0, 'rgba(124, 58, 237, 0)'],
  [0.15, '#ede9fe'],
  [0.4, '#c4b5fd'],
  [0.65, '#8b5cf6'],
  [1, '#5b21b6'],
];

const FONTE = 'municipios';
const FONTE_HEATMAP = 'vazios-heatmap';
const CAMADA_PREENCHIMENTO = 'municipios-preenchimento';
const CAMADA_CONTORNO = 'municipios-contorno';
const CAMADA_DESTAQUE = 'vazios-destaque';
const CAMADA_HEATMAP = 'vazios-heatmap';

/** Pontos do heatmap (RF-057): centro do município + peso 0–1 (IVS normalizado). */
export type PontosHeatmap = GeoJSON.FeatureCollection<GeoJSON.Point, { peso: number }>;

/**
 * Comando de enquadramento (busca de município, RF-026). Objeto em vez de
 * string de propósito: repetir a mesma busca cria um objeto novo e re-dispara
 * o efeito de voo mesmo com codigoIbge igual.
 */
export interface FocoMunicipio {
  codigoIbge: string;
}

interface MapaMunicipiosProps {
  dados: FeatureCollectionMunicipios | null;
  indicador: IndicadorMapa;
  /** Cortes internos das 5 classes (calcularQuebrasQuantis) — mesmos da legenda. */
  quebras: number[];
  /** Códigos IBGE a destacar (quadrante Vazio de Acesso) ou null para desligar. */
  codigosDestaque: string[] | null;
  /**
   * Pontos do heatmap de Vazios de Acesso (RF-057) ou null para desligar.
   * Não-nulo também ESMAECE o choropleth (modo exclusivo). Quem monta os
   * pontos e calcula os pesos é a página — aqui só renderização.
   */
  pontosHeatmap: PontosHeatmap | null;
  /** Município a enquadrar (fitBounds) ou null. Ver FocoMunicipio. */
  foco: FocoMunicipio | null;
  /**
   * Códigos IBGE visíveis no filtro do Dashboard Público (RF-046) ou null
   * quando nenhum filtro está ativo (mostra todos). Municípios fora da lista
   * somem do preenchimento E do contorno — "filtro" aqui é literal, não
   * esmaecimento (diferente do modo heatmap, que só troca a cor de fundo).
   */
  codigosVisiveis: string[] | null;
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
  pontosHeatmap,
  foco,
  codigosVisiveis,
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
      // Cinza neutro translúcido em vez de branco puro: branco somia nas
      // classes mais claras do choropleth (primeiro quintil é quase branco)
      // e o cinza mantém a divisa legível em qualquer classe sem pesar nas
      // escuras. Ajuste feito após validação visual de 09/07/2026.
      paint: { 'line-color': '#64748b', 'line-width': 0.3, 'line-opacity': 0.4 },
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

  // Troca de indicador → só repinta a camada (sem recriar fonte). No modo
  // heatmap (RF-057) o choropleth esmaece para o fundo neutro — modo
  // exclusivo, ver COR_FUNDO_MODO_HEATMAP.
  const modoHeatmap = pontosHeatmap !== null;
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !mapa.getLayer(CAMADA_PREENCHIMENTO)) return;
    mapa.setPaintProperty(
      CAMADA_PREENCHIMENTO,
      'fill-color',
      modoHeatmap ? COR_FUNDO_MODO_HEATMAP : corChoropleth,
    );
  }, [corChoropleth, modoHeatmap, mapaCarregado, dados]);

  // Liga/desliga/atualiza a camada heatmap (RF-057). Fonte e camada são
  // criadas de forma lazy no primeiro uso; desligar só esconde (visibility),
  // não destrói — religar é instantâneo.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado) return;

    const fonte = mapa.getSource(FONTE_HEATMAP) as GeoJSONSource | undefined;
    if (!pontosHeatmap) {
      if (fonte && mapa.getLayer(CAMADA_HEATMAP)) {
        mapa.setLayoutProperty(CAMADA_HEATMAP, 'visibility', 'none');
      }
      return;
    }

    if (fonte) {
      fonte.setData(pontosHeatmap as GeoJSON.GeoJSON);
      mapa.setLayoutProperty(CAMADA_HEATMAP, 'visibility', 'visible');
      return;
    }

    mapa.addSource(FONTE_HEATMAP, {
      type: 'geojson',
      data: pontosHeatmap as GeoJSON.GeoJSON,
    });
    mapa.addLayer({
      id: CAMADA_HEATMAP,
      type: 'heatmap',
      source: FONTE_HEATMAP,
      paint: {
        // Peso 0–1 já vem calculado da página (IVS normalizado, RF-056 como
        // critério de intensidade — decisão da sessão de 09/07/2026).
        'heatmap-weight': ['get', 'peso'],
        // Intensidade/raio crescem com o zoom para o kernel não "sumir" ao
        // aproximar (padrão recomendado na doc do MapLibre para heatmaps).
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 7, 2],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 14, 6, 36, 9, 90],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          ...RAMPA_HEATMAP.flat(),
        ],
        'heatmap-opacity': 0.8,
      } as unknown as HeatmapLayerSpecification['paint'],
    });
  }, [pontosHeatmap, mapaCarregado]);

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

  // Filtro do Dashboard Público (RF-046) — esconde (não esmaece) municípios
  // fora da faixa/estado/região selecionados, no preenchimento E no contorno.
  // Independente do destaque de Vazios de Acesso (camada separada,
  // CAMADA_DESTAQUE) e do heatmap — filtrar o choropleth não afeta essas
  // outras camadas de propósito (fora do escopo do RF-046).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado) return;
    if (!mapa.getLayer(CAMADA_PREENCHIMENTO) || !mapa.getLayer(CAMADA_CONTORNO)) return;

    const filtro =
      codigosVisiveis !== null
        ? (['in', ['get', 'codigoIbge'], ['literal', codigosVisiveis]] as unknown as FilterSpecification)
        : null;
    mapa.setFilter(CAMADA_PREENCHIMENTO, filtro);
    mapa.setFilter(CAMADA_CONTORNO, filtro);
  }, [codigosVisiveis, mapaCarregado, dados]);

  // Voa até o município buscado (RF-026). fitBounds em vez de flyTo com zoom
  // fixo: municípios variam de ~3 km² a ~150.000 km² (Altamira/PA), zoom fixo
  // cortaria os grandes ou afogaria os pequenos.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !dados || !foco) return;
    const feature = dados.features.find((f) => f.properties.codigoIbge === foco.codigoIbge);
    if (!feature?.geometry) return;
    const bbox = bboxDaGeometria(feature.geometry);
    if (!bbox) return;
    mapa.fitBounds(bbox, { padding: 80, maxZoom: 10, duration: 1400 });
  }, [foco, mapaCarregado, dados]);

  return <div ref={containerRef} className="h-full w-full" />;
}
