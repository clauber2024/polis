import type { DiagnosticoComparacao as DiagnosticoComparacaoType } from '../../utils/diagnosticosComparacao';

interface DiagnosticoComparacaoProps {
  diagnostico: DiagnosticoComparacaoType;
}

/**
 * RF-051 — leitura analítica automática. Só apresentação: a lógica das
 * regras vive em utils/diagnosticosComparacao.ts (puro, testável, sem
 * dependência de React) — este componente só decide como mostrar o
 * resultado.
 */
export function DiagnosticoComparacao({ diagnostico }: DiagnosticoComparacaoProps) {
  const { alertas, interpretacoes } = diagnostico;

  return (
    <section className="mt-6 rounded border border-slate-200 bg-white p-6 shadow-2xs">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Diagnóstico e alertas de comparabilidade
        </h2>
        <span className="w-fit rounded bg-slate-900 px-2.5 py-1 font-mono text-[9px] font-bold text-white">
          Regras determinísticas — sem IA
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2.5">
          <span className="block font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Alertas técnicos de consistência
          </span>
          {alertas.length > 0 ? (
            alertas.map((alerta, i) => (
              <div
                key={i}
                className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
              >
                {alerta}
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
              Nenhuma inconsistência de escala ou dado ausente identificada entre os municípios
              comparados.
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          <span className="block font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Leitura do grupo comparado
          </span>
          {interpretacoes.length > 0 ? (
            interpretacoes.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 text-xs leading-relaxed text-slate-800"
              >
                {item}
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500 italic">
              Nenhum município comparado está classificado como Vazio de Acesso, e nenhum se
              destaca simultaneamente em MMGD per capita e IVS.
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 rounded border border-slate-100 bg-slate-50 p-3 font-mono text-[10px] leading-relaxed text-slate-400">
        * Regras paramétricas em TypeScript (diferença de escala &gt;10×, amplitude de irradiação
        &gt;1,8 kWh/m²·dia, classificação de Vazio de Acesso vinda do backend). Nenhum limiar aqui
        foi calibrado estatisticamente — são heurísticas de leitura rápida, não um modelo validado.
        Ver utils/diagnosticosComparacao.ts.
      </p>
    </section>
  );
}
