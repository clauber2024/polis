/**
 * SERVICE: endpoints de escrita do papel Colaborador (RF-059 a RF-067)
 * ============================================================================
 * Funde as antigas seções "Painel do Parceiro Técnico (P4)" e "Painel da
 * Equipe do Projeto (P5)" do DRF — ver DRF.md Seção 2 (revisão 08/07/2026).
 * Todas as escritas aqui exigem `req.usuario` (populado por
 * `requireAutenticacao`) — quem chama estas funções é responsabilidade do
 * controller/rota garantir isso via middleware, não desta camada.
 *
 * Como nas demais tabelas simples (ver auth.service.ts), usa o query builder
 * do Drizzle, não `sql` cru — sem geometria/agregação complexa aqui.
 * ============================================================================
 */

import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { AppError } from '../utils/AppError.js';
import {
  revisoesBasesDados,
  observacoesBasesDados,
  sugestoesIndicadores,
  notasMetodologicas,
  materiaisComunicacao,
  usuarios,
  type StatusRevisaoBaseDados,
  type StatusMaterialComunicacao,
} from '../db/schema/index.js';
import type { BaseDadosCanonica } from '../utils/basesDeDadosCanonicas.js';

// -- RF-059: revisão metodológica por base ----------------------------------

export async function listarRevisoesBasesDados() {
  return db
    .select({
      baseDados: revisoesBasesDados.baseDados,
      status: revisoesBasesDados.status,
      atualizadoEm: revisoesBasesDados.atualizadoEm,
      atualizadoPorNome: usuarios.nome,
    })
    .from(revisoesBasesDados)
    .leftJoin(usuarios, eq(revisoesBasesDados.atualizadoPorUsuarioId, usuarios.id))
    .orderBy(revisoesBasesDados.baseDados);
}

export async function atualizarRevisaoBaseDados(
  baseDados: BaseDadosCanonica,
  status: StatusRevisaoBaseDados,
  usuarioId: number,
) {
  const [linha] = await db
    .insert(revisoesBasesDados)
    .values({ baseDados, status, atualizadoPorUsuarioId: usuarioId })
    .onConflictDoUpdate({
      target: revisoesBasesDados.baseDados,
      set: { status, atualizadoPorUsuarioId: usuarioId, atualizadoEm: new Date() },
    })
    .returning();

  return linha;
}

// -- RF-060: observações sobre inconsistências ------------------------------

export async function listarObservacoesBasesDados(baseDados?: BaseDadosCanonica) {
  // `.where(undefined)` é o idioma do Drizzle para "sem filtro" — evita
  // encadeamento condicional de `.where()` depois de `.orderBy()`, que exige
  // `.$dynamic()` nesta versão do drizzle-orm.
  return db
    .select({
      id: observacoesBasesDados.id,
      baseDados: observacoesBasesDados.baseDados,
      mensagem: observacoesBasesDados.mensagem,
      criadoEm: observacoesBasesDados.criadoEm,
      autorNome: usuarios.nome,
    })
    .from(observacoesBasesDados)
    .leftJoin(usuarios, eq(observacoesBasesDados.usuarioId, usuarios.id))
    .where(baseDados ? eq(observacoesBasesDados.baseDados, baseDados) : undefined)
    .orderBy(desc(observacoesBasesDados.criadoEm));
}

export async function criarObservacaoBaseDados(
  baseDados: BaseDadosCanonica,
  usuarioId: number,
  mensagem: string,
) {
  const [linha] = await db
    .insert(observacoesBasesDados)
    .values({ baseDados, usuarioId, mensagem })
    .returning();
  return linha;
}

// -- RF-061: sugestões de melhoria em indicadores ---------------------------

export async function listarSugestoesIndicadores(indicador?: string) {
  return db
    .select({
      id: sugestoesIndicadores.id,
      indicador: sugestoesIndicadores.indicador,
      mensagem: sugestoesIndicadores.mensagem,
      criadoEm: sugestoesIndicadores.criadoEm,
      autorNome: usuarios.nome,
    })
    .from(sugestoesIndicadores)
    .leftJoin(usuarios, eq(sugestoesIndicadores.usuarioId, usuarios.id))
    .where(indicador ? eq(sugestoesIndicadores.indicador, indicador) : undefined)
    .orderBy(desc(sugestoesIndicadores.criadoEm));
}

export async function criarSugestaoIndicador(
  indicador: string,
  mensagem: string,
  usuarioId: number,
) {
  const [linha] = await db
    .insert(sugestoesIndicadores)
    .values({ indicador, mensagem, usuarioId })
    .returning();
  return linha;
}

// -- RF-064/065/066: notas metodológicas (com histórico) --------------------

export async function listarNotasMetodologicas(topico?: string) {
  return db
    .select({
      id: notasMetodologicas.id,
      topico: notasMetodologicas.topico,
      conteudo: notasMetodologicas.conteudo,
      forcaAchado: notasMetodologicas.forcaAchado,
      criadoEm: notasMetodologicas.criadoEm,
      autorNome: usuarios.nome,
    })
    .from(notasMetodologicas)
    .leftJoin(usuarios, eq(notasMetodologicas.usuarioId, usuarios.id))
    .where(topico ? eq(notasMetodologicas.topico, topico) : undefined)
    .orderBy(desc(notasMetodologicas.criadoEm));
}

export async function criarNotaMetodologica(
  topico: string,
  conteudo: string,
  forcaAchado: number | undefined,
  usuarioId: number,
) {
  const [linha] = await db
    .insert(notasMetodologicas)
    .values({ topico, conteudo, forcaAchado: forcaAchado ?? null, usuarioId })
    .returning();
  return linha;
}

// -- RF-067: materiais de comunicação ----------------------------------------

export async function listarMateriaisComunicacao() {
  return db
    .select({
      id: materiaisComunicacao.id,
      titulo: materiaisComunicacao.titulo,
      status: materiaisComunicacao.status,
      criadoEm: materiaisComunicacao.criadoEm,
      atualizadoEm: materiaisComunicacao.atualizadoEm,
      autorNome: usuarios.nome,
    })
    .from(materiaisComunicacao)
    .leftJoin(usuarios, eq(materiaisComunicacao.usuarioId, usuarios.id))
    .orderBy(desc(materiaisComunicacao.atualizadoEm));
}

export async function criarMaterialComunicacao(
  titulo: string,
  status: StatusMaterialComunicacao | undefined,
  usuarioId: number,
) {
  const [linha] = await db
    .insert(materiaisComunicacao)
    .values({ titulo, status: status ?? 'em_producao', usuarioId })
    .returning();
  return linha;
}

export async function atualizarMaterialComunicacao(id: number, status: StatusMaterialComunicacao) {
  const [linha] = await db
    .update(materiaisComunicacao)
    .set({ status, atualizadoEm: new Date() })
    .where(eq(materiaisComunicacao.id, id))
    .returning();

  if (!linha) {
    throw new AppError(404, `Material de comunicação ${id} não encontrado.`);
  }
  return linha;
}
