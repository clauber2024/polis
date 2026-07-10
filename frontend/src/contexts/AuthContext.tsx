import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as authService from '../services/auth.service';
import type { Papel, UsuarioAutenticado } from '../types/api';

const CHAVE_STORAGE = 'atlas.sessao';

interface Sessao {
  token: string;
  usuario: UsuarioAutenticado;
}

interface AuthContextValor {
  sessao: Sessao | null;
  /** true enquanto restaura a sessão do localStorage no primeiro render — evita
   *  redirecionar para /login antes de saber se já havia sessão salva. */
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => void;
  temPapel: (...papeis: Papel[]) => boolean;
}

const AuthContext = createContext<AuthContextValor | null>(null);

/**
 * Sessão de autenticação (RF-009/013/014 — fundação de RBAC). Persistida em
 * localStorage (JWT stateless, sem endpoint de refresh/validação nesta
 * fundação — ver auth.service.ts no backend) para sobreviver a um F5.
 * Componentes leem/alteram a sessão via `useAuth()`, nunca via localStorage
 * direto (mesma regra de "nenhum acesso direto fora dos services/contexto").
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    if (bruto) {
      try {
        setSessao(JSON.parse(bruto) as Sessao);
      } catch {
        localStorage.removeItem(CHAVE_STORAGE);
      }
    }
    setCarregando(false);
  }, []);

  async function entrar(email: string, senha: string): Promise<void> {
    const resultado = await authService.login(email, senha);
    const novaSessao: Sessao = { token: resultado.token, usuario: resultado.usuario };
    setSessao(novaSessao);
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(novaSessao));
  }

  function sair(): void {
    setSessao(null);
    localStorage.removeItem(CHAVE_STORAGE);
    // Logout é no-op no servidor (JWT stateless) — dispara por completude, sem
    // bloquear a saída no cliente em caso de falha de rede.
    authService.logout().catch(() => {});
  }

  function temPapel(...papeis: Papel[]): boolean {
    return sessao !== null && papeis.includes(sessao.usuario.papel);
  }

  return (
    <AuthContext.Provider value={{ sessao, carregando, entrar, sair, temPapel }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth() precisa ser usado dentro de <AuthProvider>.');
  }
  return contexto;
}
