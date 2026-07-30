import { useMemo } from 'react';
import type { VaziosDeAcessoCompleto } from '../../services/vaziosDeAcesso.service';
import { COR_QUADRANTE } from './GraficoQuadrantes';

/**
 * Funil da Dupla Exclusão — diagrama de fluxo (estilo Sankey) da Visão
 * Executiva (30/07/2026, decisão do usuário, mesma sessão de
 * GraficoRegional/RankingPrioridadeExecutivo). SVG próprio, layout de 3
 * colunas escrito à mão para esta topologia fixa (1 raiz → 2 nós → 2 nós) —
 * NÃO um algoritmo de Sankey genérico nem `Recharts` (sem essa lib no
 * projeto, mesma decisão já registrada em GraficoQuadrantes.tsx).
 *
 * Todos os números vêm de `dados.municipios` (já carregado por inteiro para
 * a aba Visão Executiva) — nenhum valor fabricado. Diferente do rascunho
 * original (que usava dados inventados de exemplo), o funil aqui é:
 *
 *   Vazios de Acesso (quadrante oficial, RF-055)
 *     → classificacaoIvsh 'muito_alto'/'alto' vs. o restante (quintil de
 *       IVSH DENTRO do quadrante — só populado pelo endpoint paginado, ver
 *       docstring de ClassificacaoIvsh em types/api.ts)
 *       → alertaDeficitCredito true/false (lente já calculada pelo backend:
 *         Vazio de Acesso E ausência de contrato Reforma Casa Brasil Solar —
 *         ver types/api.ts, MunicipioClassificado.alertaDeficitCredito)
 *
 * Único caminho colorido de vermelho (largura SEMPRE proporcional ao valor
 * real, nunca engrossada artificialmente) é literalmente o achado já
 * registrado em CLAUDE.md ("Auditoria analítica moradia×solar e IVSH",
 * 18/07/2026): precariedade habitacional alta correlaciona com MENOS
 * contrato de financiamento, não mais.
 */

interface FunilExclusaoHabitacionalProps {
  dados: VaziosDeAcessoCompleto;
}

const LARGURA = 760;
const ALTURA = 440;
const MARGEM_VERT = 16;
const GAP_VERTICAL = 28;
const LARGURA_NO = 10;
const COL0_X = 6;
const COL1_X = 300;
const COL2_X = 600;

const COR_ALTA_VULNERABILIDADE = '#991b1b';
const COR_MODERADA = '#a8a29e';
const COR_SEM_FINANCIAMENTO = '#7f1d1d';
const COR_COM_FINANCIAMENTO = COR_QUADRANTE.acesso_pleno;
const COR_LINK_NEUTRO = '#d6d3d1';

const formatoPercentual = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

interface Banda {
  y0: number;
  y1: number;
}

function centro(b: Banda): number {
  return (b.y0 + b.y1) / 2;
}

function altura(b: Banda): number {
  return b.y1 - b.y0;
}

export function FunilExclusaoHabitacional({ dados }: FunilExclusaoHabitacionalProps) {
  const calculo = useMemo(() => {
    const vazios = dados.municipios.filter((m) => m.quadrante === 'vazio_de_acesso');
    const totalVazios = vazios.length;

    const altaVulnerabilidade = vazios.filter(
      (m) => m.classificacaoIvsh === 'muito_alto' || m.classificacaoIvsh === 'alto',
    );
    const moderadaOuBaixa = vazios.filter(
      (m) => m.classificacaoIvsh !== 'muito_alto' && m.classificacaoIvsh !== 'alto',
    );

    const n1 = altaVulnerabilidade.length;
    const n2 = moderadaOuBaixa.length;
    const n1a = altaVulnerabilidade.filter((m) => m.alertaDeficitCredito).length; // sem financiamento
    const n1b = n1 - n1a; // com financiamento
    const n2a = moderadaOuBaixa.filter((m) => m.alertaDeficitCredito).length;
    const n2b = n2 - n2a;

    return { totalVazios, n1, n2, n1a, n1b, n2a, n2b };
  }, [dados]);

  const { totalVazios, n1, n2, n1a, n1b, n2a, n2b } = calculo;

  if (totalVazios === 0) {
    return (
      <p className="text-sm text-stone-500">
        Nenhum município classificado em Vazio de Acesso para montar o funil.
      </p>
    );
  }

  const alturaUtil = ALTURA - MARGEM_VERT * 2;
  const escala = (alturaUtil - GAP_VERTICAL) / totalVazios;

  // Coluna 0: um único nó (Vazios de Acesso), centralizado no mesmo espaço
  // vertical usado pelas colunas de 2 nós.
  const no0: Banda = { y0: MARGEM_VERT + GAP_VERTICAL / 2, y1: MARGEM_VERT + GAP_VERTICAL / 2 + totalVazios * escala };

  // Coluna 1: Alta vulnerabilidade (topo) / Moderada-baixa (base).
  const no1: Banda = { y0: MARGEM_VERT, y1: MARGEM_VERT + n1 * escala };
  const no2: Banda = { y0: no1.y1 + GAP_VERTICAL, y1: no1.y1 + GAP_VERTICAL + n2 * escala };

  // Coluna 2: Sem financiamento (topo) / Com financiamento (base).
  const no3: Banda = { y0: MARGEM_VERT, y1: MARGEM_VERT + (n1a + n2a) * escala };
  const no4: Banda = { y0: no3.y1 + GAP_VERTICAL, y1: no3.y1 + GAP_VERTICAL + (n1b + n2b) * escala };

  // Bandas de saída do nó raiz (empilhadas na mesma ordem dos nós da coluna 1).
  const banda_0_1: Banda = { y0: no0.y0, y1: no0.y0 + n1 * escala };
  const banda_0_2: Banda = { y0: banda_0_1.y1, y1: no0.y1 };

  // Bandas de saída de cada nó da coluna 1 (empilhadas na ordem dos nós da coluna 2).
  const banda_1_3: Banda = { y0: no1.y0, y1: no1.y0 + n1a * escala };
  const banda_1_4: Banda = { y0: banda_1_3.y1, y1: no1.y1 };
  const banda_2_3: Banda = { y0: no2.y0, y1: no2.y0 + n2a * escala };
  const banda_2_4: Banda = { y0: banda_2_3.y1, y1: no2.y1 };

  // Bandas de entrada de cada nó da coluna 2 (empilhadas na mesma ordem das origens).
  const banda_3_de1: Banda = { y0: no3.y0, y1: no3.y0 + n1a * escala };
  const banda_3_de2: Banda = { y0: banda_3_de1.y1, y1: no3.y1 };
  const banda_4_de1: Banda = { y0: no4.y0, y1: no4.y0 + n1b * escala };
  const banda_4_de2: Banda = { y0: banda_4_de1.y1, y1: no4.y1 };

  function caminho(x0: number, bandaOrigem: Banda, x1: number, bandaDestino: Banda) {
    const y0 = centro(bandaOrigem);
    const y1 = centro(bandaDestino);
    const xMeio = (x0 + x1) / 2;
    return `M${x0},${y0} C${xMeio},${y0} ${xMeio},${y1} ${x1},${y1}`;
  }

  const percentualSemFinanciamentoAltaVulnerabilidade = n1 > 0 ? (n1a / n1) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Filete "escoando" do caminho crítico — CSS puro, sem lib de animação. */}
      <style>{`
        @keyframes funilFluxoCritico {
          0% { stroke-dashoffset: 36; }
          100% { stroke-dashoffset: 0; }
        }
        .funil-fluxo-critico {
          animation: funilFluxoCritico 1.2s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .funil-fluxo-critico {
            animation: none;
          }
        }
      `}</style>

      <p className="max-w-2xl text-xs leading-relaxed text-stone-500">
        Dos {totalVazios.toLocaleString('pt-BR')} municípios em Vazio de Acesso, veja onde a
        exclusão escoa: quantos têm alta vulnerabilidade habitacional (IVSH) e, entre esses,
        quantos nunca tiveram nenhum contrato do Reforma Casa Brasil Solar.
      </p>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Funil de exclusão: Vazios de Acesso, divididos por vulnerabilidade habitacional (IVSH) e por acesso a financiamento do Reforma Casa Brasil Solar"
        className="w-full bg-white"
      >
        {/* Links — cor vermelha só no caminho crítico (alta vulnerabilidade →
            sem financiamento); largura sempre proporcional ao valor real, nunca
            engrossada artificialmente. */}
        <path
          d={caminho(COL0_X + LARGURA_NO, banda_0_1, COL1_X, no1)}
          fill="none"
          stroke={COR_ALTA_VULNERABILIDADE}
          strokeOpacity={0.28}
          strokeWidth={Math.max(altura(banda_0_1), 0)}
        />
        <path
          d={caminho(COL0_X + LARGURA_NO, banda_0_2, COL1_X, no2)}
          fill="none"
          stroke={COR_LINK_NEUTRO}
          strokeOpacity={0.45}
          strokeWidth={Math.max(altura(banda_0_2), 0)}
        />
        {/* Caminho crítico (alta vulnerabilidade → sem financiamento) — contraste
            máximo (30/07/2026, feedback do usuário): opacidade alta e sólida no
            vermelho institucional, contra os demais fluxos em stone-300 discreto
            (a versão anterior tinha o crítico MENOS opaco que os neutros, invertido
            do que fazia sentido). Filete pontilhado por cima "escoando" da esquerda
            para a direita via CSS puro — decorativo, não altera a largura real (que
            continua sempre proporcional ao valor). */}
        <path
          d={caminho(COL1_X + LARGURA_NO, banda_1_3, COL2_X, banda_3_de1)}
          fill="none"
          stroke={COR_QUADRANTE.vazio_de_acesso}
          strokeOpacity={0.75}
          strokeWidth={Math.max(altura(banda_1_3), 0)}
        >
          <title>
            {`Caminho crítico: alta vulnerabilidade habitacional → sem financiamento (${n1a.toLocaleString('pt-BR')} municípios, ${formatoPercentual.format(percentualSemFinanciamentoAltaVulnerabilidade)}% dos de alta vulnerabilidade)`}
          </title>
        </path>
        <path
          d={caminho(COL1_X + LARGURA_NO, banda_1_3, COL2_X, banda_3_de1)}
          fill="none"
          stroke="#fca5a5"
          strokeWidth={Math.min(4, Math.max(altura(banda_1_3), 0))}
          strokeDasharray="12 24"
          strokeLinecap="round"
          className="funil-fluxo-critico"
          opacity={0.85}
          aria-hidden="true"
        />
        <path
          d={caminho(COL1_X + LARGURA_NO, banda_1_4, COL2_X, banda_4_de1)}
          fill="none"
          stroke={COR_LINK_NEUTRO}
          strokeOpacity={0.45}
          strokeWidth={Math.max(altura(banda_1_4), 0)}
        />
        <path
          d={caminho(COL1_X + LARGURA_NO, banda_2_3, COL2_X, banda_3_de2)}
          fill="none"
          stroke={COR_LINK_NEUTRO}
          strokeOpacity={0.45}
          strokeWidth={Math.max(altura(banda_2_3), 0)}
        />
        <path
          d={caminho(COL1_X + LARGURA_NO, banda_2_4, COL2_X, banda_4_de2)}
          fill="none"
          stroke={COR_LINK_NEUTRO}
          strokeOpacity={0.45}
          strokeWidth={Math.max(altura(banda_2_4), 0)}
        />

        {/* Nós */}
        <NoSankey x={COL0_X} banda={no0} cor={COR_QUADRANTE.vazio_de_acesso} rotulo="Vazios de Acesso" valor={totalVazios} />
        <NoSankey x={COL1_X} banda={no1} cor={COR_ALTA_VULNERABILIDADE} rotulo="Alta vulnerabilidade habitacional (IVSH)" valor={n1} />
        <NoSankey x={COL1_X} banda={no2} cor={COR_MODERADA} rotulo="Vulnerabilidade habitacional moderada/baixa" valor={n2} />
        <NoSankey x={COL2_X} banda={no3} cor={COR_SEM_FINANCIAMENTO} rotulo="Sem contrato (Reforma Casa Brasil Solar)" valor={n1a + n2a} />
        <NoSankey x={COL2_X} banda={no4} cor={COR_COM_FINANCIAMENTO} rotulo="Com contrato (Reforma Casa Brasil Solar)" valor={n1b + n2b} />
      </svg>

      <p className="text-xs text-stone-400">
        "Sem contrato" usa a lente <code>alertaDeficitCredito</code> já calculada pelo backend —
        ausência de contrato no recorte de nov/2025–abr/2026 do Reforma Casa Brasil Solar (fonte
        pontual, não série contínua; ver nota metodológica completa em /vazios-de-acesso). Não
        significa "nunca vai receber financiamento", só que não recebeu neste recorte.
      </p>
    </div>
  );
}

interface NoSankeyProps {
  x: number;
  banda: Banda;
  cor: string;
  rotulo: string;
  valor: number;
}

function NoSankey({ x, banda, cor, rotulo, valor }: NoSankeyProps) {
  const alturaNo = Math.max(altura(banda), 0);
  return (
    <g>
      <rect x={x} y={banda.y0} width={LARGURA_NO} height={alturaNo} fill={cor} rx={2}>
        <title>{`${rotulo}: ${valor.toLocaleString('pt-BR')} municípios`}</title>
      </rect>
      <text
        x={x + LARGURA_NO + 10}
        y={banda.y0 + alturaNo / 2 - 6}
        fontSize={11}
        fontWeight={800}
        fill="#1c1917"
      >
        {rotulo}
      </text>
      <text
        x={x + LARGURA_NO + 10}
        y={banda.y0 + alturaNo / 2 + 9}
        fontSize={10}
        fontWeight={700}
        fill="#78716c"
      >
        {valor.toLocaleString('pt-BR')} municípios
      </text>
    </g>
  );
}
