import { useEffect, useState } from 'react';
import { buscarStatusBasesDeDados } from '../services/basesDeDados.service';
import type { StatusBasesDeDadosResultado, StatusFonte } from '../types/api';

/**
 * Status das bases de dados primárias (RF-063, 14/07/2026 — ideia de
 * apresentação adaptada da tela "Pipeline ETL" do protótipo
 * `atlas-mmgd-solar`, mas 100% em cima do que o backend já serve em
 * GET /api/bases-de-dados: cobertura por indicador âncora de cada fonte,
 * derivada dos dados carregados — nada de status manual/simulado).
 */

const ESTILO_STATUS: Record<StatusFonte, { rotulo: string; classes: string; barra: string }> = {
  completo: {
    rotulo: 'Completo',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    barra: 'bg-emerald-500',
  },
  parcial: {
    rotulo: 'Parcial',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
    barra: 'bg-amber-500',
  },
  bloqueado: {
    rotulo: 'Bloqueado',
    classes: 'bg-red-50 text-red-700 border-red-200',
    barra: 'bg-red-400',
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
      <div className="rounded border border-slate-200 bg-white p-6 shadow-2xs">
        <span className="mb-1 inline-flex items-center gap-1.5 rounded bg-violet-50 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-violet-700 uppercase">
          Pipeline de Dados
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Status das bases de dados
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cobertura de cada fonte primária do Atlas, calculada diretamente do banco (indicador
          âncora por fonte) — não é um status declarado manualmente.
        </p>
        {resultado && (
          <p className="mt-2 font-mono text-xs text-slate-400">
            {resultado.totalMunicipios.toLocaleString('pt-BR')} municípios na base territorial ·
            consultado em {resultado.atualizadoEm}
          </p>
        )}
      </div>

      {carregando && <p className="mt-6 text-sm text-slate-500">Consultando cobertura…</p>}
      {erro && !carregando && <p className="mt-6 text-sm text-red-600">{erro}</p>}

      {resultado && (
        <div className="mt-5 space-y-3">
          {resultado.fontes.map((fonte) => {
            const estilo = ESTILO_STATUS[fonte.status];
            return (
              <div
                key={fonte.id}
                className="rounded border border-slate-200 bg-white p-4 shadow-2xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">{fonte.nome}</h2>
                    <p className="font-mono text-xs text-slate-400">
                      {fonte.municipiosCobertos.toLocaleString('pt-BR')} de{' '}
                      {resultado.totalMunicipios.toLocaleString('pt-BR')} municípios
                      {fonte.periodoReferenciaMaisRecente &&
                        ` · snapshot mais recente: ${fonte.periodoReferenciaMaisRecente}`}
                    </p>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase ${estilo.classes}`}
                  >
                    {estilo.rotulo} · {fonte.percentualCobertura.toLocaleString('pt-BR')}%
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${estilo.barra}`}
                    style={{ width: `${Math.max(1, fonte.percentualCobertura)}%` }}
                  />
                </div>

                {fonte.observacao && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">{fonte.observacao}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
