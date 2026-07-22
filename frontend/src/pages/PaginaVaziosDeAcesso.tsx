import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buscarVaziosDeAcesso } from '../services/vaziosDeAcesso.service';
import type { ClassificacaoIvsh, ListarVaziosDeAcessoResultado } from '../types/api';
import { formatarValor } from '../utils/formatadores';
import { AlternadorPriorizacaoIvsh } from '../components/vazios-de-acesso/AlternadorPriorizacaoIvsh';

/**
 * Rótulo + cor por quintil de IVSH (21/07/2026, pedido do usuário: "uma
 * classificação estatística dos municípios do ranking") — quintil calculado
 * pelo backend SOBRE o quadrante vazio_de_acesso (não nacional), ver
 * vaziosDeAcesso.service.ts, `calcularClassificacaoIvsh`. IVSH é indicador
 * negativo — muito_alto = pior 20% deste ranking.
 */
const CLASSIFICACAO_IVSH_INFO: Record<ClassificacaoIvsh, { rotulo: string; classe: string }> = {
  muito_alto: { rotulo: 'Muito alto', classe: 'bg-red-50 text-red-700 border-red-200' },
  alto: { rotulo: 'Alto', classe: 'bg-amber-50 text-amber-700 border-amber-200' },
  medio: { rotulo: 'Médio', classe: 'bg-slate-100 text-slate-600 border-slate-200' },
  baixo: { rotulo: 'Baixo', classe: 'bg-teal-50 text-teal-700 border-teal-200' },
  muito_baixo: { rotulo: 'Muito baixo', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

/**
 * Ranking nacional de "potencial não aproveitado" (14/07/2026 — ideia
 * adaptada do protótipo `atlas-mmgd-solar`): lista paginada dos municípios do
 * quadrante Vazio de Acesso, na ordenação de priorização padrão do backend
 * (RF-056: IVS decrescente — mais vulnerável primeiro). A posição exibida é a
 * posição real nessa priorização. Classificação e ordenação 100% do backend
 * (paginação server-side) — esta página só exibe.
 */

const POR_PAGINA = 50;

/** Siglas de UF para o filtro — lista estática de apresentação. */
const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

export function PaginaVaziosDeAcesso() {
  const [pagina, setPagina] = useState(1);
  const [uf, setUf] = useState('');
  const [classificacaoIvsh, setClassificacaoIvsh] = useState('');
  const [ivshLigado, setIvshLigado] = useState(false);
  const [resultado, setResultado] = useState<ListarVaziosDeAcessoResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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
          setErro(causa instanceof Error ? causa.message : 'Falha ao carregar o ranking.');
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

  const totalPaginas = resultado?.paginacao.totalPaginas ?? 1;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 font-sans">
      <div className="rounded border border-slate-200 bg-white p-6 shadow-2xs">
        <span className="mb-1 inline-flex items-center gap-1.5 rounded bg-violet-50 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-violet-700 uppercase">
          Potencial não aproveitado
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Ranking nacional de Vazios de Acesso
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Municípios com alta irradiação solar e baixa adoção de MMGD residencial, ordenados
          por {ivshLigado ? 'IVSH' : 'IVS'} decrescente — mais vulnerável primeiro. A
          classificação do quadrante (quem é Vazio de Acesso) não muda com o critério de
          priorização, só a ordem dentro dele.
        </p>
        {resultado && (
          <p className="mt-2 font-mono text-xs text-slate-400">
            {resultado.paginacao.totalResultados.toLocaleString('pt-BR')} municípios no quadrante
            {uf && ` (filtro: ${uf})`} ·{' '}
            {resultado.avisos.totalExcluidosSemDado.toLocaleString('pt-BR')} excluídos da
            classificação por falta de dado
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="filtro-uf-vazios" className="text-xs font-semibold text-slate-600">
            Filtrar por estado
          </label>
          <select
            id="filtro-uf-vazios"
            value={uf}
            onChange={(evento) => {
              setUf(evento.target.value);
              setPagina(1);
            }}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:bg-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
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
          <label htmlFor="filtro-classificacao-ivsh" className="text-xs font-semibold text-slate-600">
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
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:bg-white focus:ring-1 focus:ring-violet-500 focus:outline-none disabled:opacity-50"
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
      </div>

      {carregando && <p className="mt-6 text-sm text-slate-500">Carregando ranking…</p>}
      {erro && !carregando && <p className="mt-6 text-sm text-red-600">{erro}</p>}

      {resultado && !carregando && !erro && (
        <>
          <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left font-mono text-[10px] tracking-wider text-slate-500 uppercase">
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
                    className="border-b border-slate-100 last:border-0 hover:bg-violet-50/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">
                      {(resultado.paginacao.pagina - 1) * resultado.paginacao.porPagina + i + 1}º
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/mapa?municipio=${m.codigoIbge}`}
                        className="font-semibold text-slate-800 hover:text-violet-700 hover:underline"
                        title="Abrir no mapa"
                      >
                        {m.nome}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{m.uf}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-violet-700">
                      {m.ivs !== null ? formatarValor(m.ivs, 'numero') : '—'}
                    </td>
                    {ivshLigado && (
                      <td className="px-3 py-2 text-right font-mono font-semibold text-violet-700">
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
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {m.percentualPobrezaCadunico !== null
                        ? `${formatarValor(m.percentualPobrezaCadunico, 'numero')}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {m.mmgdResidencialPer1000Hab !== null
                        ? formatarValor(m.mmgdResidencialPer1000Hab, 'numero')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {m.irradiacaoMediaKwhM2Dia !== null
                        ? formatarValor(m.irradiacaoMediaKwhM2Dia, 'numero')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resultado.resultados.length === 0 && (
              <p className="p-4 text-sm text-slate-500">
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
              className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <span className="font-mono text-xs text-slate-500">
              Página {resultado.paginacao.pagina} de {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Próxima →
            </button>
          </div>

          {/* O backend EXIGE que a nota acompanhe qualquer exibição da classificação. */}
          <div className="mt-6 rounded border border-violet-100 bg-violet-50/50 p-4 text-xs leading-relaxed text-slate-600">
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
