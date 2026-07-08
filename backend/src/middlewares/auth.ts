/**
 * MIDDLEWARE: autenticação (JWT) e autorização por papel — fundação de RBAC
 * (sessão 08/07/2026, ver DRF.md Seção 2 e CLAUDE.md).
 * --------------------------------------------------------------------------
 * `requireAutenticacao` lê o Bearer token do header `Authorization`, valida
 * a assinatura/expiração via `jsonwebtoken`, e popula `req.usuario` (ver
 * augmentation em src/types/express.d.ts) com o payload — qualquer rota
 * atrás deste middleware pode confiar em `req.usuario` estar presente.
 *
 * `requirePapel(...papeis)` deve vir DEPOIS de `requireAutenticacao` na
 * cadeia da rota — só checa `req.usuario.papel`, não autentica sozinho.
 * Uso típico:
 *   router.post('/algo', requireAutenticacao, requirePapel('administrador'), controller);
 *
 * Token revogado/expirado, header ausente ou malformado: sempre 401 (nunca
 * um erro genérico 500) — o cliente sabe que precisa logar de novo.
 * Autenticado mas sem o papel exigido: 403.
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import type { PapelUsuario } from '../db/schema/usuarios.js';

interface PayloadJwt {
  sub: number;
  papel: PapelUsuario;
}

function extrairToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export function requireAutenticacao(req: Request, _res: Response, next: NextFunction): void {
  const token = extrairToken(req);
  if (!token) {
    next(new AppError(401, 'Token de autenticação ausente.'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as PayloadJwt;
    req.usuario = { id: payload.sub, papel: payload.papel };
    next();
  } catch {
    next(new AppError(401, 'Token de autenticação inválido ou expirado.'));
  }
}

export function requirePapel(...papeisPermitidos: PapelUsuario[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      // Erro de programação (rota esqueceu requireAutenticacao antes deste
      // middleware), não erro do cliente — mas ainda respondemos 401 em vez
      // de vazar stack trace, e logamos para investigar depois.
      console.error('[requirePapel] req.usuario ausente — requireAutenticacao não foi chamado antes?');
      next(new AppError(401, 'Não autenticado.'));
      return;
    }

    if (!papeisPermitidos.includes(req.usuario.papel)) {
      next(new AppError(403, 'Você não tem permissão para acessar este recurso.'));
      return;
    }

    next();
  };
}
