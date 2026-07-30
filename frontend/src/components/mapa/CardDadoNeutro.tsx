import type { ComponentType } from 'react';
import { formatarValor, type FormatoIndicador } from '../../utils/formatadores';
import { IconeInfoTooltip } from './IconeInfoTooltip';

/** Ícones inline (sem dependência de lucide-react — critério já registrado em CartaoVazioDeAcesso.tsx). */
export function IconeMapa({ className }: { className?: string }) {
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
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

export function IconeMoeda({ className }: { className?: string }) {
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
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  );
}

export function IconeUsuarios({ className }: { className?: string }) {
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
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export type IconeCard = ComponentType<{ className?: string }>;

interface CardDadoNeutroProps {
  titulo: string;
  valor: number | null;
  formato: FormatoIndicador;
  unidade?: string;
  /** Esclarecimento metodológico — escondido no tooltip (i), mesma regra de IndicadorComparativo. */
  notaTecnica?: string;
  icone?: IconeCard;
  /** Cartão de 2 colunas (indicador-âncora da seção) em vez de célula única do grid. */
  destaque?: boolean;
}

/**
 * KPI absoluto (sem comparação nacional) — Território, Financiamento,
 * Potência, UCs etc. Substitui o número solto/opaco da versão antiga da
 * Ficha do Município (auditoria de UX/UI, 30/07/2026): mesmo envelope de
 * card (glassmorphism) do IndicadorComparativo, mas sem termômetro — aqui
 * comparar contra a média nacional sem normalização per capita seria
 * enganoso (mesmo raciocínio de `contratosReformaCasaBrasilSolarPer10000Hab`,
 * municipios.service.ts backend) ou a API simplesmente não expõe uma média
 * (`percentualCadunico`, `numeroUcsComMmgd`).
 */
export function CardDadoNeutro({
  titulo,
  valor,
  formato,
  unidade,
  notaTecnica,
  icone: Icone,
  destaque = false,
}: CardDadoNeutroProps) {
  const semDado = valor === null;

  return (
    <div
      className={
        destaque
          ? 'col-span-2 flex flex-col rounded-xl border border-stone-200/60 bg-white/70 p-4 shadow-sm backdrop-blur-md transition-all hover:shadow-md'
          : 'flex flex-col rounded-lg border border-stone-200/50 bg-white/50 p-2.5 backdrop-blur-sm transition-all hover:shadow-md'
      }
    >
      <div className={`flex items-start justify-between gap-1 ${destaque ? 'mb-2' : 'mb-1'}`}>
        <div className="flex items-center gap-1.5">
          {Icone && <Icone className="h-3.5 w-3.5 shrink-0 text-stone-400" />}
          <h3
            className={`font-bold tracking-widest text-stone-500 uppercase ${destaque ? 'text-[10px]' : 'text-[9px]'}`}
          >
            {titulo}
          </h3>
        </div>
        {notaTecnica && <IconeInfoTooltip texto={notaTecnica} />}
      </div>

      {semDado ? (
        <span className="text-sm font-bold text-stone-400 italic">Não disponível</span>
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className={`font-black text-stone-900 ${destaque ? 'text-3xl' : 'text-lg'}`}>
            {formatarValor(valor, formato)}
          </span>
          {unidade && (
            <span
              className={`font-semibold text-stone-500 ${destaque ? 'text-xs' : 'text-[10px]'}`}
            >
              {unidade}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
