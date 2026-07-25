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
}

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

/**
 * Paleta institucional do Pólis (25/07/2026, 2ª rodada de auditoria de
 * UX/UI): terracota/carmim/chumbo substituem o âmbar/laranja/verde da
 * rodada anterior — a leitura "verde e amarelo" remetia a painel de
 * governo, não a um observatório técnico independente do Instituto.
 */
type CorDestaqueCard = 'terracota' | 'carmim' | 'chumbo';

const ESTILOS_DESTAQUE_CARD: Record<CorDestaqueCard, { icone: string; link: string; sombraHover: string }> = {
  terracota: {
    icone: 'bg-orange-50 text-orange-600 shadow-inner ring-1 ring-orange-100/50',
    link: 'text-orange-600 group-hover:text-orange-700',
    sombraHover: 'hover:shadow-[0_12px_40px_rgb(234,88,12,0.08)]',
  },
  carmim: {
    icone: 'bg-red-50 text-red-600 shadow-inner ring-1 ring-red-100/50',
    link: 'text-red-600 group-hover:text-red-700',
    sombraHover: 'hover:shadow-[0_12px_40px_rgb(185,28,28,0.08)]',
  },
  chumbo: {
    icone: 'bg-stone-100 text-stone-700 shadow-inner ring-1 ring-stone-200/50',
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
      className={`group relative flex flex-col justify-between rounded-3xl border border-white/80 bg-white/50 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/70 ${estilo.sombraHover}`}
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
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-40 -z-10 h-[600px] w-[600px] rounded-full bg-orange-100/50 mix-blend-multiply blur-[120px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-20 -right-20 -z-10 h-[500px] w-[500px] rounded-full bg-red-100/40 mix-blend-multiply blur-[100px]"
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
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-red-600 to-red-700 px-6 py-3 text-xs font-mono font-bold uppercase tracking-wider text-white shadow-[0_8px_20px_rgba(185,28,28,0.25)] ring-1 ring-inset ring-white/20 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_25px_rgba(185,28,28,0.35)] active:scale-95"
            >
              Explorar o Atlas
              <IconeSeta className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#sobre"
              className="rounded-xl border border-stone-200 bg-white/50 px-6 py-3 text-xs font-bold uppercase tracking-wider text-stone-700 backdrop-blur-lg transition-all hover:bg-white/90 hover:border-stone-300"
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
