import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
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

/**
 * Filtro de segmento do funil (30/07/2026, pedido do usuário: cliques nos
 * nós/links devem filtrar RankingPrioridadeExecutivo, mesmo padrão já
 * usado no clique de estado do Treemap). Dois eixos independentes —
 * `vulnerabilidade` (classificacaoIvsh alto/muito_alto vs. o resto) e
 * `financiamento` (alertaDeficitCredito) — combináveis com AND. `null` em
 * qualquer eixo = "todos" nesse eixo. Clicar num NÓ define só o eixo que
 * ele representa (limpa o outro); clicar num LINK define os dois de uma
 * vez (a combinação exata daquele fluxo). Exportado daqui porque este
 * arquivo é o "dono" da definição dos segmentos — RankingPrioridadeExecutivo
 * e PainelAnalitico.tsx só consomem o tipo.
 */
export interface FiltroFunil {
  vulnerabilidade: 'alta' | 'moderada' | null;
  financiamento: 'sem' | 'com' | null;
}

export const FILTRO_FUNIL_VAZIO: FiltroFunil = { vulnerabilidade: null, financiamento: null };

interface FunilExclusaoHabitacionalProps {
  dados: VaziosDeAcessoCompleto;
  /** Chamado ao clicar num nó/link — o pai decide o que fazer (hoje: filtra RankingPrioridadeExecutivo). */
  aoClicarSegmento: (filtro: FiltroFunil) => void;
  /** Filtro ativo no momento — usado só para destacar visualmente o segmento selecionado. */
  filtroAtivo: FiltroFunil;
}

/**
 * Layout (30/07/2026, correção de bug real reportado pelo usuário: rótulos
 * da coluna 2 cortados na borda direita do viewBox). Causa: o preenchimento
 * `overflow: hidden` que o próprio SVG raiz aplica por padrão faz qualquer
 * texto que ultrapasse `LARGURA` desaparecer, sem aviso — não é a mesma
 * classe de bug de `margin` do Recharts (este componente não usa Recharts,
 * ver docstring do arquivo), mas o efeito relatado ("corta o texto") é o
 * mesmo: faltava espaço reservado à direita de cada nó. Duas correções
 * juntas, para não depender de estimativa exata de largura de fonte: (1)
 * LARGURA subiu de 760 para 900 e as colunas foram espaçadas para sobrar
 * ~280px de rótulo depois do último nó (equivalente ao "margin right" que
 * faria sentido numa lib de gráfico); (2) rótulos longos quebram em várias
 * linhas via `quebrarRotulo` (abaixo) em vez de depender só da largura —
 * blindagem contra qualquer rótulo futuro mais comprido que os de hoje.
 */
const LARGURA = 900;
const ALTURA = 440;
const MARGEM_VERT = 16;
const GAP_VERTICAL = 28;
const LARGURA_NO = 10;
const COL0_X = 6;
const COL1_X = 280;
const COL2_X = 600;
/**
 * Quebra defensiva — qualquer rótulo mais longo que isso vai para a
 * próxima linha, nunca é cortado pelo viewBox. Reduzido de 34 para 24
 * (30/07/2026, segunda rodada de auditoria): 34 caracteres a ~7,3px cada
 * (estimativa conservadora para fontWeight 800/Inter Black, mais largo que
 * peso normal) já encostava na borda direita da coluna 2 (~280px
 * disponíveis) — sem poder testar visualmente aqui, prefiro linhas bem
 * mais curtas com folga real a confiar numa estimativa de pixel no limite.
 */
const MAX_CARACTERES_POR_LINHA = 24;

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

/** Quebra um rótulo em várias linhas por palavra inteira — nunca corta no meio de uma palavra, nunca depende de medir pixel de fonte. */
function quebrarRotulo(texto: string, maxCaracteres: number): string[] {
  const palavras = texto.split(' ');
  const linhas: string[] = [];
  let linhaAtual = '';
  for (const palavra of palavras) {
    const tentativa = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
    if (tentativa.length > maxCaracteres && linhaAtual) {
      linhas.push(linhaAtual);
      linhaAtual = palavra;
    } else {
      linhaAtual = tentativa;
    }
  }
  if (linhaAtual) linhas.push(linhaAtual);
  return linhas;
}

/** `prefers-reduced-motion` lido uma vez no cliente — evita renderizar o `<animate>` do filete crítico para quem pediu menos movimento. */
function usarReducaoDeMovimento(): boolean {
  const [reduzido, setReduzido] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduzido(consulta.matches);
    const ouvir = (evento: MediaQueryListEvent) => setReduzido(evento.matches);
    consulta.addEventListener('change', ouvir);
    return () => consulta.removeEventListener('change', ouvir);
  }, []);
  return reduzido;
}

/** Compara dois filtros por igualdade de valor (não referência) — usado para destacar o segmento ativo. */
function filtrosIguais(a: FiltroFunil, b: FiltroFunil): boolean {
  return a.vulnerabilidade === b.vulnerabilidade && a.financiamento === b.financiamento;
}

/** Handlers de clique/teclado para um segmento clicável (nó ou link) — evita repetir onClick+onKeyDown em cada um dos 11 elementos interativos do funil. */
function handlersSegmento(aoClicarSegmento: (filtro: FiltroFunil) => void, filtro: FiltroFunil) {
  return {
    onClick: () => aoClicarSegmento(filtro),
    onKeyDown: (evento: KeyboardEvent<SVGGElement>) => {
      if (evento.key === 'Enter' || evento.key === ' ') aoClicarSegmento(filtro);
    },
  };
}

export function FunilExclusaoHabitacional({
  dados,
  aoClicarSegmento,
  filtroAtivo,
}: FunilExclusaoHabitacionalProps) {
  const reduzirMovimento = usarReducaoDeMovimento();
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
        {/* Links — clicáveis (30/07/2026: cada fluxo filtra RankingPrioridadeExecutivo
            pela combinação exata vulnerabilidade×financiamento que ele representa).
            Cor vermelha só no caminho crítico; largura sempre proporcional ao valor
            real, nunca engrossada artificialmente. */}
        <g
          role="button"
          tabIndex={0}
          className="cursor-pointer outline-none"
          aria-label="Filtrar: alta vulnerabilidade habitacional"
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: 'alta', financiamento: null })}
        >
          <path
            d={caminho(COL0_X + LARGURA_NO, banda_0_1, COL1_X, no1)}
            fill="none"
            stroke={COR_ALTA_VULNERABILIDADE}
            strokeOpacity={filtrosIguais(filtroAtivo, { vulnerabilidade: 'alta', financiamento: null }) ? 0.5 : 0.28}
            strokeWidth={Math.max(altura(banda_0_1), 0)}
          />
        </g>
        <g
          role="button"
          tabIndex={0}
          className="cursor-pointer outline-none"
          aria-label="Filtrar: vulnerabilidade habitacional moderada ou baixa"
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: 'moderada', financiamento: null })}
        >
          <path
            d={caminho(COL0_X + LARGURA_NO, banda_0_2, COL1_X, no2)}
            fill="none"
            stroke={COR_LINK_NEUTRO}
            strokeOpacity={filtrosIguais(filtroAtivo, { vulnerabilidade: 'moderada', financiamento: null }) ? 0.75 : 0.45}
            strokeWidth={Math.max(altura(banda_0_2), 0)}
          />
        </g>
        {/* Caminho crítico (alta vulnerabilidade → sem financiamento) — contraste
            máximo (30/07/2026, feedback do usuário): opacidade alta e sólida no
            vermelho institucional, contra os demais fluxos em stone-300 discreto
            (a versão anterior tinha o crítico MENOS opaco que os neutros, invertido
            do que fazia sentido). */}
        <g
          role="button"
          tabIndex={0}
          className="cursor-pointer outline-none"
          aria-label="Filtrar: alta vulnerabilidade e sem contrato de financiamento — caminho crítico"
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: 'alta', financiamento: 'sem' })}
        >
          <path
            d={caminho(COL1_X + LARGURA_NO, banda_1_3, COL2_X, banda_3_de1)}
            fill="none"
            stroke={COR_QUADRANTE.vazio_de_acesso}
            strokeOpacity={0.75}
            strokeWidth={Math.max(altura(banda_1_3), 0)}
          >
            <title>
              {`Caminho crítico: alta vulnerabilidade habitacional → sem financiamento (${n1a.toLocaleString('pt-BR')} municípios, ${formatoPercentual.format(percentualSemFinanciamentoAltaVulnerabilidade)}% dos de alta vulnerabilidade) — clique para filtrar`}
            </title>
          </path>
          {/* Filete "escoando" por cima do caminho crítico — <animate> nativo do
              SVG (SMIL), não depende de nenhum bundler/CSS-in-JS. Puramente
              decorativo: não desenhado quando o usuário pediu menos movimento
              (prefers-reduced-motion), e nunca altera a largura real da faixa. */}
          {!reduzirMovimento && (
            <path
              d={caminho(COL1_X + LARGURA_NO, banda_1_3, COL2_X, banda_3_de1)}
              fill="none"
              stroke="#fca5a5"
              strokeWidth={Math.min(4, Math.max(altura(banda_1_3), 0))}
              strokeDasharray="12 24"
              strokeLinecap="round"
              opacity={0.85}
              aria-hidden="true"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="36"
                to="0"
                dur="1.2s"
                repeatCount="indefinite"
              />
            </path>
          )}
        </g>
        <g
          role="button"
          tabIndex={0}
          className="cursor-pointer outline-none"
          aria-label="Filtrar: alta vulnerabilidade e com contrato de financiamento"
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: 'alta', financiamento: 'com' })}
        >
          <path
            d={caminho(COL1_X + LARGURA_NO, banda_1_4, COL2_X, banda_4_de1)}
            fill="none"
            stroke={COR_LINK_NEUTRO}
            strokeOpacity={filtrosIguais(filtroAtivo, { vulnerabilidade: 'alta', financiamento: 'com' }) ? 0.75 : 0.45}
            strokeWidth={Math.max(altura(banda_1_4), 0)}
          />
        </g>
        <g
          role="button"
          tabIndex={0}
          className="cursor-pointer outline-none"
          aria-label="Filtrar: vulnerabilidade moderada/baixa e sem contrato de financiamento"
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: 'moderada', financiamento: 'sem' })}
        >
          <path
            d={caminho(COL1_X + LARGURA_NO, banda_2_3, COL2_X, banda_3_de2)}
            fill="none"
            stroke={COR_LINK_NEUTRO}
            strokeOpacity={filtrosIguais(filtroAtivo, { vulnerabilidade: 'moderada', financiamento: 'sem' }) ? 0.75 : 0.45}
            strokeWidth={Math.max(altura(banda_2_3), 0)}
          />
        </g>
        <g
          role="button"
          tabIndex={0}
          className="cursor-pointer outline-none"
          aria-label="Filtrar: vulnerabilidade moderada/baixa e com contrato de financiamento"
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: 'moderada', financiamento: 'com' })}
        >
          <path
            d={caminho(COL1_X + LARGURA_NO, banda_2_4, COL2_X, banda_4_de2)}
            fill="none"
            stroke={COR_LINK_NEUTRO}
            strokeOpacity={filtrosIguais(filtroAtivo, { vulnerabilidade: 'moderada', financiamento: 'com' }) ? 0.75 : 0.45}
            strokeWidth={Math.max(altura(banda_2_4), 0)}
          />
        </g>

        {/* Nós — clicáveis. O nó raiz limpa o filtro (representa a população
            inteira, "voltar pra visão geral"); os demais definem só o eixo que
            representam (o outro eixo some, diferente de clicar num link). */}
        <NoSankey
          x={COL0_X}
          banda={no0}
          cor={COR_QUADRANTE.vazio_de_acesso}
          rotulo="Vazios de Acesso"
          valor={totalVazios}
          ativo={filtrosIguais(filtroAtivo, FILTRO_FUNIL_VAZIO)}
          {...handlersSegmento(aoClicarSegmento, FILTRO_FUNIL_VAZIO)}
        />
        <NoSankey
          x={COL1_X}
          banda={no1}
          cor={COR_ALTA_VULNERABILIDADE}
          rotulo="Alta vulnerabilidade habitacional (IVSH)"
          valor={n1}
          ativo={filtrosIguais(filtroAtivo, { vulnerabilidade: 'alta', financiamento: null })}
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: 'alta', financiamento: null })}
        />
        <NoSankey
          x={COL1_X}
          banda={no2}
          cor={COR_MODERADA}
          rotulo="Vulnerabilidade habitacional moderada/baixa"
          valor={n2}
          ativo={filtrosIguais(filtroAtivo, { vulnerabilidade: 'moderada', financiamento: null })}
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: 'moderada', financiamento: null })}
        />
        <NoSankey
          x={COL2_X}
          banda={no3}
          cor={COR_SEM_FINANCIAMENTO}
          rotulo="Sem contrato (Reforma Casa Brasil Solar)"
          valor={n1a + n2a}
          ativo={filtrosIguais(filtroAtivo, { vulnerabilidade: null, financiamento: 'sem' })}
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: null, financiamento: 'sem' })}
        />
        <NoSankey
          x={COL2_X}
          banda={no4}
          cor={COR_COM_FINANCIAMENTO}
          rotulo="Com contrato (Reforma Casa Brasil Solar)"
          valor={n1b + n2b}
          ativo={filtrosIguais(filtroAtivo, { vulnerabilidade: null, financiamento: 'com' })}
          {...handlersSegmento(aoClicarSegmento, { vulnerabilidade: null, financiamento: 'com' })}
        />
      </svg>
      <p className="text-[10px] text-stone-400">Clique num bloco ou fluxo para filtrar a lista de prioridade acima.</p>

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
  /** Destaca o nó (contorno escuro) quando é exatamente o filtro ativo agora. */
  ativo?: boolean;
  onClick?: () => void;
  onKeyDown?: (evento: KeyboardEvent<SVGGElement>) => void;
}

const ALTURA_LINHA_ROTULO = 13;

function NoSankey({ x, banda, cor, rotulo, valor, ativo, onClick, onKeyDown }: NoSankeyProps) {
  const alturaNo = Math.max(altura(banda), 0);
  const linhasRotulo = quebrarRotulo(rotulo, MAX_CARACTERES_POR_LINHA);
  const alturaBlocoTexto = (linhasRotulo.length + 1) * ALTURA_LINHA_ROTULO;
  const yPrimeiraLinha = banda.y0 + alturaNo / 2 - alturaBlocoTexto / 2 + ALTURA_LINHA_ROTULO * 0.8;
  const xTexto = x + LARGURA_NO + 10;

  return (
    <g
      role="button"
      tabIndex={0}
      className="cursor-pointer outline-none"
      aria-label={`Filtrar: ${rotulo}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <rect
        x={x}
        y={banda.y0}
        width={LARGURA_NO}
        height={alturaNo}
        fill={cor}
        rx={2}
        stroke={ativo ? '#1c1917' : 'none'}
        strokeWidth={ativo ? 2 : 0}
      >
        <title>{`${rotulo}: ${valor.toLocaleString('pt-BR')} municípios — clique para filtrar`}</title>
      </rect>
      {linhasRotulo.map((linha, indice) => (
        <text
          key={linha}
          x={xTexto}
          y={yPrimeiraLinha + indice * ALTURA_LINHA_ROTULO}
          fontSize={11}
          fontWeight={800}
          fill="#1c1917"
        >
          {linha}
        </text>
      ))}
      <text
        x={xTexto}
        y={yPrimeiraLinha + linhasRotulo.length * ALTURA_LINHA_ROTULO}
        fontSize={10}
        fontWeight={700}
        fill="#78716c"
      >
        {valor.toLocaleString('pt-BR')} municípios
      </text>
    </g>
  );
}
