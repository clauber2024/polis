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
 * Ranking de Fricção e Atrasos na Conexão Solar (MMGD) — pivô de
 * posicionamento de produto pedido pelo usuário (reverte a tentativa
 * anterior de suavizar o tom para "Matriz de Desempenho Setorial").
 * Objetivo declarado: ferramenta de pressão pública/accountability sobre
 * concessionárias com maior fricção na conexão de MMGD.
 *
 * LISTA ÚNICA + PENALIZAÇÃO POR DADO AUSENTE (30/07/2026, correção de
 * estratégia pedida pelo usuário): a seção separada "Dados incompletos" foi
 * eliminada — na visão do usuário, ela escondia/blindava distribuidoras sem
 * dado de prazo. Agora TODAS entram na mesma tabela; quem não tem
 * `prazoConfiavel` recebe a penalidade máxima em `indiceFriccaoRanking` e
 * fica visível, tipicamente no topo. O selo exibido nessas linhas ("Sem
 * dado de prazo") descreve o FATO (campo ausente na fonte da ANEEL,
 * penalidade aplicada) — NÃO usei o rótulo "Opacidade Regulatória" pedido
 * originalmente, porque isso afirmaria que a ausência é culpa da
 * distribuidora, e a apuração já registrada em ARQUITETURA.md mostra que a
 * MAIOR distribuidora do país (Cemig-D, 7,4 milhões de pedidos) tem o mesmo
 * problema, atravessando vários grupos econômicos sem relação entre si —
 * indício de lacuna sistêmica da base da ANEEL, não padrão isolado de má-fé
 * de uma empresa. Ver docstring completa de `rankingDistribuidoras.service.ts`
 * (backend) para a metodologia e o raciocínio completo.
 *
 * Comparativos (desvio vs. média nacional, benchmark, drill-down por linha)
 * usam SEMPRE `resumoNacional`/campos já calculados no backend a partir de
 * dado real — nunca um número fabricado no cliente. Só existem para
 * distribuidoras com prazo confiável (penalizadas por dado ausente não têm
 * `pctForaDoPrazo` real pra comparar).
 *
 * "Consumidores Totais" e "% com Solar" continuam fora desta base (INDQUAL/
 * fila de conexão ANEEL não tem essas métricas) — ver nota de rodapé da
 * tabela.
 */

type IdGrupoEconomico = 'energisa' | 'equatorial' | 'cpfl' | 'neoenergia' | 'enel';

const GRUPOS_ECONOMICOS: { id: IdGrupoEconomico; nome: string }[] = [
  { id: 'energisa', nome: 'Grupo Energisa' },
  { id: 'equatorial', nome: 'Grupo Equatorial' },
  { id: 'cpfl', nome: 'Grupo CPFL / State Grid' },
  { id: 'neoenergia', nome: 'Grupo Neoenergia (Iberdrola)' },
  { id: 'enel', nome: 'Grupo Enel' },
];

const PALAVRA_CHAVE_GRUPO: Record<IdGrupoEconomico, string> = {
  energisa: 'energisa',
  equatorial: 'equatorial',
  cpfl: 'cpfl',
  neoenergia: 'neoenergia',
  enel: 'enel',
};

/**
 * Overrides verificados (30/07/2026) — mesma pesquisa externa já registrada
 * em `backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py`
 * (`MAPEAMENTO_MANUAL_CONFIRMADO`): o nome de `distribuidora` vem direto do
 * texto livre do dataset de fila de conexão da ANEEL, que pode estar
 * desatualizado frente à identidade societária real. "Enel GO" é o caso
 * confirmado mais notável — já foi vendida/rebatizada e hoje é EQUATORIAL GO
 * (mesmo crosswalk usado no eixo de justiça/IVSH). Sem este override, um
 * filtro por substring classificaria "Enel GO" como Grupo Enel, errado.
 * Forcel/João Cesa/Nova Palma/Santa Maria são companhias pequenas e
 * independentes (mesma pesquisa) — `null` documenta explicitamente que elas
 * não pertencem a nenhum dos 5 grupos, embora nenhuma batesse por substring
 * mesmo sem o override.
 *
 * Fora esta lista curta e verificada, a classificação é só por substring do
 * nome (`PALAVRA_CHAVE_GRUPO`) — aproximada, não uma auditoria societária
 * completa. Distribuidoras que hoje pertencem a um dos 5 grupos mas cujo
 * nome de cadastro não denuncia isso (o mesmo padrão do caso Enel GO)
 * ficariam de fora até serem pesquisadas e adicionadas aqui.
 */
const OVERRIDE_GRUPO_ECONOMICO: Record<string, IdGrupoEconomico | null> = {
  'Enel GO': 'equatorial',
  Forcel: null,
  'João Cesa': null,
  'Nova Palma': null,
  'Santa Maria': null,
};

function identificarGrupoEconomico(nomeDistribuidora: string): IdGrupoEconomico | null {
  if (nomeDistribuidora in OVERRIDE_GRUPO_ECONOMICO) {
    return OVERRIDE_GRUPO_ECONOMICO[nomeDistribuidora];
  }
  const nomeMinusculo = nomeDistribuidora.toLowerCase();
  const encontrado = (Object.entries(PALAVRA_CHAVE_GRUPO) as [IdGrupoEconomico, string][]).find(([, palavra]) =>
    nomeMinusculo.includes(palavra),
  );
  return encontrado ? encontrado[0] : null;
}

export function PaginaRankingDistribuidoras() {
  const [dados, setDados] = useState<RankingDistribuidorasResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroRegiao, setFiltroRegiao] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState<IdGrupoEconomico | ''>('');
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
    () => (dados ? dados.ranking.map((item, indice) => ({ ...item, posicao: indice + 1 })) : []),
    [dados],
  );

  const regioesDisponiveis = useMemo(
    () => Array.from(new Set(rankingComPosicao.map((item) => item.regiaoPrincipal))).sort(),
    [rankingComPosicao],
  );

  // Só lista grupos que de fato têm alguma distribuidora presente nos dados
  // carregados (mesmo princípio de regioesDisponiveis) — evita opção vazia.
  const gruposDisponiveis = useMemo(() => {
    const idsPresentes = new Set(
      rankingComPosicao
        .map((item) => identificarGrupoEconomico(item.distribuidora))
        .filter((id): id is IdGrupoEconomico => id !== null),
    );
    return GRUPOS_ECONOMICOS.filter((grupo) => idsPresentes.has(grupo.id));
  }, [rankingComPosicao]);

  const rankingFiltrado = rankingComPosicao.filter((item) => {
    if (filtroRegiao && item.regiaoPrincipal !== filtroRegiao) return false;
    if (filtroGrupo && identificarGrupoEconomico(item.distribuidora) !== filtroGrupo) return false;
    return true;
  });

  // Agregados nacionais (30/07/2026, pedido do usuário) — calculados aqui, no
  // cliente, a partir da lista completa já carregada (dados.ranking), nunca
  // um número fixo/fabricado. Índice médio é PONDERADO por volume de pedidos
  // (mesmo critério já usado em resumoNacional.mediaNacionalPctForaDoPrazo,
  // no backend) — inclui as distribuidoras penalizadas por dado ausente
  // (indiceFriccaoRanking=1 pra elas), de propósito: excluí-las inflaria
  // artificialmente a média nacional pra melhor do que ela é de fato.
  const agregadosNacionais = useMemo(() => {
    if (!dados || dados.ranking.length === 0) return null;
    const totalPedidos = dados.ranking.reduce((soma, item) => soma + item.nPedidos, 0);
    const indiceMedioPonderado =
      totalPedidos > 0
        ? dados.ranking.reduce((soma, item) => soma + item.nPedidos * item.indiceFriccaoRanking, 0) / totalPedidos
        : null;
    return { totalPedidos, indiceMedioPonderado };
  }, [dados]);

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
          {agregadosNacionais && <CabecalhoBaseENacional agregados={agregadosNacionais} />}

          {dados.resumoNacional && (
            <CardAlertaNacional
              resumo={dados.resumoNacional}
              penalizadas={rankingComPosicao.filter((item) => item.penalizadoPorDadoAusente)}
            />
          )}

          {/* Metodologia — versão curta e direta (30/07/2026). Reescrita a pedido do
              usuário: o "+" da versão anterior lia como soma simples de métricas
              distintas, impreciso. "Média simples" (não "ponderada" — a fórmula real dá
              peso igual aos dois indicadores, não pesos deliberadamente diferentes; ver
              rankingDistribuidoras.service.ts) descreve exatamente o cálculo real. */}
          <div className="mt-6 text-xs leading-relaxed text-stone-600">
            <strong className="font-black text-stone-900">Índice de Fricção (escala de 0 a 1):</strong>{' '}
            média simples de dois indicadores operacionais — taxa de não conexão e taxa de
            descumprimento de prazo regulatório da ANEEL — cada um normalizado independentemente entre
            as concessionárias (mínimo–máximo, 0 a 1).{' '}
            <strong className="font-bold text-stone-900">
              Valores mais próximos de 1 indicam maior barreira, lentidão e fricção na conexão.
            </strong>{' '}
            Fatores socioeconômicos da região atendida são deliberadamente isolados desta pontuação,
            para refletir exclusivamente o desempenho regulatório operacional da concessionária.
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

            <div className="min-w-[220px]">
              <label
                htmlFor="filtro-grupo-friccao"
                className="mb-1.5 block text-[10px] font-bold tracking-widest text-stone-500 uppercase"
              >
                Grupo econômico
              </label>
              <div className="relative">
                <select
                  id="filtro-grupo-friccao"
                  value={filtroGrupo}
                  onChange={(evento) => setFiltroGrupo(evento.target.value as IdGrupoEconomico | '')}
                  className={`${CLASSE_CAMPO} appearance-none pr-8`}
                >
                  <option value="">Todos os grupos</option>
                  {gruposDisponiveis.map((grupo) => (
                    <option key={grupo.id} value={grupo.id}>
                      {grupo.nome}
                    </option>
                  ))}
                </select>
                <IconeChevron className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
              </div>
            </div>

            {(filtroRegiao || filtroGrupo) && (
              <button
                type="button"
                onClick={() => {
                  setFiltroRegiao('');
                  setFiltroGrupo('');
                }}
                className="rounded-lg border border-stone-200/80 bg-white/50 px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white/80"
              >
                Limpar filtros
              </button>
            )}
          </div>

          <p className="mt-1.5 text-[10px] text-stone-400">
            Grupo econômico é aproximado, baseado no nome da distribuidora e em casos de aquisição já
            pesquisados neste projeto — não é uma auditoria societária completa.
          </p>

          <SecaoRanking
            titulo="Ranking"
            contagem={`${rankingFiltrado.length} de ${rankingComPosicao.length} concessionárias — posição 1 = maior fricção`}
            subtitulo={dados.notaMetodologicaPenalidade}
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

/**
 * Nome curto do dataset (30/07/2026, pedido do usuário — desambiguar das duas
 * fontes ANEEL usadas no projeto): "Fila de Conexão de MMGD" aqui, distinto
 * de "Registro de Sistemas MMGD" na Base de Evidências (`basesDeDados.service.ts`)
 * — são datasets diferentes, publicados separadamente pela ANEEL, com
 * cadência de atualização diferente (ver nota abaixo).
 */
const NOME_DATASET_ANEEL_FILA_CONEXAO = 'ANEEL — Fila de Conexão de MMGD (pós Lei 14.300)';

/**
 * Janela temporal real do dataset (30/07/2026) — verificada direto na página
 * do dataset em dadosabertos.aneel.gov.br, não presumida: "realizadas no
 * período entre 7 de janeiro de 2022 e 7 de janeiro de 2023". O pedido
 * original sugeria "Nov/2025 – Abr/2026", que na verdade é a janela de uma
 * fonte TOTALMENTE DIFERENTE já usada neste projeto (contratos do Reforma
 * Casa Brasil Solar, ver ARQUITETURA.md) — usar essa data aqui seria
 * publicar uma janela temporal errada numa peça pensada justamente para ser
 * auditável.
 *
 * PORQUE 2022-2023 (pergunta real do usuário, 30/07/2026): a página do
 * dataset em si mostra atividade de publicação recente (criada em 2026,
 * cadência mensal declarada), mas os PEDIDOS DE CONEXÃO que ele contém
 * continuam sendo só os desse recorte de 2022-2023 — não encontramos, na
 * mesma página, uma versão republicada com pedidos mais recentes. Ou seja,
 * a ANEEL não estendeu a cobertura deste dataset específico, mesmo mantendo
 * a página "atualizada" — daí a nota de ressalva abaixo, para o leitor não
 * confundir com o registro de sistemas instalados (esse sim atualizado até
 * meados de 2026, ver Base de Evidências).
 */
const JANELA_TEMPORAL_DATASET_ANEEL = '7 jan/2022 – 7 jan/2023';

interface AgregadosNacionais {
  totalPedidos: number;
  indiceMedioPonderado: number | null;
}

function CabecalhoBaseENacional({ agregados }: { agregados: AgregadosNacionais }) {
  return (
    <div className="mt-6 rounded-2xl border border-stone-200/50 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-xs font-bold text-stone-500">
          Base de dados oficial {NOME_DATASET_ANEEL_FILA_CONEXAO} • Janela temporal dos pedidos:{' '}
          <span className="font-black text-stone-900">{JANELA_TEMPORAL_DATASET_ANEEL}</span>
        </p>

        <div className="flex items-center gap-4 rounded-xl border border-stone-200/60 bg-stone-50 px-4 py-2.5 text-xs">
          <div>
            <span className="block text-[9px] font-bold tracking-widest text-stone-400 uppercase">
              Volume total nacional
            </span>
            <span className="font-black text-stone-900">
              {formatarValor(agregados.totalPedidos, 'inteiro')} pedidos
            </span>
          </div>
          <div className="h-6 w-px bg-stone-200" />
          <div>
            <span className="block text-[9px] font-bold tracking-widest text-stone-400 uppercase">
              Índice médio Brasil
            </span>
            <span className="font-black text-red-600">
              {formatarValor(agregados.indiceMedioPonderado, 'numero')}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-2 border-t border-stone-100 pt-2 text-[11px] leading-relaxed text-stone-400">
        Ressalva: este é um dataset ANEEL diferente do usado na Base de Evidências (registro de
        sistemas MMGD instalados, esse sim atualizado mensalmente). A Fila de Conexão de MMGD é
        publicada à parte, e a ANEEL não disponibilizou uma versão com pedidos mais recentes além
        dessa janela de 2022-2023 — os números abaixo refletem esse período, não o cenário atual de
        conexões no país.
      </p>
    </div>
  );
}

/** Junta uma lista em português com "e" antes do último item — "A, B e C". */
function formatarListaComE(itens: string[]): string {
  if (itens.length === 0) return '';
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * (30/07/2026, correção pedida pelo usuário — o texto anterior dizia "a pior
 * concessionária DO RANKING" referindo-se a `resumo.piorDesempenho`, mas
 * desde a unificação do ranking com penalização por dado ausente,
 * `resumo.piorDesempenho`/`percentualDosPedidosForaDoPrazoNoTop5` são
 * calculados só entre `comPrazo` — quem de fato lidera o ranking hoje, no
 * topo, são as distribuidoras penalizadas por dado ausente (empatadas no
 * valor máximo), não a "pior por atraso real". A primeira frase agora cobre
 * isso explicitamente, com exemplos reais tirados de `penalizadas` (as de
 * maior volume, mesmo critério de desempate já usado no ranking) — nunca
 * hardcoded, ao contrário do texto pedido originalmente. As demais frases
 * seguem citando `resumo.piorDesempenho`/`top5`, mas com a ressalva textual
 * "entre as com dado auditável de prazo", que é o que esses números
 * realmente representam.
 */
function CardAlertaNacional({
  resumo,
  penalizadas,
}: {
  resumo: ResumoNacionalFriccao;
  penalizadas: ItemComPosicao[];
}) {
  const frases: string[] = [];

  if (penalizadas.length > 0) {
    const exemplos = formatarListaComE(penalizadas.slice(0, 3).map((item) => item.distribuidora));
    frases.push(
      `${penalizadas.length} concessionária${penalizadas.length > 1 ? 's' : ''} sem dado de prazo confiável na fonte da ANEEL (como ${exemplos}) recebem a penalidade máxima do Índice de Fricção e encabeçam o ranking.`,
    );
  }

  if (resumo.percentualDosPedidosForaDoPrazoNoTop5 !== null) {
    frases.push(
      `Entre as distribuidoras com dado auditável de prazo, as 5 piores concentram ${formatarValor(resumo.percentualDosPedidosForaDoPrazoNoTop5, 'percentual')} dos pedidos de conexão solar fora do prazo regulatório no Brasil.`,
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
      ? `Entre as distribuidoras com dado auditável de prazo, a pior (${resumo.piorDesempenho.distribuidora}) acumula um índice de atraso ${formatarMultiplicador(resumo.multiplicadorPiorSobreBenchmark)} maior que a referência em eficiência do setor (${referenciaBenchmark}, ${formatarValor(resumo.benchmarkMelhorDesempenho.pctForaDoPrazo, 'percentual')} fora do prazo).`
      : `Entre as distribuidoras com dado auditável de prazo, a pior (${resumo.piorDesempenho.distribuidora}) tem ${formatarValor(resumo.piorDesempenho.pctForaDoPrazo, 'percentual')} dos pedidos fora do prazo regulatório, contra 0% da referência em eficiência do setor (${referenciaBenchmark}).`,
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
                    <td className="px-6 py-4 text-right">
                      {item.penalizadoPorDadoAusente ? (
                        <span
                          title={item.motivosDadosIncompletos[0]}
                          className="inline-block rounded bg-red-100 px-2 py-1 text-[10px] font-black tracking-wide text-red-800 uppercase"
                        >
                          Sem dado de prazo
                        </span>
                      ) : (
                        <span className="font-bold text-stone-800">
                          {formatarValor(item.pctForaDoPrazo, 'percentual')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-black text-red-800">
                        {formatarValor(item.indiceFriccaoRanking, 'numero')}
                      </span>
                      {item.penalizadoPorDadoAusente && (
                        <span className="ml-1.5 text-[10px] font-bold text-red-700/70">(penalizado)</span>
                      )}
                    </td>
                  </tr>
                  {expandida && (
                    <tr className="border-t border-stone-100/80 bg-stone-50/60">
                      <td colSpan={5} className="px-6 py-4">
                        {item.pctForaDoPrazo !== null && resumoNacional ? (
                          <ComparativoBarras
                            nomeEmpresa={item.distribuidora}
                            valorEmpresa={item.pctForaDoPrazo}
                            resumo={resumoNacional}
                          />
                        ) : (
                          <TrilhaAuditoriaDadoAusente />
                        )}
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

/**
 * Trilha de auditoria/evidência para linhas penalizadas por dado ausente
 * (30/07/2026, pedido do usuário — rastreabilidade técnica pra facilitar
 * verificação em caso de contestação externa). Os metadados de fonte/
 * variável abaixo são reais: nome oficial do dataset ANEEL e nome real do
 * campo (`DatLim`), ver docstring de
 * `backend/src/etl/loaders/extrair_desempenho_conexao_mmgd.py`.
 *
 * A nota metodológica NÃO usa o termo "opacidade" nem cita uma "diretriz do
 * observatório" — o pedido original incluía isso, mas equivaleria a
 * afirmar publicamente que a distribuidora é culpada pela ausência do
 * dado (sem confirmar se a causa é dela ou da própria base da ANEEL) e a
 * citar uma política institucional que não existe neste projeto. A
 * apuração real já registrada em ARQUITETURA.md mostra a MAIOR
 * distribuidora do país (Cemig-D, 7,4 milhões de pedidos) com o mesmo
 * problema, atravessando vários grupos econômicos sem relação entre si —
 * por isso a nota descreve a REGRA aplicada (penalidade máxima, sem
 * isenção) sem atribuir causa. Ver mesma decisão em
 * `rankingDistribuidoras.service.ts` (backend).
 */
function TrilhaAuditoriaDadoAusente() {
  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-5">
      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-600" />
          <h5 className="text-xs font-black tracking-wider text-stone-900 uppercase">
            Trilha de auditoria e evidência regulatória
          </h5>
        </div>
        <span className="rounded border border-stone-200 bg-white px-2 py-1 text-[10px] font-bold text-stone-500">
          Ref. base: ANEEL / MMGD
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
        <div>
          <span className="block text-[9px] font-bold tracking-widest text-stone-400 uppercase">Fonte oficial</span>
          <span className="font-semibold text-stone-800">{NOME_DATASET_ANEEL_FILA_CONEXAO}</span>
        </div>
        <div>
          <span className="block text-[9px] font-bold tracking-widest text-stone-400 uppercase">
            Variável analisada
          </span>
          <span className="font-mono font-semibold text-stone-800">DatLim</span>{' '}
          <span className="text-stone-500">(prazo regulatório de atendimento)</span>
        </div>
        <div>
          <span className="block text-[9px] font-bold tracking-widest text-stone-400 uppercase">
            Tratamento metodológico
          </span>
          <span className="font-semibold text-stone-800">
            Atribuição da penalidade máxima de fricção por ausência do campo na fonte pública.
          </span>
        </div>
      </div>

      <p className="border-t border-stone-200/60 pt-3 text-justify text-[11px] leading-relaxed font-medium text-stone-600">
        <strong>Nota metodológica:</strong> a ausência do campo <code className="font-mono">DatLim</code> impede
        aferir cumprimento de prazo para esta concessionária. Por decisão metodológica deste ranking, vazio de dado
        em fonte oficial não gera isenção nem pontuação neutra — recebe a penalidade máxima, para não favorecer quem
        tem dado ausente sobre quem tem dado desfavorável. Essa mesma ausência de campo já foi identificada em
        várias distribuidoras de grupos econômicos diferentes na mesma base nacional, incluindo a maior
        distribuidora do país (Cemig-D) — não é possível, só com este dado, determinar se a causa é uma falha de
        reporte da distribuidora à ANEEL ou uma lacuna da própria base pública.
      </p>
    </div>
  );
}

