import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaziosDeAcessoCompleto } from '../../services/vaziosDeAcesso.service';
import type { Quadrante } from '../../types/api';
import { ROTULO_FALLBACK } from './GraficoQuadrantes';

/**
 * Treemap de proporção nacional — "peso orçamentário, não território"
 * (30/07/2026, decisão do usuário, mesma sessão de GraficoRegional/
 * RankingPrioridadeExecutivo/FunilExclusaoHabitacional). SVG próprio, layout
 * "slice" clássico (Shneiderman) escrito à mão — DUAS colunas (Vazios de
 * Acesso à esquerda, demais quadrantes consolidados à direita). NÃO
 * squarified treemap genérico (aspecto menos "bonito" que Recharts/d3, mas
 * a matemática de proporção de ÁREA é a mesma — largura ∝ peso do grupo,
 * altura ∝ peso do item no grupo, aplicada recursivamente = área de cada
 * bloco final é sempre o peso real sobre o total). NÃO Recharts nem
 * lucide-react (mesma decisão já registrada em GraficoQuadrantes.tsx).
 *
 * Aninhamento por UF (30/07/2026, mesma sessão — pedido do usuário): a
 * coluna de Vazios de Acesso ganhou um segundo nível — cada região é
 * subdividida pelos seus estados, empilhados dentro do mesmo espaço
 * vertical da região (reaproveita `empilhar` recursivamente, preservando a
 * mesma invariante de área). Os blocos de UF não têm preenchimento
 * "container" de região por baixo — a coesão visual da região vem só da
 * paleta compartilhada (crítico = vermelho forte, alerta = vermelho claro)
 * e de linhas brancas translúcidas mais finas que as da coluna "outros".
 *
 * Drill-down (decisão de UX, 30/07/2026): clicar num bloco de UF navega
 * para `/mapa?uf=<sigla>` — reaproveita 100% a mecânica já existente de
 * "clicar num estado no mapa" (RF-027/028, PaginaMapa.tsx), NÃO abre uma
 * listagem nova: o Ranking estadual (aba já existente no mapa) já É a
 * "listagem de ação focada só no estado" que faria sentido aqui. Blocos de
 * quadrante "outros" (coluna direita) não navegam — não representam um
 * recorte territorial único.
 *
 * Dados: contagem real de `dados.municipios` por região × UF (dentro de
 * Vazio de Acesso) e por quadrante (fora dele) — nenhum valor fabricado.
 * "Fundo silenciado": os 3 quadrantes fora de Vazio de Acesso usam cinza
 * fixo (stone), não a paleta semântica normal de COR_QUADRANTE (que aqui
 * misturaria classificação com "não é o foco desta tela") — decisão de
 * design explícita do usuário.
 */

interface TreemapProporcaoNacionalProps {
  dados: VaziosDeAcessoCompleto;
}

const LARGURA = 760;
const ALTURA = 420;
const LARGURA_MIN_TEXTO = 90;
const ALTURA_MIN_TEXTO = 34;
const LARGURA_MIN_TEXTO_UF = 34;
const ALTURA_MIN_TEXTO_UF = 20;

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
  variante: 'coluna' | 'uf';
  uf?: string;
}

interface RetanguloTreemap extends BlocoTreemap {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Empilha uma lista de blocos verticalmente dentro de uma faixa [yInicio, yInicio+alturaDisponivel) — cada altura ∝ valor/somaDaFaixa. Chamada recursivamente para aninhar UF dentro de região. */
function empilhar(
  blocos: BlocoTreemap[],
  x: number,
  largura: number,
  yInicio: number,
  alturaDisponivel: number,
  somaFaixa: number,
): RetanguloTreemap[] {
  let yAcumulado = yInicio;
  return blocos.map((bloco) => {
    const alturaBloco = somaFaixa > 0 ? (bloco.valor / somaFaixa) * alturaDisponivel : 0;
    const retangulo: RetanguloTreemap = { ...bloco, x, y: yAcumulado, width: largura, height: alturaBloco };
    yAcumulado += alturaBloco;
    return retangulo;
  });
}

export function TreemapProporcaoNacional({ dados }: TreemapProporcaoNacionalProps) {
  const navigate = useNavigate();

  const { retangulos, totalVazios, totalGeral } = useMemo(() => {
    const vaziosPorRegiaoUf = new Map<string, Map<string, number>>();
    const outrosPorQuadrante = new Map<Quadrante, number>();

    for (const m of dados.municipios) {
      if (m.quadrante === 'vazio_de_acesso') {
        const porUf = vaziosPorRegiaoUf.get(m.regiao) ?? new Map<string, number>();
        porUf.set(m.uf, (porUf.get(m.uf) ?? 0) + 1);
        vaziosPorRegiaoUf.set(m.regiao, porUf);
      } else if (m.quadrante && QUADRANTES_OUTROS.includes(m.quadrante)) {
        outrosPorQuadrante.set(m.quadrante, (outrosPorQuadrante.get(m.quadrante) ?? 0) + 1);
      }
    }

    const totalPorRegiao = [...vaziosPorRegiaoUf.entries()].map(
      ([regiao, porUf]) => [regiao, [...porUf.values()].reduce((a, b) => a + b, 0)] as const,
    );
    const totalVazios = totalPorRegiao.reduce((a, [, v]) => a + v, 0);
    const totalOutros = [...outrosPorQuadrante.values()].reduce((a, b) => a + b, 0);
    const totalGeral = totalVazios + totalOutros;

    if (totalGeral === 0) return { retangulos: [] as RetanguloTreemap[], totalVazios, totalGeral };

    const larguraVazios = LARGURA * (totalVazios / totalGeral);
    const larguraOutros = LARGURA - larguraVazios;

    // Regiões ordenadas pela pior primeiro — a mais volumosa define o tom
    // "crítico"; as demais, o tom "alerta". Só geometria (não renderizada
    // como bloco próprio — a coesão visual vem dos blocos de UF por baixo).
    const regioesOrdenadas = [...totalPorRegiao].sort((a, b) => b[1] - a[1]);
    const regioesComGeometria = empilhar(
      regioesOrdenadas.map(([regiao, valor], indice) => ({
        id: `regiao-${regiao}`,
        rotulo: regiao,
        valor,
        cor: indice === 0 ? VERMELHO_CRITICO : VERMELHO_ALERTA,
        corTexto: '#ffffff',
        legenda: '',
        variante: 'coluna' as const,
      })),
      0,
      larguraVazios,
      0,
      ALTURA,
      totalVazios,
    );

    const retangulosUf = regioesComGeometria.flatMap((regiaoRect) => {
      const porUf = vaziosPorRegiaoUf.get(regiaoRect.rotulo) ?? new Map<string, number>();
      const ufsOrdenadas: BlocoTreemap[] = [...porUf.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([uf, valor]) => ({
          id: `uf-${uf}`,
          rotulo: uf,
          valor,
          cor: regiaoRect.cor,
          corTexto: '#ffffff',
          legenda: `${formatoPercentual.format((valor / regiaoRect.valor) * 100)}% da região ${regiaoRect.rotulo} · ${formatoPercentual.format((valor / totalVazios) * 100)}% da exclusão nacional`,
          variante: 'uf' as const,
          uf,
        }));
      return empilhar(ufsOrdenadas, 0, larguraVazios, regiaoRect.y, regiaoRect.height, regiaoRect.valor);
    });

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
          variante: 'coluna' as const,
        };
      });

    const retangulos = [
      ...retangulosUf,
      ...empilhar(blocosOutros, larguraVazios, larguraOutros, 0, ALTURA, totalOutros),
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
        vermelha ({formatoPercentual.format((totalVazios / totalGeral) * 100)}% do total
        classificado) é o peso nacional de Vazio de Acesso, aberta por região e por estado; o cinza
        é o resto do país, só para dar escala. Clique num estado para abrir o ranking dele no mapa.
      </p>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Treemap da proporção nacional de Vazios de Acesso por região e estado, contra os demais quadrantes consolidados"
        className="w-full bg-white"
      >
        {retangulos.map((r) => {
          const ehUf = r.variante === 'uf';
          const larguraMinima = ehUf ? LARGURA_MIN_TEXTO_UF : LARGURA_MIN_TEXTO;
          const alturaMinima = ehUf ? ALTURA_MIN_TEXTO_UF : ALTURA_MIN_TEXTO;
          const mostrarTexto = r.width > larguraMinima && r.height > alturaMinima;
          return (
            <g
              key={r.id}
              role={ehUf ? 'button' : undefined}
              tabIndex={ehUf ? 0 : undefined}
              className={ehUf ? 'cursor-pointer outline-none' : undefined}
              onClick={ehUf && r.uf ? () => navigate(`/mapa?uf=${r.uf}`) : undefined}
              onKeyDown={
                ehUf && r.uf
                  ? (evento) => {
                      if (evento.key === 'Enter' || evento.key === ' ') navigate(`/mapa?uf=${r.uf}`);
                    }
                  : undefined
              }
            >
              <rect
                x={r.x}
                y={r.y}
                width={Math.max(r.width, 0)}
                height={Math.max(r.height, 0)}
                fill={r.cor}
                stroke="#ffffff"
                strokeOpacity={ehUf ? 0.5 : 1}
                strokeWidth={ehUf ? 1 : 2}
                className={ehUf ? 'transition-opacity hover:opacity-80' : undefined}
              >
                <title>
                  {ehUf
                    ? `${r.rotulo}: ${r.valor.toLocaleString('pt-BR')} municípios em Vazio de Acesso — ${r.legenda} — clique para abrir no mapa`
                    : `${r.rotulo}: ${r.valor.toLocaleString('pt-BR')} municípios — ${r.legenda}`}
                </title>
              </rect>
              {mostrarTexto && ehUf && (
                <text
                  x={r.x + r.width / 2}
                  y={r.y + r.height / 2 + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={800}
                  fill={r.corTexto}
                >
                  {r.rotulo}
                </text>
              )}
              {mostrarTexto && !ehUf && (
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
