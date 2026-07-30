import { formatarValor, type FormatoIndicador } from '../../utils/formatadores';
import { IconeInfoTooltip } from './IconeInfoTooltip';
import { TermometroComparativo, type SemanticaIndicador } from './TermometroComparativo';

export type { SemanticaIndicador };

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
 * KPI contextualizado contra a média nacional (auditoria de UX/UI,
 * 30/07/2026): substitui o número solto por um "termômetro" (bullet chart em
 * CSS puro, ver TermometroComparativo.tsx) — barra do município + traço da
 * média nacional — e uma tag de status curta. A cor semântica vive SEMPRE na
 * barra/tag, nunca no valor bruto (que fica em tom neutro escuro) — texto
 * colorido sem referência visual ao lado lê como erro de sistema, não como
 * diagnóstico territorial.
 *
 * Card completo (label + valor + termômetro) usado na Ficha do Município —
 * o mesmo termômetro, sem o chrome de card, é reaproveitado pelo tooltip de
 * hover do mapa (MapaMunicipios.tsx), para as duas telas não divergirem.
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
        {notaTecnica && <IconeInfoTooltip texto={notaTecnica} />}
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

      <TermometroComparativo
        valor={valor}
        formato={formato}
        unidade={unidade}
        mediaNacional={mediaNacional}
        semantica={semantica}
      />
    </div>
  );
}
