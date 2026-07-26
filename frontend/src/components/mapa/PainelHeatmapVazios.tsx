import { RAMPA_HEATMAP } from './MapaMunicipios';
import { formatarValor } from '../../utils/formatadores';

/**
 * Painel-legenda do heatmap de Vazios de Acesso (RF-057) — substitui a
 * Legenda do choropleth enquanto o modo heatmap está ativo (modo EXCLUSIVO,
 * ver MapaMunicipios). Só apresentação: contagem, medianas nacionais que
 * definem a classificação (vêm do backend, nunca recalculadas aqui), o
 * critério de intensidade (IVS, mesmo critério de priorização padrão do
 * RF-056) e a nota metodológica que o backend exige junto de qualquer
 * exibição da classificação.
 */

interface PainelHeatmapVaziosProps {
  totalVazios: number;
  medianaNacional: {
    potencialSolarKwhM2Dia: number;
    mmgdResidencialPer1000Hab: number;
  };
  notaMetodologica: string;
}

/** Gradiente CSS com as mesmas paradas da rampa aplicada no MapLibre. */
const GRADIENTE = `linear-gradient(to right, ${RAMPA_HEATMAP.map(
  ([parada, cor]) => `${cor} ${parada * 100}%`,
).join(', ')})`;

export function PainelHeatmapVazios({
  totalVazios,
  medianaNacional,
  notaMetodologica,
}: PainelHeatmapVaziosProps) {
  return (
    <div className="max-w-72 rounded-2xl border border-orange-200/70 bg-orange-50/70 p-4 text-sm shadow-[0_12px_40px_rgb(0,0,0,0.1)] backdrop-blur-xl">
      <p className="mb-1.5 font-mono text-[11px] font-bold tracking-wider text-orange-800 uppercase">
        Camada de Vazios de Acesso
      </p>
      <p className="mb-3 text-xs leading-snug text-stone-600">
        {totalVazios.toLocaleString('pt-BR')} municípios com alto potencial solar (irradiação ≥{' '}
        {formatarValor(medianaNacional.potencialSolarKwhM2Dia, 'numero')} kWh/m²·dia) e baixa MMGD
        residencial per capita (&lt;{' '}
        {formatarValor(medianaNacional.mmgdResidencialPer1000Hab, 'numero')} kW/1.000 hab) —
        medianas nacionais, classificação do backend.
      </p>

      <div className="h-3 rounded-full shadow-inner" style={{ background: GRADIENTE }} />
      <div className="mt-1 flex justify-between font-mono text-xs text-stone-500">
        <span>menor concentração</span>
        <span>maior</span>
      </div>

      <p className="mt-3 text-xs leading-snug text-stone-600">
        Intensidade ponderada pelo IVS (municípios mais vulneráveis pesam mais — mesmo critério de
        priorização do ranking). Municípios sem IVS entram com peso mínimo.
      </p>

      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-xs font-semibold tracking-wide text-orange-800 uppercase hover:text-orange-900">
          Nota metodológica
        </summary>
        <p className="mt-1 text-xs leading-snug text-stone-600">{notaMetodologica}</p>
      </details>
    </div>
  );
}
