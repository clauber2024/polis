/**
 * "Como os dados se conectam" (RF-006, pedido do usuário 21/07/2026) — duas
 * camadas (dimensões de dados → indicadores compostos): um grafo livre com
 * as ~11 fontes soltas + 9 dimensões + indicadores viraria ilegível (muitos
 * nós cruzando linhas), decisão tomada com o usuário na época. Aqui só se
 * documenta uma relação onde ela é real e já documentada (CLAUDE.md/
 * ARQUITETURA.md) — dimensão sem indicador composto (ex.: Clima) fica de
 * fora dos cards, mas aparece na nota abaixo, nunca inventada. As fontes
 * primárias de cada dimensão continuam cobertas pela lista completa em
 * FONTES_DE_DADOS, seção irmã desta (em PaginaLanding.tsx).
 *
 * Redesenhado em 25/07/2026 (auditoria de UX/UI): a versão anterior desenhava
 * as conexões como um SVG com paths curvos ligando duas colunas — não era
 * responsivo (as linhas quebravam/embaralhavam em telas estreitas) e lia
 * como uma "teia de aranha" para quem não desenhou o diagrama. Trocado por
 * Cards de Composição: cada indicador composto mostra, dentro do próprio
 * card, badges com as dimensões de origem — a mesma relação de antes
 * (`INDICADORES[].origens`), só sem fio nenhum para desenhar ou quebrar.
 */

interface Dimensao {
  id: string;
  nome: string;
  /** Instituição + sistema/dataset específico — precisa dar para achar a
   * fonte de forma independente (busca), não só o nome genérico. */
  fontes: string;
  /** Motivo de não ter indicador composto ainda — só para dimensões sem
   * indicador; aparece na nota "ainda não conectadas" abaixo dos cards. */
  semIndicador?: string;
}

interface IndicadorComposto {
  id: string;
  nome: string;
  descricao: string;
  origens: string[];
  cor: 'terracota' | 'chumbo' | 'carmim' | 'oportunidade';
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
    cor: 'terracota',
  },
  {
    id: 'ivs',
    nome: 'IVS Consolidado',
    descricao: 'Vulnerabilidade social (exclui moradia por desenho)',
    origens: ['infraestrutura', 'renda_trabalho', 'capital_humano'],
    cor: 'chumbo',
  },
  {
    id: 'ivsh',
    nome: 'IVSH',
    descricao: 'IVS + precariedade habitacional + insegurança da posse',
    origens: ['infraestrutura', 'renda_trabalho', 'capital_humano', 'moradia'],
    cor: 'carmim',
  },
  {
    id: 'correlacao',
    nome: 'Correlação MMGD × Moradia',
    descricao: 'Controlando irradiação e renda (Spearman parcial)',
    origens: ['mmgd', 'moradia', 'irradiacao_solar', 'renda_trabalho'],
    cor: 'oportunidade',
  },
  {
    id: 'ranking_distribuidoras',
    nome: 'Ranking de Distribuidoras',
    descricao: 'Desempenho de conexão de MMGD por distribuidora',
    origens: ['qualidade_fornecimento', 'mmgd'],
    cor: 'chumbo',
  },
];

const CORES_INDICADOR: Record<IndicadorComposto['cor'], { borda: string; fundo: string; titulo: string; badge: string }> = {
  terracota: {
    borda: 'border-orange-300/70',
    fundo: 'bg-orange-50/60',
    titulo: 'text-orange-800',
    badge: 'border-orange-200 bg-orange-100/70 text-orange-700',
  },
  chumbo: {
    borda: 'border-stone-400/60',
    fundo: 'bg-stone-100/60',
    titulo: 'text-stone-800',
    badge: 'border-stone-300 bg-stone-200/70 text-stone-700',
  },
  carmim: {
    borda: 'border-red-300/70',
    fundo: 'bg-red-50/60',
    titulo: 'text-red-800',
    badge: 'border-red-200 bg-red-100/70 text-red-700',
  },
  oportunidade: {
    borda: 'border-emerald-300/70',
    fundo: 'bg-emerald-50/60',
    titulo: 'text-emerald-800',
    badge: 'border-emerald-200 bg-emerald-100/70 text-emerald-700',
  },
};

export function DiagramaConexaoDados() {
  const nomeDimensao = new Map(DIMENSOES.map((d) => [d.id, d.nome]));
  const dimensoesSemIndicador = DIMENSOES.filter((d) => d.semIndicador);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {INDICADORES.map((ind) => {
          const cor = CORES_INDICADOR[ind.cor];
          return (
            <div
              key={ind.id}
              className={`rounded-2xl border p-5 shadow-sm backdrop-blur-md transition-colors ${cor.borda} ${cor.fundo}`}
            >
              <h4 className={`font-mono text-sm font-bold ${cor.titulo}`}>{ind.nome}</h4>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">{ind.descricao}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ind.origens.map((origemId) => (
                  <span
                    key={origemId}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur-md ${cor.badge}`}
                  >
                    {nomeDimensao.get(origemId) ?? origemId}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {dimensoesSemIndicador.length > 0 && (
        <p className="mt-4 text-[11px] leading-relaxed text-stone-400">
          Ainda sem indicador composto:{' '}
          {dimensoesSemIndicador.map((d, i) => (
            <span key={d.id}>
              <strong className="font-semibold text-stone-500">{d.nome}</strong> ({d.semIndicador})
              {i < dimensoesSemIndicador.length - 1 ? '; ' : '.'}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
