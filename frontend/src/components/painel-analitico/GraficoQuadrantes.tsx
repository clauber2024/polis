import { useMemo, useState } from 'react';
import type { VaziosDeAcessoCompleto } from '../../services/vaziosDeAcesso.service';
import type { MunicipioClassificado, Quadrante } from '../../types/api';
import { formatarValor, type FormatoIndicador } from '../../utils/formatadores';

/** Ícone inline (mesmo padrão de CartaoVazioDeAcesso.tsx — sem dependência de lucide-react). */
function IconeAlerta({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/**
 * Laboratório multidimensional do Painel Analítico (27/07/2026, decisão do
 * usuário): substitui o scatter fixo de Vazios de Acesso (irradiação × MMGD
 * residencial per capita — essa matriz continua existindo, na íntegra, na
 * página dedicada /vazios-de-acesso) por um cruzamento LIVRE entre qualquer
 * par de 7 indicadores municipais. Duas decisões de arquitetura fixadas
 * pelo usuário, não renegociáveis por este componente:
 *
 * 1. A COR/CLASSIFICAÇÃO de cada ponto é SEMPRE a classificação oficial de
 *    Vazio de Acesso (irradiação × MMGD residencial per capita, medianas do
 *    backend) — nunca muda com os eixos escolhidos aqui. Um município sem
 *    classificação oficial (falta irradiação/MMGD, 4 casos) não aparece no
 *    laboratório, mesmo quando os eixos escolhidos não dependem desses dois
 *    indicadores — a cor é uma âncora fixa, não um dado por cruzamento.
 * 2. Quando os dois eixos escolhidos são exatamente o par oficial
 *    (irradiação × MMGD), a posição no gráfico e a cor do ponto
 *    correspondem (é literalmente a Matriz de Vazios de Acesso) — linhas de
 *    mediana NACIONAL (backend) e rótulos de canto por quadrante aparecem.
 *    Em QUALQUER outro par, a posição no gráfico deixa de corresponder à
 *    cor (um ponto vermelho não define mais um "quadrante Vazio de Acesso"
 *    geométrico nesses eixos) — os rótulos de canto por quadrante são
 *    escondidos de propósito (seriam enganosos) e as linhas tracejadas
 *    passam a ser medianas DESTA AMOSTRA, não mais oficiais, com nota
 *    explícita de que é um cruzamento exploratório, sem controle
 *    estatístico nem validação — ver a caixa "Leitura exploratória" abaixo
 *    do gráfico.
 *
 * SVG próprio, sem lib de gráfico (mesma decisão de GraficoComparacao/
 * GraficoRadar: o stack atual resolve).
 *
 * Nível 2 (30/07/2026, decisão do usuário): com ~5.570 pontos, o overplotting
 * torna a leitura executiva difícil em qualquer par de eixos — por isso este
 * componente foi rebaixado a aba secundária "Visão Exploratória" em
 * PainelAnalitico.tsx, voltada a leitura técnica/cruzamento livre. A aba
 * default "Visão Executiva" (GraficoRegional.tsx, Nível 1: agregação por
 * região) responde à pergunta rápida "onde priorizar" sem exigir escolha de
 * eixos. COR_QUADRANTE/ROTULO_FALLBACK/TODOS_QUADRANTES exportados daqui
 * para os dois componentes nunca divergirem de paleta/rótulo.
 */

type IdEixo =
  | 'irradiacaoMediaKwhM2Dia'
  | 'mmgdResidencialPer1000Hab'
  | 'ivs'
  | 'ivsh'
  | 'rendaMediaDomiciliar'
  | 'percentualPobrezaCadunico'
  | 'tarifaEnergiaResidencial';

interface DescritorEixo {
  id: IdEixo;
  rotulo: string;
  unidade: string | null;
  formato: FormatoIndicador;
  acessor: (m: MunicipioClassificado) => number | null;
}

/** Mesmos rótulo/unidade/formato já usados no catálogo de indicadores do mapa (utils/indicadores.ts) — consistência entre telas. */
const EIXOS: DescritorEixo[] = [
  {
    id: 'irradiacaoMediaKwhM2Dia',
    rotulo: 'Irradiação solar média',
    unidade: 'kWh/m²·dia',
    formato: 'numero',
    acessor: (m) => m.irradiacaoMediaKwhM2Dia,
  },
  {
    id: 'mmgdResidencialPer1000Hab',
    rotulo: 'MMGD residencial per capita',
    unidade: 'kW/1.000 hab',
    formato: 'numero',
    acessor: (m) => m.mmgdResidencialPer1000Hab,
  },
  {
    id: 'ivs',
    rotulo: 'Índice de Vulnerabilidade Social (IVS)',
    unidade: null,
    formato: 'numero',
    acessor: (m) => m.ivs,
  },
  {
    id: 'ivsh',
    rotulo: 'IVSH (vulnerabilidade sócio-habitacional-energética)',
    unidade: null,
    formato: 'numero',
    acessor: (m) => m.ivsh,
  },
  {
    id: 'rendaMediaDomiciliar',
    rotulo: 'Renda média domiciliar',
    unidade: null,
    formato: 'moeda',
    acessor: (m) => m.rendaMediaDomiciliar,
  },
  {
    id: 'percentualPobrezaCadunico',
    rotulo: 'Pobreza entre famílias do CadÚnico',
    unidade: null,
    formato: 'percentual',
    acessor: (m) => m.percentualPobrezaCadunico,
  },
  {
    id: 'tarifaEnergiaResidencial',
    rotulo: 'Tarifa residencial (TUSD+TE)',
    unidade: 'R$/kWh',
    formato: 'numero',
    acessor: (m) => m.tarifaEnergiaResidencial,
  },
];

function buscarEixo(id: IdEixo): DescritorEixo {
  return EIXOS.find((eixo) => eixo.id === id) ?? EIXOS[0];
}

const LARGURA = 720;
const ALTURA = 440;
const MARGEM = { topo: 28, direita: 20, base: 52, esquerda: 64 };

/**
 * Cores por quadrante — vermelho/carmim para "Vazio de Acesso" (feedback do
 * usuário, 27/07/2026): é o quadrante de exclusão/alerta do projeto, e o
 * modelo mental de "alerta = vermelho" já usado nos badges e no CTA do
 * Painel Analítico precisa valer aqui também. Antes era roxo, sem relação
 * com o resto da paleta semântica.
 */
export const COR_QUADRANTE: Record<Quadrante, string> = {
  vazio_de_acesso: '#b91c1c',
  acesso_pleno: '#059669',
  adocao_acima_do_potencial: '#0284c7',
  baixo_potencial_baixa_adocao: '#94a3b8',
};

/**
 * Raio e opacidade por quadrante (feedback do usuário, 27/07/2026: quase
 * 5.600 pontos sobrepostos viram uma massa sólida ilegível — "efeito
 * hairball"). Opacidade baixa faz a sobreposição funcionar como mapa de
 * calor (onde mais municípios se acumulam, a mancha fica mais escura) em
 * vez de esconder a densidade atrás de um bloco de cor uniforme —
 * "Vazio de Acesso" fica mais visível que os demais de propósito, é o
 * quadrante de alerta do projeto.
 */
const ESTILO_PONTO: Record<Quadrante, { r: number; opacity: number }> = {
  vazio_de_acesso: { r: 1.8, opacity: 0.55 },
  acesso_pleno: { r: 1.4, opacity: 0.35 },
  adocao_acima_do_potencial: { r: 1.4, opacity: 0.35 },
  baixo_potencial_baixa_adocao: { r: 1.2, opacity: 0.18 },
};

/** Fallback de rótulo — o rótulo real vem de quadranteRotulo (backend). */
export const ROTULO_FALLBACK: Record<Quadrante, string> = {
  vazio_de_acesso: 'Vazio de Acesso',
  acesso_pleno: 'Acesso pleno',
  adocao_acima_do_potencial: 'Adoção acima do potencial',
  baixo_potencial_baixa_adocao: 'Baixo potencial, baixa adoção',
};

/**
 * Contorno por região (toggle "colorir contorno por região", decisão do
 * usuário, 27/07/2026) — canal visual SEPARADO do preenchimento (sempre a
 * classificação oficial de quadrante, decisão irrevogável deste
 * componente). Paleta deliberadamente distinta de COR_QUADRANTE (nenhum
 * matiz repetido) para não confundir os dois canais.
 */
const COR_REGIAO: Record<string, string> = {
  Norte: '#7c3aed',
  Nordeste: '#ea580c',
  'Centro-Oeste': '#ca8a04',
  Sudeste: '#db2777',
  Sul: '#0d9488',
};
const COR_REGIAO_FALLBACK = '#334155';
function corRegiao(regiao: string): string {
  return COR_REGIAO[regiao] ?? COR_REGIAO_FALLBACK;
}

function percentil(valoresOrdenados: number[], p: number): number {
  if (valoresOrdenados.length === 0) return 0;
  const indice = Math.min(
    valoresOrdenados.length - 1,
    Math.max(0, Math.ceil(p * valoresOrdenados.length) - 1),
  );
  return valoresOrdenados[indice];
}

export const TODOS_QUADRANTES: Quadrante[] = [
  'vazio_de_acesso',
  'acesso_pleno',
  'adocao_acima_do_potencial',
  'baixo_potencial_baixa_adocao',
];

interface GraficoQuadrantesProps {
  dados: VaziosDeAcessoCompleto;
}

export function GraficoQuadrantes({ dados }: GraficoQuadrantesProps) {
  const [eixoXId, setEixoXId] = useState<IdEixo>('irradiacaoMediaKwhM2Dia');
  const [eixoYId, setEixoYId] = useState<IdEixo>('mmgdResidencialPer1000Hab');
  const [corPorRegiao, setCorPorRegiao] = useState(false);
  // Filtros (21/07/2026, feedback do usuário: ~5.570 pontos poluem o
  // gráfico). Client-side — os municípios já estão todos carregados
  // (buscarClassificacaoNacionalCompleta), não justifica nova requisição.
  const [regiaoFiltro, setRegiaoFiltro] = useState('');
  const [quadrantesVisiveis, setQuadrantesVisiveis] = useState<Set<Quadrante>>(
    () => new Set(TODOS_QUADRANTES),
  );

  const eixoXDescritor = useMemo(() => buscarEixo(eixoXId), [eixoXId]);
  const eixoYDescritor = useMemo(() => buscarEixo(eixoYId), [eixoYId]);
  const ehMatrizOficial =
    eixoXId === 'irradiacaoMediaKwhM2Dia' && eixoYId === 'mmgdResidencialPer1000Hab';

  const regioesDisponiveis = useMemo(
    () => [...new Set(dados.municipios.map((m) => m.regiao))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [dados],
  );

  function alternarQuadrante(quadrante: Quadrante) {
    setQuadrantesVisiveis((atual) => {
      const novo = new Set(atual);
      if (novo.has(quadrante)) {
        novo.delete(quadrante);
      } else {
        novo.add(quadrante);
      }
      return novo;
    });
  }

  const {
    pontos,
    rotulos,
    escalaX,
    escalaY,
    ticksX,
    ticksY,
    tetoY,
    totalTruncados,
    medianaXAmostra,
    medianaYAmostra,
    totalSemDadoNosEixos,
  } = useMemo(() => {
    const eixoX = buscarEixo(eixoXId);
    const eixoY = buscarEixo(eixoYId);

    // Cor sempre = classificação oficial (decisão do usuário) — um
    // município sem quadrante oficial (falta irradiação/MMGD) não entra no
    // laboratório, mesmo que os eixos escolhidos não dependam desses dois
    // indicadores (ver docstring do arquivo).
    const comQuadrante = dados.municipios.filter(
      (m): m is MunicipioClassificado & { quadrante: Quadrante } =>
        m.quadrante !== null &&
        quadrantesVisiveis.has(m.quadrante) &&
        (regiaoFiltro === '' || m.regiao === regiaoFiltro),
    );

    const classificados = comQuadrante.filter(
      (m) => eixoX.acessor(m) !== null && eixoY.acessor(m) !== null,
    );

    // Rótulo real de cada quadrante: primeiro município classificado nele.
    const rotulos = { ...ROTULO_FALLBACK };
    for (const m of classificados) {
      if (m.quadranteRotulo) rotulos[m.quadrante] = m.quadranteRotulo;
    }

    const valoresX = classificados.map((m) => eixoX.acessor(m) as number).sort((a, b) => a - b);
    const valoresY = classificados.map((m) => eixoY.acessor(m) as number).sort((a, b) => a - b);

    const medianaYAmostra = percentil(valoresY, 0.5);
    const medianaXAmostra = percentil(valoresX, 0.5);

    // O truncamento em p97,5 (com piso de 2x a mediana) foi calibrado para
    // a assimetria específica de MMGD residencial per capita (muitos zeros,
    // poucos outliers altíssimos) — só se aplica quando o eixo Y É esse
    // indicador. Para os demais eixos, usa o percentil bruto, sem inventar
    // um piso não calibrado para eles.
    const p975Y = percentil(valoresY, 0.975);
    const tetoY =
      eixoYId === 'mmgdResidencialPer1000Hab' ? Math.max(p975Y, medianaYAmostra * 2) : p975Y;

    const minX = valoresX[0] ?? 0;
    const maxX = valoresX[valoresX.length - 1] ?? 1;

    const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;
    const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;
    const escalaX = (v: number) =>
      MARGEM.esquerda + ((v - minX) / (maxX - minX || 1)) * larguraUtil;
    const escalaY = (v: number) =>
      MARGEM.topo + alturaUtil - (Math.min(v, tetoY) / (tetoY || 1)) * alturaUtil;

    const totalTruncados = classificados.filter((m) => (eixoY.acessor(m) as number) > tetoY).length;

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
      medianaXAmostra,
      medianaYAmostra,
      totalSemDadoNosEixos: comQuadrante.length - classificados.length,
    };
  }, [dados, eixoXId, eixoYId, regiaoFiltro, quadrantesVisiveis]);

  const xMediana = ehMatrizOficial
    ? escalaX(dados.medianaNacional.potencialSolarKwhM2Dia)
    : escalaX(medianaXAmostra);
  const yMediana = ehMatrizOficial
    ? escalaY(dados.medianaNacional.mmgdResidencialPer1000Hab)
    : escalaY(medianaYAmostra);

  return (
    <div className="space-y-3">
      {/* Cabeçalho do cruzamento atual + selo oficial/exploratório */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="mr-1.5 font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Cruzando
          </span>
          <span className="font-bold text-slate-800">
            {eixoYDescritor.rotulo} × {eixoXDescritor.rotulo}
          </span>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-black tracking-wider uppercase ${
            ehMatrizOficial ? 'bg-red-700/10 text-red-800' : 'bg-amber-500/10 text-amber-700'
          }`}
        >
          {ehMatrizOficial ? 'Matriz oficial' : 'Cruzamento exploratório'}
        </span>
      </div>

      {/* Seletores livres de eixo (laboratório multidimensional, 27/07/2026) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          Eixo vertical (Y)
          <select
            value={eixoYId}
            onChange={(evento) => setEixoYId(evento.target.value as IdEixo)}
            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
          >
            {EIXOS.map((eixo) => (
              <option key={eixo.id} value={eixo.id}>
                {eixo.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          Eixo horizontal (X)
          <select
            value={eixoXId}
            onChange={(evento) => setEixoXId(evento.target.value as IdEixo)}
            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
          >
            {EIXOS.map((eixo) => (
              <option key={eixo.id} value={eixo.id}>
                {eixo.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Filtros (21/07/2026): região reduz o volume de pontos; toggle por
          quadrante isola visualmente o(s) grupo(s) de interesse (ex.: só
          "Vazio de Acesso") — continua fazendo sentido em qualquer par de
          eixos, já que a cor é sempre o quadrante oficial. Puramente
          client-side, não muda a classificação nem as medianas oficiais. */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 font-semibold text-slate-600">
          Região
          <select
            value={regiaoFiltro}
            onChange={(evento) => setRegiaoFiltro(evento.target.value)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
          >
            <option value="">Todas</option>
            {regioesDisponiveis.map((regiao) => (
              <option key={regiao} value={regiao}>
                {regiao}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={corPorRegiao}
            onChange={(evento) => setCorPorRegiao(evento.target.checked)}
            className="rounded text-slate-700 focus:ring-slate-700"
          />
          Colorir contorno por região
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Quadrantes
          </span>
          {TODOS_QUADRANTES.map((q) => {
            const ativo = quadrantesVisiveis.has(q);
            return (
              <button
                key={q}
                type="button"
                onClick={() => alternarQuadrante(q)}
                aria-pressed={ativo}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold transition-opacity ${
                  ativo ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-40'
                }`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: COR_QUADRANTE[q] }}
                />
                {ROTULO_FALLBACK[q]}
                <span className="font-mono text-slate-400">
                  ({(dados.resumoPorQuadrante[q] ?? 0).toLocaleString('pt-BR')})
                </span>
              </button>
            );
          })}
        </div>
        {/* title = explicação do universo de 5.573 (não "~5.570") sob
            demanda — pergunta legítima e recorrente, ver NOTA_UNIVERSO em
            vaziosDeAcesso.service.ts (backend, 27/07/2026). */}
        <span
          className="cursor-help text-slate-400 underline decoration-dotted underline-offset-2"
          title={dados.avisos.notaUniverso}
        >
          {pontos.length.toLocaleString('pt-BR')} de{' '}
          {dados.avisos.totalMunicipios.toLocaleString('pt-BR')} municípios exibidos
          {totalSemDadoNosEixos > 0 && ` · ${totalSemDadoNosEixos.toLocaleString('pt-BR')} sem dado neste cruzamento`}
          {dados.avisos.totalExcluidosSemDado > 0 &&
            ` · ${dados.avisos.totalExcluidosSemDado.toLocaleString('pt-BR')} sem classificação oficial`}
        </span>
      </div>

      {corPorRegiao && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500">
          {regioesDisponiveis.map((regiao) => (
            <span key={regiao} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border-2"
                style={{ borderColor: corRegiao(regiao) }}
              />
              {regiao}
            </span>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label={`Dispersão dos municípios por ${eixoYDescritor.rotulo} × ${eixoXDescritor.rotulo} — ${
          ehMatrizOficial
            ? 'cor e quadrante sempre da classificação oficial (irradiação × MMGD)'
            : 'cor sempre da classificação oficial de Vazio de Acesso, independente destes eixos'
        }`}
        className="w-full bg-white"
      >
        {/* Linhas de mediana: nacional/oficial (backend) só no par oficial; caso contrário, mediana desta amostra — ver nota "Leitura exploratória" abaixo. */}
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

        {/* Rótulos de quadrante como marca d'água sutil — só fazem sentido
            geometricamente no par oficial (irradiação × MMGD); em qualquer
            outro par, a posição na tela não corresponde mais à cor, então
            mostrar "Vazio de Acesso" num canto seria enganoso. */}
        {ehMatrizOficial && (
          <>
            <text x={LARGURA - MARGEM.direita - 8} y={MARGEM.topo + 18} textAnchor="end" fontSize={13} fill="#0284c7" fillOpacity={0.35} fontWeight={800}>
              {ROTULO_FALLBACK.acesso_pleno}
            </text>
            <text x={MARGEM.esquerda + 8} y={MARGEM.topo + 18} fontSize={13} fill="#0284c7" fillOpacity={0.35} fontWeight={800}>
              {ROTULO_FALLBACK.adocao_acima_do_potencial}
            </text>
            <text x={MARGEM.esquerda + 8} y={ALTURA - MARGEM.base - 10} fontSize={13} fill="#78716c" fillOpacity={0.35} fontWeight={800}>
              {ROTULO_FALLBACK.baixo_potencial_baixa_adocao}
            </text>
            <text x={LARGURA - MARGEM.direita - 8} y={ALTURA - MARGEM.base - 10} textAnchor="end" fontSize={13} fill="#b91c1c" fillOpacity={0.35} fontWeight={800}>
              {ROTULO_FALLBACK.vazio_de_acesso}
            </text>
          </>
        )}

        {/* Pontos — preenchimento sempre a classificação oficial (irradiação
            × MMGD); posição sempre os eixos escolhidos acima. Contorno por
            região é opcional (canal visual separado, nunca substitui o
            preenchimento). Código IBGE bruto fica fora do tooltip de
            propósito (só nome/UF, que já identificam o município). */}
        {pontos.map((m) => (
          <circle
            key={m.codigoIbge}
            cx={escalaX(eixoXDescritor.acessor(m) as number)}
            cy={escalaY(eixoYDescritor.acessor(m) as number)}
            r={ESTILO_PONTO[m.quadrante].r}
            fill={COR_QUADRANTE[m.quadrante]}
            fillOpacity={ESTILO_PONTO[m.quadrante].opacity}
            stroke={corPorRegiao ? corRegiao(m.regiao) : 'none'}
            strokeWidth={corPorRegiao ? 0.8 : 0}
          >
            <title>
              {`${m.nome} (${m.uf}) — ${rotulos[m.quadrante]}\n${eixoYDescritor.rotulo}: ${formatarValor(eixoYDescritor.acessor(m), eixoYDescritor.formato)}${eixoYDescritor.unidade ? ` ${eixoYDescritor.unidade}` : ''} · ${eixoXDescritor.rotulo}: ${formatarValor(eixoXDescritor.acessor(m), eixoXDescritor.formato)}${eixoXDescritor.unidade ? ` ${eixoXDescritor.unidade}` : ''}${corPorRegiao ? ` · Região: ${m.regiao}` : ''}`}
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
            {formatarValor(t, eixoXDescritor.formato)}
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
            {formatarValor(t, eixoYDescritor.formato)}
          </text>
        ))}
        <text
          x={MARGEM.esquerda + (LARGURA - MARGEM.esquerda - MARGEM.direita) / 2}
          y={ALTURA - 8}
          textAnchor="middle"
          fontSize={11}
          fill="#475569"
        >
          {eixoXDescritor.rotulo}
          {eixoXDescritor.unidade ? ` (${eixoXDescritor.unidade})` : ''}
        </text>
        <text
          x={16}
          y={MARGEM.topo + (ALTURA - MARGEM.topo - MARGEM.base) / 2}
          textAnchor="middle"
          fontSize={11}
          fill="#475569"
          transform={`rotate(-90 16 ${MARGEM.topo + (ALTURA - MARGEM.topo - MARGEM.base) / 2})`}
        >
          {eixoYDescritor.rotulo}
          {eixoYDescritor.unidade ? ` (${eixoYDescritor.unidade})` : ''}
        </text>
      </svg>

      {totalTruncados > 0 && (
        <p className="text-xs text-slate-400">
          Eixo vertical truncado em {formatarValor(tetoY, eixoYDescritor.formato)}
          {eixoYDescritor.unidade ? ` ${eixoYDescritor.unidade}` : ''} (percentil 97,5) só para
          exibição — {totalTruncados.toLocaleString('pt-BR')} municípios com{' '}
          {eixoYDescritor.rotulo.toLowerCase()} acima disso aparecem fixados no topo do gráfico. A
          classificação deles não muda com o truncamento.
        </p>
      )}

      {!ehMatrizOficial && (
        <p className="rounded border border-amber-100 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-900">
          <span className="mb-1 block font-mono text-[10px] font-bold tracking-wider uppercase">
            Leitura exploratória, sem validação estatística
          </span>
          As linhas tracejadas são as medianas DESTA amostra — {eixoYDescritor.rotulo.toLowerCase()}
          {' '}({formatarValor(medianaYAmostra, eixoYDescritor.formato)}
          {eixoYDescritor.unidade ? ` ${eixoYDescritor.unidade}` : ''}) e{' '}
          {eixoXDescritor.rotulo.toLowerCase()} (
          {formatarValor(medianaXAmostra, eixoXDescritor.formato)}
          {eixoXDescritor.unidade ? ` ${eixoXDescritor.unidade}` : ''}) —, calculadas só para
          referência visual, não um critério de classificação. A cor de cada ponto continua sendo
          SEMPRE a classificação oficial de Vazio de Acesso (irradiação × MMGD residencial per
          capita, ver "Matriz oficial" escolhendo esses dois eixos), não uma classificação deste
          cruzamento — por isso a posição no gráfico não corresponde à cor em nenhum quadrante
          aqui. Este é um cruzamento bivariado simples, sem controle de nenhuma outra variável e
          sem teste estatístico formal — para correlações com controle estatístico validado (ex.:
          precariedade habitacional × MMGD, controlando renda e irradiação), ver a Infraestrutura
          Estatística do Atlas.
        </p>
      )}

      {ehMatrizOficial && (
        <div className="rounded-lg border-l-4 border-red-700 bg-stone-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <IconeAlerta className="h-4 w-4 text-red-700" />
            <h4 className="text-[10px] font-black tracking-widest text-red-800 uppercase">
              Premissa analítica
            </h4>
          </div>
          <p className="text-xs leading-relaxed font-medium text-stone-600">{dados.notaMetodologica}</p>
        </div>
      )}
    </div>
  );
}
