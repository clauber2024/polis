import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as adminService from '../../services/admin.service';
import { ErroDeApi } from '../../services/http';
import type { VersaoPublicada } from '../../types/api';
import { formatarDataHora } from '../../utils/formatadores';

/** RF-075 — changelog público de versões; leitura pública, publicar é Admin. */
export function CartaoVersoesPublicadas() {
  const { sessao } = useAuth();
  const [versoes, setVersoes] = useState<VersaoPublicada[]>([]);
  const [versao, setVersao] = useState('');
  const [descricao, setDescricao] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    adminService
      .listarVersoesPublicadas()
      .then(setVersoes)
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar versões.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!sessao || !versao.trim() || !descricao.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await adminService.publicarVersao(versao.trim(), descricao.trim(), sessao.token);
      setVersao('');
      setDescricao('');
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao publicar versão.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-4 shadow-2xs">
      <h2 className="text-base font-semibold text-slate-900">Versões publicadas (RF-075)</h2>

      <form onSubmit={aoSubmeter} className="my-3 space-y-2">
        <div className="flex gap-2">
          <input
            value={versao}
            onChange={(evento) => setVersao(evento.target.value)}
            placeholder="Versão (ex.: 1.4.0)"
            maxLength={40}
            className="w-40 rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
            placeholder="Descrição do que mudou…"
            maxLength={2000}
            className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={enviando || !versao.trim() || !descricao.trim()}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {enviando ? 'Publicando…' : 'Publicar versão'}
        </button>
      </form>

      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : versoes.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma versão publicada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {versoes.map((v) => (
            <li key={v.id} className="rounded border border-slate-100 bg-slate-50 p-2 text-sm">
              <p className="font-medium text-slate-700">{v.versao}</p>
              <p className="text-slate-800">{v.descricao}</p>
              <p className="mt-1 text-xs text-slate-400">
                {v.publicadoPorNome ?? 'Usuário removido'} · {formatarDataHora(v.publicadoEm)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
