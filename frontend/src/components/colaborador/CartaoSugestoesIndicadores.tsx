import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as colaboradorService from '../../services/colaborador.service';
import { ErroDeApi } from '../../services/http';
import type { SugestaoIndicador } from '../../types/api';
import { formatarDataHora } from '../../utils/formatadores';

/** RF-061 — sugestões de melhoria em indicadores existentes. */
export function CartaoSugestoesIndicadores() {
  const { sessao } = useAuth();
  const [sugestoes, setSugestoes] = useState<SugestaoIndicador[]>([]);
  const [indicador, setIndicador] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    colaboradorService
      .listarSugestoes()
      .then(setSugestoes)
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar sugestões.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!sessao || !indicador.trim() || !mensagem.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await colaboradorService.criarSugestao(indicador.trim(), mensagem.trim(), sessao.token);
      setIndicador('');
      setMensagem('');
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao enviar sugestão.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Sugestões de indicadores (RF-061)
      </h2>

      <form onSubmit={aoSubmeter} className="my-3 space-y-2">
        <input
          value={indicador}
          onChange={(evento) => setIndicador(evento.target.value)}
          placeholder="Indicador (ex.: irradiacaoMediaKwhM2Dia)"
          maxLength={120}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={mensagem}
            onChange={(evento) => setMensagem(evento.target.value)}
            placeholder="Sugestão de melhoria…"
            maxLength={4000}
            className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={enviando || !indicador.trim() || !mensagem.trim()}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>

      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : sugestoes.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma sugestão registrada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {sugestoes.map((s) => (
            <li key={s.id} className="rounded border border-slate-100 bg-slate-50 p-2 text-sm">
              <p className="font-medium text-slate-700">{s.indicador}</p>
              <p className="text-slate-800">{s.mensagem}</p>
              <p className="mt-1 text-xs text-slate-400">
                {s.autorNome ?? 'Usuário removido'} · {formatarDataHora(s.criadoEm)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
