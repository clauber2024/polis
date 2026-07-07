/**
 * APP: monta o Express — middlewares globais, rotas, tratamento de erro.
 * --------------------------------------------------------------------------
 * Separado de src/index.ts de propósito: este arquivo só monta o app (sem
 * chamar .listen()), o que facilita testar a app depois (supertest etc.)
 * sem precisar abrir uma porta real. src/index.ts é quem sobe o servidor.
 *
 * ESCOPO DESTA SESSÃO (07/07/2026): autenticação/JWT/RBAC/6 personas
 * continuam PLANEJADO (CLAUDE.md, Seção 1) — não implementados aqui de
 * propósito. Este app só tem a estrutura mínima para o endpoint de Vazios
 * de Acesso rodar.
 * --------------------------------------------------------------------------
 */

import express from 'express';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { router } from './routes/index.js';

export function criarApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
