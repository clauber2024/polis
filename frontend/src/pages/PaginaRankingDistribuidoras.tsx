import { Fragment, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode, SVGProps } from 'react';
import { buscarRankingDistribuidoras } from '../services/rankingDistribuidoras.service';
import type {
  DistribuidoraRanking,
  RankingDistribuidorasResultado,
  ResumoNacionalFriccao,
} from '../types/api';
import { formatarValor } from '../utils/formatadores';

/**
 * Ranking de Fricção e Atrasos na Conexão Solar (MMGD) — 30/07/2026, pivô
 * explícito de posicionamento de produto pedido pelo usuário no mesmo dia
 * (reverte a tentativa anterior, também deste dia, de suavizar o tom para
 * "Matriz de Desempenho Setorial"). Objetivo declarado: ferramenta de
 * pressão pública/accountability sobre concessionárias com maior fricção na
 * conexão de MMGD.
 *
 * Para blindar contra contestação jurídica (justificativa do próprio
 * usuário), a posição no ranking usa ESTRITAMENTE o eixo técnico/operacional
 * (conexão + prazo ANEEL) — o IVSH (contexto socioeconômico da área de
 * concessão) é calculado no backend mas deliberadamente NÃO aparece nesta
 * tela nem entra na pontuação, para que nenhuma distribuidora possa alegar
 * que a vulnerabilidade da região atendida "explica" um mau desempenho
 * técnico. Ver docstring completa de `rankingDistribuidoras.service.ts`
 * (backend) para a metodologia e a mudança de critério de segregação que
 * acompanha esse pivô.
 *
 * Comparativos (mesma sessão, pedido complementar do usuário): desvio vs.
 * média nacional, distância do benchmark de melhor desempenho e o
 * drill-down por linha (clique expande um comparativo de barras) usam
 * SEMPRE `resumoNacional`/os campos de desvio já calculados no backend a
 * partir de dado real (nunca um número fabricado no cliente).
 *
 * "Consumidores Totais" e "% com Solar" continuam fora desta base (INDQUAL/
 * fila de conexão ANEEL não tem essas métricas) — ver nota de rodapé da
 * tabela, mesma ressalva já documentada na versão anterior desta página.
 */
export function PaginaRankingDistribuidoras() {
  const [dados, setDados] = useState<RankingDistribuidorasResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroRegiao, setFiltroRegiao] = useState('');
  const [linhaExpandida, setLinhaExpandida] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarRankingDistribuidoras()
      .then((resultado) => {
        if (ativo) setDados(resultado);
      })
      .catch((causa: unknown) => {
        if (ativo) {
          setErro(causa instanceof Error ? causa.message : 'Falha ao carregar o ranking.');
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  const rankingComPosicao = useMemo<ItemComPosicao[]>(
    () => (dados ? dados.rankingPrincipal.map((item, indice) => ({ ...item, posicao: indice + 1 })) : []),
    [dados],
  );

  // Terço pior calculado sobre a posição REAL no ranking nacional completo
  // (nunca recalculado dentro do subconjunto filtrado por região) — evita
  // que filtrar por região "esconda" uma distribuidora ruim só porque as
  // vizinhas da mesma região são igualmente ruins.
  const limiarTercoRuim = Math.ceil(rankingComPosicao.length / 3);

  const regioesDisponiveis = useMemo(() => {
    const todas = dados ? [...dados.rankingPrincipal, ...dados.distribuidorasComDadosIncompletos] : [];
    return Array.from(new Set(todas.map((item) => item.regiaoPrincipal))).sort();
  }, [dados]);

  function filtrarPorRegiao<T extends { regiaoPrincipal: string }>(itens: T[]): T[] {
    return filtroRegiao ? itens.filter((item) => item.regiaoPrincipal === filtroRegiao) : itens;
  }

  const rankingFiltrado = filtrarPorRegiao(rankingComPosicao);
  const incompletosFiltrados = dados ? filtrarPorRegiao(dados.distribuidorasComDadosIncompletos) : [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-black tracking-tight text-stone-900">
        Ranking de Fricção e Atrasos na Conexão Solar (MMGD)
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-stone-600">
        Ordena as concessionárias do país pela maior fricção na conexão de Microgeração
        Distribuída solar — taxa de conexão e cumprimento de prazo regulatório da ANEEL. O
        critério é estritamente operacional: fatores socioeconômicos da área de concessão são
        deliberadamente isolados desta pontuação.
      </p>

      {erro && !dados && <p className="mt-6 text-sm text-red-600">{erro}</p>}
      {!dados && !erro && <p className="mt-6 text-sm text-stone-500">Carregando ranking…</p>}

      {dados && (
        <>
          {dados.resumoNacional && <CardAlertaNacional resumo={dados.resumoNacional} />}

          {/* Metodologia — resumo curto, sempre visível (não em tooltip). */}
          <div className="mt-6 rounded-2xl bg-white/70 p-6 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
            <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">Metodologia</p>
            <p className="mt-2 text-xs text-stone-600">
              <strong className="font-bold text-stone-800">Índice Sintético de Fricção:</strong>{' '}
              {dados.metodologia.eixoTecnico}
            </p>
            <p className="mt-1.5 text-xs text-stone-600">
              <strong className="font-bold text-stone-800">O que fica de fora de propósito:</strong>{' '}
              {dados.notaMetodologicaJustica}
            </p>
          </div>

          {/* Filtro rápido */}
          <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl bg-white/70 p-4 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
            <div className="min-w-[180px]">
              <label
                htmlFor="filtro-regiao-friccao"
                className="mb-1.5 block text-[10px] font-bold tracking-widest text-stone-500 uppercase"
              >
                Região
              </label>
              <div className="relative">
                <select
                  id="filtro-regiao-friccao"
                  value={filtroRegiao}
                  onChange={(evento) => setFiltroRegiao(evento.target.value)}
                  className={`${CLASSE_CAMPO} appearance-none pr-8`}
                >
                  <option value="">Todas as regiões</option>
                  {regioesDisponiveis.map((regiao) => (
                    <option key={regiao} value={regiao}>
                      {regiao}
                    </option>
                  ))}
                </select>
                <IconeChevron className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
              </div>
            </div>

            {filtroRegiao && (
              <button
                type="button"
                onClick={() => setFiltroRegiao('')}
                className="rounded-lg border border-stone-200/80 bg-white/50 px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white/80"
              >
                Limpar filtro
              </button>
            )}
          </div>

          <SecaoRanking
            titulo="Ranking"
            contagem={`${rankingFiltrado.length} de ${rankingComPosicao.length} concessionárias — posição 1 = maior fricção`}
          >
            <TabelaRanking
              itens={rankingFiltrado}
              limiarTercoRuim={limiarTercoRuim}
              resumoNacional={dados.resumoNacional}
              linhaExpandida={linhaExpandida}
              aoAlternarExpansao={(distribuidora) =>
                setLinhaExpandida((atual) => (atual === distribuidora ? null : distribuidora))
              }
            />
          </SecaoRanking>

          <SecaoRanking
            titulo="Dados incompletos"
            contagem={`${incompletosFiltrados.length} de ${dados.distribuidorasComDadosIncompletos.length} concessionárias — fora do ranking, nunca comparadas na mesma posição`}
            subtitulo={dados.notaMetodologicaDadosIncompletos}
          >
            <TabelaIncompletos itens={incompletosFiltrados} />
          </SecaoRanking>
        </>
      )}
    </div>
  );
}

interface ItemComPosicao extends DistribuidoraRanking {
  posicao: number;
}

function formatarMultiplicador(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`;
}

function formatarDesvioRelativo(valor: number | null): string {
  if (valor === null) return 'sem dado';
  const arredondado = Math.round(valor);
  return `${arredondado >= 0 ? '+' : ''}${arredondado}%`;
}

function CardAlertaNacional({ resumo }: { resumo: ResumoNacionalFriccao }) {
  const frases: string[] = [];

  if (resumo.percentualDosPedidosForaDoPrazoNoTop5 !== null) {
    frases.push(
      `As 5 piores concessionárias do ranking concentram ${formatarValor(resumo.percentualDosPedidosForaDoPrazoNoTop5, 'percentual')} dos pedidos de conexão solar fora do prazo regulatório entre as distribuidoras com dado confiável no Brasil.`,
    );
  }

  frases.push(
    resumo.multiplicadorPiorSobreBenchmark !== null
      ? `A pior concessionária do ranking (${resumo.piorDesempenho.distribuidora}) acumula um índice de atraso ${formatarMultiplicador(resumo.multiplicadorPiorSobreBenchmark)} maior que a referência em eficiência do setor (${resumo.benchmarkMelhorDesempenho.distribuidora}, ${formatarValor(resumo.benchmarkMelhorDesempenho.pctForaDoPrazo, 'percentual')} fora do prazo).`
      : `A pior concessionária do ranking (${resumo.piorDesempenho.distribuidora}) tem ${formatarValor(resumo.piorDesempenho.pctForaDoPrazo, 'percentual')} dos pedidos fora do prazo regulatório, contra 0% da referência em eficiência do setor (${resumo.benchmarkMelhorDesempenho.distribuidora}).`,
  );

  return (
    <div className="mt-6 rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-red-50/30 p-6 shadow-lg shadow-red-100/40 ring-1 ring-red-900/5 backdrop-blur-xl">
      <p className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-red-700 uppercase">
        <IconeAlerta className="h-3.5 w-3.5" />
        Alerta nacional
      </p>
      <ul className="mt-3 space-y-2">
        {frases.map((frase) => (
          <li key={frase} className="text-sm leading-relaxed font-bold text-red-950">
            {frase}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-red-700/70">
        Média nacional ponderada por volume de pedidos:{' '}
        {formatarValor(resumo.mediaNacionalPctForaDoPrazo, 'percentual')} fora do prazo regulatório.
      </p>
    </div>
  );
}

function IconeChevron(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconeAlerta(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/** Mesmo recipe de campo "vidro" usado em PainelFiltrosDashboard.tsx — consistência de design system. */
const CLASSE_CAMPO =
  'w-full rounded-lg border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-medium text-stone-800 shadow-sm backdrop-blur-sm outline-none transition-all focus:border-red-400 focus:ring-2 focus:ring-red-400/20';

interface SecaoRankingProps {
  titulo: string;
  contagem: string;
  subtitulo?: string;
  children: ReactNode;
}

function SecaoRanking({ titulo, contagem, subtitulo, children }: SecaoRankingProps) {
  return (
    <section className="mt-8 rounded-2xl bg-white/70 p-6 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
      <h2 className="text-sm font-black tracking-wide text-stone-900 uppercase">
        {titulo}
        <span className="ml-2 text-xs font-normal tracking-normal text-stone-400 normal-case">({contagem})</span>
      </h2>
      {subtitulo && <p className="mt-1 text-xs text-stone-500">{subtitulo}</p>}
      {children}
    </section>
  );
}

interface TabelaRankingProps {
  itens: ItemComPosicao[];
  limiarTercoRuim: number;
  resumoNacional: ResumoNacionalFriccao | null;
  linhaExpandida: string | null;
  aoAlternarExpansao: (distribuidora: string) => void;
}

function TabelaRanking({ itens, limiarTercoRuim, resumoNacional, linhaExpandida, aoAlternarExpansao }: TabelaRankingProps) {
  if (itens.length === 0) {
    return <p className="mt-3 text-sm text-stone-500">Nenhuma concessionária com o filtro atual.</p>;
  }

  const maiorDistanciaBenchmark = Math.max(
    ...itens.map((item) => item.distanciaDoBenchmarkPontosPercentuais ?? 0),
    0.01,
  );

  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-stone-200/60">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead>
            <tr className="bg-stone-50/80 text-[9px] font-black tracking-widest text-stone-400 uppercase">
              <th className="px-3 py-2" colSpan={1}>
                Ranking
              </th>
              <th className="border-l border-stone-200/60 px-3 py-2" colSpan={2}>
                Identificação
              </th>
              <th className="border-l border-stone-200/60 px-3 py-2" colSpan={1}>
                Volume
              </th>
              <th className="border-l border-stone-200/60 px-3 py-2" colSpan={4}>
                Desempenho regulatório
              </th>
              <th className="border-l border-stone-200/60 px-3 py-2" colSpan={1}>
                Indicador sintético
              </th>
            </tr>
            <tr className="border-t border-stone-200/60 bg-stone-50/80 text-xs font-bold text-stone-600">
              <th className="px-3 py-2">#</th>
              <th className="border-l border-stone-200/60 px-3 py-2">Concessionária</th>
              <th className="px-3 py-2">Região</th>
              <th className="border-l border-stone-200/60 px-3 py-2 text-right">Pedidos MMGD*</th>
              <th className="border-l border-stone-200/60 px-3 py-2 text-right">% conectado*</th>
              <th className="px-3 py-2 text-right">% fora do prazo</th>
              <th className="px-3 py-2 text-right">Desvio vs. média</th>
              <th className="px-3 py-2 text-right">Distância do benchmark</th>
              <th className="border-l border-stone-200/60 px-3 py-2 text-right">Índice de Fricção</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const critico = item.posicao <= limiarTercoRuim;
              const expandida = linhaExpandida === item.distribuidora;
              const distanciaBenchmark = item.distanciaDoBenchmarkPontosPercentuais;
              const larguraBarraBenchmark =
                distanciaBenchmark !== null
                  ? Math.min(100, Math.max(4, (distanciaBenchmark / maiorDistanciaBenchmark) * 100))
                  : 0;
              const desvio = item.desvioPctForaDoPrazoRelativoPercentual;

              return (
                <Fragment key={item.distribuidora}>
                  <tr
                    role="button"
                    tabIndex={0}
                    aria-expanded={expandida}
                    onClick={() => aoAlternarExpansao(item.distribuidora)}
                    onKeyDown={(evento: KeyboardEvent<HTMLTableRowElement>) => {
                      if (evento.key === 'Enter' || evento.key === ' ') aoAlternarExpansao(item.distribuidora);
                    }}
                    className={`cursor-pointer border-t border-stone-100/80 outline-none transition-colors hover:bg-stone-50/80 ${critico ? 'bg-red-50/50' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-black ${
                          critico ? 'bg-red-800 text-white' : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {item.posicao}º
                      </span>
                    </td>
                    <td className="border-l border-stone-100/80 px-3 py-2.5 font-bold text-stone-900">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.distribuidora}
                        {critico && (
                          <span className="rounded bg-red-700 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white uppercase">
                            Crítico
                          </span>
                        )}
                        {item.amostraPequena && (
                          <span
                            title="Menos de 1.000 pedidos — amostra estatisticamente menos robusta."
                            className="rounded bg-stone-100 px-1 py-0.5 text-[9px] font-bold text-stone-500"
                          >
                            amostra pequena
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-stone-600 capitalize">{item.regiaoPrincipal}</td>
                    <td className="border-l border-stone-100/80 px-3 py-2.5 text-right text-stone-600">
                      {formatarValor(item.nPedidos, 'inteiro')}
                    </td>
                    <td className="border-l border-stone-100/80 px-3 py-2.5 text-right text-stone-600">
                      {formatarValor(item.pctConectado, 'percentual')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-stone-800">
                      {formatarValor(item.pctForaDoPrazo, 'percentual')}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold ${desvio !== null && desvio > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {formatarDesvioRelativo(desvio)}
                    </td>
                    <td className="px-3 py-2.5">
                      {distanciaBenchmark !== null ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                            <div
                              className="h-full rounded-full bg-red-400"
                              style={{ width: `${larguraBarraBenchmark}%` }}
                            />
                          </div>
                          <span className="w-14 shrink-0 text-right text-[11px] font-bold text-stone-500">
                            +{distanciaBenchmark.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pp
                          </span>
                        </div>
                      ) : (
                        <span className="block text-right text-stone-400">sem dado</span>
                      )}
                    </td>
                    <td className="border-l border-stone-100/80 px-3 py-2.5 text-right font-black text-red-800">
                      {formatarValor(item.eixoTecnico, 'numero')}
                    </td>
                  </tr>
                  {expandida && resumoNacional && item.pctForaDoPrazo !== null && (
                    <tr className="border-t border-stone-100/80 bg-stone-50/60">
                      <td colSpan={9} className="px-6 py-4">
                        <ComparativoBarras
                          nomeEmpresa={item.distribuidora}
                          valorEmpresa={item.pctForaDoPrazo}
                          resumo={resumoNacional}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-stone-400">
        Clique numa linha para ver o comparativo de barras (empresa x média nacional x benchmark do
        setor). * Esta base (fila de conexão ANEEL + INDQUAL) não tem o total de consumidores de cada
        concessionária nem uma métrica de "% com Solar" isolada de MMGD — os campos exibidos são
        pedidos de conexão MMGD processados e sua taxa de conclusão, os dados reais disponíveis mais
        próximos. "pp" = pontos percentuais.
      </p>
    </>
  );
}

function ComparativoBarras({
  nomeEmpresa,
  valorEmpresa,
  resumo,
}: {
  nomeEmpresa: string;
  valorEmpresa: number;
  resumo: ResumoNacionalFriccao;
}) {
  const linhas = [
    { rotulo: nomeEmpresa, valor: valorEmpresa, cor: '#b91c1c' },
    { rotulo: 'Média nacional', valor: resumo.mediaNacionalPctForaDoPrazo, cor: '#a8a29e' },
    {
      rotulo: `Benchmark do setor (${resumo.benchmarkMelhorDesempenho.distribuidora})`,
      valor: resumo.benchmarkMelhorDesempenho.pctForaDoPrazo,
      cor: '#15803d',
    },
  ];

  return (
    <div className="max-w-xl space-y-2">
      <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">
        % fora do prazo regulatório — comparativo
      </p>
      {linhas.map((linha) => (
        <div key={linha.rotulo} className="flex items-center gap-2">
          <span className="w-44 shrink-0 truncate text-[11px] font-bold text-stone-600" title={linha.rotulo}>
            {linha.rotulo}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200/70">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, linha.valor))}%`, backgroundColor: linha.cor }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-[11px] font-black text-stone-800">
            {formatarValor(linha.valor, 'percentual')}
          </span>
        </div>
      ))}
    </div>
  );
}

function TabelaIncompletos({ itens }: { itens: DistribuidoraRanking[] }) {
  if (itens.length === 0) {
    return <p className="mt-3 text-sm text-stone-500">Nenhuma concessionária nesta seção com o filtro atual.</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-stone-200/60">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead>
          <tr className="bg-stone-50/80 text-xs font-bold text-stone-600">
            <th className="px-3 py-2">Concessionária</th>
            <th className="px-3 py-2">Região</th>
            <th className="px-3 py-2 text-right">Pedidos MMGD</th>
            <th className="px-3 py-2 text-right">% conectado</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.distribuidora} className="border-t border-stone-100/80">
              <td className="px-3 py-2.5 font-bold text-stone-900">
                {item.distribuidora}
                {item.motivosDadosIncompletos.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[11px] font-normal text-stone-500">
                    {item.motivosDadosIncompletos.map((motivo) => (
                      <li key={motivo}>{motivo}</li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-3 py-2.5 text-stone-600 capitalize">{item.regiaoPrincipal}</td>
              <td className="px-3 py-2.5 text-right text-stone-600">{formatarValor(item.nPedidos, 'inteiro')}</td>
              <td className="px-3 py-2.5 text-right text-stone-600">{formatarValor(item.pctConectado, 'percentual')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
