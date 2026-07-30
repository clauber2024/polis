import type { DiagnosticoComparacao as DiagnosticoComparacaoType } from '../../utils/diagnosticosComparacao';

interface DiagnosticoComparacaoProps {
  diagnostico: DiagnosticoComparacaoType;
}

function IconeEscudo({ className }: { className?: string }) {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconeInfo({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/**
 * RF-051 — leitura analítica automática. Só apresentação: a lógica das
 * regras vive em utils/diagnosticosComparacao.ts (puro, testável, sem
 * dependência de React) — este componente só decide como mostrar o
 * resultado.
 *
 * Linguagem institucional (30/07/2026, feedback do usuário — "vazamento de
 * jargão de código"): removidos o selo "Regras determinísticas — sem IA", os
 * rótulos mono/uppercase estilo terminal e a menção a "TypeScript"/caminho de
 * arquivo no rodapé — um gestor público lendo isso não deveria sentir que
 * está lendo um manual de TI. O conteúdo por trás não mudou (continuam sendo
 * heurísticas determinísticas, não um modelo estatístico validado, ver
 * diagnosticosComparacao.ts) — só a forma como isso é comunicado na tela.
 * Glassmorphism (mesma família de estilo do resto da Visão Executiva) em vez
 * de caixas brancas opacas com borda cinza dura.
 */
export function DiagnosticoComparacao({ diagnostico }: DiagnosticoComparacaoProps) {
  const { alertas, interpretacoes } = diagnostico;

  return (
    <section className="mt-6 rounded-2xl bg-white/70 p-8 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
      <header className="border-b border-stone-100 pb-5">
        <h2 className="text-lg font-black tracking-tight text-stone-900">
          Síntese de comparabilidade
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Leitura automática dos desvios entre os territórios selecionados, a partir dos critérios
          do Atlas.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <h3 className="mb-3 text-[10px] font-black tracking-widest text-stone-400 uppercase">
            Integridade dos dados
          </h3>
          {alertas.length > 0 ? (
            <div className="space-y-2.5">
              {alertas.map((alerta, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-amber-200/60 bg-amber-50/70 p-3.5 text-xs leading-relaxed font-medium text-amber-900 backdrop-blur-sm"
                >
                  {alerta}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/60 bg-emerald-50/70 p-3.5 backdrop-blur-sm">
              <IconeEscudo className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-xs leading-relaxed font-medium text-emerald-800">
                Nenhuma inconsistência de escala ou dado ausente identificada entre os municípios
                comparados — a comparação é confiável nos termos abaixo.
              </p>
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          <h3 className="mb-3 text-[10px] font-black tracking-widest text-stone-400 uppercase">
            Destaques territoriais
          </h3>
          {interpretacoes.length > 0 ? (
            <div className="space-y-2.5">
              {interpretacoes.map((item, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-stone-200/60 bg-white/60 p-3.5 text-sm leading-relaxed font-medium text-stone-700 shadow-sm backdrop-blur-md"
                >
                  {item}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-stone-200/60 bg-white/60 p-3.5 text-xs leading-relaxed text-stone-500 italic backdrop-blur-md">
              Nenhum município comparado está classificado como Vazio de Acesso, e nenhum se
              destaca simultaneamente em MMGD per capita e IVS.
            </p>
          )}
        </div>
      </div>

      <footer className="mt-6 flex gap-2 border-t border-stone-100 pt-4">
        <IconeInfo className="h-4 w-4 shrink-0 text-stone-400" />
        <p className="text-[11px] leading-relaxed text-stone-400">
          <strong className="font-bold text-stone-500">Nota metodológica:</strong> as leituras
          acima usam critérios paramétricos de referência rápida (diferença de escala populacional
          acima de 10×, amplitude de irradiação solar acima de 1,8 kWh/m²·dia, classificação de
          Vazio de Acesso vinda da metodologia oficial do Atlas) — não são um modelo estatístico
          preditivo nem substituem a análise técnica completa.
        </p>
      </footer>
    </section>
  );
}
