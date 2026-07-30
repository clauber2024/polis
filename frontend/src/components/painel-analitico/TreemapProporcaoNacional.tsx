import { useMemo } from 'react';
import type { VaziosDeAcessoCompleto } from '../../services/vaziosDeAcesso.service';
import type { Quadrante } from '../../types/api';
import { ROTULO_FALLBACK } from './GraficoQuadrantes';

/**
 * Treemap de proporção nacional — "peso orçamentário, não território"
 * (30/07/2026, decisão do usuário, mesma sessão de GraficoRegional/
 * RankingPrioridadeExecutivo/FunilExclusaoHabitacional). SVG próprio, layout
 * "slice" clássico (Shneiderman) escrito à mão — DUAS colunas (Vazios de
 * Acesso por região à esquerda, demais quadrantes consolidados à direita),
 * cada retângulo empilhado dentro da sua coluna. NÃO squarified treemap
 * genérico (aspecto menos "bonito" que uma libs como Recharts/d3, mas a
 * matemática de proporção de ÁREA é a mesma — largura da coluna ∝ peso do
 * grupo, altura dentro da coluna ∝ peso do item no grupo, logo área de cada
 * bloco = peso real do item sobre o total, sempre). NÃO Recharts nem
 * lucide-react (mesma decisão já registrada em GraficoQuadrantes.tsx).
 *
 * Dados: contagem real de `dados.municipios` por região (dentro de Vazio de
 * Acesso) e por quadrante (fora dele) — nenhum valor fabricado, diferente do
 * rascunho original que tinha números de exemplo. "Fundo silenciado": os 3
 * quadrantes fora de Vazio de Acesso usam cinza fixo (stone), não a paleta
 * semântica normal de COR_QUADRANTE (que aqui misturaria classificação com
 * "não é o foco desta tela") — decisão de design explícita do usuário.
 */

interface TreemapProporcaoNacionalProps {
  dados: VaziosDeAcessoCompleto;
}

const LARGURA = 760;
const ALTURA = 420;
const LARGURA_MIN_TEXTO = 90;
const ALTURA_MIN_TEXTO = 34;

const QUADRANTES_OUTROS: Quadrante[] = [
  'acesso_pleno',
  'adocao_acima_do_potencial',
  'baixo_potencial_baixa_adocao',
];

const CINZA_OUTROS = ['#e7e5e4', '#d6d3d1', '#a8a29e']; // stone-200/300/400, mais escuro = mais volume
const VERMELHO_CRITICO = '#b91c1c';
const VERMELHO_ALERTA = '#ef4444';

const formatoPercentual = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

interface BlocoTreemap {
  id: string;
  rotulo: string;
  valor: number;
  cor: string;
  corTexto: string;
  legenda: string;
}

interface RetanguloTreemap extends BlocoTreemap {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Empilha uma lista de blocos verticalmente dentro de uma coluna de largura fixa — cada altura ∝ valor/somaDaColuna. */
function empilhar(blocos: BlocoTreemap[], x: number, largura: number, somaColuna: number): RetanguloTreemap[] {
  let yAcumulado = 0;
  return blocos.map((bloco) => {
    const alturaBloco = somaColuna > 0 ? (bloco.valor / somaColuna) * ALTURA : 0;
    const retangulo: RetanguloTreemap = { ...bloco, x, y: yAcumulado, width: largura, height: alturaBloco };
    yAcumulado += alturaBloco;
    return retangulo;
  });
}

export function TreemapProporcaoNacional({ dados }: TreemapProporcaoNacionalProps) {
  const { retangulos, totalVazios, totalGeral } = useMemo(() => {
    const vaziosPorRegiao = new Map<string, number>();
    const outrosPorQuadrante = new Map<Quadrante, number>();

    for (const m of dados.municipios) {
      if (m.quadrante === 'vazio_de_acesso') {
        vaziosPorRegiao.set(m.regiao, (vaziosPorRegiao.get(m.regiao) ?? 0) + 1);
      } else if (m.quadrante && QUADRANTES_OUTROS.includes(m.quadrante)) {
        outrosPorQuadrante.set(m.quadrante, (outrosPorQuadrante.get(m.quadrante) ?? 0) + 1);
      }
    }

    const totalVazios = [...vaziosPorRegiao.values()].reduce((a, b) => a + b, 0);
    const totalOutros = [...outrosPorQuadrante.values()].reduce((a, b) => a + b, 0);
    const totalGeral = totalVazios + totalOutros;

    if (totalGeral === 0) return { retangulos: [] as RetanguloTreemap[], totalVazios, totalGeral };

    const blocosVazios: BlocoTreemap[] = [...vaziosPorRegiao.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([regiao, valor], indice) => ({
        id: `vazio-${regiao}`,
        rotulo: regiao,
        valor,
        cor: indice === 0 ? VERMELHO_CRITICO : VERMELHO_ALERTA,
        corTexto: '#ffffff',
        legenda: `${formatoPercentual.format((valor / totalVazios) * 100)}% da exclusão nacional`,
      }));

    const blocosOutros: BlocoTreemap[] = QUADRANTES_OUTROS.filter((q) => (outrosPorQuadrante.get(q) ?? 0) > 0)
      .sort((a, b) => (outrosPorQuadrante.get(b) ?? 0) - (outrosPorQuadrante.get(a) ?? 0))
      .map((quadrante, indice) => {
        const valor = outrosPorQuadrante.get(quadrante) ?? 0;
        return {
          id: `outro-${quadrante}`,
          rotulo: ROTULO_FALLBACK[quadrante],
          valor,
          cor: CINZA_OUTROS[Math.min(indice, CINZA_OUTROS.length - 1)],
          corTexto: '#44403c',
          legenda: `${formatoPercentual.format((valor / totalOutros) * 100)}% dos demais quadrantes`,
        };
      });

    const larguraVazios = LARGURA * (totalVazios / totalGeral);
    const larguraOutros = LARGURA - larguraVazios;

    const retangulos = [
      ...empilhar(blocosVazios, 0, larguraVazios, totalVazios),
      ...empilhar(blocosOutros, larguraVazios, larguraOutros, totalOutros),
    ];

    return { retangulos, totalVazios, totalGeral };
  }, [dados]);

  if (totalGeral === 0) {
    return <p className="text-sm text-stone-500">Nenhum município classificado para montar o treemap.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-xs leading-relaxed text-stone-500">
        Cada bloco vale sua proporção real de municípios, não seu tamanho no mapa — a coluna
        vermelha (
        {formatoPercentual.format((totalVazios / totalGeral) * 100)}% do total classificado) é o
        peso nacional de Vazio de Acesso, aberto por região; o cinza é o resto do país, só para dar
        escala.
      </p>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Treemap da proporção nacional de Vazios de Acesso por região, contra os demais quadrantes consolidados"
        className="w-full bg-white"
      >
        {retangulos.map((r) => {
          const mostrarTexto = r.width > LARGURA_MIN_TEXTO && r.height > ALTURA_MIN_TEXTO;
          return (
            <g key={r.id}>
              <rect
                x={r.x}
                y={r.y}
                width={Math.max(r.width, 0)}
                height={Math.max(r.height, 0)}
                fill={r.cor}
                stroke="#ffffff"
                strokeWidth={2}
              >
                <title>{`${r.rotulo}: ${r.valor.toLocaleString('pt-BR')} municípios — ${r.legenda}`}</title>
              </rect>
              {mostrarTexto && (
                <>
                  <text x={r.x + 12} y={r.y + 22} fontSize={12} fontWeight={800} fill={r.corTexto}>
                    {r.rotulo}
                  </text>
                  <text
                    x={r.x + 12}
                    y={r.y + 38}
                    fontSize={10}
                    fontWeight={700}
                    fill={r.corTexto}
                    opacity={0.85}
                  >
                    {r.valor.toLocaleString('pt-BR')} municípios — {r.legenda}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
