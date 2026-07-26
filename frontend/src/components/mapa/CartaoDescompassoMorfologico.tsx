import type { MunicipioComIndicadores } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';

interface CartaoDescompassoMorfologicoProps {
  municipio: MunicipioComIndicadores;
  /** Mediana nacional de irradiação (GET /api/vazios-de-acesso) — mesmo critério "alta irradiação" já usado na classificação oficial de Vazios de Acesso (RF-056), reaproveitado aqui em vez de um valor fixo inventado. */
  medianaIrradiacao: number | null;
  /** Percentil 90 nacional de indice_precariedade_moradia (GET /api/vazios-de-acesso, mesmo lazy load acima) — ver docstring abaixo sobre por que isso substituiu um corte fixo de 0,5. */
  limiarPrecariedadeHabitacionalAlta: number | null;
}

/** Ícones inline (sem dependência de lucide-react, ainda não usada no projeto). */
function IconeAlerta({ className }: { className?: string }) {
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
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconeCasa({ className }: { className?: string }) {
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
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

function IconeLampada({ className }: { className?: string }) {
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
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.6.6 1.13 1.28 1.41 2.5" />
    </svg>
  );
}

/**
 * Alerta de "descompasso morfológico": alta irradiação solar desperdiçada
 * porque a tipologia construtiva do município barra a instalação
 * individual no telhado (paredes/cortiços inadequados ou prédios sem
 * telhado próprio) — 18/07/2026, pedido do usuário.
 *
 * Limiares documentados (nenhum é fabricado sem critério):
 * - "alta irradiação" = >= mediana NACIONAL real (vinda do backend, mesmo
 *   critério do quadrante Vazio de Acesso), não um valor fixo tipo "GHI >
 *   5.0" — isso já foi tentado e descartado no protótipo do AI Studio (ver
 *   CLAUDE.md, "adaptação de layout do protótipo", 14/07/2026).
 * - "alta precariedade habitacional" = indice_precariedade_moradia > percentil
 *   90 NACIONAL real (calculado no backend, `vaziosDeAcesso.service.ts`).
 *   CORRIGIDO em 20/07/2026: a versão original usava um corte fixo de 0,5
 *   assumindo que o índice (média de 3 sub-índices normalizados min-max
 *   independentemente, migration 0014) se distribuía perto de [0,1] — na
 *   prática o composto nacional nunca passa de ~0,36 (máximo observado,
 *   Fernando de Noronha) e a mediana é ~0,0066, então 0,5 nunca disparava
 *   para NENHUM dos ~5.570 municípios. Confirmado por auditoria manual antes
 *   da correção (ver docs/DECISOES.md).
 * - "alta verticalização" = percentual_apartamento > 50% — maioria dos
 *   domicílios do município são apartamentos (sem telhado individual),
 *   leitura direta do percentual, não um corte estatístico validado. Municípios
 *   assim (ex: Balneário Camboriú, Santos) tendem a ter irradiação abaixo da
 *   mediana nacional (litoral Sul/Sudeste) — combinado com "alta irradiação",
 *   este ramo é estruturalmente raro por geografia, não por erro de corte.
 *
 * Ausência de qualquer um dos 3 indicadores (município sem dado) nunca vira
 * alerta — só dispara com os 3 valores presentes e a condição confirmada.
 */
export function CartaoDescompassoMorfologico({
  municipio,
  medianaIrradiacao,
  limiarPrecariedadeHabitacionalAlta,
}: CartaoDescompassoMorfologicoProps) {
  const { irradiacaoMediaKwhM2Dia, indicePrecariedadeMoradia, percentualApartamento } = municipio;

  if (
    irradiacaoMediaKwhM2Dia === null ||
    medianaIrradiacao === null ||
    (indicePrecariedadeMoradia === null && percentualApartamento === null)
  ) {
    return null;
  }

  const irradiacaoAlta = irradiacaoMediaKwhM2Dia >= medianaIrradiacao;
  const precariedadeAlta =
    indicePrecariedadeMoradia !== null &&
    limiarPrecariedadeHabitacionalAlta !== null &&
    indicePrecariedadeMoradia > limiarPrecariedadeHabitacionalAlta;
  const verticalizacaoAlta = percentualApartamento !== null && percentualApartamento > 50;

  if (!irradiacaoAlta || (!precariedadeAlta && !verticalizacaoAlta)) {
    return null;
  }

  // Diagnóstico em tom de política pública, não de acusação ("desperdício"):
  // apresenta o fato técnico (a estrutura não comporta o painel) e já entrega
  // a diretriz — não um relatório do cálculo pro gestor decifrar.
  const descricaoBarreira =
    precariedadeAlta && verticalizacaoAlta
      ? `vulnerabilidade habitacional crítica (índice ${formatarValor(indicePrecariedadeMoradia, 'numero')}, entre as 10% piores do país) e alta verticalização (${formatarValor(percentualApartamento, 'percentual')} dos domicílios em apartamentos, sem telhado individual)`
      : precariedadeAlta
        ? `vulnerabilidade habitacional crítica (índice ${formatarValor(indicePrecariedadeMoradia, 'numero')}, entre as 10% piores do país)`
        : `alta verticalização habitacional (${formatarValor(percentualApartamento, 'percentual')} dos domicílios em apartamentos, sem telhado individual)`;

  const mecanismoBarreira =
    precariedadeAlta && verticalizacaoAlta
      ? 'A precariedade das moradias e a predominância de apartamentos sem telhado próprio inviabilizam'
      : precariedadeAlta
        ? 'A precariedade das moradias (estruturas e telhados inadequados) inviabiliza'
        : 'A predominância de apartamentos sem telhado individual inviabiliza';

  return (
    <div className="mx-4 mt-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 border-b border-amber-200/60 pb-3">
        <IconeAlerta className="h-4 w-4 text-amber-600" />
        <h4 className="text-xs font-black tracking-widest text-amber-800 uppercase">
          Alerta: descompasso morfológico
        </h4>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-1.5">
            <IconeCasa className="h-3.5 w-3.5 text-amber-700" />
          </div>
          <div>
            <span className="mb-0.5 block text-[10px] font-bold tracking-wider text-amber-800/70 uppercase">
              Barreira estrutural
            </span>
            <p className="text-[11px] leading-relaxed font-medium text-stone-700">
              Alto potencial solar (
              <strong className="font-bold text-stone-900">
                {formatarValor(irradiacaoMediaKwhM2Dia, 'numero')} kWh/m²·dia
              </strong>
              ), mas {descricaoBarreira}. {mecanismoBarreira} a instalação de painéis individuais,
              independentemente da disponibilidade de crédito ou renda.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-amber-200/80 bg-white/70 p-3 shadow-sm">
          <div className="mt-0.5 shrink-0 rounded-full bg-stone-100 p-1.5">
            <IconeLampada className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div>
            <span className="mb-0.5 block text-[10px] font-bold tracking-wider text-amber-800/70 uppercase">
              Diretriz recomendada
            </span>
            <p className="text-[11px] leading-relaxed font-medium text-stone-700">
              Priorizar modelos de{' '}
              <strong className="font-bold text-stone-900">
                Geração Compartilhada ou Comunitária
              </strong>{' '}
              (usinas remotas com rateio de créditos). Subsídios para instalação individual no
              telhado terão baixa eficácia técnica neste território.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
