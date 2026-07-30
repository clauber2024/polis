import { useId } from 'react';
import { formatarValor, type FormatoIndicador } from '../../utils/formatadores';

/**
 * "Maior é melhor" (ex.: MMGD per capita, renda), "menor é melhor" (ex.: IVS,
 * mortalidade infantil) ou "neutro" (ex.: irradiação — é um recurso natural,
 * não um resultado de política pública; comparar contra a média não carrega
 * juízo de valor). Controla a cor da barra/tag — nunca o tom do valor bruto.
 */
export type SemanticaIndicador = 'maiorMelhor' | 'menorMelhor' | 'neutro';

interface IndicadorComparativoProps {
  rotulo: string;
  valor: number;
  formato: FormatoIndicador;
  unidade?: string;
  /** Média nacional (GET /api/municipios/medias, sem filtro) — referência do traço vertical. */
  mediaNacional: number;
  semantica: SemanticaIndicador;
  /** Esclarecimento metodológico — escondido num tooltip por trás do ícone (i), fora do fluxo de leitura do KPI. */
  notaTecnica?: string;
  /** Cartão de 2 colunas (indicador-âncora da seção) em vez de célula única do grid. */
  destaque?: boolean;
}

/**
 * Ícone (i) circular inline, sem dependência de lucide-react (mesmo critério
 * já registrado em CartaoVazioDeAcesso.tsx — ainda não usada no projeto).
 */
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
      <line x1="12" y1="16" x2="12" y2="11" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/**
 * KPI contextualizado contra a média nacional (auditoria de UX/UI,
 * 30/07/2026): substitui o número solto por um "termômetro" (bullet chart em
 * CSS puro) — barra do município + traço da média nacional — e uma tag de
 * status curta ("X% abaixo da média"). A cor semântica vive SEMPRE na
 * barra/tag, nunca no valor bruto (que fica em tom neutro escuro) — texto
 * colorido sem referência visual ao lado lê como erro de sistema, não como
 * diagnóstico territorial.
 *
 * Escala do termômetro é dinâmica (maior entre o valor do município e a
 * média nacional, com folga de 30%) — não fixa por indicador, para não exigir
 * um "máximo nacional" que a API não expõe hoje (só a Ficha do Município tem
 * esse contexto; o Ranking já resolve isso com o maior valor da própria
 * lista, ver RankingItem.tsx).
 */
export function IndicadorComparativo({
  rotulo,
  valor,
  formato,
  unidade,
  mediaNacional,
  semantica,
  notaTecnica,
  destaque = false,
}: IndicadorComparativoProps) {
  const idTooltip = useId();
  const escalaMaxima = Math.max(valor, mediaNacional, 0.0001) * 1.3;
  const percentualValor = Math.min(100, (valor / escalaMaxima) * 100);
  const percentualMedia = Math.min(100, (mediaNacional / escalaMaxima) * 100);

  // mediaNacional === 0 é um caso de borda real (nenhum indicador atual da
  // Ficha do Município deveria chegar a isso, mas uma média de 0 tornaria a
  // variação percentual indefinida/infinita) — degrada para "sem tag de
  // status", mantém só o termômetro.
  const variacaoPercentual = mediaNacional !== 0 ? ((valor - mediaNacional) / mediaNacional) * 100 : null;

  const favoravel =
    semantica === 'maiorMelhor'
      ? valor >= mediaNacional
      : semantica === 'menorMelhor'
        ? valor <= mediaNacional
        : null;

  const barraCor =
    semantica === 'neutro' ? 'bg-stone-500' : favoravel ? 'bg-emerald-500' : 'bg-red-600';

  const textoStatus =
    variacaoPercentual === null
      ? null
      : semantica === 'neutro'
        ? `${variacaoPercentual >= 0 ? 'Acima' : 'Abaixo'} da média nacional (${Math.abs(variacaoPercentual).toFixed(0)}%)`
        : favoravel
          ? `Melhor que a média (${Math.abs(variacaoPercentual).toFixed(0)}%)`
          : `Pior que a média — alerta (${Math.abs(variacaoPercentual).toFixed(0)}%)`;

  const tagCor =
    semantica === 'neutro'
      ? 'text-stone-500'
      : favoravel
        ? 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200'
        : 'text-red-700 bg-red-50 ring-1 ring-red-200';

  return (
    <div
      className={
        destaque
          ? 'col-span-2 rounded-xl border border-stone-200/60 bg-white/70 p-4 shadow-sm backdrop-blur-md'
          : 'flex flex-col rounded-lg border border-stone-200/50 bg-white/50 p-2.5 backdrop-blur-sm'
      }
    >
      <div className="mb-1 flex items-start justify-between gap-1">
        <span
          className={`font-bold tracking-widest text-stone-500 uppercase ${destaque ? 'text-[10px]' : 'text-[9px]'}`}
        >
          {rotulo}
        </span>
        {notaTecnica && (
          <div className="group relative shrink-0 cursor-help">
            <IconeInfo className="h-3.5 w-3.5 text-stone-400 transition-colors hover:text-stone-600" />
            <div
              role="tooltip"
              id={idTooltip}
              className="pointer-events-none absolute right-0 bottom-full z-20 mb-2 hidden w-56 rounded-lg bg-stone-900 p-2.5 text-[10px] leading-relaxed font-medium text-white shadow-xl group-hover:block"
            >
              {notaTecnica}
              <div className="absolute top-full right-1.5 -mt-1 border-4 border-transparent border-t-stone-900" />
            </div>
          </div>
        )}
      </div>

      <div className={`flex items-baseline gap-1.5 ${destaque ? 'mb-2' : 'mb-1.5'}`}>
        <span className={`font-black text-stone-900 ${destaque ? 'text-3xl' : 'text-lg'}`}>
          {formatarValor(valor, formato)}
        </span>
        {unidade && (
          <span className={`font-semibold text-stone-500 ${destaque ? 'text-xs' : 'text-[10px]'}`}>
            {unidade}
          </span>
        )}
      </div>

      {/* Termômetro: barra do município + traço vertical da média nacional. */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-stone-200/70">
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-700 ${barraCor}`}
          style={{ width: `${percentualValor}%` }}
        />
        <div
          className="absolute top-0 z-10 h-full w-0.5 bg-stone-900 shadow-[0_0_2px_rgba(255,255,255,0.9)]"
          style={{ left: `${percentualMedia}%` }}
          title={`Média nacional: ${formatarValor(mediaNacional, formato)}${unidade ? ` ${unidade}` : ''}`}
        />
      </div>

      {textoStatus && (
        <span
          className={`mt-1.5 inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase ${tagCor}`}
        >
          {textoStatus}
        </span>
      )}
    </div>
  );
}
