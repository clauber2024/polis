import type { LoginResultado } from '../types/api';
import { enviarJson } from './http';

/** POST /api/auth/login (RF-009/013). Papel Público não loga (não chama isto). */
export function login(email: string, senha: string): Promise<LoginResultado> {
  return enviarJson<LoginResultado>('POST', '/api/auth/login', { corpo: { email, senha } });
}

/**
 * POST /api/auth/logout (RF-014) — no-op no servidor (JWT stateless, ver
 * auth.controller.ts). Chamado só por completude; quem efetivamente encerra a
 * sessão no cliente é o AuthContext descartando o token do localStorage.
 */
export function logout(): Promise<void> {
  return enviarJson<void>('POST', '/api/auth/logout');
}
