import { useEffect, useRef, useState } from 'react';
import type { IndicadorMapa } from '../../utils/indicadores';

interface SeletorIndicadorProps {
  indicadores: IndicadorMapa[];
  valor: IndicadorMapa['id'];
  aoMudar: (id: IndicadorMapa['id']) => void;
}

/**
 * Categorização dos 10 indicadores do mapa (25/07/2026, auditoria de UX/UI)
 * — mesmos 4 domínios já usados em "Fontes de dados" na landing page
 * (PaginaLanding.tsx), para o usuário reconhecer a mesma taxonomia em vez de
 * inventar agrupamentos novos. Só ordena/rotula os IDs reais de
 * INDICADORES_MAPA — nenhum indicador novo, nenhuma sigla trocada.
 */
const GRUPOS: { titulo: string; ids: IndicadorMapa['id'][] }[] = [
  {
    titulo: 'Território e Clima',
    ids: ['irradiacaoMediaKwhM2Dia'],
  },
  {
    titulo: 'Energia e Infraestrutura Elétrica',
    ids: ['mmgdResidencialPer1000Hab', 'mmgdPer1000Hab', 'tarifaEnergiaResidencial'],
  },
  {
    titulo: 'Vulnerabilidade Social e Renda',
    ids: ['ivs', 'ivsh', 'percentualPobrezaCadunico', 'rendaMediaDomiciliar', 'taxaAlfabetizacao'],
  },
  {
    titulo: 'Moradia e Crédito Habitacional',
    ids: ['contratosReformaCasaBrasilSolarPer10000Hab'],
  },
];

/**
 * Substitui o `<select>` nativo (impossível de estilizar sem o fundo azul de
 * hover do navegador nas `<option>`) por um dropdown customizado, agrupado
 * pelos mesmos 4 domínios da landing page. Mesma prop `valor`/`aoMudar` de
 * um select controlado — quem decide o indicador ativo continua sendo
 * PaginaMapa, aqui é só apresentação.
 */
export function SeletorIndicador({ indicadores, valor, aoMudar }: SeletorIndicadorProps) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const indicadorAtivo = indicadores.find((i) => i.id === valor) ?? indicadores[0];

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(evento: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    function aoPressionarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoPressionarTecla);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoPressionarTecla);
    };
  }, [aberto]);

  return (
    <div ref={containerRef} className="relative w-full">
      <label
        htmlFor="seletor-indicador"
        className="mb-1.5 block text-[10px] font-bold tracking-widest text-stone-500 uppercase"
      >
        Indicador de distribuição espacial
      </label>

      <button
        id="seletor-indicador"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((estado) => !estado)}
        className="flex w-full items-center justify-between rounded-xl border border-stone-200/80 bg-white/70 px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm backdrop-blur-md transition-all outline-none hover:bg-white/90 focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
      >
        <span className="truncate">{indicadorAtivo.rotulo}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <div
          role="listbox"
          aria-label="Indicador de distribuição espacial"
          className="absolute left-0 top-[calc(100%+8px)] z-30 max-h-[400px] w-full overflow-y-auto rounded-xl border border-stone-200/80 bg-white/95 py-2 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl"
        >
          {GRUPOS.map((grupo) => {
            const itens = grupo.ids
              .map((id) => indicadores.find((i) => i.id === id))
              .filter((i): i is IndicadorMapa => !!i);
            if (itens.length === 0) return null;
            return (
              <div key={grupo.titulo} className="mb-2 border-b border-stone-100 pb-2 last:mb-0 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 px-4 py-1.5 opacity-70">
                  <span className="text-[10px] font-extrabold tracking-widest text-stone-500 uppercase">
                    {grupo.titulo}
                  </span>
                </div>
                <div className="flex flex-col">
                  {itens.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={item.id === valor}
                      onClick={() => {
                        aoMudar(item.id);
                        setAberto(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-900"
                    >
                      <span className="truncate pr-4">{item.rotulo}</span>
                      {item.id === valor && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4 shrink-0 text-red-600"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
