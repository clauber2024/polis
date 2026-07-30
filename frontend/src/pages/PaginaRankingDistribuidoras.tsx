import { useEffect, useMemo, useState } from 'react';
import type { ReactNode, SVGProps } from 'react';
import { buscarRankingDistribuidoras } from '../services/rankingDistribuidoras.service';
import type { DistribuidoraRanking, RankingDistribuidorasResultado } from '../types/api';
import { formatarValor } from '../utils/formatadores';

/**
 * Matriz de Desempenho Setorial: Fricções e Oportunidades de Acesso
 * (30/07/2026, correção de escopo/tom pedida pelo usuário — antes "Ranking
 * de distribuidoras"). O termo "ranking" soava punitivo e gerava atrito
 * regulatório desnecessário com concessionárias/ANEEL; o produto sempre foi,
 * na prática, uma matriz de cruzamento técnico x social, não um "placar de
 * vilãs" — só o enquadramento textual/visual não refletia isso. Nenhuma
 * mudança de metodologia central por causa do tom (a segregação visual do
 * ADR — dados completos x incompletos, nunca a mesma posição ordinal —
 * continua exatamente como era, é o mesmo tipo de salvaguarda contra leitura
 * injusta que este pedido está pedindo).
 *
 * Mudança de fundo que ACOMPANHA o reposicionamento (não é só cosmética): o
 * eixo social trocou de IVS para IVSH — ver docstring de
 * `rankingDistribuidoras.service.ts` (backend) para o porquê.
 *
 * "Consumidores Totais" e "% com Solar" (pedidos originais do usuário para as
 * colunas) NÃO existem nesta base — o INDQUAL/fila de conexão ANEEL não tem o
 * total de consumidores de cada concessionária, e MMGD aqui já É a geração
 * solar distribuída (não há uma métrica "solar" separada de MMGD neste
 * dataset). Mantive os grupos de coluna pedidos, mas com os campos REAIS
 * disponíveis, nunca um número inventado — ver nota de rodapé da tabela.
 */
export function PaginaRankingDistribuidoras() {
  const [dados, setDados] = useState<RankingDistribuidorasResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroRegiao, setFiltroRegiao] = useState('');
  const [filtroVulnerabilidade, setFiltroVulnerabilidade] = useState<NivelVulnerabilidade | 'todas'>(
    'todas',
  );

  useEffect(() => {
    let ativo = true;
    buscarRankingDistribuidoras()
      .then((resultado) => {
        if (ativo) setDados(resultado);
      })
      .catch((causa: unknown) => {
        if (ativo) {
          setErro(causa instanceof Error ? causa.message : 'Falha ao carregar a matriz setorial.');
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  const todasAsLinhas = useMemo(
    () => (dados ? [...dados.rankingPrincipal, ...dados.distribuidorasComDadosIncompletos] : []),
    [dados],
  );

  const regioesDisponiveis = useMemo(
    () => Array.from(new Set(todasAsLinhas.map((item) => item.regiaoPrincipal))).sort(),
    [todasAsLinhas],
  );

  // Terços calculados sobre os valores REAIS de IVSH da carga atual — mesmo
  // princípio do "piso dinâmico" já usado no ranking executivo (nunca um
  // limiar fixo/fabricado): o que é "alta vulnerabilidade" só faz sentido
  // relativo às distribuidoras que estão de fato na tela.
  const limiaresVulnerabilidade = useMemo(() => calcularLimiaresVulnerabilidade(todasAsLinhas), [
    todasAsLinhas,
  ]);

  function aplicarFiltros(itens: DistribuidoraRanking[]): DistribuidoraRanking[] {
    return itens.filter((item) => {
      if (filtroRegiao && item.regiaoPrincipal !== filtroRegiao) return false;
      if (filtroVulnerabilidade !== 'todas') {
        const nivel = classificarVulnerabilidade(
          item.ivshMedioPonderadoPorPopulacao,
          limiaresVulnerabilidade,
        );
        if (nivel !== filtroVulnerabilidade) return false;
      }
      return true;
    });
  }

  const filtrosAtivos = !!filtroRegiao || filtroVulnerabilidade !== 'todas';

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-black tracking-tight text-stone-900">
        Matriz de Desempenho Setorial: Fricções e Oportunidades de Acesso
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-stone-600">
        Cruza o desempenho técnico de conexão de cada concessionária (taxa de conexão e
        cumprimento de prazo regulatório) com o Índice de Vulnerabilidade Sócio-Habitacional-
        Energética (IVSH) médio, ponderado por população, da sua área de concessão —
        identificando onde o potencial solar esbarra em fricções de conexão, em vulnerabilidades
        socioterritoriais estruturais, ou nas duas ao mesmo tempo.
      </p>

      {erro && !dados && <p className="mt-6 text-sm text-red-600">{erro}</p>}
      {!dados && !erro && <p className="mt-6 text-sm text-stone-500">Carregando matriz…</p>}

      {dados && (
        <>
          {/* Metodologia — resumo curto, sempre visível (não em tooltip). */}
          <div className="mt-6 rounded-2xl bg-white/70 p-6 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
            <p className="text-[10px] font-black tracking-widest text-stone-400 uppercase">
              Metodologia
            </p>
            <p className="mt-2 text-xs text-stone-600">
              <strong className="font-bold text-stone-800">Eixo técnico (fricção de conexão):</strong>{' '}
              {dados.metodologia.eixoTecnico}
            </p>
            <p className="mt-1.5 text-xs text-stone-600">
              <strong className="font-bold text-stone-800">Lente social (IVSH):</strong>{' '}
              {dados.metodologia.eixoJustica}
            </p>
            <p className="mt-1.5 text-xs text-stone-600">
              <strong className="font-bold text-stone-800">Índice de Fricção Setorial:</strong>{' '}
              {dados.metodologia.composicaoScore}
            </p>
          </div>

          {/* Decisão 3 do ADR: nota metodológica fixa sobre Equatorial fora-GO
              / vulnerabilidade regional — visível, não em tooltip. Mantida
              intacta: é exatamente a salvaguarda contra leitura punitiva que
              motivou este pedido. */}
          <div className="mt-3 rounded-2xl border border-amber-200/60 bg-amber-50/80 p-4 text-xs text-amber-900 shadow-sm backdrop-blur-sm">
            {dados.notaMetodologicaJustica}
          </div>

          {/* Filtros rápidos */}
          <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl bg-white/70 p-4 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
            <div className="min-w-[180px]">
              <label
                htmlFor="filtro-regiao-setorial"
                className="mb-1.5 block text-[10px] font-bold tracking-widest text-stone-500 uppercase"
              >
                Região
              </label>
              <div className="relative">
                <select
                  id="filtro-regiao-setorial"
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

            <div className="min-w-[220px]">
              <label
                htmlFor="filtro-vulnerabilidade-setorial"
                className="mb-1.5 block text-[10px] font-bold tracking-widest text-stone-500 uppercase"
              >
                Vulnerabilidade da concessionária (IVSH)
              </label>
              <div className="relative">
                <select
                  id="filtro-vulnerabilidade-setorial"
                  value={filtroVulnerabilidade}
                  onChange={(evento) =>
                    setFiltroVulnerabilidade(evento.target.value as NivelVulnerabilidade | 'todas')
                  }
                  disabled={!limiaresVulnerabilidade}
                  className={`${CLASSE_CAMPO} appearance-none pr-8 disabled:opacity-50`}
                >
                  <option value="todas">Todos os níveis</option>
                  <option value="baixa">Baixa (terço melhor)</option>
                  <option value="media">Média (terço intermediário)</option>
                  <option value="alta">Alta (terço pior)</option>
                </select>
                <IconeChevron className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
              </div>
            </div>

            {filtrosAtivos && (
              <button
                type="button"
                onClick={() => {
                  setFiltroRegiao('');
                  setFiltroVulnerabilidade('todas');
                }}
                className="rounded-lg border border-stone-200/80 bg-white/50 px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white/80"
              >
                Limpar filtros
              </button>
            )}
          </div>

          <SecaoMatriz
            titulo="Matriz principal"
            contagem={`${aplicarFiltros(dados.rankingPrincipal).length} de ${dados.rankingPrincipal.length} concessionárias — os dois eixos disponíveis e prazo confiável`}
          >
            <TabelaMatriz
              itens={aplicarFiltros(dados.rankingPrincipal)}
              colunaIndice="scoreComposto"
              rotuloIndice="Índice de Fricção Setorial"
            />
          </SecaoMatriz>

          <SecaoMatriz
            titulo="Dados incompletos"
            contagem={`${aplicarFiltros(dados.distribuidorasComDadosIncompletos).length} de ${dados.distribuidorasComDadosIncompletos.length} concessionárias — fora da matriz principal, nunca comparadas na mesma posição`}
            subtitulo={dados.notaMetodologicaDadosIncompletos}
          >
            <TabelaMatriz
              itens={aplicarFiltros(dados.distribuidorasComDadosIncompletos)}
              colunaIndice="eixoTecnico"
              rotuloIndice="Índice de Fricção (só técnico)"
              mostrarMotivos
            />
          </SecaoMatriz>
        </>
      )}
    </div>
  );
}

type NivelVulnerabilidade = 'baixa' | 'media' | 'alta';
interface LimiaresVulnerabilidade {
  terco1: number;
  terco2: number;
}

function calcularLimiaresVulnerabilidade(
  itens: DistribuidoraRanking[],
): LimiaresVulnerabilidade | null {
  const valores = itens
    .map((item) => item.ivshMedioPonderadoPorPopulacao)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (valores.length < 3) return null;
  return {
    terco1: valores[Math.floor(valores.length / 3)],
    terco2: valores[Math.floor((valores.length * 2) / 3)],
  };
}

function classificarVulnerabilidade(
  valor: number | null,
  limiares: LimiaresVulnerabilidade | null,
): NivelVulnerabilidade | null {
  if (valor === null || !limiares) return null;
  if (valor <= limiares.terco1) return 'baixa';
  if (valor <= limiares.terco2) return 'media';
  return 'alta';
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

/** Mesmo recipe de campo "vidro" usado em PainelFiltrosDashboard.tsx — reaproveitado aqui
 * para os dois `<select>` de filtro rápido, consistência de design system. */
const CLASSE_CAMPO =
  'w-full rounded-lg border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-medium text-stone-800 shadow-sm backdrop-blur-sm outline-none transition-all focus:border-red-400 focus:ring-2 focus:ring-red-400/20';

interface SecaoMatrizProps {
  titulo: string;
  contagem: string;
  subtitulo?: string;
  children: ReactNode;
}

function SecaoMatriz({ titulo, contagem, subtitulo, children }: SecaoMatrizProps) {
  return (
    <section className="mt-8 rounded-2xl bg-white/70 p-6 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
      <h2 className="text-sm font-black tracking-wide text-stone-900 uppercase">
        {titulo}
        <span className="ml-2 text-xs font-normal tracking-normal text-stone-400 normal-case">
          ({contagem})
        </span>
      </h2>
      {subtitulo && <p className="mt-1 text-xs text-stone-500">{subtitulo}</p>}
      {children}
    </section>
  );
}

interface TabelaMatrizProps {
  itens: DistribuidoraRanking[];
  colunaIndice: 'scoreComposto' | 'eixoTecnico';
  rotuloIndice: string;
  mostrarMotivos?: boolean;
}

function TabelaMatriz({ itens, colunaIndice, rotuloIndice, mostrarMotivos }: TabelaMatrizProps) {
  if (itens.length === 0) {
    return <p className="mt-3 text-sm text-stone-500">Nenhuma concessionária com os filtros atuais.</p>;
  }

  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-stone-200/60">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="bg-stone-50/80 text-[9px] font-black tracking-widest text-stone-400 uppercase">
              <th className="px-3 py-2" colSpan={3}>
                Identificação
              </th>
              <th className="border-l border-stone-200/60 px-3 py-2" colSpan={2}>
                Dinâmica de mercado
              </th>
              <th className="border-l border-stone-200/60 px-3 py-2" colSpan={1}>
                Lente social
              </th>
              <th className="border-l border-stone-200/60 px-3 py-2" colSpan={1}>
                Indicador sintético
              </th>
            </tr>
            <tr className="border-t border-stone-200/60 bg-stone-50/80 text-xs font-bold text-stone-600">
              <th className="px-3 py-2">Concessionária</th>
              <th className="px-3 py-2">Região</th>
              <th className="px-3 py-2 text-right">Pedidos MMGD*</th>
              <th className="border-l border-stone-200/60 px-3 py-2 text-right">% conectado*</th>
              <th className="px-3 py-2 text-right">% no prazo</th>
              <th className="border-l border-stone-200/60 px-3 py-2 text-right">IVSH médio</th>
              <th className="border-l border-stone-200/60 px-3 py-2 text-right">{rotuloIndice}</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr
                key={item.distribuidora}
                className="border-t border-stone-100/80 transition-colors hover:bg-stone-50/60"
              >
                <td className="px-3 py-2.5 font-bold text-stone-900">
                  {item.distribuidora}
                  {item.amostraPequena && (
                    <span
                      title="Menos de 1.000 pedidos — amostra estatisticamente menos robusta."
                      className="ml-1.5 rounded bg-stone-100 px-1 py-0.5 align-middle text-[9px] font-bold text-stone-500"
                    >
                      amostra pequena
                    </span>
                  )}
                  {mostrarMotivos && item.motivosDadosIncompletos.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-[11px] font-normal text-stone-500">
                      {item.motivosDadosIncompletos.map((motivo) => (
                        <li key={motivo}>{motivo}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-2.5 text-stone-600 capitalize">{item.regiaoPrincipal}</td>
                <td className="px-3 py-2.5 text-right text-stone-600">
                  {formatarValor(item.nPedidos, 'inteiro')}
                </td>
                <td className="border-l border-stone-100/80 px-3 py-2.5 text-right text-stone-600">
                  {formatarValor(item.pctConectado, 'percentual')}
                </td>
                <td className="px-3 py-2.5 text-right text-stone-600">
                  {item.prazoConfiavel ? (
                    formatarValor(item.pctDentroDoPrazo, 'percentual')
                  ) : (
                    <span title="Prazo regulatório (DatLim) ausente na fonte — NÃO é 0%, é dado indisponível.">
                      sem dado
                    </span>
                  )}
                </td>
                <td className="border-l border-stone-100/80 px-3 py-2.5 text-right text-stone-600">
                  {item.ivshMedioPonderadoPorPopulacao !== null
                    ? formatarValor(item.ivshMedioPonderadoPorPopulacao, 'numero')
                    : 'sem dado'}
                </td>
                <td className="border-l border-stone-100/80 px-3 py-2.5 text-right font-black text-red-700">
                  {formatarValor(item[colunaIndice], 'numero')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-stone-400">
        * Esta base (fila de conexão ANEEL + INDQUAL) não tem o total de consumidores de cada
        concessionária nem uma métrica de "% com Solar" isolada de MMGD — os campos exibidos são
        pedidos de conexão MMGD processados e sua taxa de conclusão, os dados reais disponíveis
        mais próximos.
      </p>
    </>
  );
}
