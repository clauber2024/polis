/**
 * APP: monta o Express — middlewares globais, rotas, tratamento de erro.
 * --------------------------------------------------------------------------
 * Separado de src/index.ts de propósito: este arquivo só monta o app (sem
 * chamar .listen()), o que facilita testar a app depois (supertest etc.)
 * sem precisar abrir uma porta real. src/index.ts é quem sobe o servidor.
 *
 * ATUALIZADO 08/07/2026: fundação de autenticação/RBAC implementada
 * (POST /api/auth/login, /logout — ver routes/auth.routes.ts,
 * middlewares/auth.ts). Só 3 papéis reais (Público sem login, Colaborador,
 * Administrador — ver DRF.md Seção 2). Os ENDPOINTS DE ESCRITA que dependem
 * disso (observações/sugestões do Colaborador, painel completo do
 * Administrador) continuam PLANEJADOS — ver CLAUDE.md, "Estado Real do
 * Projeto".
 * --------------------------------------------------------------------------
 */

import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { router } from './routes/index.js';

export function criarApp() {
  const app = express();

  /**
   * Sem FRONTEND_URL definida (dev local), libera qualquer origem — o Vite já
   * evita CORS de verdade via proxy, então isso só importa em produção, onde
   * frontend (Vercel) e backend (Railway) vivem em domínios diferentes.
   */
  app.use(
    cors({
      origin: env.frontendUrls.length > 0 ? env.frontendUrls : true,
    }),
  );

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
