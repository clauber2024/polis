import type { MunicipioComIndicadores } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';

interface CartaoDescompassoMorfologicoProps {
  municipio: MunicipioComIndicadores;
  /** Mediana nacional de irradiação (GET /api/vazios-de-acesso) — mesmo critério "alta irradiação" já usado na classificação oficial de Vazios de Acesso (RF-056), reaproveitado aqui em vez de um valor fixo inventado. */
  medianaIrradiacao: number | null;
  /** Percentil 90 nacional de indice_precariedade_moradia (GET /api/vazios-de-acesso, mesmo lazy load acima) — ver docstring abaixo sobre por que isso substituiu um corte fixo de 0,5. */
  limiarPrecariedadeHabitacionalAlta: number | null;
}

/**
 * Alerta de "descompasso morfológico": alta irradiação solar desperdiçada
 * porque a tipologia construtiva do município barra a instalação
 * individual no telhado (paredes/cortiços inadequados ou prédios sem
 * telhado próprio) — 18/07/2026, pedido do usuário.
 *
 * Limiares documentados (nenhum é fabricado sem critério):
 * - "alta irradiação" = >= mediana NACIONAL real (vinda do backend, mesmo
 *   critério do quadrante Vazio de Acesso), não um valor fixo tipo "GHI >
 *   5.0" — isso já foi tentado e descartado no protótipo do AI Studio (ver
 *   CLAUDE.md, "adaptação de layout do protótipo", 14/07/2026).
 * - "alta precariedade habitacional" = indice_precariedade_moradia > percentil
 *   90 NACIONAL real (calculado no backend, `vaziosDeAcesso.service.ts`).
 *   CORRIGIDO em 20/07/2026: a versão original usava um corte fixo de 0,5
 *   assumindo que o índice (média de 3 sub-índices normalizados min-max
 *   independentemente, migration 0014) se distribuía perto de [0,1] — na
 *   prática o composto nacional nunca passa de ~0,36 (máximo observado,
 *   Fernando de Noronha) e a mediana é ~0,0066, então 0,5 nunca disparava
 *   para NENHUM dos ~5.570 municípios. Confirmado por auditoria manual antes
 *   da correção (ver docs/DECISOES.md).
 * - "alta verticalização" = percentual_apartamento > 50% — maioria dos
 *   domicílios do município são apartamentos (sem telhado individual),
 *   leitura direta do percentual, não um corte estatístico validado. Municípios
 *   assim (ex: Balneário Camboriú, Santos) tendem a ter irradiação abaixo da
 *   mediana nacional (litoral Sul/Sudeste) — combinado com "alta irradiação",
 *   este ramo é estruturalmente raro por geografia, não por erro de corte.
 *
 * Ausência de qualquer um dos 3 indicadores (município sem dado) nunca vira
 * alerta — só dispara com os 3 valores presentes e a condição confirmada.
 */
export function CartaoDescompassoMorfologico({
  municipio,
  medianaIrradiacao,
  limiarPrecariedadeHabitacionalAlta,
}: CartaoDescompassoMorfologicoProps) {
  const { irradiacaoMediaKwhM2Dia, indicePrecariedadeMoradia, percentualApartamento } = municipio;

  if (
    irradiacaoMediaKwhM2Dia === null ||
    medianaIrradiacao === null ||
    (indicePrecariedadeMoradia === null && percentualApartamento === null)
  ) {
    return null;
  }

  const irradiacaoAlta = irradiacaoMediaKwhM2Dia >= medianaIrradiacao;
  const precariedadeAlta =
    indicePrecariedadeMoradia !== null &&
    limiarPrecariedadeHabitacionalAlta !== null &&
    indicePrecariedadeMoradia > limiarPrecariedadeHabitacionalAlta;
  const verticalizacaoAlta = percentualApartamento !== null && percentualApartamento > 50;

  if (!irradiacaoAlta || (!precariedadeAlta && !verticalizacaoAlta)) {
    return null;
  }

  const barreiras: string[] = [];
  if (precariedadeAlta) {
    barreiras.push(
      `precariedade habitacional entre as 10% piores do país (índice ${formatarValor(indicePrecariedadeMoradia, 'numero')} de 1 — cortiços, paredes inadequadas ou favelas)`,
    );
  }
  if (verticalizacaoAlta) {
    barreiras.push(
      `${formatarValor(percentualApartamento, 'percentual')} dos domicílios são apartamentos, sem telhado individual disponível`,
    );
  }

  return (
    <div className="mx-4 mt-3 rounded-lg border-2 border-red-300 bg-red-50 p-3">
      <p className="mb-1 font-mono text-[10px] font-bold tracking-wider text-red-700 uppercase">
        ⚠ Descompasso morfológico
      </p>
      <p className="text-sm leading-snug text-red-900">
        Alta irradiação solar ({formatarValor(irradiacaoMediaKwhM2Dia, 'numero')} kWh/m²·dia, acima
        da mediana nacional) está sendo desperdiçada: {barreiras.join(' e ')}. A instalação
        individual no telhado é, na prática, uma barreira física para boa parte do território —
        não só uma questão de renda.
      </p>
      <p className="mt-2 rounded bg-white/70 p-2 text-xs leading-snug text-red-800">
        <span className="font-semibold">Recomendado:</span> geração compartilhada/comunitária
        (usinas remotas com rateio de créditos), em vez de subsídio para instalação individual —
        orienta melhor fundos climáticos/habitacionais focados neste território.
      </p>
    </div>
  );
}
