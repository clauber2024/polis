import { useEffect } from 'react';
import { DetalhamentoTerritorialVazios } from '../vazios-de-acesso/DetalhamentoTerritorialVazios';

interface ModalDetalhamentoVaziosProps {
  aoFechar: () => void;
  /** Continuidade do drill-down: UF já filtrada no Ranking Executivo abre o modal no mesmo recorte. */
  ufInicial?: string;
}

function IconeX({ className }: { className?: string }) {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Modal do Detalhamento Territorial de Vazios de Acesso (30/07/2026,
 * decisão do usuário): a tabela nacional completa (paginação server-side,
 * ~1.451 linhas no quadrante) deixou de ser página principal do menu —
 * agora é um drill-down acionado pelo botão "Carregar Top 50 municípios"
 * dentro do Ranking Executivo (RankingPrioridadeExecutivo.tsx, aba Visão
 * Executiva do Dossiê Executivo). Envolve DetalhamentoTerritorialVazios sem
 * duplicar nenhuma lógica de filtro/paginação/exportação — este componente
 * só é a moldura (overlay + fechar).
 *
 * Sem focus trap completo (fora de escopo aqui) — fecha em Esc, clique no
 * fundo, ou no botão X. `aria-modal`/`role="dialog"` para leitor de tela.
 */
export function ModalDetalhamentoVazios({ aoFechar, ufInicial }: ModalDetalhamentoVaziosProps) {
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') aoFechar();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={aoFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detalhamento Territorial de Vazios de Acesso"
        className="my-4 w-full max-w-5xl rounded-2xl bg-white shadow-2xl"
        onClick={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 p-4">
          <span className="text-xs font-bold tracking-wide text-stone-500 uppercase">
            Drill-down territorial
          </span>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            title="Fechar"
          >
            <IconeX className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-6">
          <DetalhamentoTerritorialVazios ufInicial={ufInicial} />
        </div>
      </div>
    </div>
  );
}
