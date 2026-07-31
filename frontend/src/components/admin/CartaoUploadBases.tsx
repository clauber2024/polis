import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as adminService from '../../services/admin.service';
import { ErroDeApi } from '../../services/http';
import type { StatusExecucaoEtl, StatusExtratorComUpload } from '../../types/api';
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
 * RF-070 revisitado, fase 2 (31/07/2026) — bases sem URL pública (Reforma
 * Casa Brasil Solar, ZEIS de São Paulo/Belo Horizonte): o Administrador
 * anexa o(s) arquivo(s) exatos que o extractor espera (ver
 * `utils/extractoresComUpload.ts` no backend) antes de disparar. Mesmo
 * mecanismo de execução/log/polling de `CartaoAtualizacaoEtl.tsx` — só a
 * etapa de disparo muda (upload em vez de clique direto).
 */
export function CartaoUploadBases() {
  const { sessao } = useAuth();
  const [status, setStatus] = useState<StatusExtratorComUpload[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [arquivosSelecionados, setArquivosSelecionados] = useState<Record<string, File[]>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function carregar() {
    if (!sessao) return;
    adminService
      .listarStatusExtratoresComUpload(sessao.token)
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

  function aoEscolherArquivo(baseId: string, indice: number, arquivo: File | null) {
    setArquivosSelecionados((atuais) => {
      const lista = [...(atuais[baseId] ?? [])];
      if (arquivo) lista[indice] = arquivo;
      else delete lista[indice];
      return { ...atuais, [baseId]: lista };
    });
  }

  async function aoEnviar(item: StatusExtratorComUpload) {
    if (!sessao) return;
    const arquivos = arquivosSelecionados[item.id] ?? [];
    if (arquivos.filter(Boolean).length !== item.arquivos.length) {
      setErro(`"${item.rotulo}" precisa dos ${item.arquivos.length} arquivo(s) selecionados.`);
      return;
    }
    setEnviando(item.id);
    setErro(null);
    try {
      await adminService.dispararComUpload(item.id, arquivos, sessao.token);
      setArquivosSelecionados((atuais) => ({ ...atuais, [item.id]: [] }));
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao enviar arquivo(s).');
    } finally {
      setEnviando(null);
    }
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-4 shadow-2xs">
      <h2 className="text-base font-semibold text-slate-900">Upload de bases sem fonte pública</h2>
      <p className="mb-3 text-xs text-slate-500">
        Fontes que nunca tiveram (e provavelmente nunca vão ter) um link de download automático
        — anexe o(s) arquivo(s) exatos abaixo e dispare a atualização.
      </p>
      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : (
        <div className="space-y-3">
          {status.map((item) => {
            const execucao = item.ultimaExecucao;
            const emExecucao = execucao?.status === 'em_execucao';
            const arquivosAtuais = arquivosSelecionados[item.id] ?? [];
            const prontoPraEnviar =
              arquivosAtuais.filter(Boolean).length === item.arquivos.length;
            return (
              <div key={item.id} className="rounded border border-slate-100 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">{item.rotulo}</span>
                  {execucao && (
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-medium ${ESTILO_STATUS[execucao.status]}`}
                    >
                      {ROTULO_STATUS[execucao.status]}
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-1.5">
                  {item.arquivos.map((arquivoEsperado, indice) => (
                    <div key={indice} className="flex items-center gap-2 text-xs">
                      <span className="w-56 shrink-0 text-slate-500">
                        {arquivoEsperado.descricao} ({arquivoEsperado.extensaoAceita})
                      </span>
                      <input
                        type="file"
                        accept={arquivoEsperado.extensaoAceita}
                        disabled={enviando === item.id || emExecucao}
                        onChange={(evento) =>
                          aoEscolherArquivo(item.id, indice, evento.target.files?.[0] ?? null)
                        }
                        className="flex-1 text-xs text-slate-600 file:mr-2 file:rounded file:border file:border-slate-300 file:bg-white file:px-2 file:py-1 file:text-xs hover:file:bg-slate-50"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={!prontoPraEnviar || enviando === item.id || emExecucao}
                  onClick={() => aoEnviar(item)}
                  className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs whitespace-nowrap hover:bg-slate-50 disabled:opacity-50"
                >
                  {enviando === item.id
                    ? 'Enviando…'
                    : emExecucao
                      ? 'Atualizando…'
                      : 'Enviar e atualizar'}
                </button>

                {execucao && (
                  <p className="mt-1.5 text-xs text-slate-400">
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
