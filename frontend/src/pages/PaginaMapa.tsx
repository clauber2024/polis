import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapaMunicipios,
  type FocoMapa,
  type PontosHeatmap,
} from '../components/mapa/MapaMunicipios';
import { Legenda } from '../components/mapa/Legenda';
import { PainelFiltrosDashboard } from '../components/mapa/PainelFiltrosDashboard';
import { PainelHeatmapVazios } from '../components/mapa/PainelHeatmapVazios';
import { PainelMunicipio } from '../components/mapa/PainelMunicipio';
import { PainelRanking } from '../components/mapa/PainelRanking';
import { SeletorIndicador } from '../components/mapa/SeletorIndicador';
import { buscarGeoJsonNacional } from '../services/municipios.service';
import { buscarEstadosGeoJson } from '../services/estados.service';
import type { EstadosGeoJson } from '../types/api';
import {
  buscarTodosVaziosDeAcesso,
  type VaziosDeAcessoCompleto,
} from '../services/vaziosDeAcesso.service';
import type { FeatureCollectionMunicipios, MunicipioComIndicadores } from '../types/api';
import { centroDaGeometria } from '../utils/geometria';
import { INDICADORES_MAPA, calcularQuebrasQuantis } from '../utils/indicadores';

/**
 * Peso mínimo de um ponto no heatmap (RF-057): municípios sem IVS não podem
 * pesar 0 (sumiriam do heatmap — ausência de IVS não significa ausência de
 * vazio), nem o município de MENOR IVS pode zerar (ele continua sendo um
 * Vazio de Acesso classificado). Normalização min–max é apresentação, mesma
 * régua da barra do ranking (RF-032) — a CLASSIFICAÇÃO continua 100% do
 * backend.
 */
const PESO_MINIMO_HEATMAP = 0.2;

/**
 * Interruptor das "Lentes de Priorização" (25/07/2026, auditoria de UX/UI) —
 * antes eram checkboxes nativos minúsculos disputando espaço com a busca no
 * canto superior; viraram os protagonistas do painel flutuante esquerdo.
 * Só apresentação: quem decide ligado/desligado e dispara o fetch lazy
 * continua sendo PaginaMapa (aoAlternar já vem pronto com essa lógica).
 */
function InterruptorLente({
  rotulo,
  ligado,
  aoAlternar,
  nota,
}: {
  rotulo: string;
  ligado: boolean;
  aoAlternar: (ligado: boolean) => void;
  nota?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-red-100/70 bg-white/60 p-2.5 shadow-sm transition-colors hover:bg-white/80">
      <span className="text-sm font-bold text-stone-800">
        {rotulo}
        {nota && <span className="ml-1.5 text-xs font-normal text-stone-400">{nota}</span>}
      </span>
      <span
        role="switch"
        aria-checked={ligado}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          ligado ? 'bg-red-700' : 'bg-stone-300'
        }`}
      >
        <input
          type="checkbox"
          checked={ligado}
          onChange={(evento) => aoAlternar(evento.target.checked)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={rotulo}
        />
        <span
          className={`ml-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            ligado ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </label>
  );
}

/**
 * Mapa interativo do Atlas (RF-016/017 choropleth; RF-055/056 destaque dos
 * Vazios de Acesso). Toda a busca de dado fica aqui (via services) — o
 * componente de mapa só renderiza o que recebe.
 */
export function PaginaMapa() {
  const [dados, setDados] = useState<FeatureCollectionMunicipios | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [estados, setEstados] = useState<EstadosGeoJson | null>(null);

  const [indicadorId, setIndicadorId] = useState(INDICADORES_MAPA[0].id);
  const indicador = INDICADORES_MAPA.find((i) => i.id === indicadorId) ?? INDICADORES_MAPA[0];

  const [destaqueLigado, setDestaqueLigado] = useState(false);
  const [heatmapLigado, setHeatmapLigado] = useState(false);
  // Destaque de Descompasso Morfológico (21/07/2026) — mesmo padrão de
  // carregamento lazy do destaque de Vazios de Acesso, mas escopado ao MESMO
  // conjunto já carregado (quadrante vazio_de_acesso, ~8 requisições) em vez
  // de buscar a classificação nacional completa (~28 requisições, só usada
  // hoje pelo scatter do Painel Analítico): o alerta de descompasso dentro
  // de um Vazio de Acesso já é o caso de maior interesse (potencial alto E
  // MMGD baixo E barreira morfológica), então não justifica o fetch maior.
  const [descompassoLigado, setDescompassoLigado] = useState(false);
  const [vazios, setVazios] = useState<VaziosDeAcessoCompleto | null>(null);
  const [carregandoVazios, setCarregandoVazios] = useState(false);
  const [erroVazios, setErroVazios] = useState<string | null>(null);

  const [municipioSelecionado, setMunicipioSelecionado] =
    useState<MunicipioComIndicadores | null>(null);
  const [foco, setFoco] = useState<FocoMapa | null>(null);
  // Sidebar em abas (Ranking | Filtros), sempre visível — layout de 3 colunas
  // do protótipo AI Studio (13/07/2026). Substitui os antigos painéis
  // mutuamente exclusivos abertos por botões flutuantes sobre o mapa; o fetch
  // lazy dos badges de vazio (RF-032) migrou de "abrir o ranking" para
  // "escolher uma UF" (prop aoEscolherUf do PainelRanking).
  const [abaSidebar, setAbaSidebar] = useState<'ranking' | 'filtros'>('ranking');
  // UF selecionada no ranking — prop controlada do PainelRanking (RF-027:
  // o clique num estado no mapa também precisa atualizar o dropdown do ranking,
  // o que exige que o estado viva aqui e não dentro do PainelRanking).
  const [ufRanking, setUfRanking] = useState('');
  // UF com contorno destacado no mapa — segue ufRanking OU o filtro do painel.
  const [ufDestacada, setUfDestacada] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  // Filtros do Dashboard Público (RF-046) + download (RF-047). Painel
  // controlado (ver PainelFiltrosDashboard.tsx) — os valores moram aqui
  // porque o cálculo de codigosVisiveis (abaixo) precisa deles junto com
  // `dados`, que também mora nesta página.
  const [filtroUf, setFiltroUf] = useState('');
  const [filtroRegiao, setFiltroRegiao] = useState('');
  const [filtroPotenciaMin, setFiltroPotenciaMin] = useState('');
  const [filtroPotenciaMax, setFiltroPotenciaMax] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    buscarGeoJsonNacional()
      .then((geojson) => {
        if (ativo) setDados(geojson);
      })
      .catch((causa: unknown) => {
        if (ativo) setErro(causa instanceof Error ? causa.message : 'Falha ao carregar o mapa.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Contornos estaduais (camada de referência, 14/07/2026) — busca em
  // paralelo com o GeoJSON nacional; falha é silenciosa de propósito (o mapa
  // funciona sem a camada; a primeira chamada pode demorar alguns segundos
  // enquanto o backend calcula o ST_Union e aquece o cache).
  useEffect(() => {
    let ativo = true;
    buscarEstadosGeoJson()
      .then((resultado) => {
        if (ativo) setEstados(resultado);
      })
      .catch(() => {
        // Sem camada de estados — não bloqueia nada.
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Busca a classificação de Vazios de Acesso na primeira vez que alguém
  // precisa dela (destaque no mapa OU badges do ranking). De propósito NO
  // HANDLER, não em useEffect: a primeira versão usava um efeito com
  // `carregandoVazios` nas dependências, e o próprio setCarregandoVazios(true)
  // re-disparava o efeito — o cleanup marcava a busca em andamento como
  // cancelada e o resultado era descartado (spinner eterno). Bug real
  // encontrado na validação de 09/07/2026.
  function garantirVaziosCarregados() {
    if (vazios || carregandoVazios) return;
    setCarregandoVazios(true);
    setErroVazios(null);
    buscarTodosVaziosDeAcesso()
      .then(setVazios)
      .catch((causa: unknown) => {
        setErroVazios(
          causa instanceof Error ? causa.message : 'Falha ao carregar os Vazios de Acesso.',
        );
        setDestaqueLigado(false);
        setHeatmapLigado(false);
      })
      .finally(() => setCarregandoVazios(false));
  }

  function aoAlternarDestaque(ligado: boolean) {
    setDestaqueLigado(ligado);
    if (ligado) garantirVaziosCarregados();
  }

  function aoAlternarHeatmap(ligado: boolean) {
    setHeatmapLigado(ligado);
    if (ligado) garantirVaziosCarregados();
  }

  function aoAlternarDescompasso(ligado: boolean) {
    setDescompassoLigado(ligado);
    if (ligado) garantirVaziosCarregados();
  }

  // O CartaoDescompassoMorfologico (painel de detalhe) precisa da mediana
  // nacional de irradiação para comparar o município selecionado contra o
  // país — mesma classificação lazy já usada pelo destaque/heatmap/ranking,
  // só mais um gatilho para o mesmo carregamento (garantirVaziosCarregados
  // já é idempotente).
  useEffect(() => {
    if (municipioSelecionado) garantirVaziosCarregados();
  }, [municipioSelecionado]);

  const quebras = useMemo(() => {
    if (!dados) return [];
    const valores = dados.features
      .map((f) => f.properties[indicador.id])
      .filter((v): v is number => typeof v === 'number');
    return calcularQuebrasQuantis(valores);
  }, [dados, indicador.id]);

  const codigosDestaque = useMemo(
    () => (destaqueLigado && vazios ? vazios.municipios.map((m) => m.codigoIbge) : null),
    [destaqueLigado, vazios],
  );

  // Descompasso Morfológico (21/07/2026) — classificação 100% do backend
  // (`descompassoMorfologico` já vem calculado em cada município de `vazios`,
  // ver vaziosDeAcesso.service.ts); aqui só filtra o array já carregado.
  const codigosDescompasso = useMemo(
    () =>
      descompassoLigado && vazios
        ? vazios.municipios.filter((m) => m.descompassoMorfologico).map((m) => m.codigoIbge)
        : null,
    [descompassoLigado, vazios],
  );

  // Badges do ranking (RF-032) — mesma classificação do backend, como Set.
  const codigosVazios = useMemo(
    () => (vazios ? new Set(vazios.municipios.map((m) => m.codigoIbge)) : null),
    [vazios],
  );

  // Pontos do heatmap (RF-057): centro do bbox de cada Vazio de Acesso
  // (geometria do GeoJSON já carregado) + peso = IVS normalizado min–max
  // DENTRO do conjunto de vazios (ver PESO_MINIMO_HEATMAP). A lista de quem
  // é vazio vem SEMPRE do backend; aqui só se monta a apresentação.
  const pontosHeatmap = useMemo<PontosHeatmap | null>(() => {
    if (!heatmapLigado || !vazios || !dados) return null;

    const geometriaPorCodigo = new Map(
      dados.features.map((f) => [f.properties.codigoIbge, f.geometry]),
    );

    const valoresIvs = vazios.municipios
      .map((m) => m.ivs)
      .filter((v): v is number => v !== null);
    const minimo = valoresIvs.length > 0 ? Math.min(...valoresIvs) : 0;
    const amplitude = valoresIvs.length > 0 ? Math.max(...valoresIvs) - minimo : 0;

    const features = vazios.municipios.flatMap(
      (m): PontosHeatmap['features'] => {
        const geometria = geometriaPorCodigo.get(m.codigoIbge);
        if (!geometria) return [];
        const centro = centroDaGeometria(geometria);
        if (!centro) return [];
        const peso =
          m.ivs === null
            ? PESO_MINIMO_HEATMAP
            : amplitude > 0
              ? PESO_MINIMO_HEATMAP +
                (1 - PESO_MINIMO_HEATMAP) * ((m.ivs - minimo) / amplitude)
              : 1;
        return [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: centro },
            properties: { peso },
          },
        ];
      },
    );

    return { type: 'FeatureCollection', features };
  }, [heatmapLigado, vazios, dados]);

  const listaMunicipios = useMemo(
    () => dados?.features.map((f) => f.properties) ?? [],
    [dados],
  );

  // Opções do painel de filtros (RF-046) — mesma técnica de derivar de
  // `listaMunicipios` já usada em PainelRanking.tsx para a lista de UFs.
  const ufsDisponiveis = useMemo(() => {
    const porUf = new Map<string, string>();
    for (const m of listaMunicipios) porUf.set(m.uf, m.nomeEstado);
    return [...porUf.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [listaMunicipios]);

  const regioesDisponiveis = useMemo(
    () => [...new Set(listaMunicipios.map((m) => m.regiao))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [listaMunicipios],
  );

  const filtrosDashboardAtivos = !!(
    filtroUf ||
    filtroRegiao ||
    filtroPotenciaMin ||
    filtroPotenciaMax
  );

  // RF-046: municípios visíveis no mapa depois do filtro — null quando nenhum
  // filtro está ativo (mostra todos). "Sem dado" de potência nunca casa com
  // filtro de faixa, mesma regra já usada no backend (buscarEFiltrarMunicipios).
  const codigosVisiveis = useMemo(() => {
    if (!dados || !filtrosDashboardAtivos) return null;
    const minimo = filtroPotenciaMin ? Number(filtroPotenciaMin) : undefined;
    const maximo = filtroPotenciaMax ? Number(filtroPotenciaMax) : undefined;
    return dados.features
      .filter((f) => {
        const m = f.properties;
        if (filtroUf && m.uf !== filtroUf) return false;
        if (filtroRegiao && m.regiao !== filtroRegiao) return false;
        if (minimo !== undefined && (m.potenciaInstaladaKw === null || m.potenciaInstaladaKw < minimo)) {
          return false;
        }
        if (maximo !== undefined && (m.potenciaInstaladaKw === null || m.potenciaInstaladaKw > maximo)) {
          return false;
        }
        return true;
      })
      .map((f) => f.properties.codigoIbge);
  }, [dados, filtrosDashboardAtivos, filtroUf, filtroRegiao, filtroPotenciaMin, filtroPotenciaMax]);

  function limparFiltrosDashboard() {
    setFiltroUf('');
    setFiltroRegiao('');
    setFiltroPotenciaMin('');
    setFiltroPotenciaMax('');
  }

  // Índice codigoIbge → município do GeoJSON original: o clique no mapa só
  // devolve o código (as properties do feature perdem os nulos na conversão
  // interna do MapLibre para tile vetorial — ver MapaMunicipios).
  const municipioPorCodigo = useMemo(
    () => new Map(dados?.features.map((f) => [f.properties.codigoIbge, f.properties]) ?? []),
    [dados],
  );

  // Busca do header (RF-026): consome ?municipio=<codigoIbge> como comando
  // one-shot — seleciona o município, voa até ele e REMOVE o parâmetro da URL
  // (replace, sem poluir o histórico). Consumir e remover permite repetir a
  // mesma busca (a URL volta a mudar) e, de quebra, dá deep-link: abrir
  // /mapa?municipio=3550308 direto já enquadra São Paulo quando o GeoJSON chega.
  const codigoBuscado = searchParams.get('municipio');
  useEffect(() => {
    if (!codigoBuscado || !dados) return;
    const municipio = municipioPorCodigo.get(codigoBuscado);
    if (municipio) {
      setMunicipioSelecionado(municipio);
      setFoco({ codigoIbge: codigoBuscado });
    }
    setSearchParams(
      (atuais) => {
        atuais.delete('municipio');
        return atuais;
      },
      { replace: true },
    );
  }, [codigoBuscado, dados, municipioPorCodigo, setSearchParams]);

  // RF-035: clicar num item do ranking = mesma mecânica da busca do header.
  function aoSelecionarDoRanking(codigoIbge: string) {
    setMunicipioSelecionado(municipioPorCodigo.get(codigoIbge) ?? null);
    setFoco({ codigoIbge });
  }

  // Escolher UF — compartilhado pelo PainelRanking (dropdown) e pelo clique
  // no estado do mapa (RF-027). Atualiza ranking, destaque e foco do mapa.
  function aoEscolherUfRanking(uf: string) {
    setUfRanking(uf);
    setUfDestacada(uf);
    if (uf) {
      garantirVaziosCarregados();
      setFoco({ uf });
    }
  }

  // RF-027/028: click num estado no mapa → seleciona UF + troca para aba Ranking.
  function aoClicarEstadoNoMapa(uf: string) {
    aoEscolherUfRanking(uf);
    setAbaSidebar('ranking');
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-stone-100">
      {/* Camada do mapa — tela cheia. Painéis de controle flutuam por cima
          (25/07/2026, auditoria de UX/UI: layout "encaixotado" antigo com
          sidebar/header sólidos virou Floating UI em vidro, mesmo padrão da
          landing page). Nenhuma prop mudou — MapaMunicipios continua
          isolado da lógica de negócio (CLAUDE.md Seção 4). */}
      <div className="absolute inset-0">
        <MapaMunicipios
          dados={dados}
          indicador={indicador}
          quebras={quebras}
          codigosDestaque={codigosDestaque}
          codigosDescompasso={codigosDescompasso}
          pontosHeatmap={pontosHeatmap}
          foco={foco}
          estados={estados}
          ufDestacada={ufDestacada || null}
          codigoDestacado={municipioSelecionado?.codigoIbge ?? null}
          codigosVisiveis={codigosVisiveis}
          aoClicarMunicipio={(codigoIbge) =>
            setMunicipioSelecionado(municipioPorCodigo.get(codigoIbge) ?? null)
          }
          aoClicarEstado={aoClicarEstadoNoMapa}
        />
      </div>

      {/* Painel de controle tático flutuante (esquerda): Camada Base +
          Lentes de Priorização + abas Ranking/Filtros. top-4/bottom-4 (em
          vez de vh) para a altura acompanhar o <main> do LayoutApp sem
          contas de viewport. */}
      {/* z-30 (não z-10): este wrapper compete por empilhamento contra os
          irmãos dele no nível raiz da página (legenda, painel de município)
          — como o SeletorIndicador aqui dentro precisa abrir por cima de
          TUDO, o wrapper precisa vencer essa disputa, não só a interna entre
          os 3 cards (ver comentário no card do indicador, abaixo). */}
      <div className="absolute top-4 bottom-4 left-4 z-30 flex w-80 flex-col gap-3 sm:top-6 sm:bottom-6 sm:left-6">
        {/* z-20/z-10/z-0 nos 3 blocos abaixo (25/07/2026, bug real de
            stacking context): backdrop-blur força cada card a virar seu
            próprio stacking context, então o z-30 do dropdown de
            SeletorIndicador fica preso DENTRO do stacking context deste
            card — sem um z-index explícito aqui (maior que o dos irmãos
            abaixo), o card de Lentes (mais tarde no DOM) ganhava a disputa
            de empilhamento e engolia o menu. Como os 3 são itens flex,
            z-index já funciona neles sem precisar de position:relative. */}
        <div className="relative z-20 shrink-0 rounded-2xl border border-white/90 bg-white/70 p-4 shadow-[0_12px_40px_rgb(0,0,0,0.08)] backdrop-blur-xl">
          <SeletorIndicador indicadores={INDICADORES_MAPA} valor={indicador.id} aoMudar={setIndicadorId} />
          {/* Esclarecimento metodológico do indicador ativo (quando houver —
              irradiação e CadÚnico EXIGEM contextualização, ver indicadores.ts). */}
          {indicador.descricao && (
            <div className="mt-3 border-t border-stone-200/70 pt-3">
              <span className="block text-[10px] font-bold tracking-widest text-stone-500 uppercase">
                Nota científica
              </span>
              <p className="mt-0.5 text-xs leading-normal text-stone-600">{indicador.descricao}</p>
            </div>
          )}
        </div>

        <div className="relative z-10 shrink-0 rounded-2xl border border-red-200/60 bg-red-50/60 p-4 shadow-[0_12px_40px_rgb(185,28,28,0.08)] backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2 border-b border-red-200/70 pb-2">
            <span className="text-[10px] font-bold tracking-widest text-red-900 uppercase">
              Lentes de priorização
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <InterruptorLente
              rotulo="Destacar Vazios de Acesso"
              ligado={destaqueLigado}
              aoAlternar={aoAlternarDestaque}
              nota={carregandoVazios ? 'carregando…' : undefined}
            />
            <InterruptorLente
              rotulo="Descompasso Morfológico"
              ligado={descompassoLigado}
              aoAlternar={aoAlternarDescompasso}
              nota={vazios ? `(${vazios.municipios.filter((m) => m.descompassoMorfologico).length})` : undefined}
            />
            <button
              type="button"
              onClick={() => aoAlternarHeatmap(!heatmapLigado)}
              className={`mt-1 w-full rounded-lg px-4 py-2 text-xs font-bold shadow-sm transition-all ${
                heatmapLigado
                  ? 'bg-red-700 text-white hover:bg-red-800'
                  : 'border border-red-200 bg-white/70 text-red-800 hover:bg-white'
              }`}
            >
              {heatmapLigado ? 'Ver mapa normal' : 'Gerar heatmap de exclusão'}
            </button>
          </div>

          {/* Avisos operacionais — mesmas condições de antes, só reposicionados. */}
          {heatmapLigado && (
            <p className="mt-2 text-xs text-stone-500">
              O indicador do mapa fica esmaecido enquanto o heatmap está ativo.
            </p>
          )}
          {erroVazios && <p className="mt-2 text-xs text-red-600">{erroVazios}</p>}
          {(destaqueLigado || heatmapLigado || descompassoLigado) &&
            vazios &&
            vazios.avisos.totalPrecisaReextrairMmgd > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {vazios.avisos.totalPrecisaReextrairMmgd.toLocaleString('pt-BR')} municípios fora da
              classificação (MMGD residencial pendente de re-extração — ver CLAUDE.md).
            </p>
          )}
          {filtrosDashboardAtivos && abaSidebar !== 'filtros' && (
            <p className="mt-2 text-xs text-amber-700">
              Filtro ativo: {codigosVisiveis?.length ?? 0} de {listaMunicipios.length} municípios
              visíveis.
            </p>
          )}
        </div>

        {/* Abas: Ranking (RF-030 a RF-036) | Filtros (RF-046/047) */}
        <div className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/90 bg-white/70 shadow-[0_12px_40px_rgb(0,0,0,0.08)] backdrop-blur-xl">
          <div className="flex shrink-0 gap-1 border-b border-stone-200/70 p-1.5">
            <button
              type="button"
              onClick={() => setAbaSidebar('ranking')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                abaSidebar === 'ranking'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Ranking estadual
            </button>
            <button
              type="button"
              onClick={() => setAbaSidebar('filtros')}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                abaSidebar === 'filtros'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Filtros do mapa
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {abaSidebar === 'ranking' ? (
              <PainelRanking
                municipios={listaMunicipios}
                indicador={indicador}
                codigosVazios={codigosVazios}
                carregandoVazios={carregandoVazios}
                aoSelecionarMunicipio={aoSelecionarDoRanking}
                ufSelecionada={ufRanking}
                aoEscolherUf={aoEscolherUfRanking}
              />
            ) : (
              <PainelFiltrosDashboard
                ufs={ufsDisponiveis}
                regioes={regioesDisponiveis}
                uf={filtroUf}
                regiao={filtroRegiao}
                potenciaMin={filtroPotenciaMin}
                potenciaMax={filtroPotenciaMax}
                totalVisiveis={codigosVisiveis?.length ?? listaMunicipios.length}
                totalMunicipios={listaMunicipios.length}
                aoMudarUf={(uf) => {
                  setFiltroUf(uf);
                  setUfDestacada(uf);
                  if (uf) setFoco({ uf }); // mesma UX do ranking: escolher UF enquadra o estado
                }}
                aoMudarRegiao={setFiltroRegiao}
                aoMudarPotenciaMin={setFiltroPotenciaMin}
                aoMudarPotenciaMax={setFiltroPotenciaMax}
                aoLimparFiltros={limparFiltrosDashboard}
              />
            )}
          </div>
        </div>
      </div>

      {/* Legenda/heatmap flutuante — no modo heatmap (RF-057) o painel do
          heatmap substitui a legenda do choropleth (modo exclusivo: o
          choropleth está esmaecido). */}
      <div className="absolute bottom-6 left-4 z-10 sm:left-6">
        {heatmapLigado && vazios ? (
          <PainelHeatmapVazios
            totalVazios={vazios.municipios.length}
            medianaNacional={vazios.medianaNacional}
            notaMetodologica={vazios.notaMetodologica}
          />
        ) : (
          <Legenda
            indicador={indicador}
            quebras={quebras}
            destaqueLigado={destaqueLigado && !!vazios}
            totalDestacados={vazios?.municipios.length ?? 0}
          />
        )}
      </div>

      {/* Estados de carga/erro do GeoJSON nacional */}
      {carregando && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-stone-100/60 backdrop-blur-sm">
          <p className="rounded-2xl border border-white/90 bg-white/90 px-5 py-3 text-sm font-medium text-stone-600 shadow-[0_12px_40px_rgb(0,0,0,0.1)] backdrop-blur-xl">
            Carregando a malha municipal (~5.570 municípios)…
          </p>
        </div>
      )}
      {erro && !carregando && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-stone-100/60 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/90 bg-white/90 px-5 py-4 text-sm shadow-[0_12px_40px_rgb(0,0,0,0.1)] backdrop-blur-xl">
            <p className="font-semibold text-red-600">{erro}</p>
            <p className="mt-1 text-stone-500">
              O backend está rodando? (<code>make dev</code> na raiz do projeto)
            </p>
          </div>
        </div>
      )}

      {/* Painel de detalhe do município — flutuante à direita. */}
      {municipioSelecionado && (
        <div className="absolute top-4 bottom-4 right-4 z-10 sm:top-6 sm:right-6 sm:bottom-6">
          <PainelMunicipio
            municipio={municipioSelecionado}
            aoFechar={() => setMunicipioSelecionado(null)}
            medianaIrradiacao={vazios?.medianaNacional.potencialSolarKwhM2Dia ?? null}
            limiarPrecariedadeHabitacionalAlta={vazios?.limiarPrecariedadeHabitacionalAlta ?? null}
          />
        </div>
      )}
    </div>
  );
}
