import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapaMunicipios,
  type FocoMunicipio,
  type PontosHeatmap,
} from '../components/mapa/MapaMunicipios';
import { Legenda } from '../components/mapa/Legenda';
import { PainelFiltrosDashboard } from '../components/mapa/PainelFiltrosDashboard';
import { PainelHeatmapVazios } from '../components/mapa/PainelHeatmapVazios';
import { PainelMunicipio } from '../components/mapa/PainelMunicipio';
import { PainelRanking } from '../components/mapa/PainelRanking';
import { buscarGeoJsonNacional } from '../services/municipios.service';
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
 * Mapa interativo do Atlas (RF-016/017 choropleth; RF-055/056 destaque dos
 * Vazios de Acesso). Toda a busca de dado fica aqui (via services) — o
 * componente de mapa só renderiza o que recebe.
 */
export function PaginaMapa() {
  const [dados, setDados] = useState<FeatureCollectionMunicipios | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [indicadorId, setIndicadorId] = useState(INDICADORES_MAPA[0].id);
  const indicador = INDICADORES_MAPA.find((i) => i.id === indicadorId) ?? INDICADORES_MAPA[0];

  const [destaqueLigado, setDestaqueLigado] = useState(false);
  const [heatmapLigado, setHeatmapLigado] = useState(false);
  const [vazios, setVazios] = useState<VaziosDeAcessoCompleto | null>(null);
  const [carregandoVazios, setCarregandoVazios] = useState(false);
  const [erroVazios, setErroVazios] = useState<string | null>(null);

  const [municipioSelecionado, setMunicipioSelecionado] =
    useState<MunicipioComIndicadores | null>(null);
  const [foco, setFoco] = useState<FocoMunicipio | null>(null);
  const [rankingAberto, setRankingAberto] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Filtros do Dashboard Público (RF-046) + download (RF-047). Painel
  // controlado (ver PainelFiltrosDashboard.tsx) — os valores moram aqui
  // porque o cálculo de codigosVisiveis (abaixo) precisa deles junto com
  // `dados`, que também mora nesta página.
  const [filtrosAberto, setFiltrosAberto] = useState(false);
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

  // Ranking (RF-030) e Filtros (RF-046) são dois painéis laterais do mesmo
  // tamanho — mantidos mutuamente exclusivos para não disputar espaço à
  // esquerda do mapa.
  function alternarFiltros() {
    setFiltrosAberto((aberto) => !aberto);
    setRankingAberto(false);
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

  // RF-035: clicar num item do ranking = mesma mecânica da busca do header
  // (abre o painel de detalhe e enquadra o município no mapa).
  function aoSelecionarDoRanking(codigoIbge: string) {
    setMunicipioSelecionado(municipioPorCodigo.get(codigoIbge) ?? null);
    setFoco({ codigoIbge });
  }

  return (
    <div className="relative flex h-full">
      {rankingAberto && dados && (
        <PainelRanking
          municipios={listaMunicipios}
          indicador={indicador}
          codigosVazios={codigosVazios}
          carregandoVazios={carregandoVazios}
          aoSelecionarMunicipio={aoSelecionarDoRanking}
          aoFechar={() => setRankingAberto(false)}
        />
      )}

      {filtrosAberto && dados && (
        <PainelFiltrosDashboard
          ufs={ufsDisponiveis}
          regioes={regioesDisponiveis}
          uf={filtroUf}
          regiao={filtroRegiao}
          potenciaMin={filtroPotenciaMin}
          potenciaMax={filtroPotenciaMax}
          totalVisiveis={codigosVisiveis?.length ?? listaMunicipios.length}
          totalMunicipios={listaMunicipios.length}
          aoMudarUf={setFiltroUf}
          aoMudarRegiao={setFiltroRegiao}
          aoMudarPotenciaMin={setFiltroPotenciaMin}
          aoMudarPotenciaMax={setFiltroPotenciaMax}
          aoLimparFiltros={limparFiltrosDashboard}
          aoFechar={() => setFiltrosAberto(false)}
        />
      )}

      <div className="relative min-w-0 flex-1">
        <MapaMunicipios
          dados={dados}
          indicador={indicador}
          quebras={quebras}
          codigosDestaque={codigosDestaque}
          pontosHeatmap={pontosHeatmap}
          foco={foco}
          codigosVisiveis={codigosVisiveis}
          aoClicarMunicipio={(codigoIbge) =>
            setMunicipioSelecionado(municipioPorCodigo.get(codigoIbge) ?? null)
          }
        />

        {/* Controles */}
        <div className="absolute top-4 left-4 w-72 rounded-lg border border-slate-200 bg-white/95 p-3 shadow">
          <label htmlFor="seletor-indicador" className="mb-1 block text-xs font-semibold text-slate-600">
            Indicador do mapa
          </label>
          <select
            id="seletor-indicador"
            value={indicador.id}
            onChange={(evento) =>
              setIndicadorId(evento.target.value as (typeof INDICADORES_MAPA)[number]['id'])
            }
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
          >
            {INDICADORES_MAPA.map((opcao) => (
              <option key={opcao.id} value={opcao.id}>
                {opcao.rotulo}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setRankingAberto((aberto) => !aberto);
              setFiltrosAberto(false);
              if (!rankingAberto) garantirVaziosCarregados();
            }}
            className="mt-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {rankingAberto ? 'Fechar ranking estadual' : 'Ranking estadual'}
          </button>

          <button
            type="button"
            onClick={alternarFiltros}
            className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {filtrosAberto ? 'Fechar filtros' : 'Filtros (Dashboard Público)'}
          </button>
          {filtrosDashboardAtivos && !filtrosAberto && (
            <p className="mt-1 text-xs text-amber-600">
              Filtro ativo: {codigosVisiveis?.length ?? 0} de {listaMunicipios.length} municípios
              visíveis.
            </p>
          )}

          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={destaqueLigado}
              onChange={(evento) => aoAlternarDestaque(evento.target.checked)}
              className="h-4 w-4"
            />
            Destacar Vazios de Acesso
            {carregandoVazios && <span className="text-xs text-slate-400">carregando…</span>}
          </label>

          <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={heatmapLigado}
              onChange={(evento) => aoAlternarHeatmap(evento.target.checked)}
              className="h-4 w-4"
            />
            Heatmap de Vazios de Acesso
          </label>
          {heatmapLigado && (
            <p className="mt-1 text-xs text-slate-400">
              O indicador do mapa fica esmaecido enquanto o heatmap está ativo.
            </p>
          )}

          {erroVazios && <p className="mt-1 text-xs text-red-600">{erroVazios}</p>}
          {(destaqueLigado || heatmapLigado) && vazios && vazios.avisos.totalPrecisaReextrairMmgd > 0 && (
            <p className="mt-1 text-xs text-amber-600">
              {vazios.avisos.totalPrecisaReextrairMmgd.toLocaleString('pt-BR')} municípios fora da
              classificação (MMGD residencial pendente de re-extração — ver CLAUDE.md).
            </p>
          )}
        </div>

        {/* Legenda — no modo heatmap (RF-057) o painel do heatmap substitui a
            legenda do choropleth (modo exclusivo: o choropleth está esmaecido). */}
        <div className="absolute bottom-6 left-4">
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
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <p className="rounded-lg bg-white px-4 py-2 text-sm text-slate-600 shadow">
              Carregando a malha municipal (~5.570 municípios)…
            </p>
          </div>
        )}
        {erro && !carregando && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <div className="rounded-lg bg-white px-4 py-3 text-sm shadow">
              <p className="text-red-600">{erro}</p>
              <p className="mt-1 text-slate-500">
                O backend está rodando? (<code>make dev</code> na raiz do projeto)
              </p>
            </div>
          </div>
        )}
      </div>

      {municipioSelecionado && (
        <PainelMunicipio
          municipio={municipioSelecionado}
          aoFechar={() => setMunicipioSelecionado(null)}
        />
      )}
    </div>
  );
}
