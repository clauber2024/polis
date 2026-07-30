import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { VaziosDeAcessoCompleto } from '../../services/vaziosDeAcesso.service';
import type { MunicipioClassificado } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';
import { RankingItem } from '../ranking/RankingItem';
import { ModalDetalhamentoVazios } from './ModalDetalhamentoVazios';
import type { FiltroFunil } from './FunilExclusaoHabitacional';

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
 * Barra de comparação (30/07/2026 — a versão "Cards Executivos" sem barra,
 * de uma rodada anterior, foi revertida a pedido do usuário: a barra não é
 * poluição, é informação — mostra o quanto cada município está acima/abaixo
 * da referência). Reaproveita RankingItem (components/ranking/RankingItem.tsx
 * — extraído do PainelRanking do mapa exatamente para listas de valor único
 * como esta) em vez de duplicar o layout. Clique num município navega para a
 * Ficha no mapa (`/mapa?municipio=<codigoIbge>`), mesmo padrão de drill-down
 * já usado em PaginaVaziosDeAcesso.tsx.
 *
 * Mediana nacional OU estadual, conforme o filtro (30/07/2026, pedido do
 * usuário na mesma revisão): sem `ufFiltro`, a barra compara cada município
 * contra a mediana NACIONAL de IVSH (todos os municípios com dado, não só
 * Vazio de Acesso — mesmo universo já usado antes desta revisão). Com
 * `ufFiltro` ativo (clique no Treemap), a comparação vira a mediana DENTRO
 * do estado filtrado — comparar contra o Brasil inteiro depois de já ter
 * restringido a lista a um estado seria uma referência menos útil. RankingItem
 * ganhou a prop opcional `rotuloMediana` para o rótulo do marcador
 * acompanhar qual referência está sendo mostrada ("Mediana Brasil" vs.
 * "Mediana BA") — default 'Brasil' preserva o comportamento de
 * PainelRanking.tsx (mapa), que não passa essa prop.
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
 *
 * Filtro do Funil (30/07/2026, mesma sessão — FunilExclusaoHabitacional
 * virou clicável): `filtroFunil` é o SEGUNDO filtro independente aplicado
 * aqui, combinado com `ufFiltro` por AND (ex.: "Bahia" + "alta
 * vulnerabilidade + sem contrato" ao mesmo tempo, se os dois estiverem
 * ativos). Mesma filosofia do UF — filtra a lista na própria tela em vez
 * de navegar pra outro lugar.
 */

const TOPO_INICIAL = 5;

interface RankingPrioridadeExecutivoProps {
  dados: VaziosDeAcessoCompleto;
  /** UF selecionada no Treemap ('' = sem filtro, visão nacional) — controlado pelo pai. */
  ufFiltro: string;
  /** Limpa o filtro de UF (botão "Ver Nacional") — controlado pelo pai, mesmo estado que TreemapProporcaoNacional lê. */
  aoLimparFiltro: () => void;
  /** Segmento selecionado no Funil (vulnerabilidade × financiamento) — controlado pelo pai, mesmo estado que FunilExclusaoHabitacional lê/escreve. */
  filtroFunil: FiltroFunil;
  /** Limpa o filtro do Funil — controlado pelo pai. */
  aoLimparFiltroFunil: () => void;
}

/** Descrição legível do filtro de funil ativo, ou null se nenhum eixo estiver filtrado. */
function rotuloFiltroFunil(filtro: FiltroFunil): string | null {
  const partes: string[] = [];
  if (filtro.vulnerabilidade === 'alta') partes.push('alta vulnerabilidade habitacional');
  if (filtro.vulnerabilidade === 'moderada') partes.push('vulnerabilidade moderada/baixa');
  if (filtro.financiamento === 'sem') partes.push('sem contrato de financiamento');
  if (filtro.financiamento === 'com') partes.push('com contrato de financiamento');
  return partes.length > 0 ? partes.join(' + ') : null;
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

export function RankingPrioridadeExecutivo({
  dados,
  ufFiltro,
  aoLimparFiltro,
  filtroFunil,
  aoLimparFiltroFunil,
}: RankingPrioridadeExecutivoProps) {
  const [modalAberto, setModalAberto] = useState(false);

  const comIvsh = dados.municipios.filter(
    (m): m is MunicipioClassificado & { ivsh: number } =>
      m.quadrante === 'vazio_de_acesso' && m.ivsh !== null,
  );
  const ordenadosNacional = [...comIvsh].sort((a, b) => b.ivsh - a.ivsh);
  const ordenados = ordenadosNacional.filter((m) => {
    if (ufFiltro && m.uf !== ufFiltro) return false;
    const altaVulnerabilidade = m.classificacaoIvsh === 'muito_alto' || m.classificacaoIvsh === 'alto';
    if (filtroFunil.vulnerabilidade === 'alta' && !altaVulnerabilidade) return false;
    if (filtroFunil.vulnerabilidade === 'moderada' && altaVulnerabilidade) return false;
    if (filtroFunil.financiamento === 'sem' && !m.alertaDeficitCredito) return false;
    if (filtroFunil.financiamento === 'com' && m.alertaDeficitCredito) return false;
    return true;
  });
  const rotuloFunil = rotuloFiltroFunil(filtroFunil);

  // Mediana de apresentação (client-side, sobre os classificados) — não é a
  // metodologia oficial de Vazio de Acesso, que segue sempre do backend
  // (mesma ressalva já documentada em PainelRanking.tsx, mediana()).
  // Nacional: sobre TODOS os municípios com ivsh calculado, não só Vazio de
  // Acesso — mesmo universo já usado antes desta revisão. Estadual: mesmo
  // universo, restrito à UF filtrada — só calculada quando há filtro.
  const medianaNacionalIvsh = mediana(
    dados.municipios.map((m) => m.ivsh).filter((v): v is number => v !== null),
  );
  const medianaEstadualIvsh = ufFiltro
    ? mediana(
        dados.municipios
          .filter((m) => m.uf === ufFiltro)
          .map((m) => m.ivsh)
          .filter((v): v is number => v !== null),
      )
    : null;
  const medianaExibida = ufFiltro ? medianaEstadualIvsh : medianaNacionalIvsh;
  const rotuloMediana = ufFiltro || 'Brasil';
  const maxIvsh = ordenados.length > 0 ? ordenados[0].ivsh : 0;
  const visiveis = ordenados.slice(0, TOPO_INICIAL);

  // Piso dinâmico da barra (30/07/2026, feedback do usuário: os valores de
  // IVSH do Top 5 são muito próximos entre si — ex. 0,28 vs 0,27 — e numa
  // escala 0–max as barras ficavam visualmente idênticas). Derivado do
  // menor IVSH REAL entre os municípios exibidos agora — NUNCA um piso
  // fixo tipo 0,20: o Top 5 real pode estar em qualquer faixa da
  // distribuição de IVSH, um número chutado fabricaria uma escala que não
  // corresponde ao dado. 5% de folga abaixo do mínimo real para o 5º
  // colocado nunca renderizar com barra de largura zero (pareceria bug, não
  // "é o menos pior dos 5 piores").
  const pisoIvsh = visiveis.length > 0 ? Math.min(...visiveis.map((m) => m.ivsh)) * 0.95 : 0;

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

      {rotuloFunil && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5">
          <span className="text-[10px] font-bold text-stone-600">
            Segmento do funil: <span className="text-stone-900">{rotuloFunil}</span>
          </span>
          <button
            type="button"
            onClick={aoLimparFiltroFunil}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-stone-500 uppercase shadow-sm transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <IconeX className="h-3 w-3" />
            Limpar
          </button>
        </div>
      )}

      <h3 className="text-sm font-black tracking-tight text-stone-900">
        {ufFiltro || rotuloFunil
          ? `${ordenados.length.toLocaleString('pt-BR')} município(s) filtrado(s)`
          : `Top ${Math.min(TOPO_INICIAL, ordenados.length)}: dupla exclusão`}
      </h3>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-stone-500">
        {ufFiltro || rotuloFunil
          ? `Filtrado pelo${ufFiltro ? ` bloco de ${ufFiltro} no treemap` : ''}${ufFiltro && rotuloFunil ? ' e pelo' : ''}${rotuloFunil ? ` segmento "${rotuloFunil}" no funil` : ''} acima — municípios em Vazio de Acesso ordenados pelo IVSH.`
          : 'Municípios em Vazio de Acesso (alto potencial solar, baixa adoção residencial) que lideram o IVSH — vulnerabilidade sócio-habitacional-energética.'}{' '}
        Clique num município para abrir a Ficha no mapa.
      </p>

      {ordenados.length === 0 && (
        <p className="rounded-xl border border-dashed border-stone-200 p-6 text-center text-sm font-bold text-stone-400">
          {ufFiltro || rotuloFunil
            ? 'Nenhum município em Vazio de Acesso corresponde a essa combinação de filtros.'
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
                    medianaNacional={medianaExibida}
                    rotuloMediana={rotuloMediana}
                    maxRanking={maxIvsh}
                    minRanking={pisoIvsh}
                    cor={COR_BARRA_NEUTRA}
                  />
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
