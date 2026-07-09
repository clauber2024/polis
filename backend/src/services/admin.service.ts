/**
 * SERVICE: endpoints do Painel Administrador (RF-070 a RF-077)
 * ============================================================================
 * RF-070 ("upload de bases"): decisão do usuário (08/07/2026) — implementado
 * só como workflow/status (metadados + aprovação + versionamento), NÃO
 * recebimento de arquivo via API. A carga real de dado continua via ETL
 * Python (`python3 backend/src/etl/loaders/extrair_*.py`, fora desta API).
 *
 * Guards de "último administrador": nenhuma operação aqui pode deixar o
 * sistema sem NENHUM administrador ativo (removeria a única forma de
 * gerenciar usuários depois) — ver `garantirNaoUltimoAdministrador`.
 * ============================================================================
 */

import { eq, and, ne, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { AppError } from '../utils/AppError.js';
import {
  metadadosBasesDados,
  aprovacoesIndicadores,
  versoesPublicadas,
  usuarios,
  type GranularidadeEspacial,
  type StatusMetadadoBaseDados,
  type StatusAprovacaoIndicador,
  type PapelUsuario,
} from '../db/schema/index.js';
import type { IdMetadadoBaseDados } from '../utils/basesDeDadosCanonicas.js';

// -- RF-071/072/073: metadados técnicos das bases ---------------------------

export async function listarMetadadosBasesDados() {
  return db
    .select({
      baseDados: metadadosBasesDados.baseDados,
      granularidadeEspacial: metadadosBasesDados.granularidadeEspacial,
      status: metadadosBasesDados.status,
      observacao: metadadosBasesDados.observacao,
      atualizadoEm: metadadosBasesDados.atualizadoEm,
      atualizadoPorNome: usuarios.nome,
    })
    .from(metadadosBasesDados)
    .leftJoin(usuarios, eq(metadadosBasesDados.atualizadoPorUsuarioId, usuarios.id))
    .orderBy(metadadosBasesDados.baseDados);
}

export async function atualizarMetadadoBaseDados(
  baseDados: IdMetadadoBaseDados,
  dados: {
    granularidadeEspacial?: GranularidadeEspacial;
    status?: StatusMetadadoBaseDados;
    observacao?: string;
  },
  usuarioId: number,
) {
  const [linha] = await db
    .update(metadadosBasesDados)
    .set({ ...dados, atualizadoPorUsuarioId: usuarioId, atualizadoEm: new Date() })
    .where(eq(metadadosBasesDados.baseDados, baseDados))
    .returning();

  if (!linha) {
    throw new AppError(404, `Metadado de base de dados "${baseDados}" não encontrado.`);
  }
  return linha;
}

// -- RF-074: aprovação de indicadores -----------------------------------------

export async function listarAprovacoesIndicadores() {
  return db
    .select({
      id: aprovacoesIndicadores.id,
      indicador: aprovacoesIndicadores.indicador,
      status: aprovacoesIndicadores.status,
      motivo: aprovacoesIndicadores.motivo,
      criadoEm: aprovacoesIndicadores.criadoEm,
      decididoEm: aprovacoesIndicadores.decididoEm,
    })
    .from(aprovacoesIndicadores)
    .orderBy(aprovacoesIndicadores.criadoEm);
}

export async function criarAprovacaoIndicador(indicador: string, usuarioId: number) {
  const [linha] = await db
    .insert(aprovacoesIndicadores)
    .values({ indicador, criadoPorUsuarioId: usuarioId })
    .returning();
  return linha;
}

export async function decidirAprovacaoIndicador(
  id: number,
  status: Exclude<StatusAprovacaoIndicador, 'pendente'>,
  motivo: string | undefined,
  usuarioId: number,
) {
  const [linha] = await db
    .update(aprovacoesIndicadores)
    .set({
      status,
      motivo: motivo ?? null,
      decididoPorUsuarioId: usuarioId,
      decididoEm: new Date(),
    })
    .where(eq(aprovacoesIndicadores.id, id))
    .returning();

  if (!linha) {
    throw new AppError(404, `Indicador pendente ${id} não encontrado.`);
  }
  return linha;
}

// -- RF-075: versionamento de publicação --------------------------------------

export async function listarVersoesPublicadas() {
  return db
    .select({
      id: versoesPublicadas.id,
      versao: versoesPublicadas.versao,
      descricao: versoesPublicadas.descricao,
      publicadoEm: versoesPublicadas.publicadoEm,
      publicadoPorNome: usuarios.nome,
    })
    .from(versoesPublicadas)
    .leftJoin(usuarios, eq(versoesPublicadas.publicadoPorUsuarioId, usuarios.id))
    .orderBy(versoesPublicadas.publicadoEm);
}

export async function publicarVersao(versao: string, descricao: string, usuarioId: number) {
  const jaExiste = await db
    .select({ id: versoesPublicadas.id })
    .from(versoesPublicadas)
    .where(eq(versoesPublicadas.versao, versao))
    .limit(1);

  if (jaExiste.length > 0) {
    throw new AppError(409, `Versão "${versao}" já foi publicada.`);
  }

  const [linha] = await db
    .insert(versoesPublicadas)
    .values({ versao, descricao, publicadoPorUsuarioId: usuarioId })
    .returning();
  return linha;
}

// -- RF-076: gestão de usuários -----------------------------------------------

/**
 * Garante que a operação não deixa o sistema sem NENHUM administrador ativo.
 * `idExcluido` é o usuário sendo removido/alterado — não conta ele mesmo na
 * checagem de "sobra alguém depois desta operação?".
 */
async function garantirNaoUltimoAdministrador(idExcluido: number): Promise<void> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(usuarios)
    .where(and(eq(usuarios.papel, 'administrador'), eq(usuarios.ativo, true), ne(usuarios.id, idExcluido)));

  if (Number(total) === 0) {
    throw new AppError(
      400,
      'Esta operação deixaria o sistema sem nenhum administrador ativo. Promova outro usuário antes.',
    );
  }
}

export async function listarUsuarios() {
  return db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      papel: usuarios.papel,
      ativo: usuarios.ativo,
      criadoEm: usuarios.criadoEm,
      // senhaHash NUNCA exposto pela API (RF-076 só pede papel/status/ações).
    })
    .from(usuarios)
    .orderBy(usuarios.nome);
}

export async function atualizarUsuario(
  id: number,
  dados: { nome?: string; papel?: PapelUsuario; ativo?: boolean },
) {
  const [existente] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
  if (!existente) {
    throw new AppError(404, `Usuário ${id} não encontrado.`);
  }

  const vaiDeixarDeSerAdminAtivo =
    existente.papel === 'administrador' &&
    existente.ativo &&
    ((dados.papel !== undefined && dados.papel !== 'administrador') ||
      (dados.ativo !== undefined && dados.ativo === false));

  if (vaiDeixarDeSerAdminAtivo) {
    await garantirNaoUltimoAdministrador(id);
  }

  const [linha] = await db
    .update(usuarios)
    .set(dados)
    .where(eq(usuarios.id, id))
    .returning({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      papel: usuarios.papel,
      ativo: usuarios.ativo,
      criadoEm: usuarios.criadoEm,
    });

  return linha;
}

export async function removerUsuario(id: number, usuarioSolicitanteId: number): Promise<void> {
  if (id === usuarioSolicitanteId) {
    throw new AppError(400, 'Você não pode remover sua própria conta.');
  }

  const [existente] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
  if (!existente) {
    throw new AppError(404, `Usuário ${id} não encontrado.`);
  }

  if (existente.papel === 'administrador' && existente.ativo) {
    await garantirNaoUltimoAdministrador(id);
  }

  await db.delete(usuarios).where(eq(usuarios.id, id));
}
