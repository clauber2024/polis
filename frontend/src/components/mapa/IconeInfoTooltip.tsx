import { useId } from 'react';

/**
 * Ícone (i) com tooltip hover — extraído de IndicadorComparativo.tsx
 * (auditoria de UX/UI, 30/07/2026) para ser reaproveitado também por
 * CardDadoNeutro.tsx, em vez de duplicar a mesma marcação/lógica nos dois.
 * Esconde a nota metodológica do KPI atrás do ícone — ela não compete mais
 * por espaço com o valor bruto na tela principal.
 */
export function IconeInfoTooltip({ texto }: { texto: string }) {
  const idTooltip = useId();
  return (
    <div className="group relative shrink-0 cursor-help">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 text-stone-400 transition-colors hover:text-stone-600"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="11" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <div
        role="tooltip"
        id={idTooltip}
        className="pointer-events-none absolute right-0 bottom-full z-20 mb-2 hidden w-56 rounded-lg bg-stone-900 p-2.5 text-[10px] leading-relaxed font-medium text-white shadow-xl group-hover:block"
      >
        {texto}
        <div className="absolute top-full right-1.5 -mt-1 border-4 border-transparent border-t-stone-900" />
      </div>
    </div>
  );
}
