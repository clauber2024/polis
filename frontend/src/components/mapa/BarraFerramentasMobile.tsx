function IconeCamadas(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M12 2l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </svg>
  );
}

function IconeFunil(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M4 4h16l-6 8v6l-4 2v-8L4 4z" />
    </svg>
  );
}

function IconeLista(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function BotaoFerramenta({
  rotulo,
  icone,
  onClick,
  destaque,
}: {
  rotulo: string;
  icone: React.ReactNode;
  onClick: () => void;
  destaque?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-100 transition-colors ${
        destaque ? 'bg-red-700' : 'bg-transparent hover:bg-white/10'
      }`}
    >
      {icone}
      {destaque && (
        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-white" aria-hidden="true" />
      )}
    </button>
  );
}

interface BarraFerramentasMobileProps {
  aoAbrirCamadas: () => void;
  aoAbrirFiltros: () => void;
  aoAbrirRanking: () => void;
  filtrosAtivos: boolean;
}

/**
 * Barra de ferramentas inferior mobile (31/07/2026) — substitui, em telas
 * pequenas, o painel esquerdo flutuante (Indicador + Lentes de priorização
 * + abas Ranking/Filtros), que é `w-80` fixo sem breakpoint responsivo e
 * cobre quase toda a largura de um celular. `md:hidden` — só existe abaixo
 * do breakpoint `md`, onde o painel desktop já está escondido (ver
 * PaginaMapa.tsx).
 *
 * Fundo `stone-800`/ícone `stone-100` (pedido do usuário) — cada botão abre
 * o bottom sheet correspondente (BottomSheetMobile), nunca os dois campos
 * "Camadas"/"Filtros" juntos: são conteúdos reais distintos no componente
 * desktop (Indicador+Lentes+Legenda vs. PainelFiltrosDashboard), não uma
 * junção arbitrária.
 */
export function BarraFerramentasMobile({
  aoAbrirCamadas,
  aoAbrirFiltros,
  aoAbrirRanking,
  filtrosAtivos,
}: BarraFerramentasMobileProps) {
  return (
    <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center md:hidden">
      <div className="flex items-center gap-1 rounded-full bg-stone-800/95 p-1.5 shadow-[0_8px_24px_rgb(0,0,0,0.3)] backdrop-blur-sm">
        <BotaoFerramenta rotulo="Camadas do mapa" icone={<IconeCamadas className="h-5 w-5" />} onClick={aoAbrirCamadas} />
        <BotaoFerramenta
          rotulo="Filtros"
          icone={<IconeFunil className="h-5 w-5" />}
          onClick={aoAbrirFiltros}
          destaque={filtrosAtivos}
        />
        <BotaoFerramenta rotulo="Ranking estadual" icone={<IconeLista className="h-5 w-5" />} onClick={aoAbrirRanking} />
      </div>
    </div>
  );
}
