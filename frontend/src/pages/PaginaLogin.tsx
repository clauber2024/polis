import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ErroDeApi } from '../services/http';

/** Login (RF-009/013) — só Colaborador/Administrador autenticam; Público não. */
export function PaginaLogin() {
  const { entrar, sessao } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Default '/mapa', não '/' — "/" é a landing pública (RF-001), não faz
  // sentido devolver quem acabou de logar pra lá.
  const destino = (location.state as { de?: string } | null)?.de ?? '/mapa';

  if (sessao) {
    navigate(destino, { replace: true });
    return null;
  }

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
      navigate(destino, { replace: true });
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao entrar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <form
        onSubmit={aoSubmeter}
        className="w-80 rounded-lg border border-slate-200 bg-white p-6 shadow"
      >
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Entrar</h1>

        <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          required
          autoComplete="username"
          className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
        />

        <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="senha">
          Senha
        </label>
        <input
          id="senha"
          type="password"
          value={senha}
          onChange={(evento) => setSenha(evento.target.value)}
          required
          autoComplete="current-password"
          className="mb-4 w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
        />

        {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="mt-4 text-xs text-slate-400">
          Acesso restrito a Colaboradores e Administradores — ver README, seção "Acesso de
          demonstração".
        </p>
      </form>
    </div>
  );
}
