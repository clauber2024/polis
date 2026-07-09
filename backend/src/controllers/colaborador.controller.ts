/**
 * CONTROLLER: endpoints de escrita do papel Colaborador (RF-059 a RF-067)
 * --------------------------------------------------------------------------
 * Controllers finos (CLAUDE.md, Seção 4) — validação via validateRequest,
 * autenticação/papel via requireAutenticacao+requirePapel (ver
 * src/routes/colaborador.routes.ts). `req.usuario` sempre presente aqui
 * porque as rotas de escrita passam por requireAutenticacao antes.
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import * as colaboradorService from '../services/colaborador.service.js';
import type { BaseDadosCanonica } from '../utils/basesDeDadosCanonicas.js';
import type {
  StatusRevisaoBaseDados,
  StatusMaterialComunicacao,
} from '../db/schema/index.js';

/** Rotas atrás de requireAutenticacao sempre têm req.usuario — este helper só documenta isso e evita `!` espalhado pelos handlers. */
function usuarioAutenticado(req: Request): { id: number } {
  if (!req.usuario) {
    // Não deveria acontecer (rota mal configurada) — ver requirePapel para o mesmo guard.
    throw new AppError(401, 'Não autenticado.');
  }
  return req.usuario;
}

export async function listarRevisoesBasesDadosController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await colaboradorService.listarRevisoesBasesDados());
  } catch (erro) {
    next(erro);
  }
}

export async function atualizarRevisaoBaseDadosController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = usuarioAutenticado(req);
    const { baseDados } = req.params as unknown as { baseDados: BaseDadosCanonica };
    const { status } = req.body as { status: StatusRevisaoBaseDados };
    res.json(await colaboradorService.atualizarRevisaoBaseDados(baseDados, status, id));
  } catch (erro) {
    next(erro);
  }
}

export async function listarObservacoesBasesDadosController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { baseDados } = req.params as unknown as { baseDados: BaseDadosCanonica };
    res.json(await colaboradorService.listarObservacoesBasesDados(baseDados));
  } catch (erro) {
    next(erro);
  }
}

export async function criarObservacaoBaseDadosController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = usuarioAutenticado(req);
    const { baseDados } = req.params as unknown as { baseDados: BaseDadosCanonica };
    const { mensagem } = req.body as { mensagem: string };
    res.status(201).json(await colaboradorService.criarObservacaoBaseDados(baseDados, id, mensagem));
  } catch (erro) {
    next(erro);
  }
}

export async function listarSugestoesIndicadoresController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { indicador } = req.query as { indicador?: string };
    res.json(await colaboradorService.listarSugestoesIndicadores(indicador));
  } catch (erro) {
    next(erro);
  }
}

export async function criarSugestaoIndicadorController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = usuarioAutenticado(req);
    const { indicador, mensagem } = req.body as { indicador: string; mensagem: string };
    res.status(201).json(await colaboradorService.criarSugestaoIndicador(indicador, mensagem, id));
  } catch (erro) {
    next(erro);
  }
}

export async function listarNotasMetodologicasController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { topico } = req.query as { topico?: string };
    res.json(await colaboradorService.listarNotasMetodologicas(topico));
  } catch (erro) {
    next(erro);
  }
}

export async function criarNotaMetodologicaController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = usuarioAutenticado(req);
    const { topico, conteudo, forcaAchado } = req.body as {
      topico: string;
      conteudo: string;
      forcaAchado?: number;
    };
    res
      .status(201)
      .json(await colaboradorService.criarNotaMetodologica(topico, conteudo, forcaAchado, id));
  } catch (erro) {
    next(erro);
  }
}

export async function listarMateriaisComunicacaoController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await colaboradorService.listarMateriaisComunicacao());
  } catch (erro) {
    next(erro);
  }
}

export async function criarMaterialComunicacaoController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = usuarioAutenticado(req);
    const { titulo, status } = req.body as {
      titulo: string;
      status?: StatusMaterialComunicacao;
    };
    res.status(201).json(await colaboradorService.criarMaterialComunicacao(titulo, status, id));
  } catch (erro) {
    next(erro);
  }
}

export async function atualizarMaterialComunicacaoController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: materialId } = req.params as unknown as { id: number };
    const { status } = req.body as { status: StatusMaterialComunicacao };
    res.json(await colaboradorService.atualizarMaterialComunicacao(materialId, status));
  } catch (erro) {
    next(erro);
  }
}
