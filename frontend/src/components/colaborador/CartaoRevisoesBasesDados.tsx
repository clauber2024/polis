import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as colaboradorService from '../../services/colaborador.service';
import { ErroDeApi } from '../../services/http';
import {
  BASES_DE_DADOS_CANONICAS,
  type BaseDadosCanonica,
  type RevisaoBaseDados,
  type StatusRevisaoBaseDados,
} from '../../types/api';

const ROTULOS_STATUS: Record<StatusRevisaoBaseDados, string> = {
  em_revisao: 'Em revisão',
  validado: 'Validado',
  inconsistencia_encontrada: 'Inconsistência encontrada',
};

/** RF-059 — status de revisão metodológica das 6 bases primárias do Atlas. */
export function CartaoRevisoesBasesDados() {
  const { sessao } = useAuth();
  const [revisoes, setRevisoes] = useState<RevisaoBaseDados[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<BaseDadosCanonica | null>(null);

  function carregar() {
    setCarregando(true);
    colaboradorService
      .listarRevisoesBasesDados()
      .then(setRevisoes)
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar revisões.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  async function aoMudarStatus(baseDados: BaseDadosCanonica, status: StatusRevisaoBaseDados) {
    if (!sessao) return;
    setSalvando(baseDados);
    setErro(null);
    try {
      await colaboradorService.atualizarRevisaoBaseDados(baseDados, status, sessao.token);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao salvar.');
    } finally {
      setSalvando(null);
    }
  }

  const porBase = new Map(revisoes.map((r) => [r.baseDados, r]));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Revisão metodológica das bases (RF-059)
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Status de revisão de cada base de dados primária do Atlas.
      </p>
      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-1 font-medium">Base</th>
              <th className="font-medium">Status</th>
              <th className="font-medium">Atualizado por</th>
            </tr>
          </thead>
          <tbody>
            {BASES_DE_DADOS_CANONICAS.map((base) => {
              const registro = porBase.get(base);
              return (
                <tr key={base} className="border-b border-slate-100">
                  <td className="py-1.5 font-medium text-slate-700 uppercase">{base}</td>
                  <td>
                    <select
                      value={registro?.status ?? 'em_revisao'}
                      disabled={salvando === base}
                      onChange={(evento) =>
                        aoMudarStatus(base, evento.target.value as StatusRevisaoBaseDados)
                      }
                      className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-700"
                    >
                      {Object.entries(ROTULOS_STATUS).map(([valor, rotulo]) => (
                        <option key={valor} value={valor}>
                          {rotulo}
                        </option>
                      ))}
                    </select>
                    {salvando === base && (
                      <span className="ml-2 text-xs text-slate-400">salvando…</span>
                    )}
                  </td>
                  <td className="text-xs text-slate-500">{registro?.atualizadoPorNome ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
