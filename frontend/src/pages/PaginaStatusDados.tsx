import { useEffect, useState } from 'react';
import type { KeyboardEvent, SVGProps } from 'react';
import { buscarStatusBasesDeDados } from '../services/basesDeDados.service';
import type { StatusBasesDeDadosResultado, StatusFonte, StatusFonteDados } from '../types/api';
import { formatarDataBrasileira } from '../utils/formatadores';

/**
 * Status das bases de dados primárias (RF-063) — "Base de Evidências".
 *
 * Redesenho de 30/07/2026 (pedido do usuário — alinhar ao design system
 * atual, esta tela ainda carregava o visual antigo slate/violeta do
 * protótipo AI Studio original): paleta trocada para stone (títulos/
 * subtítulos) + vermelho institucional/emerald para status (nunca mais
 * violeta), datas de `periodoReferenciaMaisRecente` convertidas de
 * `YYYY-MM-DD` para `DD/MM/AAAA` (`formatarDataBrasileira`, nunca via
 * `Date` bruto — ver docstring da função), e cada card ganhou um bloco de
 * proveniência (Órgão Provedor Oficial / Método de Coleta / última
 * referência) — campos novos (`orgaoProvedor`, `metodoColeta`) adicionados
 * ao backend nesta mesma sessão, promovendo informação que já existia
 * documentada em `basesDeDados.service.ts` (docstring) para dado estruturado
 * da API, não inventada agora.
 *
 * A barra de busca de município do header (`BuscaMunicipio`, em App.tsx) foi
 * escondida especificamente nesta rota — não se aplica a um painel de status
 * macro de bases nacionais, mas continua nas demais telas (mapa, dossiê
 * etc.), onde faz sentido.
 *
 * Accordion por card (30/07/2026, pedido do usuário — a lista ficou extensa
 * demais com todo o bloco de proveniência/nota sempre aberto): cada
 * `CartaoFonte` tem seu próprio `useState` de expansão, independente dos
 * demais (não é um accordion clássico "abrir um fecha os outros" — com ~11
 * fontes, faz mais sentido deixar comparar proveniência de 2-3 fontes ao
 * mesmo tempo do que forçar uma de cada vez). Estado colapsado mostra só
 * título, tag de status, resumo de cobertura e barra; expandido revela o
 * grid de proveniência e a nota de rodapé.
 */

const ESTILO_STATUS: Record<StatusFonte, { rotulo: string; classes: string; barra: string }> = {
  completo: {
    rotulo: 'Completo',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    barra: 'bg-emerald-600',
  },
  parcial: {
    rotulo: 'Parcial',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
    barra: 'bg-amber-500',
  },
  bloqueado: {
    rotulo: 'Bloqueado',
    classes: 'bg-red-50 text-red-700 border-red-200',
    barra: 'bg-red-600',
  },
};

export function PaginaStatusDados() {
  const [resultado, setResultado] = useState<StatusBasesDeDadosResultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarStatusBasesDeDados()
      .then((resposta) => {
        if (ativo) setResultado(resposta);
      })
      .catch((causa: unknown) => {
        if (ativo) {
          setErro(causa instanceof Error ? causa.message : 'Falha ao carregar o status.');
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 font-sans">
      <div className="rounded-2xl border border-stone-200/50 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
        <span className="mb-1 inline-flex items-center gap-1.5 rounded bg-stone-100 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-stone-600 uppercase">
          Pipeline de Dados
        </span>
        <h1 className="text-2xl font-black tracking-tight text-stone-900">
          Status das bases de dados
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Cobertura de cada fonte primária do Atlas, calculada diretamente do banco (indicador
          âncora por fonte) — não é um status declarado manualmente.
        </p>
        {resultado && (
          <p className="mt-2 font-mono text-xs text-stone-400">
            {resultado.totalMunicipios.toLocaleString('pt-BR')} municípios na base territorial ·
            consultado em {resultado.atualizadoEm}
          </p>
        )}
      </div>

      {carregando && <p className="mt-6 text-sm text-stone-500">Consultando cobertura…</p>}
      {erro && !carregando && <p className="mt-6 text-sm text-red-600">{erro}</p>}

      {resultado && (
        <div className="mt-5 space-y-3">
          {resultado.fontes.map((fonte) => (
            <CartaoFonte key={fonte.id} fonte={fonte} totalMunicipios={resultado.totalMunicipios} />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoFonte({
  fonte,
  totalMunicipios,
}: {
  fonte: StatusFonteDados;
  totalMunicipios: number;
}) {
  const [expandido, setExpandido] = useState(false);
  const estilo = ESTILO_STATUS[fonte.status];

  function alternar() {
    setExpandido((atual) => !atual);
  }

  return (
    <div className="rounded-2xl border border-stone-200/60 bg-white/80 shadow-sm backdrop-blur-xl">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expandido}
        onClick={alternar}
        onKeyDown={(evento: KeyboardEvent<HTMLDivElement>) => {
          if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            alternar();
          }
        }}
        className="cursor-pointer rounded-2xl p-5 outline-none transition-colors hover:bg-stone-50/60"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <IconeChevronExpandir
              className={`mt-0.5 h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${expandido ? 'rotate-90' : ''}`}
            />
            <div>
              <h2 className="text-sm font-black text-stone-900">{fonte.nome}</h2>
              <p className="font-mono text-xs text-stone-400">
                {fonte.alcanceLimitadoPorDesenho && 'Alcance real: presença em '}
                {fonte.municipiosCobertos.toLocaleString('pt-BR')} de{' '}
                {totalMunicipios.toLocaleString('pt-BR')} municípios
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase ${estilo.classes}`}
          >
            {estilo.rotulo} · {fonte.percentualCobertura.toLocaleString('pt-BR')}%
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className={`h-full rounded-full ${estilo.barra}`}
            style={{ width: `${Math.max(1, fonte.percentualCobertura)}%` }}
          />
        </div>
      </div>

      {/* Detalhes técnicos — colapsados por padrão (30/07/2026, pedido do
          usuário: a lista inteira ficava muito extensa com tudo sempre
          aberto). max-h + opacity em vez de height auto porque o conteúdo
          tem altura variável entre fontes (nota de rodapé mais longa em
          algumas) — height auto não anima em CSS puro, max-h generoso dá o
          efeito suave sem precisar medir altura via JS. */}
      <div
        className={`grid overflow-hidden px-5 transition-all duration-300 ease-in-out ${
          expandido ? 'grid-rows-[1fr] pb-5 opacity-100' : 'grid-rows-[0fr] pb-0 opacity-0'
        }`}
      >
        <div className="min-h-0">
          {/* Trilha de proveniência — mesmo padrão de grid rotulado já usado
              na Trilha de Auditoria do Ranking de Fricção. */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-stone-200/60 bg-stone-50 p-4 text-xs sm:grid-cols-3">
            <div>
              <span className="block text-[9px] font-bold tracking-widest text-stone-400 uppercase">
                Órgão provedor oficial
              </span>
              <span className="font-semibold text-stone-800">{fonte.orgaoProvedor}</span>
            </div>
            <div>
              <span className="block text-[9px] font-bold tracking-widest text-stone-400 uppercase">
                Método de coleta
              </span>
              <span className="font-semibold text-stone-800">{fonte.metodoColeta}</span>
            </div>
            <div>
              <span className="block text-[9px] font-bold tracking-widest text-stone-400 uppercase">
                Última referência
              </span>
              <span className="font-semibold text-stone-800">
                {formatarDataBrasileira(fonte.periodoReferenciaMaisRecente)}
              </span>
            </div>
          </div>

          {fonte.observacao && (
            <p className="mt-3 text-xs leading-relaxed text-stone-500">{fonte.observacao}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function IconeChevronExpandir(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
