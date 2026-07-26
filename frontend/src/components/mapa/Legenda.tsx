import type { IndicadorMapa } from '../../utils/indicadores';
import { formatarValor } from '../../utils/formatadores';
import { COR_DESTAQUE_DESCOMPASSO, COR_DESTAQUE_VAZIO, COR_SEM_DADO } from './MapaMunicipios';

interface LegendaProps {
  indicador: IndicadorMapa;
  quebras: number[];
  destaqueLigado: boolean;
  totalDestacados: number;
  descompassoLigado: boolean;
  totalDescompasso: number;
}

/**
 * Legenda do choropleth — mesmas quebras/cores aplicadas no MapaMunicipios.
 * Vazios de Acesso e Descompasso Morfológico agora são LENTES translúcidas
 * sobrepostas ao indicador (25/07/2026, 2ª rodada — antes o destaque
 * substituía o choropleth inteiro, e a legenda tinha um modo "exclusivo"
 * separado; virou obsoleto porque o indicador nunca mais some do mapa,
 * então as classes de quintil continuam sempre corretas, só ganham um
 * bloco extra quando alguma lente está ligada).
 */
export function Legenda({
  indicador,
  quebras,
  destaqueLigado,
  totalDestacados,
  descompassoLigado,
  totalDescompasso,
}: LegendaProps) {
  if (quebras.length !== 4) return null;

  const faixas = [
    `até ${formatarValor(quebras[0], indicador.formato)}`,
    `${formatarValor(quebras[0], indicador.formato)} a ${formatarValor(quebras[1], indicador.formato)}`,
    `${formatarValor(quebras[1], indicador.formato)} a ${formatarValor(quebras[2], indicador.formato)}`,
    `${formatarValor(quebras[2], indicador.formato)} a ${formatarValor(quebras[3], indicador.formato)}`,
    `acima de ${formatarValor(quebras[3], indicador.formato)}`,
  ];

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

      {(destaqueLigado || descompassoLigado) && (
        <div className="mt-3 border-t border-stone-200/80 pt-3">
          <p className="mb-1.5 font-mono text-[10px] font-bold tracking-wider text-stone-400 uppercase">
            Lentes ativas
          </p>
          <ul className="space-y-1.5">
            {destaqueLigado && (
              <li className="flex items-center gap-2.5 rounded-lg bg-red-50/80 px-2 py-1.5">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: COR_DESTAQUE_VAZIO }}
                />
                <span className="font-mono text-xs font-bold text-red-800">
                  Vazio de Acesso ({totalDestacados.toLocaleString('pt-BR')})
                </span>
              </li>
            )}
            {descompassoLigado && (
              <li className="flex items-center gap-2.5 rounded-lg bg-amber-50/80 px-2 py-1.5">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: COR_DESTAQUE_DESCOMPASSO }}
                />
                <span className="font-mono text-xs font-bold text-amber-800">
                  Descompasso Morfológico ({totalDescompasso.toLocaleString('pt-BR')})
                </span>
              </li>
            )}
          </ul>
          {destaqueLigado && descompassoLigado && (
            <p className="mt-2 text-[10px] leading-snug text-stone-500">
              Onde as duas lentes coincidem, as cores se somam — o terracota mais escuro é o
              alerta duplo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
