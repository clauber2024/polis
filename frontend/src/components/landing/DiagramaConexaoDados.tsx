/**
 * Diagrama "como os dados se conectam" (RF-006, pedido do usuário 21/07/2026)
 * — substitui a ideia original de "mapa mental" livre por um diagrama em
 * DUAS camadas (dimensões de dados → indicadores compostos), decisão tomada
 * com o usuário: um grafo livre com as ~11 fontes soltas + 9 dimensões +
 * indicadores viraria ilegível (muitos nós cruzando linhas). Aqui só se
 * desenha uma linha onde existe uma relação real e já documentada
 * (CLAUDE.md/ARQUITETURA.md) — dimensão sem indicador composto (ex.: Clima)
 * fica sem linha, nunca inventada. As fontes primárias de cada dimensão
 * aparecem como legenda dentro do próprio card (não como um 3º nível de
 * caixas, que exigiria fiação individual por fonte — RF-006 continua
 * coberto pela lista completa em FONTES_DE_DADOS, seção irmã desta).
 *
 * SVG próprio (sem lib de gráfico), mesmo padrão de GraficoQuadrantes.tsx —
 * coordenadas fixas (não medidas via DOM/ResizeObserver), scroll horizontal
 * em telas estreitas (mesmo padrão de tabelas largas do projeto).
 */

interface Dimensao {
  id: string;
  nome: string;
  /** Instituição + sistema/dataset específico — precisa dar para achar a
   * fonte de forma independente (busca), não só o nome genérico. */
  fontes: string;
  /** Motivo de não ter linha de conexão — só para dimensões sem indicador
   * composto ainda; desenhado como aviso no próprio card, não só na legenda
   * do rodapé (rodapé sozinho passava despercebido — feedback do usuário). */
  semIndicador?: string;
}

interface IndicadorComposto {
  id: string;
  nome: string;
  descricao: string;
  origens: string[];
}

const DIMENSOES: Dimensao[] = [
  {
    id: 'territorio',
    nome: 'Território',
    fontes: 'IBGE — Malha Municipal (malhas.ibge.gov.br)',
    semIndicador: 'base espacial comum a todos os indicadores, não "entra" em nenhum sozinha',
  },
  {
    id: 'mmgd',
    nome: 'MMGD',
    fontes: 'ANEEL — Dados Abertos, dataset "Relação de empreendimentos de Geração Distribuída" (dadosabertos.aneel.gov.br)',
  },
  {
    id: 'infraestrutura',
    nome: 'Infraestrutura Urbana',
    fontes: 'IBGE — Censo Demográfico 2022, Resultados do Universo (sidra.ibge.gov.br)',
  },
  {
    id: 'renda_trabalho',
    nome: 'Renda e Trabalho',
    fontes: 'RAIS (Ministério do Trabalho, base "Base dos Dados"/BigQuery) e IBGE — Censo 2022 (RDPC)',
  },
  {
    id: 'moradia',
    nome: 'Moradia',
    fontes:
      'IBGE — Censo 2022 (domicílios), CadÚnico (aberto.dados.gov.br), Caixa/FGTS e Min. das Cidades (MCMV), prefeituras municipais (ZEIS/AEIS), Caixa (Reforma Casa Brasil Solar, via LAI)',
  },
  {
    id: 'qualidade_fornecimento',
    nome: 'Qualidade de Fornecimento',
    fontes: 'ANEEL — BDGD (Base de Dados Geográfica da Distribuidora) e indicadores DEC/FEC',
  },
  {
    id: 'capital_humano',
    nome: 'Capital Humano',
    fontes: 'IBGE — Censo 2022 (alfabetização) e DATASUS — SIM + SINASC (datasus.saude.gov.br, via BigQuery)',
  },
  {
    id: 'irradiacao_solar',
    nome: 'Irradiação Solar',
    fontes: 'INPE — Atlas Brasileiro de Energia Solar 2017 (LABREN/CCST, labren.ccst.inpe.br)',
  },
  {
    id: 'clima',
    nome: 'Clima',
    fontes: 'INPE/CPTEC — produto MERGE de precipitação (satélite + solo)',
    semIndicador: 'dimensão exploratória — ainda sem indicador composto formal',
  },
];

const INDICADORES: IndicadorComposto[] = [
  {
    id: 'vazio_de_acesso',
    nome: 'Vazio de Acesso',
    descricao: 'Alta irradiação + baixa adoção de MMGD residencial',
    origens: ['mmgd', 'irradiacao_solar'],
  },
  {
    id: 'ivs',
    nome: 'IVS Consolidado',
    descricao: 'Vulnerabilidade social (exclui moradia por desenho)',
    origens: ['infraestrutura', 'renda_trabalho', 'capital_humano'],
  },
  {
    id: 'ivsh',
    nome: 'IVSH',
    descricao: 'IVS + precariedade habitacional + insegurança da posse',
    origens: ['infraestrutura', 'renda_trabalho', 'capital_humano', 'moradia'],
  },
  {
    id: 'correlacao',
    nome: 'Correlação MMGD × Moradia',
    descricao: 'Controlando irradiação e renda (Spearman parcial)',
    origens: ['mmgd', 'moradia', 'irradiacao_solar', 'renda_trabalho'],
  },
  {
    id: 'ranking_distribuidoras',
    nome: 'Ranking de Distribuidoras',
    descricao: 'Desempenho de conexão de MMGD por distribuidora',
    origens: ['qualidade_fornecimento', 'mmgd'],
  },
];

const LARGURA = 920;
const ALTURA = 680;
const CAIXA_DIM = { x: 16, largura: 344, altura: 66 };
const CAIXA_IND = { x: 624, largura: 280, altura: 92 };
const TOPO = 12;
const ESPACO_DIM = (ALTURA - TOPO * 2) / DIMENSOES.length;
const ESPACO_IND = (ALTURA - TOPO * 2) / INDICADORES.length;

function centroY(indice: number, espaco: number, alturaCaixa: number): number {
  return TOPO + indice * espaco + alturaCaixa / 2;
}

export function DiagramaConexaoDados() {
  const centroDim = new Map(DIMENSOES.map((d, i) => [d.id, centroY(i, ESPACO_DIM, CAIXA_DIM.altura)]));
  const centroInd = new Map(INDICADORES.map((ind, i) => [ind.id, centroY(i, ESPACO_IND, CAIXA_IND.altura)]));

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Diagrama mostrando como as 9 dimensões de dados do Atlas se combinam nos indicadores compostos (Vazio de Acesso, IVS, IVSH, Correlação MMGD×Moradia, Ranking de Distribuidoras)."
        className="w-full min-w-[860px]"
      >
        {/* Coluna esquerda: dimensões de dados (entrada). */}
        {DIMENSOES.map((dim, i) => {
          const y = TOPO + i * ESPACO_DIM;
          return (
            <g key={dim.id}>
              <rect
                x={CAIXA_DIM.x}
                y={y}
                width={CAIXA_DIM.largura}
                height={CAIXA_DIM.altura}
                rx={6}
                fill="#ffffff"
                stroke={dim.semIndicador ? '#fbbf24' : '#e2e8f0'}
                strokeDasharray={dim.semIndicador ? '4 3' : undefined}
              />
              <foreignObject x={CAIXA_DIM.x} y={y} width={CAIXA_DIM.largura} height={CAIXA_DIM.altura}>
                <div className="flex h-full flex-col justify-center gap-0.5 px-3 py-1.5">
                  <p className="text-xs font-semibold text-slate-700">{dim.nome}</p>
                  <p className="text-[10px] leading-tight text-slate-400">{dim.fontes}</p>
                  {dim.semIndicador && (
                    <p className="text-[10px] leading-tight font-medium text-amber-600">
                      Sem linha: {dim.semIndicador}
                    </p>
                  )}
                </div>
              </foreignObject>
            </g>
          );
        })}

        {/* Coluna direita: indicadores compostos (saída). */}
        {INDICADORES.map((ind, i) => {
          const y = TOPO + i * ESPACO_IND;
          return (
            <g key={ind.id}>
              <rect
                x={CAIXA_IND.x}
                y={y}
                width={CAIXA_IND.largura}
                height={CAIXA_IND.altura}
                rx={6}
                fill="#f5f3ff"
                stroke="#c4b5fd"
              />
              <foreignObject x={CAIXA_IND.x} y={y} width={CAIXA_IND.largura} height={CAIXA_IND.altura}>
                <div className="flex h-full flex-col justify-center px-3">
                  <p className="font-mono text-xs font-bold text-violet-800">{ind.nome}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-violet-600">{ind.descricao}</p>
                </div>
              </foreignObject>
            </g>
          );
        })}

        {/* Linhas de conexão — desenhadas por CIMA das caixas de propósito
            (senão o preenchimento opaco das caixas cobre o ponto exato de
            encontro linha↔borda, deixando a conexão pouco visível — bug
            real encontrado nesta sessão). Um círculo em cada ponta reforça
            visualmente onde a linha "encosta" na caixa. */}
        <g fill="none" stroke="#94a3b8" strokeWidth="2" strokeOpacity={0.7}>
          {INDICADORES.flatMap((ind) =>
            ind.origens.map((origemId) => {
              const y1 = centroDim.get(origemId);
              const y2 = centroInd.get(ind.id);
              if (y1 === undefined || y2 === undefined) return null;
              const x1 = CAIXA_DIM.x + CAIXA_DIM.largura;
              const x2 = CAIXA_IND.x;
              const xMeio = (x1 + x2) / 2;
              return (
                <path
                  key={`${origemId}-${ind.id}`}
                  d={`M ${x1} ${y1} C ${xMeio} ${y1}, ${xMeio} ${y2}, ${x2} ${y2}`}
                />
              );
            }),
          )}
        </g>
        <g stroke="#ffffff" strokeWidth={1.5}>
          {DIMENSOES.map((dim) => {
            const y = centroDim.get(dim.id);
            const conectada = INDICADORES.some((ind) => ind.origens.includes(dim.id));
            if (y === undefined || !conectada) return null;
            return (
              <circle key={dim.id} cx={CAIXA_DIM.x + CAIXA_DIM.largura} cy={y} r={4} fill="#64748b" />
            );
          })}
          {INDICADORES.map((ind) => {
            const y = centroInd.get(ind.id);
            if (y === undefined) return null;
            return <circle key={ind.id} cx={CAIXA_IND.x} cy={y} r={4} fill="#7c3aed" />;
          })}
        </g>
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-slate-200 bg-white" />
          Dimensões de dados (entrada)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-violet-300 bg-violet-50" />
          Indicadores compostos (saída)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-amber-400 bg-white" />
          Sem indicador composto ainda (ver aviso no próprio card)
        </span>
      </div>
    </div>
  );
}
