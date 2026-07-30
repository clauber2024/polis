/**
 * COMPONENTE: linha de ranking de propósito geral (posição + barra de valor +
 * marcador de mediana nacional) — extraído do painel de ranking estadual do
 * mapa (RF-030 a RF-036) para reaproveitar em qualquer lista ordenada de
 * municípios (ou outras entidades) com um valor de destaque e uma referência
 * nacional de comparação.
 *
 * Isolado de lógica de negócio (CLAUDE.md, Seção 4): só renderiza o que
 * recebe por props — busca de dado, ordenação e cálculo de mediana ficam na
 * página/componente que o usa (ex.: PainelRanking.tsx).
 *
 * Só faz sentido para listas de VALOR ÚNICO em destaque (uma métrica por
 * linha). Rankings com várias colunas simultâneas (ex.: a tabela de
 * PaginaVaziosDeAcesso.tsx, com IVS/IVSH/pobreza/MMGD/irradiação lado a
 * lado) continuam como tabela — usar este componente ali removeria colunas
 * hoje visíveis ao mesmo tempo, não é um ajuste cosmético.
 */

interface RankingItemProps {
  posicao: number;
  nomeMunicipio: string;
  /** Valor numérico bruto — usado só para calcular a barra e a posição da mediana, nunca exibido diretamente. */
  valor: number;
  /** Valor já formatado para exibição (ex: via formatarValor — respeita moeda/percentual/inteiro/número). */
  valorFormatado: string;
  /** Ex: "kW/1.000 hab", "R$/MWh", "kWh/m²·dia" — null quando o indicador não tem unidade (ex: índices 0–1). */
  unidade: string | null;
  /** Valor de referência para o traço vertical — null quando não há mediana calculável para este indicador/lista. */
  medianaNacional: number | null;
  /** Maior valor da lista atual, para normalizar a barra (0 a 100%). */
  maxRanking: number;
  /**
   * Piso da escala da barra (30/07/2026, feedback do usuário: valores muito
   * próximos entre si — ex. IVSH 0,28 vs 0,27 — ficavam visualmente
   * idênticos numa escala 0–max). Default 0 preserva o comportamento
   * original (escala cheia) para PainelRanking.tsx (mapa), que não passa
   * esta prop. Quem passa um piso > 0 (ex. RankingPrioridadeExecutivo,
   * calculado a partir do menor valor REAL da lista exibida, nunca um
   * número fixo) dá "zoom" na variação — a barra passa a ocupar toda a
   * largura entre `minRanking` e `maxRanking`, não entre 0 e `maxRanking`.
   */
  minRanking?: number;
  ehVazioDeAcesso?: boolean;
  /** Cor de destaque da barra (hex) — permite reaproveitar o componente em rankings de indicadores diferentes, cada um com sua cor. */
  cor: string;
  /**
   * Rótulo da referência de `medianaNacional` (30/07/2026: RankingPrioridadeExecutivo
   * passa "UF" quando a lista está filtrada por estado — a mediana comparada
   * deixa de ser nacional e vira estadual, então o rótulo precisa refletir
   * isso, não é só cosmético). Default 'Brasil' preserva o comportamento
   * original de PainelRanking.tsx (mapa), que nunca passa esta prop.
   */
  rotuloMediana?: string;
}

export function RankingItem({
  posicao,
  nomeMunicipio,
  valor,
  valorFormatado,
  unidade,
  medianaNacional,
  maxRanking,
  minRanking = 0,
  ehVazioDeAcesso,
  cor,
  rotuloMediana = 'Brasil',
}: RankingItemProps) {
  // amplitude <= 0 ocorre com lista vazia/todos os valores iguais — evita
  // NaN/Infinity na largura da barra. Math.max(0, ...) protege contra
  // `valor` cair abaixo do piso (ex.: mediana estadual menor que o piso
  // calculado só sobre os 5 visíveis).
  const amplitude = maxRanking - minRanking;
  const larguraBarra =
    amplitude > 0 ? Math.min(100, Math.max(0, ((valor - minRanking) / amplitude) * 100)) : valor > 0 ? 100 : 0;
  const posicaoMediana =
    medianaNacional !== null && amplitude > 0
      ? Math.min(100, Math.max(0, ((medianaNacional - minRanking) / amplitude) * 100))
      : null;

  return (
    <div className="flex flex-col gap-1.5 border-b border-stone-100 px-2 py-3 transition-colors hover:bg-stone-50/80">
      {/* Linha superior: posição, nome e valor com unidade */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-[11px] font-bold text-stone-400">{posicao}º</span>
          <span className="truncate text-xs font-bold text-stone-900">{nomeMunicipio}</span>
          {ehVazioDeAcesso && (
            <span className="rounded border border-red-200/60 bg-red-50 px-1 py-0.5 text-[8px] font-black tracking-wider text-red-700 uppercase">
              Vazio de Acesso
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-baseline gap-1">
          <span className="text-xs font-black text-stone-900">{valorFormatado}</span>
          {unidade && <span className="text-[9px] font-bold text-stone-500">{unidade}</span>}
        </div>
      </div>

      {/* Linha inferior: barra de valor + marcador da mediana nacional (quando disponível) */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-stone-100">
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${larguraBarra}%`, backgroundColor: cor }}
        />
        {posicaoMediana !== null && (
          <div
            className="absolute top-0 z-10 h-full w-0.5 bg-stone-900 shadow-[0_0_2px_rgba(255,255,255,0.8)]"
            style={{ left: `${posicaoMediana}%` }}
            title={`Mediana ${rotuloMediana}: ${medianaNacional?.toLocaleString('pt-BR')}${unidade ? ` ${unidade}` : ''}`}
          />
        )}
      </div>

      {medianaNacional !== null && (
        <div className="flex justify-between px-0.5 text-[8px] font-medium text-stone-400">
          <span>{minRanking.toLocaleString('pt-BR')}</span>
          <span className="font-bold text-stone-600">
            Mediana {rotuloMediana}: {medianaNacional.toLocaleString('pt-BR')}
          </span>
          <span>{maxRanking.toLocaleString('pt-BR')}</span>
        </div>
      )}
    </div>
  );
}
