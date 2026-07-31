/**
 * SERVICE: upload de arquivo + disparo de extractor (RF-070 revisitado,
 * fase 2 — 31/07/2026). Cobre as 3 fontes de `utils/extractoresComUpload.ts`
 * que nunca tiveram URL pública (Reforma Casa Brasil Solar, ZEIS de São
 * Paulo/Belo Horizonte) — diferente de `atualizacaoBases.service.ts`
 * (fontes que baixam sozinhas), aqui o Administrador anexa o(s) arquivo(s)
 * pela interface antes de disparar.
 *
 * Os arquivos são gravados numa pasta TEMPORÁRIA (`os.tmpdir()`), nunca em
 * `backend/src/etl/data/raw/` — o filesystem do container é efêmero
 * (qualquer redeploy apaga tudo), e o objetivo aqui não é guardar o arquivo
 * bruto, é só alimentar UMA execução do extractor (o dado que importa fica
 * persistido no Postgres depois do upsert). A pasta é apagada assim que o
 * subprocesso termina, sucesso ou falha (`aoFinalizar` de
 * `executarSubprocesso`).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { execucoesEtl, usuarios } from '../db/schema/index.js';
import { AppError } from '../utils/AppError.js';
import {
  EXTRATORES_COM_UPLOAD,
  buscarExtractorComUpload,
  type IdExtratorComUpload,
} from '../utils/extractoresComUpload.js';
import { executarSubprocesso, iniciarExecucao } from './atualizacaoBases.service.js';

export async function listarStatusExtratoresComUpload() {
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

  return EXTRATORES_COM_UPLOAD.map((extractor) => ({
    id: extractor.id,
    rotulo: extractor.rotulo,
    arquivos: extractor.arquivos.map((a) => ({
      extensaoAceita: a.extensaoAceita,
      descricao: a.descricao,
    })),
    ultimaExecucao: maisRecentePorBase.get(extractor.id) ?? null,
  }));
}

export async function dispararComUpload(
  baseId: string,
  arquivos: Express.Multer.File[],
  usuarioId: number,
) {
  const extractor = buscarExtractorComUpload(baseId);
  if (!extractor) {
    throw new AppError(404, `Base "${baseId}" não está na whitelist de upload.`);
  }
  if (arquivos.length !== extractor.arquivos.length) {
    throw new AppError(
      400,
      `"${extractor.rotulo}" espera ${extractor.arquivos.length} arquivo(s) ` +
        `(${extractor.arquivos.map((a) => a.descricao).join(', ')}), recebido(s) ${arquivos.length}.`,
    );
  }

  const execucao = await iniciarExecucao(baseId, extractor.rotulo, usuarioId);

  const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), `atlas-upload-${baseId}-`));
  const envExtra: NodeJS.ProcessEnv = { BASE_DOWNLOADS: pastaTemp };

  extractor.arquivos.forEach((esperado, indice) => {
    if ('envVarCaminhoCompleto' in esperado) {
      // Arquivo avulso (EPE BEN/PDGD) — grava fora da convenção de pasta
      // compartilhada e aponta a variável de ambiente específica pra ele.
      const nomeGravado = `arquivo${indice}${esperado.extensaoAceita}`;
      const destino = path.join(pastaTemp, nomeGravado);
      fs.writeFileSync(destino, arquivos[indice].buffer);
      envExtra[esperado.envVarCaminhoCompleto] = destino;
    } else {
      const destino = path.join(pastaTemp, esperado.nomeArquivoDestino);
      fs.writeFileSync(destino, arquivos[indice].buffer);
    }
  });

  executarSubprocesso(execucao.id, extractor.scriptRelativo, {
    envExtra,
    aoFinalizar: () => {
      fs.rm(pastaTemp, { recursive: true, force: true }, (erro) => {
        if (erro) console.error(`Falha ao limpar pasta temporária ${pastaTemp}:`, erro);
      });
    },
  });

  return { execucaoId: execucao.id };
}

export type { IdExtratorComUpload };
