import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buscarVaziosDeAcesso, exportarVaziosDeAcesso } from '../../services/vaziosDeAcesso.service';
import type { ClassificacaoIvsh, ListarVaziosDeAcessoResultado } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';
import { AlternadorPriorizacaoIvsh } from './AlternadorPriorizacaoIvsh';

/**
 * Rótulo + cor por quintil de IVSH (21/07/2026) — quintil calculado pelo
 * backend SOBRE o quadrante vazio_de_acesso (não nacional), ver
 * vaziosDeAcesso.service.ts, `calcularClassificacaoIvsh`. IVSH é indicador
 * negativo — muito_alto = pior 20% desta fila.
 */
const CLASSIFICACAO_IVSH_INFO: Record<ClassificacaoIvsh, { rotulo: string; classe: string }> = {
  muito_alto: { rotulo: 'Muito alto', classe: 'bg-red-50 text-red-700 border-red-200' },
  alto: { rotulo: 'Alto', classe: 'bg-amber-50 text-amber-700 border-amber-200' },
  medio: { rotulo: 'Médio', classe: 'bg-stone-100 text-stone-600 border-stone-200' },
  baixo: { rotulo: 'Baixo', classe: 'bg-teal-50 text-teal-700 border-teal-200' },
  muito_baixo: { rotulo: 'Muito baixo', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const POR_PAGINA = 50;

/** Siglas de UF para o filtro — lista estática de apresentação. */
const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

interface DetalhamentoTerritorialVaziosProps {
  /** Semeia o filtro de UF ao abrir (30/07/2026: continuidade do drill-down
   * vindo do Treemap/RankingPrioridadeExecutivo — quem já estava olhando
   * Bahia não deveria "perder o lugar" ao abrir o detalhamento completo). */
  ufInicial?: string;
}

/**
 * Detalhamento Territorial de Vazios de Acesso (14/07/2026, ideia adaptada
 * do protótipo `atlas-mmgd-solar`; extraído de PaginaVaziosDeAcesso.tsx em
 * 30/07/2026 para ser reaproveitado também dentro de ModalDetalhamentoVazios,
 * chamado a partir do Dossiê Executivo). Lista paginada dos municípios do
 * quadrante Vazio de Acesso, na ordenação de priorização padrão do backend
 * (RF-056: IVS ou IVSH decrescente — mais vulnerável primeiro). A posição
 * exibida é a posição real nessa priorização. Classificação e ordenação
 * 100% do backend (paginação server-side) — este componente só exibe.
 *
 * Taxonomia institucional (30/07/2026, decisão do usuário): esta tela
 * deixou de ser uma aba própria do menu chamada "Vazios de Acesso" com
 * "Ranking Nacional" — o Atlas é um centro de inteligência permanente, não
 * uma lista de denúncia. Título virou "Detalhamento Territorial de Vazios
 * de Acesso" (é isso que o componente entrega: o drill-down município a
 * município da lente macro), e a exportação virou "Exportar Fila de
 * Priorização" — a mesma lista, reformulada como instrumento de gestão
 * (fila do que priorizar), não como ranking público de quem "está pior".
 * IVSH como critério padrão (antes IVS) — mesmo raciocínio da lente
 * habitacional já usada em RankingPrioridadeExecutivo.tsx.
 */
export function DetalhamentoTerritorialVazios({ ufInicial = '' }: DetalhamentoTerritorialVaziosProps) {
  const [pagina, setPagina] = useState(1);
  const [uf, setUf] = useState(ufInicial);
  const [classificacaoIvsh, setClassificacaoIvsh] = useState('');
  const [ivshLigado, setIvshLigado] = useState(true);
  const [resultado, setResultado] = useState<ListarVaziosDeAcessoResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    buscarVaziosDeAcesso({
      quadrante: 'vazio_de_acesso',
      pagina: String(pagina),
      porPagina: String(POR_PAGINA),
      ordenarPor: ivshLigado ? 'ivsh' : 'ivs',
      ...(uf ? { uf } : {}),
      ...(classificacaoIvsh ? { classificacaoIvsh } : {}),
    })
      .then((resposta) => {
        if (ativo) setResultado(resposta);
      })
      .catch((causa: unknown) => {
        if (ativo) {
          setErro(causa instanceof Error ? causa.message : 'Falha ao carregar o detalhamento.');
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [pagina, uf, classificacaoIvsh, ivshLigado]);

  function aoAlternarIvsh(ligado: boolean) {
    setIvshLigado(ligado);
    // Desliga o filtro de classificação junto — não faz sentido ele ficar
    // aplicado (mesmo que desabilitado na UI) quando o critério volta a ser IVS.
    if (!ligado) setClassificacaoIvsh('');
    setPagina(1);
  }

  /**
   * Exporta em CSV a fila COMPLETA (todos os municípios do quadrante, não
   * só a página atual de 50) com os mesmos filtros já aplicados na tela —
   * mesmo padrão de download já usado no Dashboard Público (RF-047).
   */
  async function aoClicarExportar() {
    setBaixando(true);
    setErro(null);
    try {
      await exportarVaziosDeAcesso({
        quadrante: 'vazio_de_acesso',
        ordenarPor: ivshLigado ? 'ivsh' : 'ivs',
        ...(uf ? { uf } : {}),
        ...(classificacaoIvsh ? { classificacaoIvsh } : {}),
      });
    } catch (causa: unknown) {
      setErro(causa instanceof Error ? causa.message : 'Falha ao exportar o CSV.');
    } finally {
      setBaixando(false);
    }
  }

  const totalPaginas = resultado?.paginacao.totalPaginas ?? 1;

  return (
    <div className="font-sans">
      <div className="rounded-xl border border-stone-200/70 bg-white p-6">
        <span className="mb-1 inline-flex items-center gap-1.5 rounded bg-violet-50 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-violet-700 uppercase">
          Potencial não aproveitado
        </span>
        <h1 className="text-2xl font-black tracking-tight text-stone-900">
          Detalhamento Territorial de Vazios de Acesso
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Municípios com alta irradiação solar e baixa adoção de MMGD residencial, ordenados
          por {ivshLigado ? 'IVSH' : 'IVS'} decrescente — mais vulnerável primeiro. A
          classificação do quadrante (quem é Vazio de Acesso) não muda com o critério de
          priorização, só a ordem dentro dele.
        </p>
        {resultado && (
          <p
            className="mt-2 cursor-help font-mono text-xs text-stone-400 underline decoration-dotted underline-offset-2"
            title={resultado.avisos.notaUniverso}
          >
            {resultado.paginacao.totalResultados.toLocaleString('pt-BR')} municípios no quadrante
            {uf && ` (filtro: ${uf})`} ·{' '}
            {resultado.avisos.totalExcluidosSemDado.toLocaleString('pt-BR')} excluídos da
            classificação por falta de dado (de {resultado.avisos.totalMunicipios.toLocaleString('pt-BR')}{' '}
            municípios no total)
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="filtro-uf-vazios" className="text-xs font-semibold text-stone-600">
            Filtrar por estado
          </label>
          <select
            id="filtro-uf-vazios"
            value={uf}
            onChange={(evento) => {
              setUf(evento.target.value);
              setPagina(1);
            }}
            className="rounded border border-stone-200 bg-stone-50 px-2 py-1.5 text-sm text-stone-800 focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none"
          >
            <option value="">Todos os estados</option>
            {UFS.map((sigla) => (
              <option key={sigla} value={sigla}>
                {sigla}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro por classificação de IVSH (21/07/2026) — só faz sentido
            junto do modo IVSH ligado, já que a classificação é sobre esse
            índice; desabilitado (não escondido) quando IVS está ativo, para
            deixar claro que a opção existe. */}
        <div className="flex items-center gap-3">
          <label htmlFor="filtro-classificacao-ivsh" className="text-xs font-semibold text-stone-600">
            Classificação IVSH
          </label>
          <select
            id="filtro-classificacao-ivsh"
            value={classificacaoIvsh}
            disabled={!ivshLigado}
            onChange={(evento) => {
              setClassificacaoIvsh(evento.target.value);
              setPagina(1);
            }}
            className="rounded border border-stone-200 bg-stone-50 px-2 py-1.5 text-sm text-stone-800 focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none disabled:opacity-50"
            title={!ivshLigado ? 'Ligue o critério IVSH acima para filtrar por classificação' : undefined}
          >
            <option value="">Todas</option>
            {(Object.entries(CLASSIFICACAO_IVSH_INFO) as [ClassificacaoIvsh, { rotulo: string }][]).map(
              ([valor, info]) => (
                <option key={valor} value={valor}>
                  {info.rotulo}
                </option>
              ),
            )}
          </select>
        </div>

        <AlternadorPriorizacaoIvsh ligado={ivshLigado} aoAlternar={aoAlternarIvsh} />

        <button
          type="button"
          onClick={aoClicarExportar}
          disabled={baixando}
          className="rounded border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
        >
          {baixando ? 'Gerando CSV…' : 'Exportar fila de priorização (CSV)'}
        </button>
      </div>

      {carregando && <p className="mt-6 text-sm text-stone-500">Carregando detalhamento…</p>}
      {erro && !carregando && <p className="mt-6 text-sm text-red-600">{erro}</p>}

      {resultado && !carregando && !erro && (
        <>
          <div className="mt-4 overflow-x-auto rounded border border-stone-200 bg-white shadow-2xs">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-left font-mono text-[10px] tracking-wider text-stone-500 uppercase">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Município</th>
                  <th className="px-3 py-2">UF</th>
                  <th className="px-3 py-2 text-right">IVS</th>
                  {ivshLigado && <th className="px-3 py-2 text-right">IVSH</th>}
                  {ivshLigado && <th className="px-3 py-2">Classificação IVSH</th>}
                  <th className="px-3 py-2 text-right">Pobreza CadÚnico</th>
                  <th className="px-3 py-2 text-right">MMGD res. (kW/1.000 hab)</th>
                  <th className="px-3 py-2 text-right">Irradiação (kWh/m²·dia)</th>
                </tr>
              </thead>
              <tbody>
                {resultado.resultados.map((m, i) => (
                  <tr
                    key={m.codigoIbge}
                    className="border-b border-stone-100 last:border-0 hover:bg-red-50/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-stone-400">
                      {(resultado.paginacao.pagina - 1) * resultado.paginacao.porPagina + i + 1}º
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/mapa?municipio=${m.codigoIbge}`}
                        className="font-semibold text-stone-800 hover:text-red-700 hover:underline"
                        title="Abrir no mapa"
                      >
                        {m.nome}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-stone-500">{m.uf}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-stone-700">
                      {m.ivs !== null ? formatarValor(m.ivs, 'numero') : '—'}
                    </td>
                    {ivshLigado && (
                      <td className="px-3 py-2 text-right font-mono font-semibold text-red-700">
                        {m.ivsh !== null ? formatarValor(m.ivsh, 'numero') : '—'}
                      </td>
                    )}
                    {ivshLigado && (
                      <td className="px-3 py-2">
                        {m.classificacaoIvsh ? (
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${CLASSIFICACAO_IVSH_INFO[m.classificacaoIvsh].classe}`}
                          >
                            {CLASSIFICACAO_IVSH_INFO[m.classificacaoIvsh].rotulo}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-mono text-stone-700">
                      {m.percentualPobrezaCadunico !== null
                        ? `${formatarValor(m.percentualPobrezaCadunico, 'numero')}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-stone-700">
                      {m.mmgdResidencialPer1000Hab !== null
                        ? formatarValor(m.mmgdResidencialPer1000Hab, 'numero')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-stone-700">
                      {m.irradiacaoMediaKwhM2Dia !== null
                        ? formatarValor(m.irradiacaoMediaKwhM2Dia, 'numero')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resultado.resultados.length === 0 && (
              <p className="p-4 text-sm text-stone-500">
                Nenhum Vazio de Acesso {uf ? `em ${uf}` : 'encontrado'} — isso pode ser um bom
                sinal (adoção acima da mediana) ou falta de dado; ver a nota metodológica abaixo.
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1}
              className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <span className="font-mono text-xs text-stone-500">
              Página {resultado.paginacao.pagina} de {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas}
              className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              Próxima →
            </button>
          </div>

          {/* O backend EXIGE que a nota acompanhe qualquer exibição da classificação. */}
          <div className="mt-6 rounded border border-violet-100 bg-violet-50/50 p-4 text-xs leading-relaxed text-stone-600">
            <span className="mb-1 block font-mono text-[10px] font-bold tracking-wider text-violet-700 uppercase">
              Nota metodológica
            </span>
            <p>{resultado.metodologia.criterioQuadrante}</p>
            <p className="mt-1.5">{resultado.metodologia.criterioPriorizacaoPadrao}</p>
            <p className="mt-1.5">{resultado.notaMetodologica}</p>
            {resultado.avisos.totalPrecisaReextrairMmgd > 0 && (
              <p className="mt-1.5 text-amber-700">
                {resultado.avisos.totalPrecisaReextrairMmgd.toLocaleString('pt-BR')} municípios
                fora da classificação (MMGD residencial pendente de re-extração — ver CLAUDE.md).
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
