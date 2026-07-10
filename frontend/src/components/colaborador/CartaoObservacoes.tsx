import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as colaboradorService from '../../services/colaborador.service';
import { ErroDeApi } from '../../services/http';
import {
  BASES_DE_DADOS_CANONICAS,
  type BaseDadosCanonica,
  type ObservacaoBaseDados,
} from '../../types/api';
import { formatarDataHora } from '../../utils/formatadores';

/** RF-060 — observações sobre inconsistências encontradas em uma base. */
export function CartaoObservacoes() {
  const { sessao } = useAuth();
  const [base, setBase] = useState<BaseDadosCanonica>(BASES_DE_DADOS_CANONICAS[0]);
  const [observacoes, setObservacoes] = useState<ObservacaoBaseDados[]>([]);
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    colaboradorService
      .listarObservacoes(base)
      .then(setObservacoes)
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar observações.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, [base]);

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!sessao || !mensagem.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await colaboradorService.criarObservacao(base, mensagem.trim(), sessao.token);
      setMensagem('');
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao enviar observação.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Observações sobre inconsistências (RF-060)
      </h2>
      <div className="my-3 flex items-center gap-2">
        <label htmlFor="obs-base" className="text-xs font-semibold text-slate-600">
          Base
        </label>
        <select
          id="obs-base"
          value={base}
          onChange={(evento) => setBase(evento.target.value as BaseDadosCanonica)}
          className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-700 uppercase"
        >
          {BASES_DE_DADOS_CANONICAS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={aoSubmeter} className="mb-3 flex gap-2">
        <input
          value={mensagem}
          onChange={(evento) => setMensagem(evento.target.value)}
          placeholder="Descreva a inconsistência encontrada…"
          maxLength={4000}
          className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={enviando || !mensagem.trim()}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : observacoes.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma observação registrada para {base}.</p>
      ) : (
        <ul className="space-y-2">
          {observacoes.map((obs) => (
            <li key={obs.id} className="rounded border border-slate-100 bg-slate-50 p-2 text-sm">
              <p className="text-slate-800">{obs.mensagem}</p>
              <p className="mt-1 text-xs text-slate-400">
                {obs.autorNome ?? 'Usuário removido'} · {formatarDataHora(obs.criadoEm)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
