import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as adminService from '../../services/admin.service';
import { ErroDeApi } from '../../services/http';
import type { Papel, UsuarioAdmin } from '../../types/api';

/**
 * RF-076 — gestão de usuários. O guard de "último administrador" e o
 * bloqueio de "remover a própria conta" vêm do BACKEND (admin.service.ts) —
 * este componente só exibe a mensagem de erro que a API devolver, nunca
 * tenta reproduzir a regra no cliente.
 */
export function CartaoGestaoUsuarios() {
  const { sessao } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    if (!sessao) return;
    setCarregando(true);
    adminService
      .listarUsuarios(sessao.token)
      .then(setUsuarios)
      .catch((causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Falha ao carregar usuários.'),
      )
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, [sessao]);

  async function aoMudarPapel(id: number, papel: Papel) {
    if (!sessao) return;
    setSalvandoId(id);
    setErro(null);
    try {
      await adminService.atualizarUsuario(id, { papel }, sessao.token);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao atualizar papel.');
    } finally {
      setSalvandoId(null);
    }
  }

  async function aoAlternarAtivo(id: number, ativo: boolean) {
    if (!sessao) return;
    setSalvandoId(id);
    setErro(null);
    try {
      await adminService.atualizarUsuario(id, { ativo }, sessao.token);
      carregar();
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao atualizar status.');
    } finally {
      setSalvandoId(null);
    }
  }

  async function aoRemover(id: number) {
    if (!sessao) return;
    setSalvandoId(id);
    setErro(null);
    try {
      await adminService.removerUsuario(id, sessao.token);
      carregar();
    } catch (causa) {
      // Mensagens esperadas aqui: "não pode remover a própria conta" e o
      // guard de "deixaria o sistema sem administrador ativo" — ambas vêm
      // prontas do backend, ver admin.service.ts.
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao remover usuário.');
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Gestão de usuários (RF-076)</h2>
      <p className="mb-3 text-xs text-slate-500">
        Cadastro de novos usuários continua fora de escopo (RF-070 mantém upload real fora da
        API) — esta tela só edita papel/status e remove.
      </p>
      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-1 font-medium">Nome</th>
              <th className="font-medium">E-mail</th>
              <th className="font-medium">Papel</th>
              <th className="font-medium">Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className="border-b border-slate-100">
                <td className="py-1.5 text-slate-700">
                  {usuario.nome}
                  {usuario.id === sessao?.usuario.id && (
                    <span className="ml-1 text-xs text-slate-400">(você)</span>
                  )}
                </td>
                <td className="text-xs text-slate-500">{usuario.email}</td>
                <td>
                  <select
                    value={usuario.papel}
                    disabled={salvandoId === usuario.id}
                    onChange={(evento) => aoMudarPapel(usuario.id, evento.target.value as Papel)}
                    className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-700"
                  >
                    <option value="colaborador">Colaborador</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={usuario.ativo}
                    disabled={salvandoId === usuario.id}
                    onChange={(evento) => aoAlternarAtivo(usuario.id, evento.target.checked)}
                    className="h-4 w-4"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    disabled={salvandoId === usuario.id}
                    onClick={() => aoRemover(usuario.id)}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
