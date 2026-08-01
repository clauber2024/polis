import type { ReactNode } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';

interface BottomSheetMobileProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
}

function IconeFechar(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={props.className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Bottom sheet mobile (31/07/2026, refatoração de UX mobile do Mapa
 * Interativo — os painéis flutuantes de controle são `position: absolute`
 * com largura fixa (`w-80`) e altura do topo à base da tela, sem nenhum
 * breakpoint responsivo, cobrindo quase toda a largura em qualquer celular.
 * Este componente é a versão mobile desses painéis: desliza de baixo,
 * arrastável pra fechar (usa `framer-motion`, já dependência do projeto
 * desde TourAchados.tsx — sem lib nova).
 *
 * Altura por conteúdo (`max-h`), não fixa em 60vh — conteúdo curto (ex.:
 * filtros) não deixa espaço vazio; conteúdo longo (ex.: ranking paginado)
 * rola internamente.
 */
export function BottomSheetMobile({ aberto, aoFechar, titulo, children }: BottomSheetMobileProps) {
  function aoSoltarArraste(_evento: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (info.offset.y > 80 || info.velocity.y > 500) aoFechar();
  }

  return (
    <AnimatePresence>
      {aberto && (
        <>
          <motion.div
            key="fundo"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-stone-950/40 md:hidden"
            onClick={aoFechar}
          />
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={aoSoltarArraste}
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[75vh] flex-col rounded-t-3xl bg-white shadow-[0_-8px_30px_rgb(0,0,0,0.18)] md:hidden"
          >
            <div className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2.5 pb-1.5 active:cursor-grabbing">
              <div className="h-1.5 w-10 rounded-full bg-stone-300" />
            </div>
            <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-4 pb-3">
              <h3 className="text-sm font-black tracking-tight text-stone-900">{titulo}</h3>
              <button
                type="button"
                onClick={aoFechar}
                aria-label="Fechar"
                className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
              >
                <IconeFechar className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
