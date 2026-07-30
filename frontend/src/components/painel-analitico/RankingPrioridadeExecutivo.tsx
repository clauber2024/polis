import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { VaziosDeAcessoCompleto } from '../../services/vaziosDeAcesso.service';
import type { MunicipioClassificado } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';
import { ModalDetalhamentoVazios } from './ModalDetalhamentoVazios';

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
 * Cards Executivos (30/07/2026, revisão de design — substitui o RankingItem
 * com barra de progresso usado antes): a barra horizontal cinza tentava
 * resolver o "código de barras" de um feedback anterior, mas continuava
 * poluindo a leitura numa lista pensada para escaneamento rápido em
 * reunião. Trocado por um List-Group de cards limpos — posição numerada,
 * nome do município, valor bruto de IVSH e uma seta indicando drill-down —
 * sem nenhum gráfico de barra na linha. RankingItem (components/ranking/
 * RankingItem.tsx) continua existindo e é usado no ranking estadual do
 * mapa (PainelRanking.tsx) — não foi alterado, só parou de ser reaproveitado
 * aqui: os dois contextos têm necessidades diferentes (lá compara o valor
 * contra o maior da UF e a mediana nacional via barra; aqui o objetivo é
 * escaneamento rápido do nome + posição, não comparação visual de
 * magnitude). Clique num município navega para a Ficha no mapa
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
 * "Carregar Top 50 municípios" (30/07/2026, reformulado — taxonomia
 * institucional do menu): não expande mais a lista NESTA tela — abre
 * ModalDetalhamentoVazios, o drill-down territorial completo (paginação
 * server-side, filtro por UF/classificação IVSH, exportação CSV), a mesma
 * tela que antes vivia numa aba própria "Vazios de Acesso" do menu
 * principal (removida — ver App.tsx). Top 5 sempre fixo aqui; o "Carregar
 * mais" virou "abrir o detalhamento", não "mostrar mais linhas na mesma
 * lista".
 */

const TOPO_INICIAL = 5;

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

function IconeSeta({ className }: { className?: string }) {
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
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function RankingPrioridadeExecutivo({ dados, ufFiltro, aoLimparFiltro }: RankingPrioridadeExecutivoProps) {
  const [modalAberto, setModalAberto] = useState(false);

  const comIvsh = dados.municipios.filter(
    (m): m is MunicipioClassificado & { ivsh: number } =>
      m.quadrante === 'vazio_de_acesso' && m.ivsh !== null,
  );
  const ordenadosNacional = [...comIvsh].sort((a, b) => b.ivsh - a.ivsh);
  const ordenados = ufFiltro
    ? ordenadosNacional.filter((m) => m.uf === ufFiltro)
    : ordenadosNacional;

  const visiveis = ordenados.slice(0, TOPO_INICIAL);

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
          : `Top ${Math.min(TOPO_INICIAL, ordenados.length)}: dupla exclusão`}
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
          <ol className="space-y-2">
            {visiveis.map((m, indice) => (
              <li key={m.codigoIbge}>
                <Link
                  to={`/mapa?municipio=${m.codigoIbge}`}
                  className="group flex w-full items-center justify-between rounded-xl border border-stone-100 bg-white p-4 shadow-sm transition-all hover:border-red-200 hover:bg-red-50/30 hover:shadow-md"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-50 text-sm font-black text-stone-400 transition-colors group-hover:bg-red-100 group-hover:text-red-700">
                      {indice + 1}º
                    </span>
                    <h4 className="truncate text-sm font-black text-stone-900">
                      {m.nome} <span className="font-bold text-stone-400">— {m.uf}</span>
                    </h4>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="text-xs font-black text-stone-700 transition-colors group-hover:text-red-700">
                      IVSH {formatarValor(m.ivsh, 'numero')}
                    </span>
                    <IconeSeta className="h-5 w-5 shrink-0 text-stone-300 transition-transform group-hover:translate-x-1 group-hover:text-red-600" />
                  </div>
                </Link>
              </li>
            ))}
          </ol>

          {ordenados.length > TOPO_INICIAL && (
            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className="mt-3 w-full rounded-lg border border-dashed border-stone-300 py-2.5 text-xs font-bold tracking-widest text-stone-500 uppercase transition-colors hover:border-stone-400 hover:bg-stone-50 hover:text-stone-700"
            >
              Carregar Top {Math.min(50, ordenados.length)} municípios
            </button>
          )}
        </>
      )}

      {modalAberto && (
        <ModalDetalhamentoVazios ufInicial={ufFiltro} aoFechar={() => setModalAberto(false)} />
      )}
    </div>
  );
}
