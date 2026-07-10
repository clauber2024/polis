import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as adminService from '../../services/admin.service';
import { ErroDeApi } from '../../services/http';
import {
  IDS_METADADOS_BASES_DADOS,
  type GranularidadeEspacial,
  type IdMetadadoBaseDados,
  type MetadadoBaseDados,
  type StatusMetadadoBaseDados,
} from '../../types/api';

const ROTULOS_STATUS: Record<StatusMetadadoBaseDados, string> = {
  pendente: 'Pendente',
  validado: 'Validado',
  erro: 'Erro',
  aguardando_liberacao: 'Aguardando liberação',
};

const ROTULOS_GRANULARIDADE: Record<GranularidadeEspacial, string> = {
  municipio: 'Município',
  setor_censitario: 'Setor censitário',
  cep: 'CEP',
  bairro: 'Bairro',
  outro: 'Outro',
};

/**
 * RF-071/072/073 — metadados técnicos das bases. Leitura é pública; escrita
 * exige Admin (ver admin.routes.ts). RF-070 (upload de arquivo real) não
 * implementado por decisão do projeto — isto aqui é só workflow/status.
 */
export function CartaoMetadadosBasesDados() {
  const { sessao } = useAuth();
  const [metadados, setMetadados] = useState<MetadadoBaseDados[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<IdMetadadoBaseDados | null>(null);
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});

  function carregar() {
    setCarregando(true);
    adminService
      .listarMetadadosBasesDados()
      .then(setMetadados)
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar metadados.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  async function aoSalvar(
    baseDados: IdMetadadoBaseDados,
    dados: {
      granularidadeEspacial?: GranularidadeEspacial;
      status?: StatusMetadadoBaseDados;
      observacao?: string;
    },
  ) {
    if (!sessao) return;
    setSalvando(baseDados);
    setErro(null);
    try {
      await adminService.atualizarMetadadoBaseDados(baseDados, dados, sessao.token);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao salvar metadado.');
    } finally {
      setSalvando(null);
    }
  }

  const porBase = new Map(metadados.map((m) => [m.baseDados, m]));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Metadados técnicos das bases (RF-071/072/073)
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Granularidade espacial, status de carga e observações — não substitui o ETL Python.
      </p>
      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : (
        <div className="space-y-3">
          {IDS_METADADOS_BASES_DADOS.map((base) => {
            const registro = porBase.get(base);
            const observacaoAtual = observacoes[base] ?? registro?.observacao ?? '';
            return (
              <div key={base} className="rounded border border-slate-100 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-56 font-medium text-slate-700">{base}</span>
                  <select
                    value={registro?.granularidadeEspacial ?? ''}
                    disabled={salvando === base}
                    onChange={(evento) =>
                      aoSalvar(base, {
                        granularidadeEspacial: evento.target.value as GranularidadeEspacial,
                      })
                    }
                    className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-700"
                  >
                    <option value="" disabled>
                      Granularidade
                    </option>
                    {Object.entries(ROTULOS_GRANULARIDADE).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                  <select
                    value={registro?.status ?? 'pendente'}
                    disabled={salvando === base}
                    onChange={(evento) =>
                      aoSalvar(base, { status: evento.target.value as StatusMetadadoBaseDados })
                    }
                    className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-700"
                  >
                    {Object.entries(ROTULOS_STATUS).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                  {salvando === base && <span className="text-xs text-slate-400">salvando…</span>}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={observacaoAtual}
                    onChange={(evento) =>
                      setObservacoes((atuais) => ({ ...atuais, [base]: evento.target.value }))
                    }
                    placeholder="Observação…"
                    maxLength={2000}
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    disabled={salvando === base}
                    onClick={() => aoSalvar(base, { observacao: observacaoAtual })}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Salvar observação
                  </button>
                </div>
                {registro?.atualizadoPorNome && (
                  <p className="mt-1 text-xs text-slate-400">
                    Última atualização: {registro.atualizadoPorNome}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
