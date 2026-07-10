import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as colaboradorService from '../../services/colaborador.service';
import { ErroDeApi } from '../../services/http';
import type { MaterialComunicacao, StatusMaterialComunicacao } from '../../types/api';
import { formatarDataHora } from '../../utils/formatadores';

const ROTULOS_STATUS: Record<StatusMaterialComunicacao, string> = {
  em_producao: 'Em produção',
  em_revisao: 'Em revisão',
  publicado: 'Publicado',
};

/** RF-067 — materiais de comunicação (peças, releases, etc.) e seu status. */
export function CartaoMateriaisComunicacao() {
  const { sessao } = useAuth();
  const [materiais, setMateriais] = useState<MaterialComunicacao[]>([]);
  const [titulo, setTitulo] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    colaboradorService
      .listarMateriaisComunicacao()
      .then(setMateriais)
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar materiais.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!sessao || !titulo.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await colaboradorService.criarMaterialComunicacao(titulo.trim(), sessao.token);
      setTitulo('');
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao criar material.');
    } finally {
      setEnviando(false);
    }
  }

  async function aoMudarStatus(id: number, status: StatusMaterialComunicacao) {
    if (!sessao) return;
    setSalvandoId(id);
    setErro(null);
    try {
      await colaboradorService.atualizarMaterialComunicacao(id, status, sessao.token);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao atualizar status.');
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Materiais de comunicação (RF-067)
      </h2>

      <form onSubmit={aoSubmeter} className="my-3 flex gap-2">
        <input
          value={titulo}
          onChange={(evento) => setTitulo(evento.target.value)}
          placeholder="Título do material…"
          maxLength={160}
          className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={enviando || !titulo.trim()}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {enviando ? 'Criando…' : 'Criar'}
        </button>
      </form>

      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : materiais.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum material cadastrado ainda.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-1 font-medium">Título</th>
              <th className="font-medium">Status</th>
              <th className="font-medium">Autor</th>
              <th className="font-medium">Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            {materiais.map((material) => (
              <tr key={material.id} className="border-b border-slate-100">
                <td className="py-1.5 text-slate-700">{material.titulo}</td>
                <td>
                  <select
                    value={material.status}
                    disabled={salvandoId === material.id}
                    onChange={(evento) =>
                      aoMudarStatus(material.id, evento.target.value as StatusMaterialComunicacao)
                    }
                    className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-700"
                  >
                    {Object.entries(ROTULOS_STATUS).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-xs text-slate-500">{material.autorNome ?? '—'}</td>
                <td className="text-xs text-slate-500">
                  {formatarDataHora(material.atualizadoEm)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
