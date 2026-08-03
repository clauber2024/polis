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
  MediasMunicipios,
  MunicipioComIndicadores,
} from '../../types/api';
import { bboxDaGeometria, centroDaGeometria } from '../../utils/geometria';
import type { IndicadorMapa } from '../../utils/indicadores';
import { formatarValor } from '../../utils/formatadores';
import { TermometroComparativo, type SemanticaIndicador } from './TermometroComparativo';

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
 * Lentes de Priorização — Vazios de Acesso e Descompasso Morfológico
 * (25/07/2026, 2ª rodada de auditoria de UX/UI). Tentativa anterior
 * substituía o preenchimento inteiro por um esquema de "atenuação"
 * (município fora do filtro virava cinza, dentro virava carmim sólido) —
 * corrigido aqui porque isso ESCONDIA o indicador ativo, anulando o
 * propósito de cruzar "quem é Vazio de Acesso" com "qual o valor do
 * indicador ali" ao mesmo tempo. Agora são duas camadas de preenchimento
 * TRANSLÚCIDAS extras, sobrepostas ao indicador (que continua sempre
 * visível, só com a opacidade reduzida quando alguma lente está ligada —
 * ver OPACIDADE_BASE_COM_LENTE). Onde as duas lentes coincidem, o WebGL
 * soma os canais alfa sozinho, sem cálculo de cor manual.
 */
export const COR_LENTE_VAZIOS = 'rgba(185, 28, 28, 0.55)';
const COR_LENTE_VAZIOS_CONTORNO = 'rgba(185, 28, 28, 1)';
export const COR_LENTE_DESCOMPASSO = 'rgba(245, 158, 11, 0.55)';
const COR_LENTE_DESCOMPASSO_CONTORNO = 'rgba(217, 119, 6, 1)';
/**
 * Amarelo-ouro (não o mesmo tom âmbar/laranja de COR_LENTE_DESCOMPASSO, de
 * propósito — as duas lentes podem estar ligadas ao mesmo tempo e precisam
 * ser diferenciáveis visualmente) para a lente "Déficit de Crédito Crítico"
 * (26/07/2026, decisão executiva do usuário sobre a arquitetura híbrida
 * Indicador + Lente do Reforma Casa Brasil Solar).
 */
export const COR_LENTE_DEFICIT_CREDITO = 'rgba(234, 179, 8, 0.55)';
const COR_LENTE_DEFICIT_CREDITO_CONTORNO = 'rgba(161, 98, 7, 1)';
const OPACIDADE_BASE_NORMAL = 0.85;
const OPACIDADE_BASE_COM_LENTE = 0.45;

/** Versões sólidas das cores das lentes — só para UI (swatch da legenda,
 * badges), nunca aplicadas como paint do mapa (lá são sempre translúcidas). */
export const COR_DESTAQUE_VAZIO = '#b91c1c';
export const COR_DESTAQUE_DESCOMPASSO = '#d97706';

/** Badge de confiança do tooltip de hover — cor reflete o dado real
 * (`indicador.metadados.confianca`), não fixa: "Baixa" em verde-sucesso
 * seria enganoso. */
const CONFIANCA_ESTILO: Record<'Alta' | 'Média' | 'Baixa', string> = {
  Alta: 'border-emerald-200/60 bg-emerald-50 text-emerald-700',
  Média: 'border-amber-200/60 bg-amber-50 text-amber-700',
  Baixa: 'border-red-200/60 bg-red-50 text-red-700',
};

/**
 * Rampa do heatmap (transparente → terracota escuro) — mesma família de cor
 * que identifica "Vazio de Acesso" no destaque e nos badges (#ea580c,
 * paleta institucional do Pólis desde 25/07/2026 — antes era violeta),
 * para manter a identidade visual do conceito.
 */
export const RAMPA_HEATMAP: [number, string][] = [
  [0, 'rgba(252, 211, 77, 0)'],
  [0.2, 'rgba(253, 186, 116, 0.6)'],
  [0.5, 'rgba(234, 88, 12, 0.8)'],
  [0.8, 'rgba(220, 38, 38, 0.9)'],
  [1, 'rgba(153, 27, 27, 1)'],
];

const FONTE = 'municipios';
const FONTE_HEATMAP = 'vazios-heatmap';
const FONTE_ESTADOS = 'estados';
const FONTE_ROTULOS = 'municipios-rotulos';
const CAMADA_PREENCHIMENTO = 'municipios-preenchimento';
const CAMADA_CONTORNO = 'municipios-contorno';
const CAMADA_LENTE_VAZIOS = 'lente-vazios-acesso';
const CAMADA_LENTE_DESCOMPASSO = 'lente-descompasso';
const CAMADA_LENTE_DEFICIT_CREDITO = 'lente-deficit-credito';
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
  /**
   * Códigos IBGE a destacar (quadrante Vazio de Acesso) ou null para
   * desligar — vira a lente translúcida CAMADA_LENTE_VAZIOS, sobreposta
   * ao indicador ativo (não substitui mais o preenchimento, ver
   * COR_LENTE_VAZIOS).
   */
  codigosDestaque: string[] | null;
  /**
   * Códigos IBGE com alerta de Descompasso Morfológico ativo (21/07/2026,
   * `descompassoMorfologico` do backend) ou null para desligar — lente
   * translúcida independente da de Vazios de Acesso (CAMADA_LENTE_DESCOMPASSO);
   * um município pode ter as duas ligadas ao mesmo tempo, e o WebGL soma os
   * alfas das duas sozinho, sem cálculo de cor manual.
   */
  codigosDescompasso: string[] | null;
  /**
   * Códigos IBGE com a lente "Déficit de Crédito Crítico" ativa (26/07/2026,
   * `alertaDeficitCredito` do backend: vazio de acesso E zero contratos
   * confirmados do Reforma Casa Brasil Solar) ou null para desligar — lente
   * translúcida independente das outras duas (CAMADA_LENTE_DEFICIT_CREDITO);
   * como é sempre um SUBCONJUNTO de codigosDestaque, na prática aparece
   * sobreposta à lente de Vazios de Acesso quando as duas estão ligadas.
   */
  codigosDeficitCredito: string[] | null;
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
   * 14/07/2026). Desenhada ABAIXO das lentes de priorização de propósito:
   * os alertas continuam sendo o elemento mais proeminente do mapa.
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
  /**
   * Médias nacionais de referência (GET /api/municipios/medias, sem filtro)
   * — auditoria de UX/UI de 30/07/2026: contextualiza o indicador ativo no
   * tooltip de hover com o mesmo termômetro (TermometroComparativo) da Ficha
   * do Município, para as duas telas não divergirem. `null` enquanto não
   * carregou — o tooltip volta a exibir só o valor bruto até então.
   */
  mediasNacionais: MediasMunicipios['medias'] | null;
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
  codigosDescompasso,
  codigosDeficitCredito,
  pontosHeatmap,
  foco,
  estados,
  ufDestacada,
  codigoDestacado,
  codigosVisiveis,
  aoClicarMunicipio,
  aoClicarEstado,
  mediasNacionais,
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

  // Termômetro de comparação nacional do tooltip de hover (30/07/2026) —
  // mesma lógica da Ficha do Município (IndicadorComparativo), para o hover
  // do mapa não divergir visualmente do painel de detalhe. `sentido` do
  // catálogo (utils/indicadores.ts) já é a mesma semântica de "maior/menor é
  // melhor" usada lá — nenhum indicador de mapa hoje é 'neutro', todos já
  // carregam uma leitura de direção. Sem média nacional disponível (ainda
  // carregando, ou indicador sem essa agregação na API), fica `null` — o
  // tooltip cai no valor bruto de sempre.
  const valorIndicadorHover = municipioHover ? municipioHover[indicador.id] : null;
  const mediaNacionalIndicadorAtivo =
    typeof valorIndicadorHover === 'number' ? (mediasNacionais?.[indicador.id] ?? null) : null;
  const semanticaIndicadorAtivo: SemanticaIndicador =
    indicador.sentido === 'positivo' ? 'maiorMelhor' : 'menorMelhor';

  const corChoropleth = useMemo(
    () => (quebras.length === 4 ? expressaoChoropleth(indicador, quebras) : COR_SEM_DADO),
    [indicador, quebras],
  );

  // Pontos de rótulo (nome do município conforme o zoom, 14/07/2026):
  // `pontoRotulo` vem do backend (ST_PointOnSurface, GARANTIDAMENTE dentro
  // do polígono) — ver docs/DECISOES.md, 21/07/2026. Bug real corrigido: o
  // centro do bbox (client-side, `centroDaGeometria`) caía FORA do polígono
  // para municípios côncavos/pequenos (região metropolitana do Recife —
  // Camaragibe, Paulista, Abreu e Lima), jogando o rótulo em cima do
  // vizinho. `centroDaGeometria` como fallback só para o caso defensivo de
  // `pontoRotulo` nulo (não deveria ocorrer com geometria presente).
  const pontosRotulos = useMemo<GeoJSON.FeatureCollection<
    GeoJSON.Point,
    { codigoIbge: string; nome: string }
  > | null>(() => {
    if (!dados) return null;
    const features = dados.features.flatMap(
      (f): GeoJSON.Feature<GeoJSON.Point, { codigoIbge: string; nome: string }>[] => {
        const ponto =
          f.properties.pontoRotulo ?? (f.geometry ? centroDaGeometria(f.geometry) : null);
        if (!ponto) return [];
        return [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: ponto },
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
      paint: {
        'fill-color': corChoropleth,
        // RF-022: transições nativas do MapLibre — animam qualquer
        // setPaintProperty subsequente sem código de interpolação manual.
        'fill-color-transition': { duration: 500, delay: 0 },
        'fill-opacity': 0.85,
        'fill-opacity-transition': { duration: 300, delay: 0 },
      } as unknown as maplibregl.FillLayerSpecification['paint'],
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
    // Lentes de Priorização (25/07/2026, 2ª rodada) — preenchimentos
    // translúcidos, nascem desligadas (filter false) e SOBREPÕEM o
    // indicador ativo em vez de substituí-lo (ver comentário de
    // COR_LENTE_VAZIOS/COR_LENTE_DESCOMPASSO acima). Um traço tracejado
    // (usado antes para Descompasso) some visualmente em zoom nacional com
    // muitos municípios pequenos — fill translúcido não tem esse problema.
    mapa.addLayer({
      id: CAMADA_LENTE_VAZIOS,
      type: 'fill',
      source: FONTE,
      filter: ['boolean', false],
      paint: {
        'fill-color': COR_LENTE_VAZIOS,
        'fill-outline-color': COR_LENTE_VAZIOS_CONTORNO,
        'fill-opacity-transition': { duration: 300, delay: 0 },
      } as unknown as maplibregl.FillLayerSpecification['paint'],
    });
    mapa.addLayer({
      id: CAMADA_LENTE_DESCOMPASSO,
      type: 'fill',
      source: FONTE,
      filter: ['boolean', false],
      paint: {
        'fill-color': COR_LENTE_DESCOMPASSO,
        'fill-outline-color': COR_LENTE_DESCOMPASSO_CONTORNO,
        'fill-opacity-transition': { duration: 300, delay: 0 },
      } as unknown as maplibregl.FillLayerSpecification['paint'],
    });
    mapa.addLayer({
      id: CAMADA_LENTE_DEFICIT_CREDITO,
      type: 'fill',
      source: FONTE,
      filter: ['boolean', false],
      paint: {
        'fill-color': COR_LENTE_DEFICIT_CREDITO,
        'fill-outline-color': COR_LENTE_DEFICIT_CREDITO_CONTORNO,
        'fill-opacity-transition': { duration: 300, delay: 0 },
      } as unknown as maplibregl.FillLayerSpecification['paint'],
    });

    // Contorno engrossado do município selecionado (15/07/2026) — mesma
    // solução do destaque de estado; fica por cima do preenchimento (é a
    // seleção ativa do usuário, a linha mais importante do momento).
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

  // Troca de indicador e modo heatmap — os dois disputam o MESMO paint
  // property (fill-color) da camada de preenchimento, por isso vivem num
  // efeito só (heatmap continua sendo modo EXCLUSIVO, ver
  // COR_FUNDO_MODO_HEATMAP). fill-opacity também reage às lentes de
  // priorização (25/07/2026, 2ª rodada): quando Vazios de Acesso e/ou
  // Descompasso Morfológico estão ligados, a opacidade do indicador cai
  // pra OPACIDADE_BASE_COM_LENTE — dá contraste pras lentes translúcidas
  // (CAMADA_LENTE_VAZIOS/CAMADA_LENTE_DESCOMPASSO, camadas PRÓPRIAS, ver
  // abaixo) sem apagar o indicador de base, que continua a mesma cor de
  // sempre (o corte por "atenuação" tentado antes escondia o indicador —
  // corrigido aqui).
  const modoHeatmap = pontosHeatmap !== null;
  const algumaLenteAtiva =
    !modoHeatmap &&
    ((!!codigosDestaque && codigosDestaque.length > 0) ||
      (!!codigosDescompasso && codigosDescompasso.length > 0) ||
      (!!codigosDeficitCredito && codigosDeficitCredito.length > 0));
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !mapa.getLayer(CAMADA_PREENCHIMENTO)) return;

    if (modoHeatmap) {
      mapa.setPaintProperty(CAMADA_PREENCHIMENTO, 'fill-color', COR_FUNDO_MODO_HEATMAP);
      mapa.setPaintProperty(CAMADA_PREENCHIMENTO, 'fill-opacity', OPACIDADE_BASE_NORMAL);
      return;
    }

    mapa.setPaintProperty(CAMADA_PREENCHIMENTO, 'fill-color', corChoropleth);
    mapa.setPaintProperty(
      CAMADA_PREENCHIMENTO,
      'fill-opacity',
      algumaLenteAtiva ? OPACIDADE_BASE_COM_LENTE : OPACIDADE_BASE_NORMAL,
    );
  }, [corChoropleth, modoHeatmap, algumaLenteAtiva, mapaCarregado, dados]);

  // Liga/desliga a lente de Vazios de Acesso (preenchimento translúcido
  // sobreposto ao indicador, ver COR_LENTE_VAZIOS).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !mapa.getLayer(CAMADA_LENTE_VAZIOS)) return;
    if (codigosDestaque && codigosDestaque.length > 0) {
      mapa.setFilter(CAMADA_LENTE_VAZIOS, [
        'in',
        ['get', 'codigoIbge'],
        ['literal', codigosDestaque],
      ] as unknown as FilterSpecification);
    } else {
      mapa.setFilter(CAMADA_LENTE_VAZIOS, ['boolean', false]);
    }
  }, [codigosDestaque, mapaCarregado, dados]);

  // Liga/desliga/atualiza a camada heatmap (RF-057). Fonte e camada são
  // criadas de forma lazy no primeiro uso; desligar só esconde (visibility),
  // não destrói — religar é instantâneo.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado) return;

    const fonte = mapa.getSource(FONTE_HEATMAP) as GeoJSONSource | undefined;
    if (!pontosHeatmap) {
      // RF-022: fade out via opacidade (não visibility) — a transição anima.
      if (fonte && mapa.getLayer(CAMADA_HEATMAP)) {
        mapa.setPaintProperty(CAMADA_HEATMAP, 'heatmap-opacity', 0);
      }
      return;
    }

    if (fonte) {
      fonte.setData(pontosHeatmap as GeoJSON.GeoJSON);
      mapa.setPaintProperty(CAMADA_HEATMAP, 'heatmap-opacity', 0.85);
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
          'heatmap-weight': ['get', 'peso'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 7, 2],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 14, 6, 36, 9, 90],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            ...RAMPA_HEATMAP.flat(),
          ],
          // RF-022: começa em 0 e faz fade-in via requestAnimationFrame abaixo.
          'heatmap-opacity': 0,
          'heatmap-opacity-transition': { duration: 400, delay: 0 },
        } as unknown as HeatmapLayerSpecification['paint'],
      },
      mapa.getLayer(CAMADA_ROTULOS) ? CAMADA_ROTULOS : undefined,
    );
    // Dispara o fade-in após o layer ser adicionado ao canvas.
    requestAnimationFrame(() => {
      mapaRef.current?.setPaintProperty(CAMADA_HEATMAP, 'heatmap-opacity', 0.85);
    });
  }, [pontosHeatmap, mapaCarregado]);

  // Camada de limite dos estados — adicionada quando o GeoJSON de estados
  // chega. Inserida ANTES (= por baixo) das lentes de priorização, para
  // elas continuarem sendo o elemento mais proeminente do mapa; depende de
  // `dados` porque as camadas municipais precisam existir antes (senão o
  // beforeId CAMADA_LENTE_VAZIOS ainda não existe).
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
      mapa.getLayer(CAMADA_LENTE_VAZIOS) ? CAMADA_LENTE_VAZIOS : undefined,
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
      mapa.getLayer(CAMADA_LENTE_VAZIOS) ? CAMADA_LENTE_VAZIOS : undefined,
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
      mapa.getLayer(CAMADA_LENTE_VAZIOS) ? CAMADA_LENTE_VAZIOS : undefined,
    );

    // Rótulos de ESTADO no zoom amplo (15/07/2026) — `pontoRotulo` do backend
    // (ST_PointOnSurface, GARANTIDAMENTE dentro do polígono), não mais o
    // centro do bbox: o Espírito Santo tem a Ilha da Trindade (~1.140 km da
    // costa, parte oficial de Vitória) na malha, e o bbox da união estadual
    // jogava o rótulo no meio do Atlântico — ver docs/DECISOES.md,
    // 21/07/2026. `centroDaGeometria` como fallback defensivo. Texto some
    // quando os rótulos de município entram (ZOOM_MINIMO_ROTULOS).
    const pontosEstados: GeoJSON.FeatureCollection<GeoJSON.Point, { nomeEstado: string }> = {
      type: 'FeatureCollection',
      features: estados.features.flatMap(
        (f): GeoJSON.Feature<GeoJSON.Point, { nomeEstado: string }>[] => {
          const ponto = f.properties.pontoRotulo ?? centroDaGeometria(f.geometry);
          if (!ponto) return [];
          return [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: ponto },
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

  // Liga/desliga a lente de Descompasso Morfológico — mesmo padrão da
  // lente de Vazios de Acesso acima; as duas são independentes, um
  // município pode ter as duas ligadas ao mesmo tempo (é exatamente o
  // cruzamento que a ferramenta existe pra mostrar — onde as lentes se
  // sobrepõem, o WebGL soma os alfas sozinho).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !mapa.getLayer(CAMADA_LENTE_DESCOMPASSO)) return;
    if (codigosDescompasso && codigosDescompasso.length > 0) {
      mapa.setFilter(CAMADA_LENTE_DESCOMPASSO, [
        'in',
        ['get', 'codigoIbge'],
        ['literal', codigosDescompasso],
      ] as unknown as FilterSpecification);
    } else {
      mapa.setFilter(CAMADA_LENTE_DESCOMPASSO, ['boolean', false]);
    }
  }, [codigosDescompasso, mapaCarregado, dados]);

  // Liga/desliga a lente de Déficit de Crédito Crítico — mesmo padrão das
  // duas lentes acima, independente delas (embora seja sempre um subconjunto
  // de codigosDestaque, ver docstring da prop).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaCarregado || !mapa.getLayer(CAMADA_LENTE_DEFICIT_CREDITO)) return;
    if (codigosDeficitCredito && codigosDeficitCredito.length > 0) {
      mapa.setFilter(CAMADA_LENTE_DEFICIT_CREDITO, [
        'in',
        ['get', 'codigoIbge'],
        ['literal', codigosDeficitCredito],
      ] as unknown as FilterSpecification);
    } else {
      mapa.setFilter(CAMADA_LENTE_DEFICIT_CREDITO, ['boolean', false]);
    }
  }, [codigosDeficitCredito, mapaCarregado, dados]);

  // Filtro do Dashboard Público (RF-046) — esconde (não esmaece) municípios
  // fora da faixa/estado/região selecionados, no preenchimento E no contorno.
  // Independente das lentes de priorização (opacidade do próprio
  // preenchimento) e do heatmap — filtrar o choropleth não afeta essas
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
          className="pointer-events-none absolute z-[100] w-64 rounded-2xl border border-white/80 bg-white/90 p-4 font-sans shadow-[0_12px_40px_rgb(0,0,0,0.12)] backdrop-blur-xl"
          style={{ left: hover.x, top: hover.y, transform: 'translate(-50%, -110%)' }}
        >
          <div className="mb-3 border-b border-stone-200/80 pb-2">
            <h4 className="text-sm leading-tight font-black text-stone-900">
              {municipioHover.nome}
            </h4>
            <span className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">
              {municipioHover.regiao} · {municipioHover.uf}
            </span>
          </div>

          {/* Indicador ativo em caixa própria — antes flutuava solto no
              corpo do tooltip, mesma correção de "âncora visual" já
              aplicada no disclaimer da landing page. */}
          <div className="mb-3 rounded-xl border border-stone-200/50 bg-stone-50/80 p-3">
            <span className="mb-1 block text-[9px] font-extrabold tracking-widest text-stone-400 uppercase">
              Indicador ativo
            </span>
            <span className="mb-1.5 block text-[11px] leading-tight font-bold text-stone-700">
              {indicador.rotulo}
            </span>
            <div className="mb-1.5 flex items-baseline gap-1">
              <span className="text-xl font-black text-stone-900">
                {municipioHover[indicador.id] !== null
                  ? formatarValor(municipioHover[indicador.id] as number, indicador.formato)
                  : 'Não disponível'}
              </span>
              {municipioHover[indicador.id] !== null && indicador.unidade && (
                <span className="text-[10px] font-bold text-stone-500">{indicador.unidade}</span>
              )}
            </div>

            {/* Distribuidora responsável pela tarifa exibida — só existe
                para o indicador de tarifa (municipioHover.tarifaEnergia
                ResidencialDistribuidora é null pra qualquer outro
                indicador). Sigla bruta do INDQUAL/ANEEL, ver migration
                0033. */}
            {indicador.id === 'tarifaEnergiaResidencial' &&
              municipioHover.tarifaEnergiaResidencialDistribuidora && (
                <p className="text-[10px] font-semibold text-stone-500">
                  Distribuidora: {municipioHover.tarifaEnergiaResidencialDistribuidora}
                  {municipioHover.tarifaEnergiaResidencialAproximada && ' (aproximada)'}
                </p>
              )}

            {typeof valorIndicadorHover === 'number' && typeof mediaNacionalIndicadorAtivo === 'number' && (
              <TermometroComparativo
                valor={valorIndicadorHover}
                formato={indicador.formato}
                unidade={indicador.unidade ?? undefined}
                mediaNacional={mediaNacionalIndicadorAtivo}
                semantica={semanticaIndicadorAtivo}
              />
            )}
          </div>

          {indicador.metadados && (
            <>
              <div className="mb-3 flex justify-between gap-2">
                <div className="flex flex-col items-start">
                  <span className="mb-1 text-[8px] font-extrabold tracking-widest text-stone-400 uppercase">
                    Confiança
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase ${CONFIANCA_ESTILO[indicador.metadados.confianca]}`}
                  >
                    {indicador.metadados.confianca}
                  </span>
                </div>
                <div className="flex flex-col items-start">
                  <span className="mb-1 text-[8px] font-extrabold tracking-widest text-stone-400 uppercase">
                    Natureza
                  </span>
                  <span className="inline-flex items-center rounded-md border border-amber-200/60 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-amber-700 uppercase">
                    {indicador.metadados.natureza}
                  </span>
                </div>
              </div>

              <div className="border-t border-stone-200/80 pt-2.5">
                <p className="text-[9px] leading-relaxed font-medium text-stone-500">
                  <strong className="font-extrabold text-stone-700">Fonte:</strong>{' '}
                  {indicador.metadados.fonte}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
