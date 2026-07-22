import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface AlternadorPriorizacaoIvshProps {
  ligado: boolean;
  aoAlternar: (ligado: boolean) => void;
}

/**
 * Alternador do critério de priorização do ranking de Vazios de Acesso —
 * desligado usa `ordenarPor=ivs` (padrão do backend, renda/infraestrutura/
 * educação), ligado usa `ordenarPor=ivsh` (migration 0028: IVS + precariedade
 * habitacional + insegurança da posse — ver vw_ivsh_consolidado). Os dois
 * valores de `ordenarPor` já existem em CRITERIOS_ORDENACAO
 * (vaziosDeAcesso.schema.ts); este componente só decide qual delas mandar na
 * requisição — a reordenação em si é sempre feita pelo backend, nunca
 * recalculada aqui.
 */
export function AlternadorPriorizacaoIvsh({ ligado, aoAlternar }: AlternadorPriorizacaoIvshProps) {
  const [dicaVisivel, setDicaVisivel] = useState(false);

  return (
    <div
      className="relative inline-flex items-center gap-2.5"
      onMouseEnter={() => setDicaVisivel(true)}
      onMouseLeave={() => setDicaVisivel(false)}
    >
      <span className="font-mono text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        Lente habitacional (IVSH)
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => aoAlternar(!ligado)}
        onFocus={() => setDicaVisivel(true)}
        onBlur={() => setDicaVisivel(false)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 ${
          ligado ? 'bg-violet-600' : 'bg-slate-300'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow"
          style={{ x: ligado ? 20 : 0 }}
        />
      </button>

      <AnimatePresence>
        {dicaVisivel && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 z-10 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 shadow-lg"
          >
            {ligado ? (
              <>
                <span className="mb-1 block font-mono text-[10px] font-bold tracking-wider text-violet-700 uppercase">
                  IVSH ligado
                </span>
                Ao ligar o IVSH, o ranking penaliza territórios onde a precariedade
                construtiva impede a instalação de painéis no telhado — a priorização soma
                precariedade habitacional e insegurança da posse ao IVS geral (migration
                0028).
              </>
            ) : (
              <>
                <span className="mb-1 block font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                  IVS geral (padrão)
                </span>
                Ordena pelo IVS calculado do Atlas (renda, infraestrutura e educação) — não
                considera a condição da moradia.
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
