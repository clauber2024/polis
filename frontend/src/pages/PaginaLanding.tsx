import { useEffect, useState, type ReactNode, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  /** Agrupamento semântico (25/07/2026, auditoria de UX/UI) — mostra domínio
   * sobre o território analisado em vez de despejar 11 siglas soltas; não
   * muda nome/descrição reais, só organiza a mesma lista por categoria. */
  categoria: string;
  /** Prefixo literal de `descricao` (hierarquia tipográfica, pedido do
   * usuário) — precisa bater com o início exato do texto, nunca um resumo
   * novo: renderizado em negrito, o resto de `descricao` continua leve. */
  destaque: string;
}

const ORDEM_CATEGORIAS = [
  'Energia e Infraestrutura Elétrica',
  'Território e Clima',
  'Vulnerabilidade Social e Renda',
  'Moradia e Crédito Habitacional',
] as const;

function IconeSeta(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function IconeBarras(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconeCasa(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function IconeMapa(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </svg>
  );
}

function IconeBanco(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}

function IconeRede(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="19" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M7 7.5 10 16" />
      <path d="M17 7.5 14 16" />
    </svg>
  );
}

function IconeCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.2 2.2 4.8-5" />
    </svg>
  );
}

function IconeArquivo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function IconeDownload(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconeEscudo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconeRaio(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

const formatoCompacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** Abreviação (ex.: "4,5 mi") só para os KPIs de destaque desta página — não
 * mexe em formatarValor/formatadores.ts, que outras telas usam por extenso. */
function formatarCompacto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return 'sem dado';
  return formatoCompacto.format(valor);
}

const NOMES_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/**
 * "2026-06-01" -> "Junho de 2026". Faz parsing direto dos componentes
 * ano/mês da string (sem passar por `Date`/timezone) — periodoReferencia é
 * uma data calendário (mês de referência), não um instante; construir um
 * `Date` a partir dela e formatar em America/Sao_Paulo arriscaria cair no
 * mês anterior (mesma armadilha de fuso já documentada em formatadores.ts).
 */
function formatarMesAno(isoString: string): string {
  const [ano, mes] = isoString.split('-');
  const nomeMes = NOMES_MESES[Number(mes) - 1] ?? mes;
  return `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)} de ${ano}`;
}

/**
 * Paleta institucional do Pólis (25/07/2026, 2ª rodada de auditoria de
 * UX/UI): terracota/carmim/chumbo substituem o âmbar/laranja/verde da
 * rodada anterior — a leitura "verde e amarelo" remetia a painel de
 * governo, não a um observatório técnico independente do Instituto.
 */
type CorDestaqueCard = 'terracota' | 'carmim' | 'chumbo';

const ESTILOS_DESTAQUE_CARD: Record<CorDestaqueCard, { icone: string; link: string; sombraHover: string }> = {
  terracota: {
    icone: 'bg-orange-50/80 text-orange-600 shadow-inner ring-1 ring-orange-200/50',
    link: 'text-orange-600 group-hover:text-orange-700',
    sombraHover: 'hover:shadow-[0_12px_40px_rgb(234,88,12,0.08)]',
  },
  carmim: {
    icone: 'bg-red-50/80 text-red-600 shadow-inner ring-1 ring-red-200/50',
    link: 'text-red-600 group-hover:text-red-700',
    sombraHover: 'hover:shadow-[0_12px_40px_rgb(185,28,28,0.08)]',
  },
  chumbo: {
    icone: 'bg-stone-100/80 text-stone-700 shadow-inner ring-1 ring-stone-200/50',
    link: 'text-stone-700 group-hover:text-stone-900',
    sombraHover: 'hover:shadow-[0_12px_40px_rgb(28,25,23,0.08)]',
  },
};

interface CardExplicativoProps {
  corDestaque: CorDestaqueCard;
  icone: ReactNode;
  pergunta: string;
  resposta: string;
  linkPara: string;
  linkTexto: string;
}

/**
 * Card diluído (ícone + pergunta como título + uma frase de resposta) com
 * CTA de seta — troca o bloco pastel sólido da rodada anterior por vidro de
 * verdade (bg-white/30 + backdrop-blur-xl) e adiciona a microinteração de
 * hover pedida na auditoria (seta desliza no hover do link).
 */
function CardExplicativo({ corDestaque, icone, pergunta, resposta, linkPara, linkTexto }: CardExplicativoProps) {
  const estilo = ESTILOS_DESTAQUE_CARD[corDestaque];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4 }}
      className={`group relative flex flex-col justify-between rounded-3xl border border-white/60 bg-white/30 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/50 ${estilo.sombraHover}`}
    >
      <div>
        <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-2xl ${estilo.icone}`}>
          {icone}
        </div>
        <h3 className="mb-3 text-lg font-bold leading-snug text-stone-900">{pergunta}</h3>
        <p className="text-sm leading-relaxed text-stone-600">{resposta}</p>
      </div>
      <Link to={linkPara} className={`mt-8 inline-flex items-center gap-2 text-sm font-bold transition-colors ${estilo.link}`}>
        {linkTexto}
        <IconeSeta className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
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
    categoria: 'Energia e Infraestrutura Elétrica',
    destaque: 'Micro e minigeração distribuída',
  },
  {
    nome: 'IBGE — Censo 2022',
    descricao:
      'Infraestrutura urbana, moradia, tipo de domicílio, alfabetização, densidade populacional e Cadastro Nacional de Favelas e Comunidades Urbanas.',
    categoria: 'Moradia e Crédito Habitacional',
    destaque: 'Infraestrutura urbana, moradia',
  },
  {
    nome: 'CadÚnico',
    descricao: 'Cobertura e pobreza entre famílias cadastradas no Cadastro Único.',
    categoria: 'Vulnerabilidade Social e Renda',
    destaque: 'Cobertura e pobreza',
  },
  {
    nome: 'TSEE',
    descricao: 'Tarifa Social de Energia Elétrica — beneficiários por subclasse residencial.',
    categoria: 'Vulnerabilidade Social e Renda',
    destaque: 'Tarifa Social de Energia Elétrica',
  },
  {
    nome: 'IVS/IPEA',
    descricao: 'Índice de Vulnerabilidade Social, consolidado por município.',
    categoria: 'Vulnerabilidade Social e Renda',
    destaque: 'Índice de Vulnerabilidade Social',
  },
  {
    nome: 'INPE',
    descricao:
      'Irradiação solar (Atlas Solar 2017, LABREN/CCST — média climatológica 1999–2015) e precipitação mensal (MERGE/CPTEC).',
    categoria: 'Território e Clima',
    destaque: 'Irradiação solar',
  },
  {
    nome: 'RAIS — Ministério do Trabalho',
    descricao: 'Renda média domiciliar e indicadores de trabalho, via BigQuery.',
    categoria: 'Vulnerabilidade Social e Renda',
    destaque: 'Renda média domiciliar',
  },
  {
    nome: 'DATASUS',
    descricao: 'Mortalidade infantil (SIM + SINASC).',
    categoria: 'Vulnerabilidade Social e Renda',
    destaque: 'Mortalidade infantil',
  },
  {
    nome: 'Caixa/FGTS e Ministério das Cidades',
    descricao: 'Programa Minha Casa Minha Vida — unidades habitacionais entregues (faixas FGTS e OGU).',
    categoria: 'Moradia e Crédito Habitacional',
    destaque: 'Programa Minha Casa Minha Vida',
  },
  {
    nome: 'Prefeituras municipais',
    descricao:
      'Zonas Especiais de Interesse Social (ZEIS/AEIS) — hoje 8 municípios: São Paulo, Recife, Rio Branco, Belo Horizonte, Contagem, Fortaleza, Salvador e Rio de Janeiro.',
    categoria: 'Moradia e Crédito Habitacional',
    destaque: 'Zonas Especiais de Interesse Social',
  },
  {
    nome: 'Caixa Econômica Federal',
    descricao:
      'Programa Reforma Casa Brasil Solar — fonte pontual (extrato via Lei de Acesso à Informação, nov/2025–abr/2026), não uma base pública/automatizável como as demais.',
    categoria: 'Moradia e Crédito Habitacional',
    destaque: 'Programa Reforma Casa Brasil Solar',
  },
];

const FONTES_POR_CATEGORIA = ORDEM_CATEGORIAS.map((categoria) => ({
  categoria,
  fontes: FONTES_DE_DADOS.filter((fonte) => fonte.categoria === categoria),
}));

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
          <span className="bg-gradient-to-r from-orange-600 to-red-700 bg-clip-text text-transparent">
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

      {/* RF-003/RF-004: hero + cards no mesmo bloco visual, com camadas de
          desfoque coloridas atrás do glass (3ª rodada de auditoria de
          UX/UI, 25/07/2026) — o container cinza "O que o Atlas faz" (heading
          + parágrafo) foi eliminado: as perguntas dos cards já comunicam o
          que a plataforma faz, sem repetir o que o H1 e o lead já disseram.
          id="sobre" migrou para o grid de cards, alvo real do CTA "Saiba
          mais". */}
      <section className="relative overflow-hidden px-6 py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-stone-50" />
        {/* Orbes "respirando" (5ª rodada de auditoria de UX/UI, 25/07/2026):
            animação sutil de escala/opacidade para o vazamento de cor atrás
            do glass ficar perceptível mesmo em captura estática. */}
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute -top-40 -left-40 -z-10 h-[600px] w-[600px] rounded-full bg-orange-200/40 mix-blend-multiply blur-[120px]"
        />
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="pointer-events-none absolute top-20 -right-20 -z-10 h-[500px] w-[500px] rounded-full bg-red-200/30 mix-blend-multiply blur-[100px]"
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-red-200/40 bg-white/50 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-red-700 shadow-[0_2px_10px_rgba(185,28,28,0.05)] backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
            </span>
            <span>Justiça Energética &amp; Território</span>
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
            Justiça energética é mapear{' '}
            <span className="bg-gradient-to-r from-orange-600 to-red-700 bg-clip-text text-transparent">
              quem tem acesso estrutural
            </span>{' '}
            à energia solar no Brasil
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-stone-600">
            O Atlas cruza potencial de irradiação solar, vulnerabilidade social e acesso real à
            energia limpa. Um observatório de dados para apoiar formuladores de política pública
            a otimizar fundos climáticos e adaptar o crédito à realidade morfológica de cada
            território.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/mapa"
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-red-600 to-red-800 px-6 py-3 text-xs font-mono font-bold uppercase tracking-wider text-white shadow-[0_8px_25px_rgba(185,28,28,0.25)] ring-1 ring-inset ring-white/20 transition-all hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(185,28,28,0.4)] active:scale-95"
            >
              Explorar o Atlas
              <IconeSeta className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#sobre"
              className="rounded-xl border border-stone-200 bg-white/40 px-6 py-3 text-xs font-bold uppercase tracking-wider text-stone-700 shadow-sm backdrop-blur-lg transition-all hover:bg-white/70 hover:text-stone-900"
            >
              Saiba mais
            </a>
          </div>
        </motion.div>

        {/* RF-004: convite interativo aos 3 componentes premium (Gráfico de
            Quadrantes, Alternador IVSH, Radar de Descompasso Morfológico) —
            ver docs/PLANO_ATUAL.md e docs/DECISOES.md para a metodologia e os
            limiares reais por trás de cada um (percentil 90 de precariedade
            habitacional corrigido em 20/07/2026). */}
        <div id="sobre" className="mx-auto mt-20 grid max-w-5xl scroll-mt-24 grid-cols-1 gap-6 sm:grid-cols-3">
          <CardExplicativo
            corDestaque="terracota"
            icone={<IconeBarras className="h-6 w-6" strokeWidth={2.5} />}
            pergunta="Onde o sol sobra e a energia limpa não chega?"
            resposta="O Gráfico de Quadrantes cruza irradiação solar com adoção residencial de energia solar e revela os vazios de acesso."
            linkPara="/painel-analitico"
            linkTexto="Explorar Quadrantes"
          />
          <CardExplicativo
            corDestaque="carmim"
            icone={<IconeCasa className="h-6 w-6" strokeWidth={2.5} />}
            pergunta="A infraestrutura da moradia suporta a solução?"
            resposta="O Índice de Vulnerabilidade Sócio-Habitacional-Energética (IVSH) identifica onde a precariedade construtiva ou a insegurança da posse impedem a instalação segura de painéis."
            linkPara="/vazios-de-acesso"
            linkTexto="Ligar a lente habitacional"
          />
          <CardExplicativo
            corDestaque="chumbo"
            icone={<IconeMapa className="h-6 w-6" strokeWidth={2.5} />}
            pergunta="Quando o crédito individual não é a resposta?"
            resposta="Para territórios com descompasso morfológico, o mapa sinaliza a necessidade de modelos de geração compartilhada."
            linkPara="/mapa"
            linkTexto="Visualizar no mapa"
          />
        </div>
      </section>

      {/* RF-005: indicadores nacionais em destaque, sintetizados em 3 KPIs
          estratégicos (5ª rodada de auditoria de UX/UI, 25/07/2026) — os 6
          números brutos viraram 3 cards de vidro (Capacidade Instalada,
          Acesso e Renda, Presença Territorial), sem sigla técnica na visão
          principal e com os grandes números abreviados via formatarCompacto
          (evita a quebra de linha no meio do dígito). Os valores e o
          disclaimer de estimativa continuam vindo 100% de `estatisticas`
          (buscarEstatisticasNacionais) — nenhuma chamada nova, só reagrupada
          a apresentação. */}
      <section className="relative overflow-hidden bg-stone-50 px-6 py-16">
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.05, 1], opacity: [0.4, 0.6, 0.4] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute top-0 right-1/4 -z-10 h-[500px] w-[500px] rounded-full bg-orange-100/60 mix-blend-multiply blur-[100px]"
        />
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="pointer-events-none absolute bottom-0 left-1/4 -z-10 h-[600px] w-[600px] rounded-full bg-red-100/50 mix-blend-multiply blur-[120px]"
        />

        <div className="relative z-10 mx-auto max-w-5xl">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200/50 bg-white/60 px-3 py-1 shadow-sm backdrop-blur-md">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-stone-600">
                Panorama Nacional
                {estatisticas?.periodoReferencia && ` · Atualizado em: ${formatarMesAno(estatisticas.periodoReferencia)}`}
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              A infraestrutura cresce. <span className="text-red-700">O acesso acompanha?</span>
            </h2>
          </div>

          {erroEstatisticas && !estatisticas && (
            <p className="mt-6 text-center text-sm text-red-600">{erroEstatisticas}</p>
          )}

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* KPI 1 — Capacidade Instalada (chumbo): potência em GW, nunca
                "50.086,23 MW" quebrando linha no meio do número. */}
            <div className="relative flex flex-col rounded-3xl border border-white/80 bg-white/40 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition-all hover:-translate-y-1 hover:bg-white/60 hover:shadow-[0_12px_40px_rgb(28,25,23,0.06)]">
              <div className="mb-6 flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-200/50 text-stone-700 shadow-inner ring-1 ring-stone-200">
                  <IconeRaio className="h-5 w-5" strokeWidth={2.5} />
                </span>
                {estatisticas?.participacaoMatrizNacional && (
                  <span
                    className="rounded-md bg-stone-100/80 px-2.5 py-1 text-xs font-bold text-stone-700 ring-1 ring-stone-200/50 backdrop-blur-sm"
                    title={`${formatarValor(estatisticas.participacaoMatrizNacional.geracaoMmgdGwh, 'numero')} GWh (energia solar) / ${formatarValor(estatisticas.participacaoMatrizNacional.geracaoEletricaNacionalGwh, 'numero')} GWh (Brasil), ${estatisticas.participacaoMatrizNacional.periodoReferencia.slice(0, 4)}. Fontes: ${estatisticas.participacaoMatrizNacional.fonteMmgd}; ${estatisticas.participacaoMatrizNacional.fonteGeracaoNacional}`}
                  >
                    {formatarValor(estatisticas.participacaoMatrizNacional.participacaoPercentual, 'percentual')} da matriz
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">Capacidade instalada</p>
              <div className="mt-2 flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-5xl font-extrabold tracking-tight text-stone-900">
                  {estatisticas ? formatarValor(estatisticas.potenciaTotalInstaladaKw / 1_000_000, 'inteiro') : '—'}
                </span>
                <span className="text-xl font-bold text-stone-600">GW</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-stone-600">
                Distribuídos em{' '}
                <strong className="text-stone-800">
                  {estatisticas ? formatarCompacto(estatisticas.totalInstalacoesMmgd) : '—'}
                </strong>{' '}
                sistemas de energia solar conectados à rede nacional.
              </p>
            </div>

            {/* KPI 2 — Acesso e Renda (terracota): "UCs" vira "imóveis com
                acesso"; a nota de estimativa continua visível no texto, só
                o detalhe do cálculo foi para o title (mesma regra de antes:
                nunca esconder que é estimativa). */}
            <div className="relative flex flex-col rounded-3xl border border-white/80 bg-orange-50/40 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition-all hover:-translate-y-1 hover:bg-orange-50/60 hover:shadow-[0_12px_40px_rgb(234,88,12,0.06)]">
              <div className="mb-6 flex items-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-200/50 text-orange-700 shadow-inner ring-1 ring-orange-200">
                  <IconeCasa className="h-5 w-5" strokeWidth={2.5} />
                </span>
              </div>
              <p className="text-sm font-semibold uppercase tracking-wide text-orange-800/70">Imóveis com acesso</p>
              <div className="mt-2 flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-5xl font-extrabold tracking-tight text-stone-900">
                  {estatisticas ? formatarCompacto(estatisticas.totalUcsBeneficiadas) : '—'}
                </span>
              </div>
              <p
                className="mt-4 text-sm leading-relaxed text-stone-600"
                title={
                  estatisticas
                    ? `${formatarValor(estatisticas.pessoasBeneficiadas.totalUcsResidenciaisBeneficiadas, 'inteiro')} UCs residenciais beneficiadas × ${estatisticas.pessoasBeneficiadas.mediaPessoasPorDomicilio} pessoas/domicílio. Fonte: ${estatisticas.pessoasBeneficiadas.fonteMediaPessoasPorDomicilio}`
                    : undefined
                }
              >
                Impacto estimado em{' '}
                <strong className="text-orange-700">
                  {estatisticas ? formatarCompacto(estatisticas.pessoasBeneficiadas.pessoasBeneficiadasEstimativa) : '—'}
                </strong>{' '}
                pessoas beneficiadas por crédito de energia <span className="text-stone-500">(estimativa)</span>.
              </p>
            </div>

            {/* KPI 3 — Presença Territorial (carmim): município é contagem
                exata, não abrevia; usa os mesmos totalVazios/percentualVazios
                já calculados acima para o Tour Virtual, sem nova chamada. */}
            <div className="relative flex flex-col rounded-3xl border border-white/80 bg-red-50/40 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition-all hover:-translate-y-1 hover:bg-red-50/60 hover:shadow-[0_12px_40px_rgb(185,28,28,0.06)]">
              <div className="mb-6 flex items-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-200/50 text-red-700 shadow-inner ring-1 ring-red-200">
                  <IconeMapa className="h-5 w-5" strokeWidth={2.5} />
                </span>
              </div>
              <p className="text-sm font-semibold uppercase tracking-wide text-red-800/70">Presença territorial</p>
              <div className="mt-2 flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-5xl font-extrabold tracking-tight text-stone-900">
                  {estatisticas ? formatarValor(estatisticas.totalMunicipiosComMmgd, 'inteiro') : '—'}
                </span>
                <span className="text-xl font-bold text-stone-600">municípios</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-stone-600">
                {percentualVazios !== null ? (
                  <>
                    A adoção já chega a quase todo o território, mas{' '}
                    <strong className="text-red-700">
                      {formatarValor(percentualVazios, 'numero')}% ainda são Vazios de Acesso
                    </strong>{' '}
                    — sol sobrando, energia limpa não chegando.
                  </>
                ) : (
                  'A adoção chegou a quase todas as cidades, mas o acesso intraurbano segue desigual.'
                )}
              </p>
            </div>
          </div>

          {/* Disclaimer ancorado numa caixa própria (6ª rodada de auditoria
              de UX/UI, 25/07/2026) — antes flutuava solto e lia como erro de
              formatação; agora tem uma âncora visual e contraste OK. */}
          {estatisticas && (
            <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-stone-200/40 bg-stone-100/30 p-4 backdrop-blur-sm">
              <p className="text-center text-[11px] font-medium leading-relaxed text-stone-500">
                * "Imóveis com acesso" e "pessoas beneficiadas" são estimativas metodológicas (base:{' '}
                {estatisticas.pessoasBeneficiadas.mediaPessoasPorDomicilio} pessoas/domicílio,{' '}
                {estatisticas.pessoasBeneficiadas.fonteMediaPessoasPorDomicilio}), não contagens unitárias
                exatas das concessionárias.
              </p>
            </div>
          )}

          {/* O bloco "Em breve" (projeção futura, indicadoresIndisponiveis)
              foi removido daqui por decisão do Diretor de UX/UI (25/07/2026,
              7ª rodada): um centro de inteligência permanente não deve
              ocupar espaço cognitivo do painel principal com módulo
              inacabado — o dado real de indicadoresIndisponiveis continua
              vindo da API, só não é mais renderizado nesta seção. */}
        </div>
      </section>

      {/* Principais achados + tour virtual (pedido do usuário, 21/07/2026).
          Carrossel simples (React/CSS, sem lib nova — decisão do usuário
          entre as duas opções apresentadas). Números ao vivo da API, ver
          TourAchados.tsx. */}
      <section className="relative overflow-hidden px-6 py-16">
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.05, 1], opacity: [0.4, 0.6, 0.4] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute top-0 right-1/3 -z-10 h-[500px] w-[500px] rounded-full bg-red-100/50 mix-blend-multiply blur-[120px] opacity-60"
        />
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
          className="pointer-events-none absolute bottom-0 left-1/3 -z-10 h-[500px] w-[500px] rounded-full bg-orange-100/40 mix-blend-multiply blur-[100px] opacity-50"
        />

        <div className="relative z-10 mx-auto max-w-4xl">
          <span className="mb-1 block text-center text-xs font-bold uppercase tracking-widest text-stone-500">
            Tour Virtual do Observatório
          </span>
          <h2 className="text-center text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Principais achados da análise
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-stone-600">
            Uma síntese estratégica cruzando potencial solar, vulnerabilidade habitacional e o
            impacto real das políticas de crédito.
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

      {/* RF-006: fontes de dados primárias, agora agrupadas por domínio de
          conhecimento (25/07/2026, auditoria de UX/UI) — a grade solta de 11
          siglas virou 4 categorias, e o diagrama de linhas cruzadas
          (DiagramaConexaoDados) virou cards de composição (ver esse arquivo
          para a lógica de origens/indicadores, só a apresentação mudou). */}
      <section className="relative my-16 overflow-hidden px-6 py-4">
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute top-0 right-1/4 -z-10 h-[500px] w-[500px] rounded-full bg-stone-200/50 mix-blend-multiply blur-[100px]"
        />
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.1, 1], opacity: [0.25, 0.4, 0.25] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="pointer-events-none absolute bottom-0 left-1/4 -z-10 h-[600px] w-[600px] rounded-full bg-red-100/40 mix-blend-multiply blur-[120px]"
        />
        {/* Textura ambiente (linhas horizontais bem sutis) — puramente
            decorativa, não representa nenhum dado ou fluxo real; só reforça
            a sensação de "motor rodando" atrás do glass sem inventar uma
            animação de dados que não existe. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.15] [background-image:linear-gradient(to_bottom,#a8a29e_1px,transparent_1px)] [background-size:100%_4rem]"
        />

        <div className="relative z-10 mx-auto max-w-5xl rounded-3xl border border-white/60 bg-white/40 px-6 py-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl sm:px-10">
          <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-tight text-stone-900">
            <IconeBanco className="h-5 w-5 text-stone-500" />
            Fontes de dados
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Todos os indicadores do Atlas vêm de bases públicas oficiais, organizadas por domínio.
          </p>

          <div className="mt-8 flex flex-col gap-8">
            {FONTES_POR_CATEGORIA.map(({ categoria, fontes }) => (
              <div key={categoria}>
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">{categoria}</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {fontes.map((fonte) => (
                    <div
                      key={fonte.nome}
                      className="flex flex-col rounded-2xl border border-white/80 bg-white/50 p-6 shadow-sm backdrop-blur-xl transition-all hover:bg-white/70"
                    >
                      <div className="mb-3 flex items-center gap-2 border-b border-stone-200/80 pb-3">
                        <span className="text-sm font-black tracking-widest text-red-700 uppercase">{fonte.nome}</span>
                      </div>
                      <p className="text-sm leading-relaxed font-medium text-stone-500">
                        <strong className="font-bold text-stone-900">{fonte.destaque}</strong>
                        {fonte.descricao.slice(fonte.destaque.length)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Cards de composição (pedido do usuário, 21/07/2026; redesenhados
              25/07/2026 — substitui o diagrama de linhas SVG cruzando caixas,
              que não era responsivo e lia como "teia de aranha". Cada
              indicador composto mostra suas dimensões de origem como badges,
              sem desenhar fio nenhum. Ver DiagramaConexaoDados.tsx para a
              lista real de dimensões/indicadores/origens — nenhuma relação
              nova foi inventada aqui, só reapresentada. */}
          <h3 className="mt-10 flex items-center gap-2 text-sm font-bold uppercase tracking-tight text-stone-900">
            <IconeRede className="h-4 w-4 text-stone-500" />
            Como os dados se conectam
          </h3>
          <p className="mt-1 text-xs text-stone-500">
            Das 9 dimensões de dados do Atlas aos indicadores compostos que elas alimentam.
          </p>
          <div className="mt-4">
            <DiagramaConexaoDados />
          </div>
        </div>
      </section>

      {/* Explicação metodológica + download da Nota Metodológica (pedido do
          usuário, 21/07/2026). Seção DISTINTA de "Fontes de dados" (de onde
          vêm os dados) e de "Referências metodológicas" (diálogo com o
          OBEPE) — esta explica COMO a plataforma classifica os territórios.
          O PDF reaproveita o mesmo texto oficial de NOTA_METODOLOGICA
          (backend, vaziosDeAcesso.service.ts), não uma versão reescrita. */}
      <section className="relative my-16 overflow-hidden px-6 py-4">
        <motion.div
          aria-hidden
          animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute top-10 left-1/3 -z-10 h-[500px] w-[500px] rounded-full bg-stone-200/50 mix-blend-multiply opacity-60 blur-[120px]"
        />

        <div className="relative z-10 mx-auto max-w-4xl rounded-3xl border border-white/80 bg-white/50 px-6 py-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl sm:px-10">
          <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-tight text-stone-900">
            <IconeEscudo className="h-5 w-5 text-red-700" />
            Critérios de enquadramento territorial
          </h2>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/70 bg-orange-50/40 p-6 shadow-sm backdrop-blur-md">
              <span className="inline-flex items-center rounded-lg border border-orange-200/60 bg-orange-100/70 px-3 py-1 text-[10px] font-bold tracking-widest text-orange-800 uppercase">
                Corte primário
              </span>
              <h3 className="mt-3 text-lg font-bold text-stone-900">Vazio de Acesso</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                Identifica território onde o potencial natural é desperdiçado.
              </p>
              <ul className="mt-4 space-y-2 text-sm font-medium text-stone-700">
                <li className="flex items-start gap-2">
                  <IconeCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                  Irradiação solar acima da mediana nacional.
                </li>
                <li className="flex items-start gap-2">
                  <IconeCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                  Adoção residencial de energia solar per capita abaixo da mediana nacional.
                </li>
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-stone-500">
                Não controla renda: parte da concentração em regiões de menor renda reflete o
                próprio gargalo econômico, não só potencial desperdiçado.
              </p>
            </div>

            <div className="rounded-2xl border border-white/70 bg-red-50/40 p-6 shadow-sm backdrop-blur-md">
              <span className="inline-flex items-center rounded-lg border border-red-200/60 bg-red-100/70 px-3 py-1 text-[10px] font-bold tracking-widest text-red-800 uppercase">
                Corte estrutural
              </span>
              <h3 className="mt-3 text-lg font-bold text-stone-900">IVSH</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                Critério de priorização alternativo focado na barreira física da moradia.
              </p>
              <ul className="mt-4 space-y-2 text-sm font-medium text-stone-700">
                <li className="flex items-start gap-2">
                  <IconeCheck className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  Pondera a vulnerabilidade social geral (renda, infraestrutura, capital humano).
                </li>
                <li className="flex items-start gap-2">
                  <IconeCheck className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  Soma precariedade construtiva e insegurança da posse da terra.
                </li>
              </ul>
            </div>
          </div>

          {/* Download da Nota Metodológica — mesma lógica de antes
              (aoBaixarNotaMetodologica/baixandoNota/erroNota), só com mais
              peso visual (pedido do usuário, 25/07/2026: era pequeno demais
              pra ser a principal conversão secundária da página). */}
          <div className="mt-8 flex flex-col items-start gap-4 rounded-2xl border border-white/70 bg-white/50 p-6 shadow-sm backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                <IconeArquivo className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900">Nota Metodológica completa</h4>
                <p className="text-xs text-stone-500">
                  Documento em PDF: critérios de classificação, IVS/IVSH e todas as fontes de dados.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={aoBaixarNotaMetodologica}
              disabled={baixandoNota}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-stone-800 hover:shadow-lg active:scale-95 disabled:opacity-60"
            >
              <IconeDownload className="h-4 w-4" />
              {baixandoNota ? 'Gerando…' : 'Baixar PDF'}
            </button>
          </div>
          {erroNota && <p className="mt-2 text-xs text-red-600">{erroNota}</p>}
        </div>
      </section>

      {/* RF-007/RT-005/RF-078: Referências Metodológicas — seção DISTINTA das
          fontes de dados. O OBEPE inspira a metodologia do Índice de Pobreza
          Energética Regional (ver ARQUITETURA.md), mas nunca é listado como
          fonte de dado primário. Reenquadrada em 25/07/2026 (auditoria de
          UX/UI) de "justificativa defensiva" para "selo de validação": o
          fato de o OBEPE não ser fonte de dado bruto continua dito (é
          metodologicamente importante), só que como reforço de
          auditabilidade, não como pedido de desculpas. Paleta trocada de
          roxo para chumbo/carmim (Pólis), mesmo tom escuro de antes. */}
      <section id="referencias-metodologicas" className="relative overflow-hidden px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-stone-800 bg-gradient-to-b from-stone-900 to-stone-950 p-8 shadow-2xl sm:p-10"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 -z-0 h-64 w-64 translate-x-1/3 -translate-y-1/3 rounded-full bg-red-600/10 blur-[60px]"
          />

          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stone-700 bg-stone-800/80 px-4 py-1.5 backdrop-blur-sm">
              <IconeEscudo className="h-4 w-4 text-red-500" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-stone-300">
                Aderência oficial e validação
              </span>
            </div>

            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
                  <span className="h-2 w-2 rounded-full bg-stone-500" />
                  Alinhamento com o OBEPE
                </h3>
                <p className="text-sm leading-relaxed text-stone-400">
                  O Índice de Pobreza Energética Regional do Atlas segue a mesma lente analítica
                  do <strong className="text-stone-200">Observatório Brasileiro de Erradicação da
                  Pobreza Energética (OBEPE)</strong>, estruturado a partir das fontes primárias já
                  auditáveis na seção Fontes de Dados (IBGE, CadÚnico, TSEE, IVS/IPEA). O OBEPE
                  entra como referência de diálogo metodológico — a base de dados em si continua
                  100% rastreável, nunca um dado bruto importado de fora.
                </p>
              </div>

              <div>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Validação cruzada (EPE)
                </h3>
                <p className="text-sm leading-relaxed text-stone-400">
                  Como atestado de precisão do motor de dados do Atlas, o KPI que calculamos para
                  a participação da energia solar distribuída na matriz elétrica nacional —{' '}
                  <strong className="text-stone-200">
                    {estatisticas?.participacaoMatrizNacional
                      ? formatarValor(estatisticas.participacaoMatrizNacional.participacaoPercentual, 'percentual')
                      : '~7,0%'}
                  </strong>{' '}
                  — mantém extrema aderência aos <strong className="text-stone-200">7,0%</strong>{' '}
                  publicados de forma independente pela Empresa de Pesquisa Energética (EPE) no
                  Balanço Energético Nacional 2026 (ano-base 2025), a partir das mesmas fontes
                  primárias (EPE/PDGD ÷ EPE/BEN).
                </p>
                <div className="mt-4 border-l-2 border-stone-700 pl-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500">
                    Fonte: EPE, Balanço Energético Nacional 2026 — ano-base 2025 (Relatório
                    Síntese, publicado em 03/06/2026).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
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
