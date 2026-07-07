/**
 * DB CLIENT: instância única do Drizzle, usada por todos os services.
 * --------------------------------------------------------------------------
 * Acesso a dados isolado via Drizzle (CLAUDE.md, Seção 4) — nenhum service/
 * controller deve importar `pg` diretamente; sempre passam por `db` daqui.
 *
 * Driver `pg` (node-postgres) + `drizzle-orm/node-postgres`, mesma escolha
 * de stack já fixada no CLAUDE.md (Node 20+, TypeScript 5+, Drizzle ORM).
 * O Python do ETL usa psycopg2/SQLAlchemy — cada lado da stack usa o driver
 * PostgreSQL idiomático da sua linguagem, não há necessidade de compartilhar
 * driver entre Node e Python.
 * --------------------------------------------------------------------------
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

export const db = drizzle(pool, { schema });
