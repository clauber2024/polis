import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { formatarValor } from '../../utils/formatadores';

/**
 * "Tour virtual" de principais achados (pedido do usuário, 21/07/2026) —
 * carrossel simples dentro da própria Landing Page (React/CSS, sem
 * dependência nova). Decisão pedida diretamente ao usuário entre duas
 * opções: este carrossel embutido vs. um tour guiado interativo destacando
 * elementos reais da UI em várias páginas (exigiria lib nova, ex.:
 * react-joyride/driver.js, e escopo bem maior) — usuário escolheu o
 * carrossel. Ver docs/DECISOES.md.
 *
 * Redesenhado em 25/07/2026 (auditoria de UX/UI, paleta Pólis): o antigo
 * slide 5 (CTA em "dark mode", bg-slate-900) quebrava o tema no meio do
 * carrossel — virou uma barra estática abaixo do card, sempre visível, em
 * vez de um passo que a maioria dos usuários nunca chegava a ver. O
 * carrossel agora tem só os 4 achados de dado.
 *
 * Só renderização — os números vêm prontos por props (buscados em
 * PaginaLanding via services, mesmo padrão de MapaMunicipios.tsx). Os 2
 * primeiros slides usam dado AO VIVO (GET /api/vazios-de-acesso,
 * GET /api/analises-estatisticas); os 2 seguintes citam achados já
 * publicados em docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md e
 * docs/SUMARIO_EXECUTIVO_MORADIA_ENERGIA_SOLAR.md (não recalculados aqui,
 * mas não fabricados — mesmos números do relatório validado).
 */

export interface TourAchadosProps {
  totalVazios: number | null;
  percentualVazios: number | null;
  rhoPrecariedade: number | null;
  regioesConcordantesPrecariedade: number | null;
  regioesTestadasPrecariedade: number | null;
}

type CorSlide = 'terracota' | 'carmim' | 'chumbo' | 'oportunidade';

interface Slide {
  rotulo: string;
  titulo: string;
  cor: CorSlide;
  destaque: { valor: string; legenda: string; metodologia?: string } | null;
  corpo: ReactNode;
}

function IconeSetaCarrossel(props: { className?: string; direcao?: 'esquerda' | 'direita' }) {
  const { className, direcao = 'direita' } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className ?? ''} ${direcao === 'esquerda' ? 'rotate-180' : ''}`}
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function IconeInfo(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function IconeMapaTour(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </svg>
  );
}

const CORES_SLIDE: Record<CorSlide, { destaqueBg: string; destaqueTexto: string; rotulo: string; barraAtiva: string }> = {
  terracota: {
    destaqueBg: 'from-orange-100 to-orange-50',
    destaqueTexto: 'text-orange-700',
    rotulo: 'text-orange-700',
    barraAtiva: 'bg-orange-600',
  },
  carmim: {
    destaqueBg: 'from-red-100 to-red-50',
    destaqueTexto: 'text-red-700',
    rotulo: 'text-red-700',
    barraAtiva: 'bg-red-700',
  },
  chumbo: {
    destaqueBg: 'from-stone-200 to-stone-100',
    destaqueTexto: 'text-stone-700',
    rotulo: 'text-stone-700',
    barraAtiva: 'bg-stone-700',
  },
  oportunidade: {
    destaqueBg: 'from-emerald-100 to-emerald-50',
    destaqueTexto: 'text-emerald-700',
    rotulo: 'text-emerald-700',
    barraAtiva: 'bg-emerald-600',
  },
};

export function TourAchados({
  totalVazios,
  percentualVazios,
  rhoPrecariedade,
  regioesConcordantesPrecariedade,
  regioesTestadasPrecariedade,
}: TourAchadosProps) {
  const [passo, setPasso] = useState(0);
  const [dicaMetodologiaVisivel, setDicaMetodologiaVisivel] = useState(false);

  const slides = useMemo<Slide[]>(
    () => [
      {
        rotulo: '01 · Panorama nacional',
        titulo: 'Onde o sol sobra, a energia limpa nem sempre chega',
        cor: 'terracota',
        destaque:
          totalVazios !== null && percentualVazios !== null
            ? {
                valor: `${formatarValor(percentualVazios, 'numero')}%`,
                legenda: `${formatarValor(totalVazios, 'inteiro')} municípios são Vazios de Acesso`,
              }
            : null,
        corpo:
          totalVazios !== null && percentualVazios !== null ? (
            <>
              Têm irradiação solar acima da mediana nacional, mas adoção residencial de energia
              solar abaixo da mediana — sol sobrando, energia limpa não chegando. Potencial
              desperdiçado, não falta de sol.
            </>
          ) : (
            'Carregando o panorama nacional de Vazios de Acesso…'
          ),
      },
      {
        rotulo: '02 · A moradia importa',
        titulo: 'Casa precária, menos energia solar — mesmo com renda e sol iguais',
        cor: 'carmim',
        destaque:
          rhoPrecariedade !== null
            ? {
                valor: formatarValor(rhoPrecariedade, 'numero'),
                legenda: 'Correlação negativa isolada',
                metodologia:
                  'Coeficiente de correlação parcial de Spearman — isola o efeito de renda e potencial solar antes de medir o peso da precariedade habitacional.',
              }
            : null,
        corpo:
          rhoPrecariedade !== null ? (
            <>
              Comparando municípios com a mesma renda e o mesmo potencial de sol, quanto maior a
              precariedade habitacional, menor a adoção solar residencial
              {regioesConcordantesPrecariedade !== null && regioesTestadasPrecariedade !== null
                ? ` — robusta em ${regioesConcordantesPrecariedade} das ${regioesTestadasPrecariedade} regiões do país`
                : ''}
              . O efeito é real e próprio — não é só um reflexo indireto de pobreza ou de falta de
              sol.
            </>
          ) : (
            'Carregando a análise estatística…'
          ),
      },
      {
        rotulo: '03 · Descompasso morfológico',
        titulo: 'Quando o telhado não aguenta o painel',
        cor: 'chumbo',
        destaque: { valor: '0', legenda: 'adoção solar residencial per capita em Uiramutã (RR)' },
        corpo: (
          <>
            Uiramutã tem irradiação solar acima da mediana nacional e um dos índices de
            precariedade habitacional mais altos do país — mesmo assim, adoção solar residencial
            zero. Nesses territórios, a resposta não é crédito para instalação individual: é
            geração compartilhada ou comunitária, que não depende de cada família ter um telhado
            apto.
          </>
        ),
      },
      {
        rotulo: '04 · Crédito habitacional-solar',
        titulo: 'Oportunidade de calibragem territorial no Reforma Casa Brasil Solar',
        cor: 'oportunidade',
        destaque: { valor: '−31%', legenda: 'menos recurso per capita em municípios Vazio de Acesso' },
        corpo: (
          <>
            Municípios classificados como Vazio de Acesso representam <strong>27,3%</strong> da
            base nacional, mas só <strong>20,8%</strong> dos contratos do programa Reforma Casa
            Brasil Solar. Há uma janela para redirecionar subsídios para onde o déficit de acesso
            é maior.
          </>
        ),
      },
    ],
    [totalVazios, percentualVazios, rhoPrecariedade, regioesConcordantesPrecariedade, regioesTestadasPrecariedade],
  );

  const atual = slides[passo];
  const cor = CORES_SLIDE[atual.cor];

  function irPara(indice: number) {
    setPasso(indice);
    setDicaMetodologiaVisivel(false);
  }

  return (
    <div>
      <div className="relative rounded-3xl border border-white/90 bg-white/50 p-8 shadow-[0_12px_40px_rgb(0,0,0,0.1)] backdrop-blur-2xl sm:p-10">
        <div className="mb-8 flex items-center justify-between border-b border-stone-200/60 pb-4">
          <span className={`font-mono text-xs font-bold tracking-wider uppercase ${cor.rotulo}`}>{atual.rotulo}</span>
          <span className="font-mono text-xs font-semibold text-stone-400">
            {passo + 1} / {slides.length}
          </span>
        </div>

        {/* Sem AnimatePresence/mode="wait" aqui de propósito: numa rodada
            anterior isso deixou o conteúdo (título/corpo) preso no slide
            errado ao trocar de passo, enquanto o cabeçalho (fora da
            animação) atualizava normalmente — bug confirmado clicando nos
            passos e inspecionando o DOM. `key` força remount a cada troca
            de passo, então a entrada ainda anima; só a saída do slide
            anterior deixou de ser animada. */}
        <div>
          <motion.div
            key={atual.rotulo}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="grid min-h-[220px] grid-cols-1 items-center gap-8 md:grid-cols-12"
          >
            {atual.destaque && (
              <div
                className={`relative flex shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br p-6 text-center shadow-inner ring-1 ring-black/5 md:col-span-5 ${cor.destaqueBg}`}
              >
                <div className="flex items-start gap-1.5">
                  <p className={`font-mono text-5xl font-extrabold tracking-tight ${cor.destaqueTexto}`}>
                    {atual.destaque.valor}
                  </p>
                  {atual.destaque.metodologia && (
                    <span
                      className="relative mt-2 inline-flex"
                      onMouseEnter={() => setDicaMetodologiaVisivel(true)}
                      onMouseLeave={() => setDicaMetodologiaVisivel(false)}
                    >
                      <button
                        type="button"
                        onFocus={() => setDicaMetodologiaVisivel(true)}
                        onBlur={() => setDicaMetodologiaVisivel(false)}
                        aria-label="Detalhe metodológico"
                        className={`opacity-60 transition-opacity hover:opacity-100 ${cor.destaqueTexto}`}
                      >
                        <IconeInfo className="h-4 w-4" />
                      </button>
                      <AnimatePresence>
                        {dicaMetodologiaVisivel && (
                          <motion.div
                            role="tooltip"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-lg border border-stone-700 bg-stone-800 p-3 text-left text-xs leading-relaxed text-stone-100 shadow-lg"
                          >
                            {atual.destaque.metodologia}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </span>
                  )}
                </div>
                <p className={`mt-2 text-sm font-medium opacity-80 ${cor.destaqueTexto}`}>{atual.destaque.legenda}</p>
              </div>
            )}
            <div className={atual.destaque ? 'md:col-span-7' : 'md:col-span-12'}>
              <h3 className="text-2xl font-bold leading-tight tracking-tight text-stone-900">{atual.titulo}</h3>
              <div className="mt-4 leading-relaxed text-stone-600">{atual.corpo}</div>
            </div>
          </motion.div>
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-stone-200/60 pt-6">
          <button
            type="button"
            onClick={() => irPara(Math.max(0, passo - 1))}
            disabled={passo === 0}
            className="flex items-center gap-2 text-sm font-semibold text-stone-500 transition-colors hover:text-stone-900 disabled:opacity-30"
          >
            <IconeSetaCarrossel direcao="esquerda" className="h-4 w-4" />
            Anterior
          </button>

          <div className="flex items-center gap-2">
            {slides.map((slide, indice) => (
              <button
                key={slide.rotulo}
                type="button"
                aria-label={`Ir para o passo ${indice + 1}`}
                aria-current={indice === passo}
                onClick={() => irPara(indice)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  indice === passo ? `w-6 ${cor.barraAtiva}` : 'w-1.5 bg-stone-300 hover:bg-stone-400'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => irPara(Math.min(slides.length - 1, passo + 1))}
            disabled={passo === slides.length - 1}
            className="flex items-center gap-2 text-sm font-semibold text-stone-900 transition-colors hover:text-red-700 disabled:opacity-30"
          >
            Próximo
            <IconeSetaCarrossel direcao="direita" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Antigo "slide 5" — vira uma barra fixa abaixo do carrossel, sempre
          visível, em vez de um passo que a maioria nunca chegava a ver. */}
      <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-stone-800 to-stone-900 p-6 shadow-xl sm:flex-row">
        <div className="flex items-center gap-3 text-white">
          <IconeMapaTour className="h-6 w-6 shrink-0 text-red-400" />
          <div>
            <h4 className="text-sm font-bold">Estes achados estão vivos no Atlas</h4>
            <p className="text-xs text-stone-400">Explore os microdados cruzados nas telas abaixo.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
          <Link
            to="/mapa"
            className="rounded-lg bg-white px-4 py-2 text-center text-xs font-mono font-bold uppercase tracking-wider text-stone-950 transition-colors hover:bg-stone-100"
          >
            Explorar o mapa
          </Link>
          <Link
            to="/dossie-executivo"
            className="rounded-lg border border-stone-600 px-4 py-2 text-center text-xs font-bold text-white transition-colors hover:bg-stone-800"
          >
            Gráfico de Quadrantes
          </Link>
          <Link
            to="/vazios-de-acesso"
            className="rounded-lg border border-stone-600 px-4 py-2 text-center text-xs font-bold text-white transition-colors hover:bg-stone-800"
          >
            Detalhamento de Vazios de Acesso
          </Link>
        </div>
      </div>
    </div>
  );
}
