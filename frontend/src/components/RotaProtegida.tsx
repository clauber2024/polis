import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Papel } from '../types/api';

interface RotaProtegidaProps {
  /** Se omitido, exige só autenticação (qualquer papel — Colaborador ou Administrador). */
  papeis?: Papel[];
  children: ReactNode;
}

/**
 * Sem sessão: redireciona para /login guardando a rota de origem
 * (`location.state.de`), para a PaginaLogin devolver o usuário para onde ele
 * tentou ir. Com sessão mas papel não autorizado (ex: Colaborador tentando
 * /admin): redireciona para o mapa (/mapa — não mais "/", que virou a landing
 * pública nesta sessão), não para /login — o problema não é falta de login.
 */
export function RotaProtegida({ papeis, children }: RotaProtegidaProps) {
  const { sessao, carregando, temPapel } = useAuth();
  const location = useLocation();

  if (carregando) return null;

  if (!sessao) {
    return <Navigate to="/login" state={{ de: location.pathname }} replace />;
  }
  if (papeis && !temPapel(...papeis)) {
    return <Navigate to="/mapa" replace />;
  }
  return <>{children}</>;
}
