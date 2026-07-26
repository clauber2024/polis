import type { MunicipioComIndicadores } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';

interface CartaoVazioDeAcessoProps {
  municipio: MunicipioComIndicadores;
  /** Mediana nacional de irradiação (GET /api/vazios-de-acesso) — mesmo critério "alta irradiação" do quadrante oficial (RF-055/056), reaproveitado do CartaoDescompassoMorfologico em vez de duplicar o fetch. */
  medianaIrradiacao: number | null;
  /** Mediana nacional de MMGD residencial per capita (GET /api/vazios-de-acesso) — o outro eixo do mesmo critério oficial de "Vazio de Acesso": irradiação >= mediana E MMGD residencial per capita < mediana. */
  medianaMmgdResidencialPer1000Hab: number | null;
}

/** Ícones inline (sem dependência de lucide-react, ainda não usada no projeto). */
function IconeAlertaCircular({ className }: { className?: string }) {
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
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconeMapa({ className }: { className?: string }) {
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

function IconeBanco({ className }: { className?: string }) {
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

/**
 * Alerta de "Vazio de Acesso": mesma classificação oficial do backend
 * (RF-055/056 — irradiação >= mediana nacional E MMGD residencial per
 * capita < mediana nacional), recalculada aqui a partir dos dois valores
 * reais do município e das duas medianas nacionais — mesmo padrão do
 * CartaoDescompassoMorfologico, para não depender de o toggle "Destacar
 * Vazios de Acesso" estar ligado no mapa pra ver o alerta na ficha.
 *
 * Enquanto o Descompasso Morfológico é uma barreira FÍSICA (telhado não
 * comporta o painel), o Vazio de Acesso é tipicamente uma barreira
 * FINANCEIRA/DE MERCADO (o potencial técnico existe, o crédito não chega) —
 * daí o texto e a paleta (carmim, não âmbar) serem diferentes.
 */
export function CartaoVazioDeAcesso({
  municipio,
  medianaIrradiacao,
  medianaMmgdResidencialPer1000Hab,
}: CartaoVazioDeAcessoProps) {
  const { irradiacaoMediaKwhM2Dia, mmgdResidencialPer1000Hab } = municipio;

  if (
    irradiacaoMediaKwhM2Dia === null ||
    medianaIrradiacao === null ||
    mmgdResidencialPer1000Hab === null ||
    medianaMmgdResidencialPer1000Hab === null
  ) {
    return null;
  }

  const vazioDeAcesso =
    irradiacaoMediaKwhM2Dia >= medianaIrradiacao &&
    mmgdResidencialPer1000Hab < medianaMmgdResidencialPer1000Hab;

  if (!vazioDeAcesso) {
    return null;
  }

  return (
    <div className="mx-4 mt-3 rounded-xl border border-red-200/80 bg-red-50/50 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 border-b border-red-200/60 pb-3">
        <IconeAlertaCircular className="h-4 w-4 text-red-700" />
        <h4 className="text-xs font-black tracking-widest text-red-800 uppercase">
          Alerta: vazio de acesso
        </h4>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-full bg-red-100 p-1.5">
            <IconeMapa className="h-3.5 w-3.5 text-red-700" />
          </div>
          <div>
            <span className="mb-0.5 block text-[10px] font-bold tracking-wider text-red-800/70 uppercase">
              Barreira financeira / mercado
            </span>
            <p className="text-[11px] leading-relaxed font-medium text-stone-700">
              Zona de exclusão energética. Apesar da alta viabilidade técnica (
              <strong className="font-bold text-stone-900">
                {formatarValor(irradiacaoMediaKwhM2Dia, 'numero')} kWh/m²·dia
              </strong>
              ), a adoção de MMGD residencial é quase nula frente à média nacional (
              <strong className="font-bold text-stone-900">
                {formatarValor(mmgdResidencialPer1000Hab, 'numero')} kW/1.000 hab
              </strong>
              ). O mercado tradicional não penetra nesta região por falta de capital inicial e
              linhas de crédito acessíveis.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-red-200/80 bg-white/70 p-3 shadow-sm">
          <div className="mt-0.5 shrink-0 rounded-full bg-stone-100 p-1.5">
            <IconeBanco className="h-3.5 w-3.5 text-red-700" />
          </div>
          <div>
            <span className="mb-0.5 block text-[10px] font-bold tracking-wider text-red-800/70 uppercase">
              Diretriz recomendada
            </span>
            <p className="text-[11px] leading-relaxed font-medium text-stone-700">
              Território prioritário para{' '}
              <strong className="font-bold text-stone-900">
                injeção de fundos climáticos e sociais
              </strong>
              . Direcionar expansão de financiamentos subsidiados (ex.: Reforma Casa Brasil Solar)
              e fundos garantidores de microcrédito verde.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
