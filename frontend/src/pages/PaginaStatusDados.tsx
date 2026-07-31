import { useEffect, useState } from 'react';
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
  const estilo = ESTILO_STATUS[fonte.status];

  return (
    <div className="rounded-2xl border border-stone-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-stone-900">{fonte.nome}</h2>
          <p className="font-mono text-xs text-stone-400">
            {fonte.municipiosCobertos.toLocaleString('pt-BR')} de{' '}
            {totalMunicipios.toLocaleString('pt-BR')} municípios
          </p>
        </div>
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase ${estilo.classes}`}
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

      {/* Trilha de proveniência (30/07/2026) — mesmo padrão de grid rotulado
          já usado na Trilha de Auditoria do Ranking de Fricção. */}
      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-stone-200/60 bg-stone-50 p-4 text-xs sm:grid-cols-3">
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
  );
}
