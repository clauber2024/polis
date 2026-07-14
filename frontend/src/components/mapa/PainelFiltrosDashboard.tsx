import { useState } from 'react';
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
 * mesma limitação já documentada para RF-034/ranking por variação). Exibido
 * aqui como controle desabilitado com o motivo, em vez de simular um filtro
 * que não filtra nada de verdade.
 */

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
  aoFechar: () => void;
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
  aoFechar,
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
    <aside className="flex h-full w-80 flex-col border-r border-slate-200 bg-white shadow-xs">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-slate-50 p-3">
        <div>
          <span className="block font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Refinar Cobertura
          </span>
          <h2 className="text-sm font-semibold text-slate-900">Filtros (Dashboard Público)</h2>
          <p className="font-mono text-xs text-slate-500">
            {totalVisiveis.toLocaleString('pt-BR')} de {totalMunicipios.toLocaleString('pt-BR')}{' '}
            municípios
          </p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar filtros"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <label htmlFor="filtro-uf" className="mb-1 block text-xs font-semibold text-slate-600">
          Estado
        </label>
        <select
          id="filtro-uf"
          value={uf}
          onChange={(evento) => aoMudarUf(evento.target.value)}
          className="mb-3 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:bg-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
        >
          <option value="">Todos os estados</option>
          {ufs.map(([sigla, nomeEstado]) => (
            <option key={sigla} value={sigla}>
              {nomeEstado} ({sigla})
            </option>
          ))}
        </select>

        <label htmlFor="filtro-regiao" className="mb-1 block text-xs font-semibold text-slate-600">
          Região
        </label>
        <select
          id="filtro-regiao"
          value={regiao}
          onChange={(evento) => aoMudarRegiao(evento.target.value)}
          className="mb-3 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:bg-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
        >
          <option value="">Todas as regiões</option>
          {regioes.map((nomeRegiao) => (
            <option key={nomeRegiao} value={nomeRegiao}>
              {nomeRegiao}
            </option>
          ))}
        </select>

        <p className="mb-1 block text-xs font-semibold text-slate-600">
          Faixa de potência instalada (kW)
        </p>
        <div className="mb-3 flex items-center gap-2">
          <input
            type="number"
            min={0}
            inputMode="decimal"
            aria-label="Potência mínima instalada, em quilowatts"
            placeholder="Mín."
            value={potenciaMin}
            onChange={(evento) => aoMudarPotenciaMin(evento.target.value)}
            className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:bg-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
          />
          <span className="text-slate-400">–</span>
          <input
            type="number"
            min={0}
            inputMode="decimal"
            aria-label="Potência máxima instalada, em quilowatts"
            placeholder="Máx."
            value={potenciaMax}
            onChange={(evento) => aoMudarPotenciaMax(evento.target.value)}
            className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:bg-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
          />
        </div>

        <label
          htmlFor="filtro-periodo"
          className="mb-1 block text-xs font-semibold text-slate-400"
          title="O Atlas guarda só o snapshot mais recente de cada indicador — sem série temporal, não há período para filtrar (mesma limitação do ranking por variação, RF-034). Ver CLAUDE.md."
        >
          Período (indisponível)
        </label>
        <select
          id="filtro-periodo"
          disabled
          className="mb-1 w-full cursor-not-allowed rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-400"
        >
          <option>Snapshot mais recente (único disponível)</option>
        </select>
        <p className="mb-3 text-xs text-slate-400">
          Sem série temporal no banco ainda — filtro por período fica para quando houver histórico.
        </p>

        {filtrosAtivos && (
          <button
            type="button"
            onClick={aoLimparFiltros}
            className="mb-4 w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Limpar filtros
          </button>
        )}

        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Baixar dados públicos (RF-047)
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => aoExportar('csv')}
              disabled={exportando !== null}
              className="flex-1 rounded border border-slate-200 px-2.5 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exportando === 'csv' ? 'Exportando…' : 'CSV'}
            </button>
            <button
              type="button"
              onClick={() => aoExportar('geojson')}
              disabled={exportando !== null}
              className="flex-1 rounded border border-slate-200 px-2.5 py-2 text-[10px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              {exportando === 'geojson' ? 'Exportando…' : 'GeoJSON'}
            </button>
          </div>
          {erroExportacao && <p className="mt-1 text-xs text-red-600">{erroExportacao}</p>}
          <p className="mt-2 text-xs text-slate-400">
            O download respeita os filtros de estado/região/potência acima.
          </p>
        </div>
      </div>
    </aside>
  );
}
