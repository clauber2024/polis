import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { DiagramaConexaoDados } from '../components/landing/DiagramaConexaoDados';
import { TourAchados } from '../components/landing/TourAchados';
import { buscarAnalisesEstatisticas } from '../services/analisesEstatisticas.service';
import { buscarEstatisticasNacionais } from '../services/estatisticasNacionais.service';
import { baixarNotaMetodologica } from '../services/notaMetodologica.service';
import { buscarVaziosDeAcesso } from '../services/vaziosDeAcesso.service';
import type { AnalisesEstatisticasResultado, EstatisticasNacionais, ListarVaziosDeAcessoResultado } from '../types/api';
import { formatarValor } from '../utils/formatadores';

/**
 * Landing page institucional (RF-001 a RF-008) — implementada em 10/07/2026.
 * Antes desta sessão "/" ia direto para o mapa (ver App.tsx); agora "/" é
 * esta página pública, e o mapa/dashboard vive em "/mapa".
 *
 * Header próprio (RF-002), não o LayoutApp usado pelo resto do app — a
 * landing é a porta de entrada institucional, não uma tela analítica, então
 * não faz sentido ela já vir com nav de Painel Analítico/busca de município.
 */

interface FonteDados {
  nome: string;
  descricao: string;
}

/**
 * Paleta conceitual do diagnóstico de UX (22/07/2026): âmbar para sinalizar
 * potencial/vulnerabilidade, laranja para o alerta de urgência (moradia
 * barra a solução) e verde para a resposta/oportunidade certa — substitui o
 * roxo genérico que os 3 cards de "O que o Atlas faz" usavam antes.
 */
type CorDestaqueCard = 'amber' | 'orange' | 'emerald';

const ESTILOS_DESTAQUE_CARD: Record<CorDestaqueCard, { ponto: string; borda: string; gradiente: string }> = {
  amber: { ponto: 'bg-amber-500', borda: 'border-amber-200/60', gradiente: 'from-amber-50/70' },
  orange: { ponto: 'bg-orange-600', borda: 'border-orange-200/60', gradiente: 'from-orange-50/80' },
  emerald: { ponto: 'bg-emerald-500', borda: 'border-emerald-200/60', gradiente: 'from-emerald-50/70' },
};

interface CardExplicativoProps {
  corDestaque: CorDestaqueCard;
  titulo: string;
  pergunta: string;
  resposta: string;
  detalhe: string;
  linkPara: string;
  linkTexto: string;
}

/**
 * Card curto (pergunta + resposta de uma frase) com o detalhe mais longo
 * escondido atrás de um tooltip animado sob demanda — mesmo padrão de
 * AnimatePresence/motion já usado em AlternadorPriorizacaoIvsh.tsx, para não
 * introduzir uma segunda convenção de tooltip no projeto.
 */
function CardExplicativo({ corDestaque, titulo, pergunta, resposta, detalhe, linkPara, linkTexto }: CardExplicativoProps) {
  const [dicaVisivel, setDicaVisivel] = useState(false);
  const estilo = ESTILOS_DESTAQUE_CARD[corDestaque];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4 }}
      className={`group relative rounded-2xl border ${estilo.borda} bg-gradient-to-b ${estilo.gradiente} to-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]`}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`h-2 w-2 rounded-full ${estilo.ponto}`} />
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-900">{titulo}</h3>
      </div>
      <p className="text-sm font-semibold text-slate-800">{pergunta}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {resposta}{' '}
        <Link to={linkPara} className="font-semibold text-emerald-700 underline hover:text-emerald-900">
          {linkTexto}
        </Link>
      </p>

      <div
        className="relative mt-3 inline-flex items-center"
        onMouseEnter={() => setDicaVisivel(true)}
        onMouseLeave={() => setDicaVisivel(false)}
      >
        <button
          type="button"
          onFocus={() => setDicaVisivel(true)}
          onBlur={() => setDicaVisivel(false)}
          className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400 underline decoration-dotted hover:text-slate-600"
        >
          Ver exemplo real
        </button>
        <AnimatePresence>
          {dicaVisivel && (
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 z-10 mt-2 w-72 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs leading-relaxed text-slate-600 shadow-lg backdrop-blur"
            >
              {detalhe}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/**
 * RF-006: fontes de dados primárias, agrupadas por categoria — não é mais
 * um espelho 1:1 das 6 bases canônicas do backend (basesDeDadosCanonicas.ts,
 * que é uma lista de governança para RF-063, não a lista completa de fontes
 * reais). Expandido em 21/07/2026 (pergunta do usuário: a página listava só
 * 6 categorias, mas o Atlas usa ~16 fontes/programas distintos, 21
 * extractors — ver CLAUDE.md, "Estado Real do Projeto"). Cada card aqui
 * pode agrupar mais de uma fonte real (ex.: ANEEL cobre MMGD + tarifa +
 * qualidade de fornecimento), mas nenhuma fonte real fica de fora.
 */
const FONTES_DE_DADOS: FonteDados[] = [
  {
    nome: 'ANEEL',
    descricao:
      'Micro e minigeração distribuída (potência instalada, UCs conectadas), tarifa residencial (TUSD+TE) e qualidade de fornecimento (DEC/FEC).',
  },
  {
    nome: 'IBGE — Censo 2022',
    descricao:
      'Infraestrutura urbana, moradia, tipo de domicílio, alfabetização, densidade populacional e Cadastro Nacional de Favelas e Comunidades Urbanas.',
  },
  { nome: 'CadÚnico', descricao: 'Cobertura e pobreza entre famílias cadastradas no Cadastro Único.' },
  { nome: 'TSEE', descricao: 'Tarifa Social de Energia Elétrica — beneficiários por subclasse residencial.' },
  { nome: 'IVS/IPEA', descricao: 'Índice de Vulnerabilidade Social, consolidado por município.' },
  {
    nome: 'INPE',
    descricao:
      'Irradiação solar (Atlas Solar 2017, LABREN/CCST — média climatológica 1999–2015) e precipitação mensal (MERGE/CPTEC).',
  },
  {
    nome: 'RAIS — Ministério do Trabalho',
    descricao: 'Renda média domiciliar e indicadores de trabalho, via BigQuery.',
  },
  { nome: 'DATASUS', descricao: 'Mortalidade infantil (SIM + SINASC).' },
  {
    nome: 'Caixa/FGTS e Ministério das Cidades',
    descricao: 'Programa Minha Casa Minha Vida — unidades habitacionais entregues (faixas FGTS e OGU).',
  },
  {
    nome: 'Prefeituras municipais',
    descricao:
      'Zonas Especiais de Interesse Social (ZEIS/AEIS) — hoje 8 municípios: São Paulo, Recife, Rio Branco, Belo Horizonte, Contagem, Fortaleza, Salvador e Rio de Janeiro.',
  },
  {
    nome: 'Caixa Econômica Federal',
    descricao:
      'Programa Reforma Casa Brasil Solar — fonte pontual (extrato via Lei de Acesso à Informação, nov/2025–abr/2026), não uma base pública/automatizável como as demais.',
  },
];

export function PaginaLanding() {
  const [estatisticas, setEstatisticas] = useState<EstatisticasNacionais | null>(null);
  const [erroEstatisticas, setErroEstatisticas] = useState<string | null>(null);

  // Nota Metodológica em PDF (pedido do usuário, 21/07/2026) — mesmo padrão
  // de estado de RF-058 (PainelMunicipio.tsx: gerandoRelatorio/erroRelatorio).
  const [baixandoNota, setBaixandoNota] = useState(false);
  const [erroNota, setErroNota] = useState<string | null>(null);

  async function aoBaixarNotaMetodologica() {
    setBaixandoNota(true);
    setErroNota(null);
    try {
      await baixarNotaMetodologica();
    } catch (causa) {
      setErroNota(causa instanceof Error ? causa.message : 'Falha ao gerar a nota metodológica.');
    } finally {
      setBaixandoNota(false);
    }
  }

  useEffect(() => {
    let ativo = true;
    buscarEstatisticasNacionais()
      .then((resultado) => {
        if (ativo) setEstatisticas(resultado);
      })
      .catch((causa: unknown) => {
        if (ativo) {
          setErroEstatisticas(
            causa instanceof Error ? causa.message : 'Falha ao carregar os indicadores nacionais.',
          );
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  // "Tour" de principais achados (21/07/2026) — resumo de Vazios de Acesso e
  // correlação parcial moradia x MMGD, ambos AO VIVO da API (não hardcoded
  // no frontend). Falha silenciosa: o tour trata número ausente como "ainda
  // carregando", nunca bloqueia a landing (mesmo espírito da camada de
  // estados no mapa — conteúdo complementar, não crítico).
  const [resumoVazios, setResumoVazios] = useState<ListarVaziosDeAcessoResultado | null>(null);
  const [analises, setAnalises] = useState<AnalisesEstatisticasResultado | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarVaziosDeAcesso({ porPagina: '1' })
      .then((resultado) => {
        if (ativo) setResumoVazios(resultado);
      })
      .catch(() => {
        // Tour trata como "ainda carregando" — não é crítico para a landing.
      });
    buscarAnalisesEstatisticas()
      .then((resultado) => {
        if (ativo) setAnalises(resultado);
      })
      .catch(() => {
        // Idem.
      });
    return () => {
      ativo = false;
    };
  }, []);

  const totalVazios = resumoVazios?.resumoPorQuadrante.vazio_de_acesso ?? null;
  const percentualVazios =
    resumoVazios && resumoVazios.avisos.totalClassificados > 0
      ? (resumoVazios.resumoPorQuadrante.vazio_de_acesso / resumoVazios.avisos.totalClassificados) * 100
      : null;
  const analisePrecariedade =
    analises?.resultados.find((r) => r.variavelX === 'indice_precariedade_moradia') ?? null;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-800 font-sans">
      {/* RF-002: header fixo com botão Entrar no canto superior direito. */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <span className="font-display text-base font-bold tracking-tight text-slate-800">
          ATLAS SOLAR{' '}
          <span className="bg-gradient-to-r from-amber-500 to-emerald-600 bg-clip-text text-transparent">
            JUSTO
          </span>
        </span>
        <Link
          to="/login"
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Entrar
        </Link>
      </header>

      {/* RF-003: hero com headline + 2 CTAs. */}
      <section className="relative overflow-hidden px-6 py-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-amber-50 via-white to-emerald-50"
        />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="mx-auto mb-6 inline-flex items-center space-x-1.5 rounded-full border border-amber-200/60 bg-amber-50/80 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            <span>Justiça Energética &amp; Território</span>
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Justiça energética é saber{' '}
            <span className="bg-gradient-to-r from-amber-500 to-emerald-600 bg-clip-text text-transparent">
              quem tem acesso
            </span>{' '}
            à energia solar no Brasil
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600">
            Financiar painel solar para quem mora sob telhado de lona não resolve nada. O Atlas
            cruza potencial solar, vulnerabilidade social e acesso real à energia limpa para
            mostrar, com precisão territorial, onde o investimento público e os fundos
            climáticos realmente mudam o jogo.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/mapa"
              className="rounded-lg bg-emerald-600 px-6 py-3 text-xs font-mono font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-700 hover:shadow-emerald-500/40"
            >
              Explorar o Atlas
            </Link>
            <a
              href="#sobre"
              className="rounded-lg border border-slate-200 bg-white/60 px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 backdrop-blur-md transition-all hover:bg-white/90 hover:shadow-sm"
            >
              Saiba mais
            </a>
          </div>
        </motion.div>
      </section>

      {/* RF-004: seção explicativa do objetivo da plataforma. */}
      <section
        id="sobre"
        className="mx-auto max-w-4xl rounded-2xl border border-white/60 bg-white/50 px-6 py-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl sm:px-10"
      >
        <h2 className="text-lg font-bold uppercase tracking-tight text-slate-900">
          O que o Atlas faz
        </h2>
        <p className="mt-4 leading-relaxed text-slate-600">
          A energia solar distribuída cresce rápido no Brasil, mas de forma desigual: há
          municípios onde o sol é abundante e a energia limpa quase não chega, e territórios
          onde ela chega, mas só para quem já tem renda e telhado firme para receber painéis.
          O Atlas cruza três informações — quanto sol o território recebe, quão vulnerável é
          quem vive nele e quantas famílias já têm energia solar — para tornar esse descompasso
          visível, cidade por cidade, e apontar onde cada real de investimento público rende
          mais justiça energética.
        </p>

        {/* RF-004: convite interativo aos 3 componentes premium (Gráfico de
            Quadrantes, Alternador IVSH, Radar de Descompasso Morfológico) —
            ver docs/PLANO_ATUAL.md e docs/DECISOES.md para a metodologia e os
            limiares reais por trás de cada um (percentil 90 de precariedade
            habitacional corrigido em 20/07/2026). Cards reformulados em
            25/07/2026 (auditoria de UX/UI): formato pergunta→resposta curta,
            com o parágrafo original preservado por trás do tooltip "Ver
            exemplo real" (CardExplicativo). */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CardExplicativo
            corDestaque="amber"
            titulo="Painel Analítico"
            pergunta="Onde o sol sobra e a energia limpa não chega?"
            resposta="O Gráfico de Quadrantes cruza irradiação solar com adoção residencial de energia solar e revela os vazios de acesso."
            detalhe="Cruzamos o potencial de irradiação (eixo X) com a adoção residencial de MMGD (eixo Y). O resultado revela os verdadeiros Vazios de Acesso: onde o sol sobra, mas a energia limpa não chega."
            linkPara="/painel-analitico"
            linkTexto="Ver o Gráfico de Quadrantes"
          />
          <CardExplicativo
            corDestaque="orange"
            titulo="Vazios de Acesso"
            pergunta="A moradia da família permite receber a solução?"
            resposta="O alternador de IVSH reordena o ranking de prioridade penalizando territórios onde a casa não tem condição segura para painéis."
            detalhe="IVSH (Índice de Vulnerabilidade Sócio-Habitacional-Energética) combina vulnerabilidade social, precariedade construtiva e insegurança da posse — para priorizar territórios onde a própria moradia impede a instalação de painéis."
            linkPara="/vazios-de-acesso"
            linkTexto="Ligar a lente habitacional"
          />
          <CardExplicativo
            corDestaque="emerald"
            titulo="Radar de Descompasso Morfológico"
            pergunta="Quando o crédito individual não é a resposta certa?"
            resposta="Em municípios como Uiramutã (RR) e Jaboatão dos Guararapes (PE), o alerta aponta para geração compartilhada em vez de crédito individual."
            detalhe="Quando a precariedade habitacional do território está entre as 10% piores do país, o telhado geralmente não suporta painéis — o crédito individual seria inócuo. A política certa é geração solar compartilhada."
            linkPara="/mapa"
            linkTexto="Explorar no mapa"
          />
        </div>
      </section>

      {/* RF-005: indicadores nacionais em destaque. */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <span className="mb-1 block text-center text-[9px] font-mono font-bold uppercase tracking-wider text-violet-700">
            Matriz de Monitoramento
          </span>
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
            O Brasil em números
          </h2>
          {estatisticas?.periodoReferencia && (
            <p className="mt-1 text-center text-xs font-mono text-slate-400">
              Snapshot mais recente disponível: {estatisticas.periodoReferencia}
            </p>
          )}

          {erroEstatisticas && !estatisticas && (
            <p className="mt-6 text-center text-sm text-red-600">{erroEstatisticas}</p>
          )}

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded border border-slate-200 bg-white p-6 text-center shadow-2xs">
              <p className="font-mono text-2xl font-bold text-violet-700 break-words">
                {estatisticas?.totalInstalacoesMmgd !== null &&
                estatisticas?.totalInstalacoesMmgd !== undefined
                  ? formatarValor(estatisticas.totalInstalacoesMmgd, 'inteiro')
                  : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">Sistemas MMGD conectados</p>
            </div>
            <div className="rounded border border-slate-200 bg-white p-6 text-center shadow-2xs">
              <p className="font-mono text-2xl font-bold text-violet-700 break-words">
                {estatisticas ? formatarValor(estatisticas.totalUcsBeneficiadas, 'inteiro') : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">UCs beneficiadas por crédito de energia</p>
            </div>
            {/* RF-005 item 4: ESTIMATIVA, nunca contagem exata — UCs
                residenciais beneficiadas × média nacional de moradores por
                domicílio (IBGE, Censo 2022). Rótulo "(estimativa)" fica
                sempre visível, sem tooltip escondendo isso. */}
            <div
              className="rounded border border-slate-200 bg-white p-6 text-center shadow-2xs"
              title={
                estatisticas
                  ? `${formatarValor(estatisticas.pessoasBeneficiadas.totalUcsResidenciaisBeneficiadas, 'inteiro')} UCs residenciais beneficiadas × ${estatisticas.pessoasBeneficiadas.mediaPessoasPorDomicilio} pessoas/domicílio. Fonte: ${estatisticas.pessoasBeneficiadas.fonteMediaPessoasPorDomicilio}`
                  : undefined
              }
            >
              <p className="font-mono text-2xl font-bold text-violet-700 break-words">
                {estatisticas
                  ? formatarValor(estatisticas.pessoasBeneficiadas.pessoasBeneficiadasEstimativa, 'inteiro')
                  : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Pessoas beneficiadas <span className="text-slate-400">(estimativa)</span>
              </p>
            </div>
            <div className="rounded border border-slate-200 bg-white p-6 text-center shadow-2xs">
              <p className="font-mono text-2xl font-bold text-violet-700 break-words">
                {estatisticas
                  ? `${formatarValor(estatisticas.potenciaTotalInstaladaKw / 1000, 'numero')} MW`
                  : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">Potência total instalada</p>
            </div>
            <div className="rounded border border-slate-200 bg-white p-6 text-center shadow-2xs">
              <p className="font-mono text-2xl font-bold text-violet-700 break-words">
                {estatisticas
                  ? formatarValor(estatisticas.totalMunicipiosComMmgd, 'inteiro')
                  : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">Municípios com presença de MMGD</p>
            </div>
            {/* RF-005 item 5 — RESOLVIDO em 21/07/2026 (ver
                estatisticasNacionais.service.ts): geração MMGD (EPE/PDGD) /
                geração elétrica total do Brasil (EPE/BEN), mesmo ano. Fica
                "—" se os extractors de indicadores_energia_nacional nunca
                rodaram neste ambiente — nunca fabricado. */}
            <div
              className="rounded border border-slate-200 bg-white p-6 text-center shadow-2xs"
              title={
                estatisticas?.participacaoMatrizNacional
                  ? `${formatarValor(estatisticas.participacaoMatrizNacional.geracaoMmgdGwh, 'numero')} GWh (MMGD) / ${formatarValor(estatisticas.participacaoMatrizNacional.geracaoEletricaNacionalGwh, 'numero')} GWh (Brasil), ${estatisticas.participacaoMatrizNacional.periodoReferencia.slice(0, 4)}. Fontes: ${estatisticas.participacaoMatrizNacional.fonteMmgd}; ${estatisticas.participacaoMatrizNacional.fonteGeracaoNacional}`
                  : undefined
              }
            >
              <p className="font-mono text-2xl font-bold text-violet-700 break-words">
                {estatisticas?.participacaoMatrizNacional
                  ? formatarValor(estatisticas.participacaoMatrizNacional.participacaoPercentual, 'percentual')
                  : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Participação na geração elétrica nacional
                {estatisticas?.participacaoMatrizNacional && (
                  <span className="text-slate-400">
                    {' '}
                    ({estatisticas.participacaoMatrizNacional.periodoReferencia.slice(0, 4)})
                  </span>
                )}
              </p>
            </div>
          </div>

          {estatisticas && (
            <p className="mt-3 text-center text-xs text-slate-400">
              "Pessoas beneficiadas" é estimativa ({estatisticas.pessoasBeneficiadas.mediaPessoasPorDomicilio}{' '}
              pessoas/domicílio, {estatisticas.pessoasBeneficiadas.fonteMediaPessoasPorDomicilio}), não contagem exata.
            </p>
          )}

          {/* RF-005 pede também "projeção futura" — não calculável com o
              schema atual (ver estatisticasNacionais.service.ts, backend).
              Exibida como "em breve" com o motivo real, nunca com número
              inventado — mesmo princípio das notas de ausência documentada
              do painel de município (utils/notasAusencia.ts). "Participação
              na matriz nacional" (item 5) SAIU desta lista em 21/07/2026 —
              virou KPI real no grid acima. */}
          {estatisticas && estatisticas.indicadoresIndisponiveis.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-3 mx-auto max-w-sm">
              {estatisticas.indicadoresIndisponiveis.map((indicador) => (
                <div
                  key={indicador.id}
                  className="rounded border border-dashed border-slate-300 bg-white p-4 text-left"
                >
                  <p className="font-mono text-sm font-semibold text-slate-400">Em breve</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{indicador.rotulo}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{indicador.motivo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Principais achados + tour virtual (pedido do usuário, 21/07/2026).
          Carrossel simples (React/CSS, sem lib nova — decisão do usuário
          entre as duas opções apresentadas). Números ao vivo da API, ver
          TourAchados.tsx. */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <span className="mb-1 block text-center text-[9px] font-mono font-bold uppercase tracking-wider text-violet-700">
            Tour Virtual
          </span>
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
            Principais achados da análise
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500">
            Um resumo guiado do que o Atlas encontrou ao cruzar potencial solar, vulnerabilidade
            social e acesso efetivo à energia limpa.
          </p>
          <div className="mt-8">
            <TourAchados
              totalVazios={totalVazios}
              percentualVazios={percentualVazios}
              rhoPrecariedade={analisePrecariedade?.rhoParcial ?? null}
              regioesConcordantesPrecariedade={analisePrecariedade?.nRegioesMesmoSinal ?? null}
              regioesTestadasPrecariedade={analisePrecariedade?.nRegioesTestadas ?? null}
            />
          </div>
        </div>
      </section>

      {/* RF-006: fontes de dados primárias. */}
      <section className="mx-auto max-w-5xl rounded border border-slate-200 bg-white px-6 py-10 shadow-2xs sm:px-10 my-16">
        <h2 className="text-lg font-bold uppercase tracking-tight text-slate-900">
          Fontes de dados
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Todos os indicadores do Atlas vêm de bases públicas oficiais.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FONTES_DE_DADOS.map((fonte) => (
            <div key={fonte.nome} className="rounded border border-slate-100 bg-slate-50 p-4">
              <span className="mb-1 block font-mono text-[10px] font-bold text-violet-700">
                {fonte.nome}
              </span>
              <p className="text-sm text-slate-600">{fonte.descricao}</p>
            </div>
          ))}
        </div>

        {/* Diagrama "como os dados se conectam" (pedido do usuário,
            21/07/2026) — dimensões de dados → indicadores compostos. Ver
            docstring de DiagramaConexaoDados.tsx: linha só existe onde a
            relação é real e já documentada, nunca inventada. */}
        <h3 className="mt-10 text-sm font-bold uppercase tracking-tight text-slate-900">
          Como os dados se conectam
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Das 9 dimensões de dados do Atlas aos indicadores compostos que elas alimentam.
        </p>
        <div className="mt-4">
          <DiagramaConexaoDados />
        </div>
      </section>

      {/* Explicação metodológica + download da Nota Metodológica (pedido do
          usuário, 21/07/2026). Seção DISTINTA de "Fontes de dados" (de onde
          vêm os dados) e de "Referências metodológicas" (diálogo com o
          OBEPE) — esta explica COMO a plataforma classifica os territórios.
          O PDF reaproveita o mesmo texto oficial de NOTA_METODOLOGICA
          (backend, vaziosDeAcesso.service.ts), não uma versão reescrita. */}
      <section className="mx-auto max-w-4xl rounded border border-slate-200 bg-white px-6 py-10 shadow-2xs sm:px-10 my-16">
        <h2 className="text-lg font-bold uppercase tracking-tight text-slate-900">
          Como classificamos os territórios
        </h2>
        <p className="mt-4 leading-relaxed text-slate-600">
          A classificação de <strong>Vazio de Acesso</strong> é um corte simples: cada
          município é comparado à mediana nacional de irradiação solar e à mediana nacional
          de adoção residencial de MMGD per capita. Alta irradiação combinada a baixa adoção
          é o sinal de território prioritário — sol sobrando, energia limpa não chegando. É
          um recorte que <strong>não controla renda</strong>: parte da concentração observada
          em regiões de menor renda reflete o próprio gargalo econômico, não só potencial
          solar desperdiçado. Já o <strong>IVSH</strong> (Índice de Vulnerabilidade
          Sócio-Habitacional-Energética) combina vulnerabilidade social geral, precariedade da
          moradia e insegurança da posse da terra num critério de priorização alternativo, para
          quem quer considerar a condição da moradia na decisão.
        </p>
        <div className="mt-6 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="button"
            onClick={aoBaixarNotaMetodologica}
            disabled={baixandoNota}
            className="rounded border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {baixandoNota ? 'Gerando…' : 'Baixar Nota Metodológica (PDF)'}
          </button>
          <span className="text-xs text-slate-400">
            Documento completo: critérios de classificação, IVS/IVSH e todas as fontes de dados.
          </span>
        </div>
        {erroNota && <p className="mt-2 text-xs text-red-600">{erroNota}</p>}
      </section>

      {/* RF-007/RT-005/RF-078: Referências Metodológicas — seção DISTINTA das
          fontes de dados. O OBEPE inspira a metodologia do Índice de Pobreza
          Energética Regional (ver ARQUITETURA.md), mas nunca é listado como
          fonte de dado primário. */}
      <section id="referencias-metodologicas" className="px-6 py-16">
        <div className="mx-auto max-w-4xl rounded border border-slate-800 bg-slate-900 p-8 text-white shadow-2xs sm:p-10">
          <span className="mb-2 block text-[10px] font-mono font-semibold uppercase tracking-widest text-violet-400">
            Definição e Enquadramento Analítico
          </span>
          <h2 className="text-xl font-bold tracking-tight text-white">Referências metodológicas</h2>
          <div className="my-4 h-1 w-16 bg-violet-500" />
          <p className="leading-relaxed text-slate-300">
            O Índice de Pobreza Energética Regional do Atlas é elaboração própria, construída a
            partir das fontes primárias já listadas acima (IBGE, CadÚnico, TSEE, IVS/IPEA), mas
            inspirada na abordagem metodológica do{' '}
            <strong>Observatório Brasileiro de Erradicação da Pobreza Energética (OBEPE)</strong>.
            O OBEPE é uma referência de diálogo metodológico, não uma fonte de dado bruto do
            Atlas — por isso aparece aqui, separado da seção de Fontes de Dados.
          </p>

          {/* RF-005 item 5 ("participação da solar distribuída na matriz
              elétrica nacional") — RESOLVIDO em 21/07/2026: virou KPI real
              na seção "O Brasil em números" (geração MMGD/EPE-PDGD dividida
              pela geração elétrica total do Brasil/EPE-BEN, ver
              estatisticasNacionais.service.ts). Esta citação continua aqui
              como cross-check independente: o número já vinha publicado pela
              EPE antes do Atlas calcular o seu, e os dois bateram. */}
          <p className="mt-6 leading-relaxed text-slate-300">
            Como cross-check independente do KPI calculado acima, a Empresa de Pesquisa
            Energética (EPE) registra no Balanço Energético Nacional 2026 (ano-base 2025) que a
            micro e minigeração distribuída (MMGD) representou <strong>7,0%</strong> da geração
            elétrica total do Brasil em 2025 — muito próximo do{' '}
            {estatisticas?.participacaoMatrizNacional
              ? formatarValor(estatisticas.participacaoMatrizNacional.participacaoPercentual, 'percentual')
              : '~7,0%'}{' '}
            calculado pelo próprio Atlas a partir das mesmas fontes primárias (EPE/PDGD ÷
            EPE/BEN).
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Fonte: EPE, Balanço Energético Nacional 2026 — ano-base 2025 (Relatório Síntese,
            publicado em 03/06/2026).
          </p>
        </div>
      </section>

      {/* RF-008: footer institucional. */}
      <footer className="border-t border-slate-200 px-6 py-8 text-center font-mono text-[10px] text-slate-400">
        <p>Atlas Solar Justo © 2026 — plataforma de justiça energética.</p>
        <p className="mt-1">
          Dados públicos oficiais · Metodologia documentada · Ver ARQUITETURA.md do projeto.
        </p>
      </footer>
    </div>
  );
}
