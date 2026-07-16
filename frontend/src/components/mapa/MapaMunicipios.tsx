import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type HeatmapLayerSpecification,
  type Map as MapaMapLibre,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  EstadosGeoJson,
  FeatureCollectionMunicipios,
  MunicipioComIndicadores,
} from '../../types/api';
import { bboxDaGeometria, centroDaGeometria } from '../../utils/geometria';
import type { IndicadorMapa } from '../../utils/indicadores';
import { formatarValor } from '../../utils/formatadores';

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
const FONTE_ESTADOS = 'estados';
const FONTE_ROTULOS = 'municipios-rotulos';
const CAMADA_PREENCHIMENTO = 'municipios-preenchimento';
const CAMADA_CONTORNO = 'municipios-contorno';
const CAMADA_DESTAQUE = 'vazios-destaque';
const CAMADA_HEATMAP = 'vazios-heatmap';
const CAMADA_ESTADOS = 'estados-contorno';
const CAMADA_ESTADOS_FILL = 'estados-fill';
const CAMADA_ESTADO_DESTACADO = 'estado-destacado';
const CAMADA_MUNICIPIO_DESTACADO = 'municipio-destacado';
const FONTE_ROTULOS_ESTADOS = 'estados-rotulos';
const CAMADA_ROTULOS_ESTADOS = 'estados-rotulos';
const CAMADA_ROTULOS = 'municipios-rotulos';

/**
 * Servidor de glyphs (fontes PBF) para os rótulos de município — texto em
 * symbol layer EXIGE um endpoint de glyphs, que nosso estilo minimalista não
 * tinha. Endpoint público mantido pela própria MapLibre; mesma classe de
 * dependência externa leve das Google Fonts já usadas no index.css (a decisão
 * de "sem basemap externo" é sobre TILES de mapa, não sobre fontes). Se o
 * endpoint falhar, os rótulos não aparecem mas o mapa funciona normalmente.
 * Alternativa futura sem dependência: gerar os PBFs e servir do backend.
 */
const URL_GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

/** Zoom a partir do qual os rótulos de município começam a aparecer. */
const ZOOM_MINIMO_ROTULOS = 6;

/**
 * Zoom que separa "selecionar estado" de "selecionar município":
 * - zoom < ZOOM_CLIQUE_ESTADO: clicar no mapa seleciona a UF (RF-027)
 * - zoom ≥ ZOOM_CLIQUE_ESTADO: clicar seleciona o município
 * Alinhado com ZOOM_MINIMO_ROTULOS — quando os nomes dos municípios entram,
 * faz sentido clicar em município; quando só os nomes dos estados aparecem,
 * faz sentido clicar em estado.
 */
const ZOOM_CLIQUE_ESTADO = ZOOM_MINIMO_ROTULOS;

/**
 * Zoom até o qual os rótulos de ESTADO aparecem — complementar ao dos
 * municípios: visão ampla mostra nomes de estados, aproximou o suficiente
 * eles saem e entram os nomes de municípios.
 */
const ZOOM_MAXIMO_ROTULOS_ESTADOS = 6;

/**
 * Zoom mínimo para o tooltip de hover (15/07/2026, pedido do usuário): na
 * visão nacional o tooltip dispara em qualquer movimento do mouse e atrapalha
 * a navegação. Mesma régua dos rótulos de município — quando os nomes entram,
 * o tooltip passa a fazer sentido.
 */
const ZOOM_MINIMO_TOOLTIP = ZOOM_MINIMO_ROTULOS;

/** Pontos do heatmap (RF-057): centro do município + peso 0–1 (IVS normalizado). */
export type PontosHeatmap = GeoJSON.FeatureCollection<GeoJSON.Point, { peso: number }>;

/**
 * Comando de enquadramento. Objeto em vez de string de propósito: repetir a
 * mesma busca cria um objeto novo e re-dispara o efeito de voo mesmo com o
 * mesmo alvo. Dois alvos possíveis: um município (busca RF-026, ranking
 * RF-035) ou uma UF inteira (seleção de estado no ranking/filtros,
 * 14/07/2026 — o mapa enquadra o estado ao escolhê-lo).
 */
export type FocoMapa = { codigoIbge: string } | { uf: string };

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
  /** Município ou UF a enquadrar (fitBounds) ou null. Ver FocoMapa. */
  foco: FocoMapa | null;
  /**
   * Contornos estaduais (GET /api/estados) ou null enquanto não carregou —
   * camada de REFERÊNCIA visual (limite de estados por cima do choropleth,
   * 14/07/2026). Desenhada ABAIXO do destaque de Vazios de Acesso de
   * propósito: o violeta do destaque continua sendo a linha mais proeminente.
   */
  estados: EstadosGeoJson | null;
  /**
   * UF com o contorno destacado (estado selecionado no ranking/filtro,
   * 15/07/2026) ou null/'' para nenhum. Só realce visual — quem decide qual
   * UF está selecionada é a página.
   */
  ufDestacada: string | null;
  /**
   * Código IBGE do município selecionado (clique/busca/ranking, 15/07/2026)
   * — contorno engrossado, mesma solução do destaque de estado.
   */
  codigoDestacado: string | null;
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
  /**
   * Chamado quando o usuário clica num estado no mapa (RF-027) — recebe a
   * sigla da UF. Só ativo abaixo de ZOOM_CLIQUE_ESTADO (visão nacional);
   * acima desse zoom, clicar seleciona município.
   */
  aoClicarEstado?: (uf: string) => void;
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
  estados,
  ufDestacada,
  codigoDestacado,
  codigosVisiveis,
  aoClicarMunicipio,
  aoClicarEstado,
}: MapaMunicipiosProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaMapLibre | null>(null);
  const [mapaCarregado, setMapaCarregado] = useState(false);
  // Refs para os callbacks — handlers do MapLibre são registrados uma única
  // vez; sem isso capturariam a primeira versão do closure (stale closure).
  const aoClicarRef = useRef(aoClicarMunicipio);
  aoClicarRef.current = aoClicarMunicipio;
  const aoClicarEstadoRef = useRef(aoClicarEstado);
  aoClicarEstadoRef.current = aoClicarEstado;

  // Tooltip de hover (adicionado 12/07/2026, inspirado no protótipo visual do
  // AI Studio) — só apresentação, mesmo princípio do resto do componente: o
  // valor do indicador NÃO vem das properties do feature do MapLibre (elas
  // descartam nulos na conversão pro tile vetorial, mesmo motivo já
  // documentado para o clique), vem de uma busca em `dados` (prop já recebida
  // pelo componente) pelo codigoIbge — sem fetch novo, sem lógica de negócio.
  const [hover, setHover] = useState<{ x: number; y: number; codigoIbge: string } | null>(null);
  const municipioHover: MunicipioComIndicadores | null = useMemo(() => {
    if (!hover || !dados) return null;
    return (
      dados.features.find((f) => f.properties.codigoIbge === hover.codigoIbge)?.properties ?? null
    );
  }, [hover, dados]);

  const corChoropleth = useMemo(
    () => (quebras.length === 4 ? expressaoChoropleth(indicador, quebras) : COR_SEM_DADO),
    [indicador, quebras],
  );

  // Pontos de rótulo (nome do município conforme o zoom, 14/07/2026): centro
  // do bbox de cada geometria — mesmo helper e mesma ressalva do heatmap
  // (centro de bbox pode cair fora de polígono côncavo; para rótulo isso é
  // aceitável, e o caminho para um ponto garantidamente interno seria
  // ST_PointOnSurface no backend — ver utils/geometria.ts).
  const pontosRotulos = useMemo<GeoJSON.FeatureCollection<
    GeoJSON.Point,
    { codigoIbge: string; nome: string }
  > | null>(() => {
    if (!dados) return null;
    const features = dados.features.flatMap(
      (f): GeoJSON.Feature<GeoJSON.Point, { codigoIbge: string; nome: string }>[] => {
        const centro = f.geometry ? centroDaGeometria(f.geometry) : null;
        if (!centro) return [];
        return [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: centro },
            properties: { codigoIbge: f.properties.codigoIbge, nome: f.properties.nome },
          },
        ];
      },
    );
    return { type: 'FeatureCollection', features };
  }, [dados]);

  useEffect(() => {
    if (!containerRef.current) return;

    const mapa = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: URL_GLYPHS,
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
      // Abaixo do limiar de zoom, o click seleciona a UF (via CAMADA_ESTADOS_FILL);
      // acima, seleciona o município. Os dois handlers coexistem — o zoom é o
      // único árbitro (CAMADA_ESTADOS_FILL tem maxzoom: ZOOM_CLIQUE_ESTADO).
      if (mapa.getZoom() < ZOOM_CLIQUE_ESTADO) return;
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
      setHover(null);
    });
    mapa.on('mousemove', CAMADA_PREENCHIMENTO, (evento) => {
      // Tooltip só a partir de um certo zoom — na visão nacional ele dispara
      // a cada pixel e atrapalha a navegação (pedido do usuário, 15/07/2026).
      if (mapa.getZoom() < ZOOM_MINIMO_TOOLTIP) {
        setHover(null);
        return;
      }
      const codigoIbge = evento.features?.[0]?.properties?.codigoIbge;
      if (typeof codigoIbge === 'string') {
        setHover({ x: evento.point.x, y: evento.point.y, codigoIbge });
      }
    });
    // Zoom com scroll não dispara mousemove — sem isto, o tooltip ficaria
    // congelado na tela ao afastar o zoom para baixo do limiar.
    mapa.on('zoom', () => {
      if (mapa.getZoom() < ZOOM_MINIMO_TOOLTIP) setHover(null);
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
      if (pontosRotulos) {
        (mapa.getSource(FONTE_ROTULOS) as GeoJSONSource | undefined)?.setData(
          pontosRotulos as GeoJSON.GeoJSON,
        );
      }
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

    // Contorno engrossado do município selecionado (15/07/2026) — mesma
    // solução do destaque de estado; acima do destaque violeta de Vazios
    // (é a seleção ativa do usuário, a linha mais importante do momento).
    mapa.addLayer({
      id: CAMADA_MUNICIPIO_DESTACADO,
      type: 'line',
      source: FONTE,
      filter: ['boolean', false],
      paint: {
        'line-color': '#0f172a',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.6, 10, 3.4],
      },
    });

    // Rótulos de município conforme o zoom (14/07/2026) — última camada
    // adicionada aqui, então fica por cima de tudo (a colisão de rótulos é
    // resolvida pelo próprio MapLibre). Some abaixo de ZOOM_MINIMO_ROTULOS
    // (visão nacional ficaria ilegível com ~5,5 mil nomes).
    if (pontosRotulos) {
      mapa.addSource(FONTE_ROTULOS, {
        type: 'geojson',
        data: pontosRotulos as GeoJSON.GeoJSON,
      });
      mapa.addLayer({
        id: CAMADA_ROTULOS,
        type: 'symbol',
        source: FONTE_ROTULOS,
        minzoom: ZOOM_MINIMO_ROTULOS,
        layout: {
          'text-field': ['get', 'nome'],
          'text-font': ['Open Sans Semibold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9, 9, 12, 12, 15],
          'text-padding': 2,
        },
        paint: {
          'text-color': '#334155',
          'text-halo-color': 'rgba(255, 255, 255, 0.9)',
          'text-halo-width': 1.2,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corChoropleth é aplicado pelo efeito abaixo nas atualizações; pontosRotulos deriva de dados
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
    mapa.addLayer(
      {
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
      },
      // Rótulos de município ficam por cima do heatmap (referência de leitura).
      mapa.getLayer(CAMADA_ROTULOS) ? CAMADA_ROTULOS : undefined,
    );
  }, [pontosHeatmap, mapaCarregado]);

  // Camada de limite dos estados — adicionada quando o GeoJSON de estados
  // chega. Inserida ANTES (= por baixo) do destaque de Vazios de Acesso,
  // para o violeta continuar sendo a linha mais proeminente do mapa; e
  // depende de `dados` porque as camadas municipais precisam existir antes
  // (senão o beforeId CAMADA_DESTAQUE ainda não existe).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !estados || !dados) return;
    if (mapa.getSource(FONTE_ESTADOS)) return;

    mapa.addSource(FONTE_ESTADOS, {
      type: 'geojson',
      data: estados as unknown as GeoJSON.GeoJSON,
    });

    // Fill transparente para detecção de clique em estado (RF-027) — só
    // renderiza abaixo de ZOOM_CLIQUE_ESTADO (mesma régua dos rótulos de
    // estado). Opacity 0.001: MapLibre não dispara eventos de ponteiro em
    // layers com opacity 0; este valor é imperceptível ao olho.
    mapa.addLayer(
      {
        id: CAMADA_ESTADOS_FILL,
        type: 'fill',
        source: FONTE_ESTADOS,
        maxzoom: ZOOM_CLIQUE_ESTADO,
        paint: { 'fill-color': '#000000', 'fill-opacity': 0.001 },
      },
      mapa.getLayer(CAMADA_DESTAQUE) ? CAMADA_DESTAQUE : undefined,
    );
    mapa.on('click', CAMADA_ESTADOS_FILL, (evento) => {
      const uf = evento.features?.[0]?.properties?.uf;
      if (typeof uf === 'string') aoClicarEstadoRef.current?.(uf);
    });
    mapa.on('mouseenter', CAMADA_ESTADOS_FILL, () => {
      mapa.getCanvas().style.cursor = 'pointer';
    });
    mapa.on('mouseleave', CAMADA_ESTADOS_FILL, () => {
      mapa.getCanvas().style.cursor = '';
    });

    mapa.addLayer(
      {
        id: CAMADA_ESTADOS,
        type: 'line',
        source: FONTE_ESTADOS,
        paint: {
          'line-color': '#334155',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 1.8],
          'line-opacity': 0.75,
        },
      },
      mapa.getLayer(CAMADA_DESTAQUE) ? CAMADA_DESTAQUE : undefined,
    );

    // Contorno destacado do estado selecionado (ranking/filtro, 15/07/2026).
    // Filtro começa vazio; o efeito de ufDestacada (abaixo) liga/desliga.
    mapa.addLayer(
      {
        id: CAMADA_ESTADO_DESTACADO,
        type: 'line',
        source: FONTE_ESTADOS,
        filter: ['boolean', false],
        paint: {
          'line-color': '#0f172a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.8, 8, 3.2],
        },
      },
      mapa.getLayer(CAMADA_DESTAQUE) ? CAMADA_DESTAQUE : undefined,
    );

    // Rótulos de ESTADO no zoom amplo (15/07/2026) — pontos no centro do
    // bbox de cada UF (mesma ressalva de sempre do centro de bbox), texto
    // some quando os rótulos de município entram (ZOOM_MINIMO_ROTULOS).
    const pontosEstados: GeoJSON.FeatureCollection<GeoJSON.Point, { nomeEstado: string }> = {
      type: 'FeatureCollection',
      features: estados.features.flatMap(
        (f): GeoJSON.Feature<GeoJSON.Point, { nomeEstado: string }>[] => {
          const centro = centroDaGeometria(f.geometry);
          if (!centro) return [];
          return [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: centro },
              properties: { nomeEstado: f.properties.nomeEstado },
            },
          ];
        },
      ),
    };
    mapa.addSource(FONTE_ROTULOS_ESTADOS, {
      type: 'geojson',
      data: pontosEstados as GeoJSON.GeoJSON,
    });
    mapa.addLayer({
      id: CAMADA_ROTULOS_ESTADOS,
      type: 'symbol',
      source: FONTE_ROTULOS_ESTADOS,
      maxzoom: ZOOM_MAXIMO_ROTULOS_ESTADOS,
      layout: {
        'text-field': ['get', 'nomeEstado'],
        'text-font': ['Open Sans Semibold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 14],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
        'text-padding': 4,
      },
      paint: {
        'text-color': '#475569',
        'text-halo-color': 'rgba(255, 255, 255, 0.9)',
        'text-halo-width': 1.4,
      },
    });
  }, [estados, mapaCarregado, dados]);

  // Liga/desliga o contorno destacado do estado selecionado (ranking/filtro).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !mapa.getLayer(CAMADA_ESTADO_DESTACADO)) return;
    if (ufDestacada) {
      mapa.setFilter(CAMADA_ESTADO_DESTACADO, [
        '==',
        ['get', 'uf'],
        ufDestacada,
      ] as unknown as FilterSpecification);
    } else {
      mapa.setFilter(CAMADA_ESTADO_DESTACADO, ['boolean', false]);
    }
  }, [ufDestacada, mapaCarregado, estados]);

  // Liga/desliga o contorno engrossado do município selecionado.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !mapa.getLayer(CAMADA_MUNICIPIO_DESTACADO)) return;
    if (codigoDestacado) {
      mapa.setFilter(CAMADA_MUNICIPIO_DESTACADO, [
        '==',
        ['get', 'codigoIbge'],
        codigoDestacado,
      ] as unknown as FilterSpecification);
    } else {
      mapa.setFilter(CAMADA_MUNICIPIO_DESTACADO, ['boolean', false]);
    }
  }, [codigoDestacado, mapaCarregado, dados]);

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
    // Rótulos acompanham o filtro — município escondido não mantém o nome.
    if (mapa.getLayer(CAMADA_ROTULOS)) mapa.setFilter(CAMADA_ROTULOS, filtro);
  }, [codigosVisiveis, mapaCarregado, dados]);

  // Voa até o alvo do foco. fitBounds em vez de flyTo com zoom fixo:
  // municípios variam de ~3 km² a ~150.000 km² (Altamira/PA) e estados idem —
  // zoom fixo cortaria os grandes ou afogaria os pequenos. Para UF, o bbox é
  // a UNIÃO dos bboxes dos municípios dela (o GeoJSON nacional já está
  // carregado — sem geometria estadual dedicada de propósito).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !dados || !foco) return;

    let bbox: [[number, number], [number, number]] | null = null;
    if ('codigoIbge' in foco) {
      const feature = dados.features.find((f) => f.properties.codigoIbge === foco.codigoIbge);
      bbox = feature?.geometry ? bboxDaGeometria(feature.geometry) : null;
    } else {
      for (const feature of dados.features) {
        if (feature.properties.uf !== foco.uf || !feature.geometry) continue;
        const parcial = bboxDaGeometria(feature.geometry);
        if (!parcial) continue;
        bbox = bbox
          ? [
              [Math.min(bbox[0][0], parcial[0][0]), Math.min(bbox[0][1], parcial[0][1])],
              [Math.max(bbox[1][0], parcial[1][0]), Math.max(bbox[1][1], parcial[1][1])],
            ]
          : parcial;
      }
    }
    if (!bbox) return;
    mapa.fitBounds(bbox, { padding: 80, maxZoom: 10, duration: 1400 });
  }, [foco, mapaCarregado, dados]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {hover && municipioHover && (
        <div
          className="pointer-events-none absolute z-20 max-w-[260px] rounded-xl border border-slate-700/85 bg-slate-900/95 p-3 text-xs text-white shadow-xl backdrop-blur-md"
          style={{ left: hover.x, top: hover.y, transform: 'translate(-50%, -110%)' }}
        >
          <p className="text-xs font-bold tracking-tight text-slate-100">
            {municipioHover.nome}
          </p>
          <p className="font-mono text-[9px] text-slate-400">
            {municipioHover.regiao} · {municipioHover.uf}
          </p>

          <div className="mt-2 space-y-1 rounded border border-slate-800/50 bg-slate-800/40 p-2">
            <div className="flex items-center justify-between text-[8.5px] text-slate-400">
              <span>Indicador Ativo</span>
            </div>
            <div className="text-[10px] font-semibold text-slate-200">{indicador.rotulo}</div>
            <div className="font-mono text-xs font-bold text-violet-400">
              {municipioHover[indicador.id] !== null
                ? `${formatarValor(municipioHover[indicador.id] as number, indicador.formato)}${indicador.unidade ? ` ${indicador.unidade}` : ''}`
                : 'Não disponível'}
            </div>
          </div>

          {indicador.metadados && (
            <div className="mt-1.5 grid grid-cols-2 gap-2 border-t border-slate-800/60 pt-1.5 text-[9px]">
              <div>
                <span className="block font-mono text-[7.5px] tracking-wider text-slate-500 uppercase">
                  Confiança
                </span>
                <span className="font-bold text-emerald-400">{indicador.metadados.confianca}</span>
              </div>
              <div>
                <span className="block font-mono text-[7.5px] tracking-wider text-slate-500 uppercase">
                  Natureza
                </span>
                <span className="font-bold text-cyan-400">{indicador.metadados.natureza}</span>
              </div>
              <div className="col-span-2 font-mono text-[8px] text-slate-500">
                <span className="text-slate-400">Fonte:</span> {indicador.metadados.fonte}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
