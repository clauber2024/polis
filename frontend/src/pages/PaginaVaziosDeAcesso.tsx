import { DetalhamentoTerritorialVazios } from '../components/vazios-de-acesso/DetalhamentoTerritorialVazios';

/**
 * Página standalone do Detalhamento Territorial de Vazios de Acesso
 * (30/07/2026: saiu do menu principal, mas a rota continua existindo — não
 * foi deletada, só perdeu o status de aba própria, ver App.tsx). Chegam
 * aqui a lente habitacional da landing (PaginaLanding, CardExplicativo
 * "Ligar a lente habitacional") e o link do TourAchados — o mesmo conteúdo
 * também abre como modal a partir do Dossiê Executivo
 * (ModalDetalhamentoVazios), sem duplicar lógica: os dois pontos de
 * entrada renderizam DetalhamentoTerritorialVazios.
 */
export function PaginaVaziosDeAcesso() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <DetalhamentoTerritorialVazios />
    </div>
  );
}
