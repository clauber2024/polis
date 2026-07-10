import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as adminService from '../../services/admin.service';
import { ErroDeApi } from '../../services/http';
import type { AprovacaoIndicador } from '../../types/api';
import { formatarDataHora } from '../../utils/formatadores';

/** RF-074 — fila de aprovação de indicadores (tudo Admin, ver admin.routes.ts). */
export function CartaoAprovacoesIndicadores() {
  const { sessao } = useAuth();
  const [aprovacoes, setAprovacoes] = useState<AprovacaoIndicador[]>([]);
  const [indicador, setIndicador] = useState('');
  const [motivos, setMotivos] = useState<Record<number, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [decidindoId, setDecidindoId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    if (!sessao) return;
    setCarregando(true);
    adminService
      .listarAprovacoesIndicadores(sessao.token)
      .then(setAprovacoes)
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar fila de aprovação.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, [sessao]);

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!sessao || !indicador.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await adminService.criarAprovacaoIndicador(indicador.trim(), sessao.token);
      setIndicador('');
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao criar pedido de aprovação.');
    } finally {
      setEnviando(false);
    }
  }

  async function aoDecidir(id: number, status: 'aprovado' | 'rejeitado') {
    if (!sessao) return;
    setDecidindoId(id);
    setErro(null);
    try {
      await adminService.decidirAprovacaoIndicador(id, status, motivos[id], sessao.token);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao decidir aprovação.');
    } finally {
      setDecidindoId(null);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Fila de aprovação de indicadores (RF-074)
      </h2>

      <form onSubmit={aoSubmeter} className="my-3 flex gap-2">
        <input
          value={indicador}
          onChange={(evento) => setIndicador(evento.target.value)}
          placeholder="Indicador a colocar na fila…"
          maxLength={120}
          className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={enviando || !indicador.trim()}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {enviando ? 'Criando…' : 'Adicionar à fila'}
        </button>
      </form>

      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : aprovacoes.length === 0 ? (
        <p className="text-sm text-slate-400">Fila vazia.</p>
      ) : (
        <ul className="space-y-2">
          {aprovacoes.map((aprovacao) => (
            <li key={aprovacao.id} className="rounded border border-slate-100 p-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{aprovacao.indicador}</span>
                <span
                  className={
                    aprovacao.status === 'aprovado'
                      ? 'text-xs font-semibold text-emerald-600'
                      : aprovacao.status === 'rejeitado'
                        ? 'text-xs font-semibold text-red-600'
                        : 'text-xs font-semibold text-amber-600'
                  }
                >
                  {aprovacao.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Criado em {formatarDataHora(aprovacao.criadoEm)}
                {aprovacao.decididoEm && ` · decidido em ${formatarDataHora(aprovacao.decididoEm)}`}
              </p>
              {aprovacao.motivo && (
                <p className="mt-1 text-xs text-slate-500">Motivo: {aprovacao.motivo}</p>
              )}
              {aprovacao.status === 'pendente' && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={motivos[aprovacao.id] ?? ''}
                    onChange={(evento) =>
                      setMotivos((atuais) => ({ ...atuais, [aprovacao.id]: evento.target.value }))
                    }
                    placeholder="Motivo (opcional)…"
                    maxLength={2000}
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    disabled={decidindoId === aprovacao.id}
                    onClick={() => aoDecidir(aprovacao.id, 'aprovado')}
                    className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={decidindoId === aprovacao.id}
                    onClick={() => aoDecidir(aprovacao.id, 'rejeitado')}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Rejeitar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
