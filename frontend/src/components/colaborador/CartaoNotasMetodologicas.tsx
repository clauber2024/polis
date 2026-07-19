import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as colaboradorService from '../../services/colaborador.service';
import { ErroDeApi } from '../../services/http';
import type { NotaMetodologica } from '../../types/api';
import { formatarDataHora } from '../../utils/formatadores';

/**
 * RF-064/065/066 — notas metodológicas com histórico: cada POST cria uma
 * NOVA linha (nunca sobrescreve) — o histórico completo por tópico é o
 * próprio propósito do recurso, ver colaborador.service.ts (backend).
 */
export function CartaoNotasMetodologicas() {
  const { sessao } = useAuth();
  const [notas, setNotas] = useState<NotaMetodologica[]>([]);
  const [topico, setTopico] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [forcaAchado, setForcaAchado] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    colaboradorService
      .listarNotasMetodologicas()
      .then(setNotas)
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar notas.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!sessao || !topico.trim() || !conteudo.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await colaboradorService.criarNotaMetodologica(
        topico.trim(),
        conteudo.trim(),
        forcaAchado ? Number(forcaAchado) : undefined,
        sessao.token,
      );
      setTopico('');
      setConteudo('');
      setForcaAchado('');
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao registrar nota.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-4 shadow-2xs">
      <h2 className="text-base font-semibold text-slate-900">
        Documentação metodológica (RF-062, RF-064/065/066)
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Visualizador + registro de notas metodológicas — cada envio entra como uma nova linha no
        histórico do tópico, nunca substitui a anterior. Inclui notas de inspiração no OBEPE e de
        limitações de granularidade (ex.: MMGD municipal) quando registradas.
      </p>

      <form onSubmit={aoSubmeter} className="mb-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={topico}
            onChange={(evento) => setTopico(evento.target.value)}
            placeholder="Tópico (ex.: tarifa_centro_oeste)"
            maxLength={80}
            className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <select
            value={forcaAchado}
            onChange={(evento) => setForcaAchado(evento.target.value)}
            className="rounded border border-slate-300 px-1.5 py-1.5 text-xs text-slate-700"
          >
            <option value="">Força do achado</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={conteudo}
          onChange={(evento) => setConteudo(evento.target.value)}
          placeholder="Conteúdo da nota metodológica…"
          maxLength={8000}
          rows={3}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={enviando || !topico.trim() || !conteudo.trim()}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {enviando ? 'Registrando…' : 'Registrar nota'}
        </button>
      </form>

      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : notas.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma nota registrada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {notas.map((nota) => (
            <li key={nota.id} className="rounded border border-slate-100 bg-slate-50 p-2 text-sm">
              <p className="font-medium text-slate-700">
                {nota.topico}
                {nota.forcaAchado !== null && (
                  <span
                    className="ml-2 text-xs tracking-tight text-amber-500"
                    title={`Força do achado: ${nota.forcaAchado}/5`}
                    aria-label={`Força do achado: ${nota.forcaAchado} de 5`}
                  >
                    {'★'.repeat(nota.forcaAchado)}
                    <span className="text-slate-300">{'★'.repeat(5 - nota.forcaAchado)}</span>
                  </span>
                )}
              </p>
              <p className="whitespace-pre-wrap text-slate-800">{nota.conteudo}</p>
              <p className="mt-1 text-xs text-slate-400">
                {nota.autorNome ?? 'Usuário removido'} · {formatarDataHora(nota.criadoEm)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
