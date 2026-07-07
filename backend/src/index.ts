/**
 * ENTRYPOINT: sobe o servidor HTTP.
 * --------------------------------------------------------------------------
 * `npm run dev` (tsx watch) para desenvolvimento local; `npm run build` +
 * `npm start` para rodar o build compilado (dist/). Ver README.md, seção
 * "Como rodar localmente", para o passo a passo completo (banco, migrations,
 * extractors, backend).
 * --------------------------------------------------------------------------
 */

import { criarApp } from './app.js';
import { env } from './config/env.js';

const app = criarApp();

app.listen(env.porta, () => {
  console.log(`[backend] Atlas Solar Justo rodando em http://localhost:${env.porta} (ambiente: ${env.ambiente})`);
});
