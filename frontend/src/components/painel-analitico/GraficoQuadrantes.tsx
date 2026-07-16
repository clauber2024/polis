import { useMemo } from 'react';
import type { VaziosDeAcessoCompleto } from '../../services/vaziosDeAcesso.service';
import type { Quadrante } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';

/**
 * Scatter de quadrantes da classificação de Vazios de Acesso (14/07/2026 —
 * ideia adaptada do protótipo `atlas-mmgd-solar`, mas com os EIXOS REAIS da
 * metodologia do Atlas: irradiação solar × MMGD residencial per capita, com
 * as medianas nacionais vindas do backend. O protótipo plotava MMGD × IVS,
 * que NÃO é a classificação real — IVS é critério de priorização (RF-056),
 * não eixo de quadrante).
 *
 * SVG próprio, sem lib de gráfico (mesma decisão de GraficoComparacao/
 * GraficoRadar: o stack atual resolve). Todos os pontos e cores vêm da
 * classificação do BACKEND (município a município) — nada é reclassificado
 * no cliente; este componente só posiciona e pinta o que recebeu.
 */

interface GraficoQuadrantesProps {
  dados: VaziosDeAcessoCompleto;
}

const LARGURA = 720;
const ALTURA = 440;
const MARGEM = { topo: 28, direita: 20, base: 52, esquerda: 64 };

/** Cores por quadrante — violeta mantém a identidade de "Vazio de Acesso". */
const COR_QUADRANTE: Record<Quadrante, string> = {
  vazio_de_acesso: '#7c3aed',
  acesso_pleno: '#059669',
  adocao_acima_do_potencial: '#0284c7',
  baixo_potencial_baixa_adocao: '#94a3b8',
};

/** Fallback de rótulo — o rótulo real vem de quadranteRotulo (backend). */
const ROTULO_FALLBACK: Record<Quadrante, string> = {
  vazio_de_acesso: 'Vazio de Acesso',
  acesso_pleno: 'Acesso pleno',
  adocao_acima_do_potencial: 'Adoção acima do potencial',
  baixo_potencial_baixa_adocao: 'Baixo potencial, baixa adoção',
};

function percentil(valoresOrdenados: number[], p: number): number {
  if (valoresOrdenados.length === 0) return 0;
  const indice = Math.min(
    valoresOrdenados.length - 1,
    Math.max(0, Math.ceil(p * valoresOrdenados.length) - 1),
  );
  return valoresOrdenados[indice];
}

export function GraficoQuadrantes({ dados }: GraficoQuadrantesProps) {
  const {
    pontos,
    rotulos,
    escalaX,
    escalaY,
    ticksX,
    ticksY,
    tetoY,
    totalTruncados,
  } = useMemo(() => {
    const classificados = dados.municipios.filter(
      (
        m,
      ): m is (typeof dados.municipios)[number] & {
        irradiacaoMediaKwhM2Dia: number;
        mmgdResidencialPer1000Hab: number;
        quadrante: Quadrante;
      } =>
        m.quadrante !== null &&
        typeof m.irradiacaoMediaKwhM2Dia === 'number' &&
        typeof m.mmgdResidencialPer1000Hab === 'number',
    );

    // Rótulo real de cada quadrante: primeiro município classificado nele.
    const rotulos = { ...ROTULO_FALLBACK };
    for (const m of classificados) {
      if (m.quadranteRotulo) rotulos[m.quadrante] = m.quadranteRotulo;
    }

    const valoresX = classificados.map((m) => m.irradiacaoMediaKwhM2Dia).sort((a, b) => a - b);
    const valoresY = classificados.map((m) => m.mmgdResidencialPer1000Hab).sort((a, b) => a - b);

    // O eixo Y é MUITO assimétrico (outliers de adoção altíssima achatariam
    // o resto do país numa linha) — truncado no p97,5 SÓ PARA EXIBIÇÃO, com
    // aviso explícito de quantos pontos foram fixados no teto. A mediana
    // nacional (linha) não é afetada: vem pronta do backend.
    const tetoY = Math.max(percentil(valoresY, 0.975), dados.medianaNacional.mmgdResidencialPer1000Hab * 2);
    const minX = valoresX[0] ?? 0;
    const maxX = valoresX[valoresX.length - 1] ?? 1;

    const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;
    const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;
    const escalaX = (v: number) =>
      MARGEM.esquerda + ((v - minX) / (maxX - minX || 1)) * larguraUtil;
    const escalaY = (v: number) =>
      MARGEM.topo + alturaUtil - (Math.min(v, tetoY) / (tetoY || 1)) * alturaUtil;

    const totalTruncados = classificados.filter(
      (m) => m.mmgdResidencialPer1000Hab > tetoY,
    ).length;

    const ticksX = Array.from({ length: 5 }, (_, i) => minX + ((maxX - minX) / 4) * i);
    const ticksY = Array.from({ length: 5 }, (_, i) => (tetoY / 4) * i);

    return {
      pontos: classificados,
      rotulos,
      escalaX,
      escalaY,
      ticksX,
      ticksY,
      tetoY,
      totalTruncados,
    };
  }, [dados]);

  const xMediana = escalaX(dados.medianaNacional.potencialSolarKwhM2Dia);
  const yMediana = escalaY(dados.medianaNacional.mmgdResidencialPer1000Hab);

  const ordemLegenda: Quadrante[] = [
    'vazio_de_acesso',
    'acesso_pleno',
    'adocao_acima_do_potencial',
    'baixo_potencial_baixa_adocao',
  ];

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Dispersão dos municípios por irradiação solar e MMGD residencial per capita, com as medianas nacionais dividindo os quatro quadrantes"
        className="w-full rounded border border-slate-200 bg-white"
      >
        {/* Linhas das medianas nacionais (backend) */}
        <line
          x1={xMediana}
          x2={xMediana}
          y1={MARGEM.topo}
          y2={ALTURA - MARGEM.base}
          stroke="#94a3b8"
          strokeDasharray="4 4"
        />
        <line
          x1={MARGEM.esquerda}
          x2={LARGURA - MARGEM.direita}
          y1={yMediana}
          y2={yMediana}
          stroke="#94a3b8"
          strokeDasharray="4 4"
        />

        {/* Rótulos dos quadrantes (posições fixas nos 4 cantos da área útil) */}
        <text x={LARGURA - MARGEM.direita - 6} y={MARGEM.topo + 14} textAnchor="end" fontSize={10} fill="#0284c7" fontWeight={700}>
          {rotulos.acesso_pleno}
        </text>
        <text x={MARGEM.esquerda + 6} y={MARGEM.topo + 14} fontSize={10} fill="#0284c7" fontWeight={400}>
          {rotulos.adocao_acima_do_potencial}
        </text>
        <text x={MARGEM.esquerda + 6} y={ALTURA - MARGEM.base - 8} fontSize={10} fill="#64748b" fontWeight={400}>
          {rotulos.baixo_potencial_baixa_adocao}
        </text>
        <text x={LARGURA - MARGEM.direita - 6} y={ALTURA - MARGEM.base - 8} textAnchor="end" fontSize={10} fill="#7c3aed" fontWeight={700}>
          {rotulos.vazio_de_acesso}
        </text>

        {/* Pontos — classificação e cor 100% do backend */}
        {pontos.map((m) => (
          <circle
            key={m.codigoIbge}
            cx={escalaX(m.irradiacaoMediaKwhM2Dia)}
            cy={escalaY(m.mmgdResidencialPer1000Hab)}
            r={m.quadrante === 'vazio_de_acesso' ? 2.2 : 1.7}
            fill={COR_QUADRANTE[m.quadrante]}
            fillOpacity={m.quadrante === 'vazio_de_acesso' ? 0.75 : 0.45}
          >
            <title>
              {`${m.nome} (${m.uf}) — ${rotulos[m.quadrante]}\nIrradiação: ${formatarValor(m.irradiacaoMediaKwhM2Dia, 'numero')} kWh/m²·dia · MMGD res.: ${formatarValor(m.mmgdResidencialPer1000Hab, 'numero')} kW/1.000 hab`}
            </title>
          </circle>
        ))}

        {/* Eixos */}
        <line
          x1={MARGEM.esquerda}
          x2={LARGURA - MARGEM.direita}
          y1={ALTURA - MARGEM.base}
          y2={ALTURA - MARGEM.base}
          stroke="#cbd5e1"
        />
        <line
          x1={MARGEM.esquerda}
          x2={MARGEM.esquerda}
          y1={MARGEM.topo}
          y2={ALTURA - MARGEM.base}
          stroke="#cbd5e1"
        />
        {ticksX.map((t) => (
          <text
            key={`x-${t}`}
            x={escalaX(t)}
            y={ALTURA - MARGEM.base + 16}
            textAnchor="middle"
            fontSize={10}
            fill="#64748b"
          >
            {formatarValor(t, 'numero')}
          </text>
        ))}
        {ticksY.map((t) => (
          <text
            key={`y-${t}`}
            x={MARGEM.esquerda - 8}
            y={escalaY(t) + 3}
            textAnchor="end"
            fontSize={10}
            fill="#64748b"
          >
            {formatarValor(t, 'inteiro')}
          </text>
        ))}
        <text
          x={MARGEM.esquerda + (LARGURA - MARGEM.esquerda - MARGEM.direita) / 2}
          y={ALTURA - 8}
          textAnchor="middle"
          fontSize={11}
          fill="#475569"
        >
          {dados.eixoX}
        </text>
        <text
          x={16}
          y={MARGEM.topo + (ALTURA - MARGEM.topo - MARGEM.base) / 2}
          textAnchor="middle"
          fontSize={11}
          fill="#475569"
          transform={`rotate(-90 16 ${MARGEM.topo + (ALTURA - MARGEM.topo - MARGEM.base) / 2})`}
        >
          {dados.eixoY}
        </text>
      </svg>

      {/* Legenda com as contagens do backend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {ordemLegenda.map((q) => (
          <span key={q} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COR_QUADRANTE[q] }}
            />
            {rotulos[q]}{' '}
            <span className="font-mono text-slate-400">
              ({(dados.resumoPorQuadrante[q] ?? 0).toLocaleString('pt-BR')})
            </span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-slate-400">
          Excluídos por falta de dado:{' '}
          <span className="font-mono">
            {dados.avisos.totalExcluidosSemDado.toLocaleString('pt-BR')}
          </span>
        </span>
      </div>

      {totalTruncados > 0 && (
        <p className="text-xs text-slate-400">
          Eixo vertical truncado em {formatarValor(tetoY, 'numero')} kW/1.000 hab (percentil
          97,5) só para exibição — {totalTruncados.toLocaleString('pt-BR')} municípios com
          adoção acima disso aparecem fixados no topo do gráfico. A classificação deles não
          muda com o truncamento.
        </p>
      )}

      {/* O backend EXIGE que a nota acompanhe qualquer exibição da classificação. */}
      <p className="rounded border border-violet-100 bg-violet-50/50 p-3 text-xs leading-relaxed text-slate-600">
        <span className="mb-1 block font-mono text-[10px] font-bold tracking-wider text-violet-700 uppercase">
          Nota metodológica
        </span>
        {dados.notaMetodologica}
      </p>
    </div>
  );
}
