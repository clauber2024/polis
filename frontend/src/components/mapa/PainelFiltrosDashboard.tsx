import { useState } from 'react';
import type { SVGProps } from 'react';
import { exportarMunicipios } from '../../services/municipios.service';
import { ErroDeApi } from '../../services/http';

/**
 * Painel de filtros do Dashboard Público (RF-046) + download (RF-047).
 * Componente CONTROLADO: quem decide os valores de uf/regiao/potência e
 * calcula quais municípios ficam visíveis no mapa é a PaginaMapa (mesmo
 * princípio de "componentes de mapa isolados de lógica de negócio",
 * CLAUDE.md Seção 4) — aqui só os botões de download têm lógica própria
 * (chamada ao service de exportação), pelo mesmo padrão já usado em
 * PainelAnalitico.tsx (RF-052).
 *
 * RF-046 também pede filtro por "período", mas o backend não tem série
 * temporal para filtrar (só o snapshot mais recente de cada indicador —
 * mesma limitação já documentada para RF-034/ranking por variação). Removido
 * da tela (25/07/2026, auditoria de UX/UI: "filtro fantasma" — um controle
 * desabilitado com nota explicando por que não funciona lia como formulário
 * inacabado). O motivo continua documentado aqui no código, só não é mais
 * exibido — quando a série temporal existir de verdade, o filtro reaparece.
 */

function IconeChevron(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconeDownload(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconeMarcador(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/** Classes utilitárias compartilhadas pelos dois `<select>` (estado/região) e
 * pelos dois `<input type="number">` (faixa de potência) — mesmo visual de
 * vidro, mesmo focus carmim, sem depender do estilo nativo do navegador. */
const CLASSE_CAMPO =
  'w-full rounded-lg border border-stone-200/80 bg-white/70 px-3 py-2 text-sm font-medium text-stone-800 shadow-sm backdrop-blur-sm outline-none transition-all placeholder:text-stone-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20';

interface PainelFiltrosDashboardProps {
  ufs: [sigla: string, nomeEstado: string][];
  regioes: string[];
  uf: string;
  regiao: string;
  potenciaMin: string;
  potenciaMax: string;
  totalVisiveis: number;
  totalMunicipios: number;
  aoMudarUf: (uf: string) => void;
  aoMudarRegiao: (regiao: string) => void;
  aoMudarPotenciaMin: (valor: string) => void;
  aoMudarPotenciaMax: (valor: string) => void;
  aoLimparFiltros: () => void;
}

export function PainelFiltrosDashboard({
  ufs,
  regioes,
  uf,
  regiao,
  potenciaMin,
  potenciaMax,
  totalVisiveis,
  totalMunicipios,
  aoMudarUf,
  aoMudarRegiao,
  aoMudarPotenciaMin,
  aoMudarPotenciaMax,
  aoLimparFiltros,
}: PainelFiltrosDashboardProps) {
  const [exportando, setExportando] = useState<'csv' | 'geojson' | null>(null);
  const [erroExportacao, setErroExportacao] = useState<string | null>(null);

  const filtrosAtivos = !!(uf || regiao || potenciaMin || potenciaMax);

  async function aoExportar(formato: 'csv' | 'geojson') {
    setExportando(formato);
    setErroExportacao(null);
    try {
      await exportarMunicipios(formato, {
        uf: uf || undefined,
        regiao: regiao || undefined,
        potenciaMin: potenciaMin ? Number(potenciaMin) : undefined,
        potenciaMax: potenciaMax ? Number(potenciaMax) : undefined,
      });
    } catch (causa) {
      setErroExportacao(causa instanceof ErroDeApi ? causa.message : 'Falha ao exportar.');
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-stone-200/70 p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-bold tracking-wider text-stone-500 uppercase">
            Refinar cobertura
          </span>
          {/* KPI dinâmico (25/07/2026, auditoria de UX/UI) — prova de que o
              motor de dados está filtrando em tempo real; antes era um
              texto secundário cinza, quase invisível. */}
          <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-stone-200 bg-stone-100/80 px-2 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="font-mono text-[10px] font-bold text-stone-700">
              {totalVisiveis.toLocaleString('pt-BR')}
              {totalVisiveis !== totalMunicipios && ` / ${totalMunicipios.toLocaleString('pt-BR')}`}{' '}
              municípios
            </span>
          </span>
        </div>
        <h2 className="text-sm font-bold text-stone-900">Filtros (Dashboard Público)</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <label htmlFor="filtro-uf" className="mb-1.5 block text-[10px] font-bold tracking-widest text-stone-500 uppercase">
          Estado
        </label>
        <div className="relative mb-3">
          <select
            id="filtro-uf"
            value={uf}
            onChange={(evento) => aoMudarUf(evento.target.value)}
            className={`${CLASSE_CAMPO} appearance-none pr-8`}
          >
            <option value="">Todos os estados</option>
            {ufs.map(([sigla, nomeEstado]) => (
              <option key={sigla} value={sigla}>
                {nomeEstado} ({sigla})
              </option>
            ))}
          </select>
          <IconeChevron className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
        </div>

        <label htmlFor="filtro-regiao" className="mb-1.5 block text-[10px] font-bold tracking-widest text-stone-500 uppercase">
          Região
        </label>
        <div className="relative mb-3">
          <select
            id="filtro-regiao"
            value={regiao}
            onChange={(evento) => aoMudarRegiao(evento.target.value)}
            className={`${CLASSE_CAMPO} appearance-none pr-8`}
          >
            <option value="">Todas as regiões</option>
            {regioes.map((nomeRegiao) => (
              <option key={nomeRegiao} value={nomeRegiao}>
                {nomeRegiao}
              </option>
            ))}
          </select>
          <IconeChevron className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
        </div>

        <p className="mb-1.5 text-[10px] font-bold tracking-widest text-stone-500 uppercase">
          Faixa de potência instalada (kW)
        </p>
        <div className="mb-4 flex items-center gap-2">
          <input
            type="number"
            min={0}
            inputMode="decimal"
            aria-label="Potência mínima instalada, em quilowatts"
            placeholder="Mín."
            value={potenciaMin}
            onChange={(evento) => aoMudarPotenciaMin(evento.target.value)}
            className={`${CLASSE_CAMPO} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
          />
          <span className="text-stone-400">–</span>
          <input
            type="number"
            min={0}
            inputMode="decimal"
            aria-label="Potência máxima instalada, em quilowatts"
            placeholder="Máx."
            value={potenciaMax}
            onChange={(evento) => aoMudarPotenciaMax(evento.target.value)}
            className={`${CLASSE_CAMPO} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
          />
        </div>

        {filtrosAtivos && (
          <button
            type="button"
            onClick={aoLimparFiltros}
            className="mb-4 w-full rounded-lg border border-stone-200/80 bg-white/50 px-2 py-1.5 text-sm font-semibold text-stone-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white/80"
          >
            Limpar filtros
          </button>
        )}

        <div className="border-t border-stone-200/70 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-stone-500 uppercase">
            Exportar dados filtrados
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => aoExportar('csv')}
              disabled={exportando !== null}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white/70 py-2 text-xs font-bold text-stone-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white active:scale-95 disabled:opacity-50"
            >
              <IconeDownload className="h-3.5 w-3.5 text-stone-400" />
              {exportando === 'csv' ? 'Exportando…' : 'CSV'}
            </button>
            <button
              type="button"
              onClick={() => aoExportar('geojson')}
              disabled={exportando !== null}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white/70 py-2 text-xs font-bold text-stone-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white active:scale-95 disabled:opacity-50"
            >
              <IconeMarcador className="h-3.5 w-3.5 text-stone-400" />
              {exportando === 'geojson' ? 'Exportando…' : 'GeoJSON'}
            </button>
          </div>
          {erroExportacao && <p className="mt-1.5 text-xs text-red-600">{erroExportacao}</p>}
          <p className="mt-2 text-xs text-stone-400">
            O download respeita os filtros de estado/região/potência acima.
          </p>
        </div>
      </div>
    </div>
  );
}
