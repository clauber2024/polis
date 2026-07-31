import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as adminService from '../../services/admin.service';
import { ErroDeApi } from '../../services/http';
import type { StatusExecucaoEtl, StatusExtrator } from '../../types/api';
import { formatarDataHora } from '../../utils/formatadores';

const ROTULO_STATUS: Record<StatusExecucaoEtl, string> = {
  em_execucao: 'Atualizando…',
  sucesso: 'Sucesso',
  falha: 'Falha',
};

const ESTILO_STATUS: Record<StatusExecucaoEtl, string> = {
  em_execucao: 'bg-amber-50 text-amber-700 border-amber-200',
  sucesso: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  falha: 'bg-red-50 text-red-700 border-red-200',
};

const INTERVALO_POLLING_MS = 4000;

/**
 * RF-070 revisitado (30/07/2026) — disparo de ETL pela interface, só as
 * bases da whitelist (`backend/src/utils/extractoresElegiveis.ts`). Enquanto
 * alguma base está `em_execucao`, faz polling — não há WebSocket/SSE nesta
 * primeira versão, é a forma mais simples dado que a execução é só um
 * subprocesso local ao backend (sem fila externa pra assinar eventos).
 */
export function CartaoAtualizacaoEtl() {
  const { sessao } = useAuth();
  const [status, setStatus] = useState<StatusExtrator[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [disparando, setDisparando] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function carregar() {
    if (!sessao) return;
    adminService
      .listarStatusExtratores(sessao.token)
      .then((resultado) => {
        setStatus(resultado);
        setErro(null);
        const algumaEmExecucao = resultado.some(
          (item) => item.ultimaExecucao?.status === 'em_execucao',
        );
        if (timerRef.current) clearTimeout(timerRef.current);
        if (algumaEmExecucao) {
          timerRef.current = setTimeout(carregar, INTERVALO_POLLING_MS);
        }
      })
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar status.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao]);

  async function aoDisparar(baseId: string) {
    if (!sessao) return;
    setDisparando(baseId);
    setErro(null);
    try {
      await adminService.dispararAtualizacaoBase(baseId, sessao.token);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao disparar atualização.');
    } finally {
      setDisparando(null);
    }
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-4 shadow-2xs">
      <h2 className="text-base font-semibold text-slate-900">Atualização de bases (ETL)</h2>
      <p className="mb-3 text-xs text-slate-500">
        Dispara o extractor Python de verdade para as bases abaixo — as únicas confirmadas como
        100% automáticas (sem pré-requisito manual). As demais fontes do Atlas continuam exigindo
        execução manual no terminal.
      </p>
      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : (
        <div className="space-y-2">
          {status.map((item) => {
            const execucao = item.ultimaExecucao;
            const emExecucao = execucao?.status === 'em_execucao';
            return (
              <div key={item.id} className="rounded border border-slate-100 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">{item.rotulo}</span>
                  <div className="flex items-center gap-2">
                    {execucao && (
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-medium ${ESTILO_STATUS[execucao.status]}`}
                      >
                        {ROTULO_STATUS[execucao.status]}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={disparando === item.id || emExecucao}
                      onClick={() => aoDisparar(item.id)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs whitespace-nowrap hover:bg-slate-50 disabled:opacity-50"
                    >
                      {disparando === item.id
                        ? 'Disparando…'
                        : emExecucao
                          ? 'Atualizando…'
                          : 'Atualizar agora'}
                    </button>
                  </div>
                </div>
                {execucao && (
                  <p className="mt-1 text-xs text-slate-400">
                    {execucao.iniciadoPorNome ?? 'Usuário removido'} ·{' '}
                    {formatarDataHora(execucao.iniciadoEm)}
                    {execucao.finalizadoEm && ` — concluído ${formatarDataHora(execucao.finalizadoEm)}`}
                  </p>
                )}
                {execucao?.status === 'falha' && execucao.saidaLog && (
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-red-50 p-2 text-[10px] whitespace-pre-wrap text-red-800">
                    {execucao.saidaLog}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
