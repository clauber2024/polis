/**
 * CONFIG: variáveis de ambiente
 * --------------------------------------------------------------------------
 * Ponto único de leitura de `process.env` do backend — o resto do código
 * importa `env` daqui, nunca lê `process.env` diretamente (evita strings
 * mágicas espalhadas e permite validar tudo num só lugar, na inicialização).
 *
 * DATABASE_URL usa o mesmo default de dev local já usado pelos scripts
 * Python do ETL (ver backend/.env.example e analisar_correlacao_mmgd_renda.py),
 * para manter consistência entre as duas linguagens deste projeto.
 * --------------------------------------------------------------------------
 */

import 'dotenv/config';

function obrigatoria(nome: string, valorPadrao?: string): string {
  const valor = process.env[nome] ?? valorPadrao;
  if (valor === undefined) {
    throw new Error(
      `[config/env] Variável de ambiente obrigatória ausente: ${nome}. ` +
        `Confira backend/.env (ver backend/.env.example).`,
    );
  }
  return valor;
}

export const env = {
  databaseUrl: obrigatoria(
    'DATABASE_URL',
    'postgresql://atlas:atlas_dev_local@localhost:5432/atlas_solar_justo',
  ),
  porta: Number(process.env.PORT ?? 3000),
  ambiente: process.env.NODE_ENV ?? 'development',

  /**
   * JWT_SECRET tem um default de DEV LOCAL pelo mesmo motivo do DATABASE_URL
   * acima: o projeto ainda não tem deploy de produção (CLAUDE.md, Seção 8 —
   * PLANEJADO). Este default NUNCA deve ser usado fora de ambiente local —
   * definir JWT_SECRET de verdade em backend/.env antes de qualquer deploy.
   */
  jwtSecret: obrigatoria(
    'JWT_SECRET',
    'dev-secret-local-nao-usar-em-producao-ver-backend-env-example',
  ),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
};
