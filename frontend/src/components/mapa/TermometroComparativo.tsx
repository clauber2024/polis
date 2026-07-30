import { formatarValor, type FormatoIndicador } from '../../utils/formatadores';

/**
 * "Maior é melhor" (ex.: MMGD per capita, renda), "menor é melhor" (ex.: IVS,
 * mortalidade infantil) ou "neutro" (ex.: irradiação — é um recurso natural,
 * não um resultado de política pública; comparar contra a média não carrega
 * juízo de valor). Controla a cor da barra/tag — nunca o tom do valor bruto.
 */
export type SemanticaIndicador = 'maiorMelhor' | 'menorMelhor' | 'neutro';

interface TermometroComparativoProps {
  valor: number;
  formato: FormatoIndicador;
  unidade?: string;
  mediaNacional: number;
  semantica: SemanticaIndicador;
}

/**
 * Bullet chart em CSS puro (barra do valor + traço da média nacional) + tag
 * de status curta — núcleo visual reaproveitado por IndicadorComparativo.tsx
 * (card da Ficha do Município) e pelo tooltip de hover do mapa
 * (MapaMunicipios.tsx, auditoria de UX/UI 30/07/2026: os dois precisavam da
 * MESMA lógica de comparação para não divergir visualmente). Sem chrome de
 * card — cada consumidor decide o envelope ao redor.
 *
 * Escala dinâmica (maior entre valor e média nacional, com folga de 30%) —
 * não fixa por indicador, já que nem toda tela que usa isto tem acesso a um
 * "máximo nacional" (a API não expõe isso hoje).
 */
export function TermometroComparativo({
  valor,
  formato,
  unidade,
  mediaNacional,
  semantica,
}: TermometroComparativoProps) {
  const escalaMaxima = Math.max(valor, mediaNacional, 0.0001) * 1.3;
  const percentualValor = Math.min(100, (valor / escalaMaxima) * 100);
  const percentualMedia = Math.min(100, (mediaNacional / escalaMaxima) * 100);

  // mediaNacional === 0 é um caso de borda real (nenhum indicador atual do
  // Atlas deveria chegar a isso, mas uma média de 0 tornaria a variação
  // percentual indefinida/infinita) — degrada para "sem tag de status",
  // mantém só a barra.
  const variacaoPercentual = mediaNacional !== 0 ? ((valor - mediaNacional) / mediaNacional) * 100 : null;

  const favoravel =
    semantica === 'maiorMelhor'
      ? valor >= mediaNacional
      : semantica === 'menorMelhor'
        ? valor <= mediaNacional
        : null;

  const barraCor =
    semantica === 'neutro' ? 'bg-stone-500' : favoravel ? 'bg-emerald-500' : 'bg-red-600';

  // Regra de negócio (decisão do usuário, 30/07/2026): "melhor" só se aplica
  // quando MENOR é melhor (ex.: IVS, mortalidade infantil) — para "maior é
  // melhor" (ex.: MMGD, renda), o lado favorável é só "Acima da média" (estar
  // acima não é necessariamente "ótimo", só não é o alerta). O lado
  // desfavorável é sempre a mesma frase franca, nos dois sentidos.
  let textoStatus: string | null = null;
  if (variacaoPercentual !== null) {
    const percentualAbs = Math.abs(variacaoPercentual).toFixed(0);
    if (semantica === 'neutro') {
      textoStatus = `${variacaoPercentual >= 0 ? 'Acima' : 'Abaixo'} da média nacional (${percentualAbs}%)`;
    } else if (!favoravel) {
      textoStatus = `Pior que a média — Alerta (${percentualAbs}%)`;
    } else if (semantica === 'maiorMelhor') {
      textoStatus = `Acima da média (${percentualAbs}%)`;
    } else {
      textoStatus = `Melhor que a média (${percentualAbs}%)`;
    }
  }

  const tagCor =
    semantica === 'neutro'
      ? 'text-stone-500'
      : favoravel
        ? 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200'
        : 'text-red-700 bg-red-50 ring-1 ring-red-200';

  return (
    <>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-stone-200/70">
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-700 ${barraCor}`}
          style={{ width: `${percentualValor}%` }}
        />
        <div
          className="absolute top-0 z-10 h-full w-0.5 bg-stone-900 shadow-[0_0_2px_rgba(255,255,255,0.9)]"
          style={{ left: `${percentualMedia}%` }}
          title={`Média nacional: ${formatarValor(mediaNacional, formato)}${unidade ? ` ${unidade}` : ''}`}
        />
      </div>

      {textoStatus && (
        <span
          className={`mt-1.5 inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase ${tagCor}`}
        >
          {textoStatus}
        </span>
      )}
    </>
  );
}
