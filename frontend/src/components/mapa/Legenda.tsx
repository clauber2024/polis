import type { IndicadorMapa } from '../../utils/indicadores';
import { formatarValor } from '../../utils/formatadores';
import { COR_DESTAQUE_VAZIO, COR_SEM_DADO } from './MapaMunicipios';

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

  // Com o destaque ligado, o preenchimento do mapa INTEIRO troca para o
  // esquema de atenuação (ver MapaMunicipios) — as classes do choropleth do
  // indicador ativo deixam de ser o que está pintado, então mostrá-las aqui
  // seria enganoso. A legenda muda de conteúdo, não só ganha uma linha extra.
  if (destaqueLigado) {
    return (
      <div className="max-w-72 rounded-2xl border border-white/90 bg-white/80 p-4 text-sm shadow-[0_12px_40px_rgb(0,0,0,0.1)] backdrop-blur-xl">
        <p className="mb-1.5 font-mono text-[11px] font-bold tracking-wider text-stone-500 uppercase">
          Lente ativa
        </p>
        <p className="mb-3 font-bold text-stone-900">Vazios de Acesso</p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2.5 rounded-lg bg-red-50/80 px-2 py-1.5">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/5"
              style={{ backgroundColor: COR_DESTAQUE_VAZIO }}
            />
            <span className="font-mono text-sm font-bold text-red-800">
              Vazio de Acesso ({totalDestacados.toLocaleString('pt-BR')})
            </span>
          </li>
          <li className="flex items-center gap-2.5 rounded-lg bg-stone-50/80 px-2 py-1.5">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-stone-300 ring-1 ring-black/5" />
            <span className="font-mono text-sm font-medium text-stone-600">Demais municípios</span>
          </li>
        </ul>
        <p className="mt-3 text-xs leading-snug text-stone-500">
          O restante do mapa esmaece de propósito — o indicador de cor ({indicador.rotulo}) volta
          quando a lente é desligada.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-72 rounded-2xl border border-white/90 bg-white/80 p-4 text-sm shadow-[0_12px_40px_rgb(0,0,0,0.1)] backdrop-blur-xl">
      <p className="mb-1.5 font-mono text-[11px] font-bold tracking-wider text-stone-500 uppercase">
        Classificação por quintil
      </p>
      <p className="mb-1 font-bold text-stone-900">
        {indicador.rotulo}
        {indicador.unidade ? ` (${indicador.unidade})` : ''}
      </p>
      {indicador.descricao && (
        <p className="mb-1.5 text-xs leading-snug text-stone-500">{indicador.descricao}</p>
      )}
      <p className="mb-3 text-xs text-stone-500">
        Classes por quintis{indicador.sentido === 'negativo' ? ' — valor maior é pior' : ''}
      </p>
      <ul className="space-y-1.5">
        {faixas.map((faixa, i) => (
          <li key={faixa} className="flex items-center gap-2.5 rounded-lg bg-stone-50/80 px-2 py-1.5">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/5"
              style={{ backgroundColor: indicador.cores[i] }}
            />
            <span className="font-mono text-sm font-medium text-stone-700">{faixa}</span>
          </li>
        ))}
        <li className="flex items-center gap-2.5 rounded-lg bg-stone-50/80 px-2 py-1.5">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/5"
            style={{ backgroundColor: COR_SEM_DADO }}
          />
          <span className="font-mono text-sm font-medium text-stone-700">sem dado</span>
        </li>
      </ul>
    </div>
  );
}
