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

          {/* Metodologia — versão curta e direta (30/07/2026, pedido do usuário:
              o bloco anterior, com 2 parágrafos densos, poluía o topo da tela). */}
          <p className="mt-6 text-xs leading-relaxed text-stone-500">
            <strong className="font-bold text-stone-700">Índice de Fricção</strong> = taxa de conexão +
            cumprimento de prazo da ANEEL, normalizados entre distribuidoras. Fatores socioeconômicos da
            região atendida não entram nesta pontuação.
          </p>

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

function CardAlertaNacional({ resumo }: { resumo: ResumoNacionalFriccao }) {
  const frases: string[] = [];

  if (resumo.percentualDosPedidosForaDoPrazoNoTop5 !== null) {
    frases.push(
      `As 5 piores concessionárias do ranking concentram ${formatarValor(resumo.percentualDosPedidosForaDoPrazoNoTop5, 'percentual')} dos pedidos de conexão solar fora do prazo regulatório entre as distribuidoras com dado confiável no Brasil.`,
    );
  }

  // Empate no valor extremo (30/07/2026, achado real: 3 distribuidoras diferentes
  // empatam em 0% fora do prazo no dado de produção) — citar só uma como "A
  // referência" sem avisar do empate seria enganoso, ver docstring do backend.
  const referenciaBenchmark =
    resumo.benchmarkMelhorDesempenho.empatados > 1
      ? `${resumo.benchmarkMelhorDesempenho.distribuidora}, empatada com mais ${resumo.benchmarkMelhorDesempenho.empatados - 1} distribuidora${resumo.benchmarkMelhorDesempenho.empatados > 2 ? 's' : ''}`
      : resumo.benchmarkMelhorDesempenho.distribuidora;

  frases.push(
    resumo.multiplicadorPiorSobreBenchmark !== null
      ? `A pior concessionária do ranking (${resumo.piorDesempenho.distribuidora}) acumula um índice de atraso ${formatarMultiplicador(resumo.multiplicadorPiorSobreBenchmark)} maior que a referência em eficiência do setor (${referenciaBenchmark}, ${formatarValor(resumo.benchmarkMelhorDesempenho.pctForaDoPrazo, 'percentual')} fora do prazo).`
      : `A pior concessionária do ranking (${resumo.piorDesempenho.distribuidora}) tem ${formatarValor(resumo.piorDesempenho.pctForaDoPrazo, 'percentual')} dos pedidos fora do prazo regulatório, contra 0% da referência em eficiência do setor (${referenciaBenchmark}).`,
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

/** Fixo, não proporcional (30/07/2026, pedido do usuário: "sutil indicação de cor na linha
 * do 1º ao 3º lugar", não mais um terço calculado sobre o tamanho da lista). */
const POSICOES_EM_DESTAQUE = 3;

interface TabelaRankingProps {
  itens: ItemComPosicao[];
  resumoNacional: ResumoNacionalFriccao | null;
  linhaExpandida: string | null;
  aoAlternarExpansao: (distribuidora: string) => void;
}

/**
 * Reduzida a 5 colunas essenciais (30/07/2026, pedido do usuário — "limpeza radical de
 * design": os selos "Crítico" e as mini-barras de desvio/benchmark dentro das células
 * espremiam o layout e cortavam texto). O comparativo com média nacional/benchmark
 * continua disponível — só migrou inteiro para o drill-down ao clicar na linha
 * (`ComparativoBarras`), em vez de duas colunas fixas sempre visíveis.
 */
function TabelaRanking({ itens, resumoNacional, linhaExpandida, aoAlternarExpansao }: TabelaRankingProps) {
  if (itens.length === 0) {
    return <p className="mt-3 text-sm text-stone-500">Nenhuma concessionária com o filtro atual.</p>;
  }

  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-stone-200/60">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="bg-stone-50/80 text-xs font-bold text-stone-600">
              <th className="px-6 py-4">#</th>
              <th className="px-6 py-4">Concessionária / Região</th>
              <th className="px-6 py-4 text-right">Volume de Pedidos (MMGD)</th>
              <th className="px-6 py-4 text-right">% Fora do Prazo</th>
              <th className="px-6 py-4 text-right">Índice de Fricção</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const critico = item.posicao <= POSICOES_EM_DESTAQUE;
              const expandida = linhaExpandida === item.distribuidora;

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
                    className={`cursor-pointer border-t border-stone-100/80 outline-none transition-colors hover:bg-stone-50/80 ${critico ? 'bg-red-50/40' : ''}`}
                  >
                    <td className={`px-6 py-4 font-black ${critico ? 'text-red-700' : 'text-stone-500'}`}>
                      {item.posicao}º
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-stone-900">
                        {item.distribuidora}
                        {item.amostraPequena && (
                          <span
                            title="Menos de 1.000 pedidos — amostra estatisticamente menos robusta."
                            className="ml-1.5 rounded bg-stone-100 px-1 py-0.5 align-middle text-[9px] font-bold text-stone-500"
                          >
                            amostra pequena
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-stone-500 capitalize">{item.regiaoPrincipal}</p>
                    </td>
                    <td className="px-6 py-4 text-right text-stone-600">{formatarValor(item.nPedidos, 'inteiro')}</td>
                    <td className="px-6 py-4 text-right font-bold text-stone-800">
                      {formatarValor(item.pctForaDoPrazo, 'percentual')}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-red-800">
                      {formatarValor(item.eixoTecnico, 'numero')}
                    </td>
                  </tr>
                  {expandida && resumoNacional && item.pctForaDoPrazo !== null && (
                    <tr className="border-t border-stone-100/80 bg-stone-50/60">
                      <td colSpan={5} className="px-6 py-4">
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
        Clique numa linha para ver o comparativo com a média nacional e o benchmark do setor
        (empresa x média x melhor desempenho). Volume de Pedidos é o total de pedidos de conexão
        MMGD processados — esta base não tem o total de consumidores de cada concessionária nem
        uma métrica de "% com Solar" isolada de MMGD.
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
