import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
 * Redesenhado em 21/07/2026 (feedback "não ficou legal" após teste visual
 * real — screenshot confirmou texto corrido sem hierarquia, nenhum número
 * em destaque apesar de ter estatísticas fortes, e vazio grande no slide de
 * CTA): cada slide ganhou um número grande em destaque (`destaque`, mesmo
 * padrão visual mono/violeta dos cards de "O Brasil em números") e uma
 * variante de cor — `alerta` (vermelho, MESMA paleta de
 * CartaoDescompassoMorfologico.tsx, para os 2 achados de desigualdade) e
 * `cta` (escuro, mesma paleta do card de Referências Metodológicas) para o
 * slide final.
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

type Variante = 'padrao' | 'alerta' | 'cta';

interface Slide {
  rotulo: string;
  titulo: string;
  destaque: { valor: string; legenda: string } | null;
  corpo: ReactNode;
  variante: Variante;
}

export function TourAchados({
  totalVazios,
  percentualVazios,
  rhoPrecariedade,
  regioesConcordantesPrecariedade,
  regioesTestadasPrecariedade,
}: TourAchadosProps) {
  const [passo, setPasso] = useState(0);

  const slides = useMemo<Slide[]>(
    () => [
      {
        rotulo: '01 · Panorama nacional',
        titulo: 'Onde o sol sobra, a energia limpa nem sempre chega',
        variante: 'padrao',
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
              Têm irradiação solar acima da mediana nacional, mas adoção residencial de MMGD
              abaixo da mediana — sol sobrando, energia limpa não chegando. Potencial
              desperdiçado, não falta de sol.
            </>
          ) : (
            'Carregando o panorama nacional de Vazios de Acesso…'
          ),
      },
      {
        rotulo: '02 · A moradia importa',
        titulo: 'Casa precária, menos energia solar — mesmo com renda e sol iguais',
        variante: 'padrao',
        destaque:
          rhoPrecariedade !== null
            ? { valor: formatarValor(rhoPrecariedade, 'numero'), legenda: 'correlação parcial (Spearman)' }
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
        variante: 'alerta',
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
        titulo: 'O Reforma Casa Brasil Solar reforça o padrão, não corrige',
        variante: 'alerta',
        destaque: { valor: '−31%', legenda: 'menos recurso per capita em municípios Vazio de Acesso' },
        corpo: (
          <>
            Municípios classificados como Vazio de Acesso representam <strong>27,3%</strong> da
            base nacional, mas só <strong>20,8%</strong> dos contratos do programa Reforma Casa
            Brasil Solar. O crédito está chegando onde o acesso à energia solar já é bom, não onde
            mais falta.
          </>
        ),
      },
      {
        rotulo: '05 · Explore você mesmo',
        titulo: 'Esses achados estão vivos no Atlas — não são só um relatório',
        variante: 'cta',
        destaque: null,
        corpo: (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/mapa"
              className="rounded bg-white px-4 py-2 text-center text-xs font-mono font-bold uppercase tracking-wider text-slate-950 hover:bg-slate-100"
            >
              Explorar o mapa
            </Link>
            <Link
              to="/painel-analitico"
              className="rounded border border-slate-600 px-4 py-2 text-center text-xs font-bold text-white hover:bg-slate-800"
            >
              Ver o Gráfico de Quadrantes
            </Link>
            <Link
              to="/vazios-de-acesso"
              className="rounded border border-slate-600 px-4 py-2 text-center text-xs font-bold text-white hover:bg-slate-800"
            >
              Ranking de Vazios de Acesso
            </Link>
          </div>
        ),
      },
    ],
    [totalVazios, percentualVazios, rhoPrecariedade, regioesConcordantesPrecariedade, regioesTestadasPrecariedade],
  );

  const atual = slides[passo];

  const CORES_VARIANTE: Record<Variante, { cartao: string; rotulo: string; titulo: string; corpo: string; destaqueValor: string; destaqueBg: string }> = {
    padrao: {
      cartao: 'border-slate-200 bg-white',
      rotulo: 'text-violet-700',
      titulo: 'text-slate-900',
      corpo: 'text-slate-600',
      destaqueValor: 'text-violet-700',
      destaqueBg: 'bg-violet-50',
    },
    alerta: {
      cartao: 'border-red-200 bg-white',
      rotulo: 'text-red-700',
      titulo: 'text-slate-900',
      corpo: 'text-slate-600',
      destaqueValor: 'text-red-700',
      destaqueBg: 'bg-red-50',
    },
    cta: {
      cartao: 'border-slate-800 bg-slate-900',
      rotulo: 'text-violet-400',
      titulo: 'text-white',
      corpo: 'text-slate-300',
      destaqueValor: '',
      destaqueBg: '',
    },
  };
  const cor = CORES_VARIANTE[atual.variante];
  const escuro = atual.variante === 'cta';

  return (
    <div className={`rounded border p-6 shadow-2xs transition-colors sm:p-8 ${cor.cartao}`}>
      <div className="mb-4 flex items-center justify-between">
        <span className={`font-mono text-[10px] font-bold tracking-wider uppercase ${cor.rotulo}`}>
          {atual.rotulo}
        </span>
        <span className={`font-mono text-[10px] ${escuro ? 'text-slate-500' : 'text-slate-400'}`}>
          {passo + 1} / {slides.length}
        </span>
      </div>

      <div className="flex min-h-[220px] flex-col gap-5 sm:flex-row sm:items-center">
        {atual.destaque && (
          <div className={`shrink-0 rounded-lg px-6 py-5 text-center sm:w-52 ${cor.destaqueBg}`}>
            <p className={`font-mono text-4xl font-bold ${cor.destaqueValor}`}>{atual.destaque.valor}</p>
            <p className="mt-1 text-xs text-slate-500">{atual.destaque.legenda}</p>
          </div>
        )}
        <div className="flex-1">
          <h3 className={`text-lg font-bold tracking-tight ${cor.titulo}`}>{atual.titulo}</h3>
          <div className={`mt-3 leading-relaxed ${cor.corpo}`}>{atual.corpo}</div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPasso((p) => Math.max(0, p - 1))}
          disabled={passo === 0}
          className={`rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-30 ${
            escuro
              ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          ← Anterior
        </button>

        <div className="flex items-center gap-1.5">
          {slides.map((slide, indice) => (
            <button
              key={slide.rotulo}
              type="button"
              aria-label={`Ir para o passo ${indice + 1}`}
              aria-current={indice === passo}
              onClick={() => setPasso(indice)}
              className={`h-2 w-2 rounded-full transition-colors ${
                indice === passo
                  ? escuro
                    ? 'bg-white'
                    : 'bg-violet-600'
                  : escuro
                    ? 'bg-slate-700 hover:bg-slate-600'
                    : 'bg-slate-200 hover:bg-slate-300'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setPasso((p) => Math.min(slides.length - 1, p + 1))}
          disabled={passo === slides.length - 1}
          className={`rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-30 ${
            escuro
              ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Próximo →
        </button>
      </div>
    </div>
  );
}
