import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ErroDeApi } from '../services/http';
import type { Papel } from '../types/api';

// Sem redirecionamento pendente (RotaProtegida não empurrou pra cá), o
// destino padrão é o painel do próprio papel — não '/mapa': quem loga pelo
// acesso técnico está vindo ver Colaborador/Admin, não o mapa público.
function destinoPorPapel(papel: Papel): string {
  return papel === 'administrador' ? '/admin' : '/colaborador';
}

/**
 * RF-011/012 — perfis de demonstração para preencher o formulário com um
 * clique. Contas reais do seed da migration 0022 (0022_criacao_usuarios_auth.sql),
 * senha "123456" para as duas — nada simulado, é a mesma fundação de auth já
 * validada (ver CLAUDE.md, "Fundação de autenticação/RBAC").
 */
const PERFIS_DEMONSTRACAO = [
  {
    papel: 'colaborador' as const,
    nome: 'Colaborador Demo',
    email: 'colaborador@atlassolarjusto.dev',
    descricao: 'Revisão de bases, observações, sugestões e notas metodológicas.',
  },
  {
    papel: 'administrador' as const,
    nome: 'Administrador Demo',
    email: 'admin@atlassolarjusto.dev',
    descricao: 'Aprovação de indicadores, versionamento e gestão de usuários.',
  },
];
const SENHA_DEMONSTRACAO = '123456';

/** Login (RF-009/013) — só Colaborador/Administrador autenticam; Público não. */
export function PaginaLogin() {
  const { entrar, sessao } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarAvisoSenha, setMostrarAvisoSenha] = useState(false);

  const destinoRedirecionado = (location.state as { de?: string } | null)?.de;

  if (sessao) {
    navigate(destinoRedirecionado ?? destinoPorPapel(sessao.usuario.papel), { replace: true });
    return null;
  }

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const usuario = await entrar(email, senha);
      navigate(destinoRedirecionado ?? destinoPorPapel(usuario.papel), { replace: true });
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao entrar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 font-sans">
      <form
        onSubmit={aoSubmeter}
        className="w-96 space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="text-center">
          <div className="mb-3 inline-flex rounded-full bg-stone-100 p-3 text-stone-700">
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Portal de Transição Energética Justa
          </h1>
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-slate-500">
            Acesso reservado a Colaboradores e Administradores do Atlas Solar Justo.
          </p>
        </div>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {erro}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            required
            autoComplete="username"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:ring-1 focus:ring-stone-700 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700" htmlFor="senha">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:ring-1 focus:ring-stone-700 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setMostrarAvisoSenha((atual) => !atual)}
            className="text-xs font-medium text-stone-700 hover:underline"
          >
            Esqueci minha senha
          </button>
          {/* RF-010: o Atlas não tem fluxo de recuperação por e-mail — aviso honesto em
              vez de simular um "e-mail enviado" que nunca chegaria a lugar nenhum. */}
          {mostrarAvisoSenha && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
              Este é um ambiente de prototipagem sem fluxo automático de recuperação de senha.
              Use um dos perfis de demonstração abaixo ou contate o administrador do projeto para
              redefinir o acesso.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white transition-all hover:bg-slate-800 disabled:opacity-60"
        >
          {enviando ? 'Entrando…' : 'Autenticar no Sistema'}
        </button>

        <p className="text-xs text-stone-400">
          Acesso restrito a Colaboradores e Administradores autorizados do Atlas Solar Justo.
        </p>

        {/* RF-011/012: preenchimento automático com contas reais de demonstração. */}
        <div className="space-y-2 border-t border-stone-100 pt-4">
          <span className="block font-mono text-[10px] font-semibold tracking-wider text-stone-400 uppercase">
            Perfis de demonstração (clique para autocompletar)
          </span>
          {PERFIS_DEMONSTRACAO.map((perfil) => (
            <button
              key={perfil.email}
              type="button"
              onClick={() => {
                setEmail(perfil.email);
                setSenha(SENHA_DEMONSTRACAO);
                setErro(null);
              }}
              className="flex w-full items-start gap-2.5 rounded-lg border border-stone-100 p-2.5 text-left transition-all hover:border-stone-300 hover:bg-stone-50"
            >
              <span
                className={`mt-0.5 shrink-0 rounded-md px-1.5 py-1 font-mono text-[9px] font-bold uppercase ${
                  perfil.papel === 'administrador'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                {perfil.papel === 'administrador' ? 'Admin' : 'Colab'}
              </span>
              <span className="space-y-0.5">
                <span className="block text-xs font-bold text-stone-800">{perfil.nome}</span>
                <span className="block font-mono text-[10px] text-stone-500">{perfil.email}</span>
                <span className="block text-[10px] leading-normal text-stone-400">
                  {perfil.descricao}
                </span>
              </span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
