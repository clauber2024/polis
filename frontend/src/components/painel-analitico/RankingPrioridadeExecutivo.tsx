import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { VaziosDeAcessoCompleto } from '../../services/vaziosDeAcesso.service';
import type { MunicipioClassificado } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';
import { RankingItem } from '../ranking/RankingItem';

/** Tom neutro suave para a barra — mantém o vermelho reservado ao ícone/badge, ver docstring do arquivo. */
const COR_BARRA_NEUTRA = '#d6d3d1';

/**
 * Ranking Executivo — "por onde começar amanhã de manhã" (30/07/2026,
 * decisão do usuário, mesma sessão de GraficoRegional.tsx/Visão Executiva).
 * Lista os municípios em dupla exclusão: quadrante Vazio de Acesso (RF-055,
 * SEMPRE a classificação oficial do backend) E maior IVSH (vulnerabilidade
 * sócio-habitacional-energética, vw_ivsh_consolidado) — não o IVS padrão de
 * RF-056, escolha deliberada do usuário para esta lista específica (a lente
 * habitacional já existe como alternador em PaginaVaziosDeAcesso.tsx,
 * AlternadorPriorizacaoIvsh.tsx; aqui ela é fixa, não um toggle).
 *
 * Reaproveita RankingItem (components/ranking/RankingItem.tsx — extraído do
 * PainelRanking do mapa exatamente para listas de valor único como esta) em
 * vez de inventar um novo componente de card — mesmo item visual usado no
 * ranking estadual do mapa. Clique num município navega para a Ficha no mapa
 * (`/mapa?municipio=<codigoIbge>`), mesmo padrão de drill-down já usado em
 * PaginaVaziosDeAcesso.tsx.
 *
 * Filtro por UF (30/07/2026, mesma sessão — segunda resposta do usuário à
 * pergunta "o que acontece ao clicar num estado do Treemap": substitui a
 * primeira resposta, que navegava direto para `/mapa?uf=`). `ufFiltro` é
 * controlado pelo pai (PainelAnalitico.tsx), alimentado pelo clique num
 * bloco de estado do TreemapProporcaoNacional — filtra esta MESMA lista em
 * vez de sair da página, mantendo o usuário no contexto macro. O deep-link
 * `/mapa?uf=` continua existindo (PaginaMapa.tsx) — não foi removido, só
 * deixou de ser o gatilho do clique no Treemap; oferecido aqui como link
 * explícito "Ver <UF> no mapa" para quem quiser a exploração espacial.
 *
 * Cor da barra (30/07/2026, feedback do usuário): NÃO o Vermelho Pólis
 * saturado (COR_QUADRANTE.vazio_de_acesso) — como toda linha desta lista já
 * é Vazio de Acesso por construção, uma barra vermelha cheia em cada linha
 * empilhava como "código de barras" (o "divisor pesado" reportado era essa
 * barra, não a border-b do RankingItem, que já é stone-100 neutro).
 * Vermelho fica reservado ao ícone/badge "Foco de ação" — a barra usa tom
 * neutro suave (RankingItem é componente compartilhado com outras cores em
 * PainelRanking do mapa; não alterado).
 *
 * "Carregar Top 50": os ~5.500 municípios já estão inteiros na memória
 * (mesmo `dados` do GraficoRegional, carregado uma vez via botão "Carregar
 * diagnóstico") — expandir é só um slice local, não uma nova requisição.
 */

const TOPO_INICIAL = 5;
const TOPO_EXPANDIDO = 50;

interface RankingPrioridadeExecutivoProps {
  dados: VaziosDeAcessoCompleto;
  /** UF selecionada no Treemap ('' = sem filtro, visão nacional) — controlado pelo pai. */
  ufFiltro: string;
  /** Limpa o filtro (botão "Ver Nacional") — controlado pelo pai, mesmo estado que TreemapProporcaoNacional lê. */
  aoLimparFiltro: () => void;
}

function IconeAlertaTriangular({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconeX({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

export function RankingPrioridadeExecutivo({ dados, ufFiltro, aoLimparFiltro }: RankingPrioridadeExecutivoProps) {
  const [expandido, setExpandido] = useState(false);

  const comIvsh = dados.municipios.filter(
    (m): m is MunicipioClassificado & { ivsh: number } =>
      m.quadrante === 'vazio_de_acesso' && m.ivsh !== null,
  );
  const ordenadosNacional = [...comIvsh].sort((a, b) => b.ivsh - a.ivsh);
  const ordenados = ufFiltro
    ? ordenadosNacional.filter((m) => m.uf === ufFiltro)
    : ordenadosNacional;

  // Mediana de apresentação (client-side, sobre os classificados) — não é a
  // metodologia oficial de Vazio de Acesso, que segue sempre do backend
  // (mesma ressalva já documentada em PainelRanking.tsx, mediana()).
  const medianaIvsh = mediana(
    dados.municipios.map((m) => m.ivsh).filter((v): v is number => v !== null),
  );
  const maxIvsh = ordenados.length > 0 ? ordenados[0].ivsh : 0;

  const limite = expandido ? TOPO_EXPANDIDO : TOPO_INICIAL;
  const visiveis = ordenados.slice(0, limite);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 rounded bg-red-50 px-2.5 py-1 text-[10px] font-black tracking-widest text-red-800 uppercase ring-1 ring-red-200">
          <IconeAlertaTriangular className="h-3 w-3" />
          {ufFiltro ? `Foco de ação — ${ufFiltro}` : 'Foco de ação'}
        </div>
        {ufFiltro && (
          <div className="flex items-center gap-2">
            <Link
              to={`/mapa?uf=${ufFiltro}`}
              className="text-[10px] font-bold tracking-wide text-stone-500 uppercase hover:text-red-700 hover:underline"
            >
              Ver {ufFiltro} no mapa
            </Link>
            <button
              type="button"
              onClick={aoLimparFiltro}
              className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-1 text-[10px] font-bold text-stone-500 uppercase transition-colors hover:bg-stone-200 hover:text-stone-700"
            >
              <IconeX className="h-3 w-3" />
              Ver nacional
            </button>
          </div>
        )}
      </div>
      <h3 className="text-sm font-black tracking-tight text-stone-900">
        {ufFiltro
          ? `${ordenados.length.toLocaleString('pt-BR')} município(s) em ${ufFiltro}`
          : `Top ${Math.min(limite, ordenados.length)}: dupla exclusão`}
      </h3>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-stone-500">
        {ufFiltro
          ? `Filtrado pelo bloco de ${ufFiltro} no treemap acima — municípios em Vazio de Acesso ordenados pelo IVSH dentro do estado.`
          : 'Municípios em Vazio de Acesso (alto potencial solar, baixa adoção residencial) que lideram o IVSH — vulnerabilidade sócio-habitacional-energética.'}{' '}
        Clique num município para abrir a Ficha no mapa.
      </p>

      {ordenados.length === 0 && (
        <p className="rounded-xl border border-dashed border-stone-200 p-6 text-center text-sm font-bold text-stone-400">
          {ufFiltro
            ? `Nenhum município de ${ufFiltro} está em Vazio de Acesso com IVSH calculado.`
            : 'Nenhum município classificado em Vazio de Acesso tem IVSH calculado.'}
        </p>
      )}

      {ordenados.length > 0 && (
        <>
          <ol>
            {visiveis.map((m, indice) => (
              <li key={m.codigoIbge}>
                <Link
                  to={`/mapa?municipio=${m.codigoIbge}`}
                  className="block border-l-2 border-l-transparent transition-colors hover:border-l-red-600"
                >
                  <RankingItem
                    posicao={indice + 1}
                    nomeMunicipio={`${m.nome} — ${m.uf}`}
                    valor={m.ivsh}
                    valorFormatado={`IVSH ${formatarValor(m.ivsh, 'numero')}`}
                    unidade={null}
                    medianaNacional={medianaIvsh}
                    maxRanking={maxIvsh}
                    cor={COR_BARRA_NEUTRA}
                  />
                </Link>
              </li>
            ))}
          </ol>

          {!expandido && ordenados.length > TOPO_INICIAL && (
            <button
              type="button"
              onClick={() => setExpandido(true)}
              className="mt-3 w-full rounded-lg border border-dashed border-stone-300 py-2.5 text-xs font-bold tracking-widest text-stone-500 uppercase transition-colors hover:border-stone-400 hover:bg-stone-50 hover:text-stone-700"
            >
              Carregar Top {Math.min(TOPO_EXPANDIDO, ordenados.length)} municípios
            </button>
          )}
        </>
      )}
    </div>
  );
}
