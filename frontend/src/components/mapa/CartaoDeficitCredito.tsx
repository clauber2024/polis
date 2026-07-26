import { formatarMesAno } from '../../utils/formatadores';

interface CartaoDeficitCreditoProps {
  /**
   * `alertaDeficitCredito` já vem calculado do backend (vazio de acesso E
   * zero contratos CONFIRMADOS do Reforma Casa Brasil Solar — ver
   * vaziosDeAcesso.service.ts). Diferente do CartaoDescompassoMorfologico
   * (que recalcula a condição aqui a partir dos indicadores brutos), este
   * cartão só RENDERIZA o resultado já classificado — evita duplicar a
   * mesma regra de negócio em dois lugares (o próprio histórico deste
   * projeto já teve um corte fixo indo pro ar errado por causa disso, ver
   * docstring de CartaoDescompassoMorfologico).
   */
  alertaDeficitCredito: boolean;
  /** Datas-base das duas fontes — mesma transparência metodológica do toggle do mapa (decisão executiva do usuário, 26/07/2026). */
  periodoReferenciaLenteDeficitCredito: {
    mmgdMaisRecente: string | null;
    casaBrasilSolar: string | null;
  } | null;
}

function IconeMoeda({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10" />
      <path d="M14.5 9.5c0-1-1-1.5-2.5-1.5s-2.5.7-2.5 1.7c0 2.5 5 1.1 5 3.6 0 1-1 1.7-2.5 1.7s-2.5-.5-2.5-1.5" />
    </svg>
  );
}

/**
 * Alerta "Déficit de Crédito Crítico" (26/07/2026, decisão executiva do
 * usuário sobre a arquitetura híbrida Indicador + Lente do Reforma Casa
 * Brasil Solar): município é Vazio de Acesso E não recebeu nenhum contrato
 * confirmado do programa no período coberto — o argumento direto para
 * "é aqui que o próximo edital precisa chegar".
 */
export function CartaoDeficitCredito({
  alertaDeficitCredito,
  periodoReferenciaLenteDeficitCredito,
}: CartaoDeficitCreditoProps) {
  if (!alertaDeficitCredito) return null;

  return (
    <div className="mx-4 mt-3 rounded-xl border border-yellow-200/80 bg-yellow-50/50 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 border-b border-yellow-200/60 pb-3">
        <IconeMoeda className="h-4 w-4 text-yellow-700" />
        <h4 className="text-xs font-black tracking-widest text-yellow-800 uppercase">
          Alerta: déficit de crédito crítico
        </h4>
      </div>

      <p className="text-[11px] leading-relaxed font-medium text-stone-700">
        Este município é um <strong className="font-bold text-stone-900">Vazio de Acesso</strong>{' '}
        (alto potencial solar, baixa adoção de MMGD residencial) e{' '}
        <strong className="font-bold text-stone-900">
          não recebeu nenhum contrato confirmado
        </strong>{' '}
        do programa Reforma Casa Brasil Solar no período coberto. É um candidato direto para
        priorização no próximo edital do programa.
      </p>

      {periodoReferenciaLenteDeficitCredito && (
        <p className="mt-3 border-t border-yellow-200/60 pt-2 text-[10px] font-medium text-stone-500">
          Datas-base: MMGD {formatarMesAno(periodoReferenciaLenteDeficitCredito.mmgdMaisRecente)} | Casa
          Brasil Solar {formatarMesAno(periodoReferenciaLenteDeficitCredito.casaBrasilSolar)}
        </p>
      )}
    </div>
  );
}
