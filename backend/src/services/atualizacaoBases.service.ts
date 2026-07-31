/**
 * SERVICE: disparo de extractor Python pela interface (RF-070 revisitado,
 * 30/07/2026 — ver docs/DECISOES.md, "Disparo de ETL pela interface").
 * ============================================================================
 * Só cobre a whitelist de `utils/extractoresElegiveis.ts`. Cada disparo roda
 * como subprocesso via `child_process.spawn` com array de argumentos (NUNCA
 * `exec`/template de shell — `scriptRelativo` vem só da whitelist interna,
 * nunca de input do usuário, mas o padrão spawn+array é mantido de qualquer
 * forma, é a defesa correta contra injeção de comando).
 *
 * Sem fila/agendador nesta primeira versão — só bloqueia duas execuções
 * simultâneas da MESMA base (índice parcial único na migration 0031 é o
 * guard definitivo; a checagem aqui é só pra devolver um erro amigável em
 * vez de estourar a constraint).
 * ============================================================================
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { execucoesEtl, usuarios, type StatusExecucaoEtl } from '../db/schema/index.js';
import { AppError } from '../utils/AppError.js';
import {
  EXTRACTORES_ELEGIVEIS,
  buscarExtractorElegivel,
  type IdExtratorElegivel,
} from '../utils/extractoresElegiveis.js';

/**
 * Raiz de `backend/` (não a raiz do repositório) — o deploy na Railway usa
 * "Root Directory: backend" (ver docs/DEPLOY_TEMPORARIO.md), então dentro do
 * container não existe um nível acima de backend/. Ancorado no arquivo em
 * si (não em process.cwd(), que varia entre dev — rodado de dentro de
 * backend/ — e o container), 2 níveis acima de src/services/ (compilado:
 * dist/services/). `scriptRelativo` na whitelist é relativo a ESTA pasta,
 * não à raiz do repo. fileURLToPath em vez de import.meta.dirname pra não
 * depender de Node ≥20.11 especificamente.
 */
const DIRETORIO_ATUAL = path.dirname(fileURLToPath(import.meta.url));
const DIRETORIO_BACKEND = path.resolve(DIRETORIO_ATUAL, '../../');

const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE ?? 'python3';

/** Cauda do log guardada — suficiente pro resumo final que todo extractor imprime. */
const LIMITE_LOG = 8000;

export async function listarStatusExtratores() {
  const ultimas = await db
    .select({
      id: execucoesEtl.id,
      baseId: execucoesEtl.baseId,
      status: execucoesEtl.status,
      iniciadoEm: execucoesEtl.iniciadoEm,
      finalizadoEm: execucoesEtl.finalizadoEm,
      codigoSaida: execucoesEtl.codigoSaida,
      saidaLog: execucoesEtl.saidaLog,
      iniciadoPorNome: usuarios.nome,
    })
    .from(execucoesEtl)
    .leftJoin(usuarios, eq(execucoesEtl.iniciadoPorUsuarioId, usuarios.id))
    .orderBy(desc(execucoesEtl.iniciadoEm));

  const maisRecentePorBase = new Map<string, (typeof ultimas)[number]>();
  for (const execucao of ultimas) {
    if (!maisRecentePorBase.has(execucao.baseId)) {
      maisRecentePorBase.set(execucao.baseId, execucao);
    }
  }

  return EXTRACTORES_ELEGIVEIS.map((extractor) => ({
    id: extractor.id,
    rotulo: extractor.rotulo,
    ultimaExecucao: maisRecentePorBase.get(extractor.id) ?? null,
  }));
}

export async function dispararAtualizacao(baseId: string, usuarioId: number) {
  const extractor = buscarExtractorElegivel(baseId);
  if (!extractor) {
    throw new AppError(404, `Base "${baseId}" não está na whitelist de atualização automática.`);
  }

  const [ultima] = await db
    .select({ status: execucoesEtl.status })
    .from(execucoesEtl)
    .where(eq(execucoesEtl.baseId, baseId))
    .orderBy(desc(execucoesEtl.iniciadoEm))
    .limit(1);
  if (ultima?.status === ('em_execucao' satisfies StatusExecucaoEtl)) {
    throw new AppError(409, `"${extractor.rotulo}" já está atualizando — aguarde terminar.`);
  }

  const [execucao] = await db
    .insert(execucoesEtl)
    .values({ baseId, iniciadoPorUsuarioId: usuarioId })
    .returning({ id: execucoesEtl.id });

  executarSubprocesso(execucao.id, extractor.scriptRelativo);

  return { execucaoId: execucao.id };
}

function executarSubprocesso(execucaoId: number, scriptRelativo: string) {
  const processo = spawn(PYTHON_EXECUTABLE, [scriptRelativo], {
    cwd: DIRETORIO_BACKEND,
    env: process.env,
  });

  let saida = '';
  function acumular(pedaco: Buffer) {
    saida += pedaco.toString('utf-8');
    if (saida.length > LIMITE_LOG) {
      saida = saida.slice(saida.length - LIMITE_LOG);
    }
  }
  processo.stdout.on('data', acumular);
  processo.stderr.on('data', acumular);

  processo.on('close', (codigo) => {
    db.update(execucoesEtl)
      .set({
        status: (codigo === 0 ? 'sucesso' : 'falha') satisfies StatusExecucaoEtl,
        codigoSaida: codigo,
        saidaLog: saida,
        finalizadoEm: new Date(),
      })
      .where(eq(execucoesEtl.id, execucaoId))
      .catch((erro: unknown) => {
        console.error(`Falha ao registrar conclusão da execução ${execucaoId}:`, erro);
      });
  });

  processo.on('error', (erro) => {
    db.update(execucoesEtl)
      .set({
        status: 'falha' satisfies StatusExecucaoEtl,
        saidaLog: `Falha ao iniciar o processo: ${erro.message}`,
        finalizadoEm: new Date(),
      })
      .where(eq(execucoesEtl.id, execucaoId))
      .catch((erroSecundario: unknown) => {
        console.error(`Falha ao registrar erro de início da execução ${execucaoId}:`, erroSecundario);
      });
  });
}

export type { IdExtratorElegivel };
