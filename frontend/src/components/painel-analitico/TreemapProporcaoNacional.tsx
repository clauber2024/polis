import { useMemo } from 'react';
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
 * Hierarquia de 3 níveis (30/07/2026, pedido explícito do usuário — revisão
 * do aninhamento por UF da mesma sessão): Nível 1 = Quadrante (a própria
 * divisão em 2 colunas: Vazios de Acesso à esquerda, os 3 demais à
 * direita), Nível 2 = Região (dentro da coluna de Vazios, cada região vira
 * um bloco com CONTORNO BRANCO GROSSO — `variante: 'regiao'` abaixo — e o
 * nome estampado no canto superior, reaproveitando a MESMA geometria já
 * calculada para posicionar os estados, não uma segunda passada), Nível 3 =
 * Estado (fatias finas dentro de cada região, separadas por linhas brancas
 * translúcidas mais finas que o contorno da região — hierarquia visual
 * clara: contorno grosso = fronteira de região, linha fina = fronteira de
 * estado). **Decisão do usuário**: no lado direito (quadrantes "outros",
 * neutros), os Níveis 2 e 3 são DELIBERADAMENTE silenciados — não é uma
 * limitação técnica, é a mesma contagem real por região/UF que dá para
 * calcular ali também, só que esses quadrantes não são alvo de política
 * pública e abrir a mesma granularidade lá poluiria a tela sem ganho.
 *
 * Drill-down (decisão de UX, 30/07/2026 — SEGUNDA resposta do usuário,
 * substitui a primeira): clicar num bloco de UF (Nível 3) chama
 * `aoClicarEstado(uf)`, que o pai (PainelAnalitico.tsx) usa para FILTRAR
 * RankingPrioridadeExecutivo na mesma tela, sem navegar para fora — mantém
 * o usuário no contexto macro em vez de saltar direto para o mapa (essa foi
 * a primeira resposta, já implementada e depois substituída; o deep-link
 * `/mapa?uf=` continua existindo em PaginaMapa.tsx, só não é mais o gatilho
 * deste clique — RankingPrioridadeExecutivo oferece um link explícito para
 * quem quiser a exploração espacial a partir da lista já filtrada). Blocos
 * de região (Nível 2, só contorno) e de quadrante "outros" (Nível 1 da
 * coluna direita) não são clicáveis — região agrega vários estados, e
 * "outros" não é o foco da política.
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
  /** Chamado ao clicar num bloco de estado (Nível 3) — o pai decide o que fazer (hoje: filtra RankingPrioridadeExecutivo). */
  aoClicarEstado: (uf: string) => void;
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
  variante: 'coluna' | 'uf' | 'regiao';
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

export function TreemapProporcaoNacional({ dados, aoClicarEstado }: TreemapProporcaoNacionalProps) {
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

    // Nível 2 — contorno + rótulo de região, por CIMA das fatias de estado
    // (mesma geometria de regioesComGeometria, só reetiquetada para o
    // renderer desenhar como moldura, não como preenchimento).
    const contornosRegiao: RetanguloTreemap[] = regioesComGeometria.map((r) => ({
      ...r,
      id: `contorno-${r.id}`,
      legenda: `${formatoPercentual.format((r.valor / totalVazios) * 100)}% da exclusão nacional`,
      variante: 'regiao' as const,
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
          variante: 'coluna' as const,
        };
      });

    // Ordem importa: contornosRegiao depois de retangulosUf para desenhar a
    // moldura de região POR CIMA do preenchimento dos estados (SVG empilha
    // por ordem de aparição — mesma lógica de camadas já usada no mapa,
    // CAMADA_ESTADO_DESTACADO acima do choropleth).
    const retangulos = [
      ...retangulosUf,
      ...contornosRegiao,
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
        é o resto do país, só para dar escala. Clique num estado para filtrar a lista de prioridade
        abaixo.
      </p>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Treemap da proporção nacional de Vazios de Acesso por região e estado, contra os demais quadrantes consolidados"
        className="w-full bg-white"
      >
        {retangulos.map((r) => {
          // Nível 2 (contorno de região) — moldura por cima das fatias de
          // estado, sem preenchimento próprio e sem clique (região agrega
          // vários estados, não é um recorte de ação único).
          if (r.variante === 'regiao') {
            const mostrarRotulo = r.width > 60 && r.height > 24;
            return (
              <g key={r.id}>
                <rect
                  x={r.x}
                  y={r.y}
                  width={Math.max(r.width, 0)}
                  height={Math.max(r.height, 0)}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={3}
                >
                  <title>{`Região ${r.rotulo}: ${r.valor.toLocaleString('pt-BR')} municípios em Vazio de Acesso — ${r.legenda}`}</title>
                </rect>
                {mostrarRotulo && (
                  <text
                    x={r.x + 8}
                    y={r.y + 16}
                    fontSize={10}
                    fontWeight={800}
                    letterSpacing={1}
                    fill="rgba(255,255,255,0.95)"
                    style={{ textTransform: 'uppercase' }}
                  >
                    {r.rotulo}
                  </text>
                )}
              </g>
            );
          }

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
              onClick={ehUf && r.uf ? () => aoClicarEstado(r.uf as string) : undefined}
              onKeyDown={
                ehUf && r.uf
                  ? (evento) => {
                      if (evento.key === 'Enter' || evento.key === ' ') aoClicarEstado(r.uf as string);
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
