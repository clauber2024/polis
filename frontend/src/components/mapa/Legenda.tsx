import type { IndicadorMapa } from '../../utils/indicadores';
import { formatarValor } from '../../utils/formatadores';
import { COR_SEM_DADO } from './MapaMunicipios';

interface LegendaProps {
  indicador: IndicadorMapa;
  quebras: number[];
  destaqueLigado: boolean;
  totalDestacados: number;
}

/** Legenda do choropleth — mesmas quebras/cores aplicadas no MapaMunicipios. */
export function Legenda({ indicador, quebras, destaqueLigado, totalDestacados }: LegendaProps) {
  if (quebras.length !== 4) return null;

  const faixas = [
    `até ${formatarValor(quebras[0], indicador.formato)}`,
    `${formatarValor(quebras[0], indicador.formato)} a ${formatarValor(quebras[1], indicador.formato)}`,
    `${formatarValor(quebras[1], indicador.formato)} a ${formatarValor(quebras[2], indicador.formato)}`,
    `${formatarValor(quebras[2], indicador.formato)} a ${formatarValor(quebras[3], indicador.formato)}`,
    `acima de ${formatarValor(quebras[3], indicador.formato)}`,
  ];

  return (
    <div className="max-w-64 rounded border border-slate-200 bg-white/95 p-3 text-xs shadow-md backdrop-blur-sm">
      <p className="mb-1 font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
        Classificação por Quintil
      </p>
      <p className="mb-1 font-semibold text-slate-800">
        {indicador.rotulo}
        {indicador.unidade ? ` (${indicador.unidade})` : ''}
      </p>
      {indicador.descricao && (
        <p className="mb-1 leading-snug text-slate-500">{indicador.descricao}</p>
      )}
      <p className="mb-2 text-slate-500">
        Classes por quintis{indicador.sentido === 'negativo' ? ' — valor maior é pior' : ''}
      </p>
      <ul className="space-y-1">
        {faixas.map((faixa, i) => (
          <li key={faixa} className="flex items-center gap-2 rounded bg-slate-50/60 px-1.5 py-1">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: indicador.cores[i] }}
            />
            <span className="font-mono text-[11px] text-slate-700">{faixa}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 rounded bg-slate-50/60 px-1.5 py-1">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COR_SEM_DADO }} />
          <span className="font-mono text-[11px] text-slate-700">sem dado</span>
        </li>
        {destaqueLigado && (
          <li className="mt-1 flex items-center gap-2 border-t border-slate-200 pt-1.5">
            <span className="h-0.5 w-4 shrink-0 rounded" style={{ backgroundColor: '#7c3aed' }} />
            <span className="font-mono text-[10px] font-bold tracking-wide text-violet-700 uppercase">
              Vazio de Acesso ({totalDestacados.toLocaleString('pt-BR')} municípios)
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
