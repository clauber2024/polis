/**
 * CONTROLLER: endpoints do Painel Administrador (RF-070 a RF-077)
 * --------------------------------------------------------------------------
 * Controllers finos (CLAUDE.md, Seção 4). Todas as escritas aqui exigem
 * requireAutenticacao + requirePapel('administrador') — ver
 * src/routes/admin.routes.ts.
 * --------------------------------------------------------------------------
 */

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import * as adminService from '../services/admin.service.js';
import type { IdMetadadoBaseDados } from '../utils/basesDeDadosCanonicas.js';
import type {
  GranularidadeEspacial,
  StatusMetadadoBaseDados,
  StatusAprovacaoIndicador,
  PapelUsuario,
} from '../db/schema/index.js';

function usuarioAutenticado(req: Request): { id: number } {
  if (!req.usuario) {
    throw new AppError(401, 'Não autenticado.');
  }
  return req.usuario;
}

// -- metadados de bases (RF-071/072/073) -------------------------------------

export async function listarMetadadosBasesDadosController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await adminService.listarMetadadosBasesDados());
  } catch (erro) {
    next(erro);
  }
}

export async function atualizarMetadadoBaseDadosController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = usuarioAutenticado(req);
    const { baseDados } = req.params as unknown as { baseDados: IdMetadadoBaseDados };
    const dados = req.body as {
      granularidadeEspacial?: GranularidadeEspacial;
      status?: StatusMetadadoBaseDados;
      observacao?: string;
    };
    res.json(await adminService.atualizarMetadadoBaseDados(baseDados, dados, id));
  } catch (erro) {
    next(erro);
  }
}

// -- aprovação de indicadores (RF-074) ---------------------------------------

export async function listarAprovacoesIndicadoresController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await adminService.listarAprovacoesIndicadores());
  } catch (erro) {
    next(erro);
  }
}

export async function criarAprovacaoIndicadorController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = usuarioAutenticado(req);
    const { indicador } = req.body as { indicador: string };
    res.status(201).json(await adminService.criarAprovacaoIndicador(indicador, id));
  } catch (erro) {
    next(erro);
  }
}

export async function decidirAprovacaoIndicadorController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: usuarioId } = usuarioAutenticado(req);
    const { id: aprovacaoId } = req.params as unknown as { id: number };
    const { status, motivo } = req.body as {
      status: Exclude<StatusAprovacaoIndicador, 'pendente'>;
      motivo?: string;
    };
    res.json(await adminService.decidirAprovacaoIndicador(aprovacaoId, status, motivo, usuarioId));
  } catch (erro) {
    next(erro);
  }
}

// -- versionamento de publicação (RF-075) ------------------------------------

export async function listarVersoesPublicadasController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await adminService.listarVersoesPublicadas());
  } catch (erro) {
    next(erro);
  }
}

export async function publicarVersaoController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = usuarioAutenticado(req);
    const { versao, descricao } = req.body as { versao: string; descricao: string };
    res.status(201).json(await adminService.publicarVersao(versao, descricao, id));
  } catch (erro) {
    next(erro);
  }
}

// -- gestão de usuários (RF-076) ----------------------------------------------

export async function listarUsuariosController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await adminService.listarUsuarios());
  } catch (erro) {
    next(erro);
  }
}

export async function atualizarUsuarioController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: usuarioAlvoId } = req.params as unknown as { id: number };
    const dados = req.body as { nome?: string; papel?: PapelUsuario; ativo?: boolean };
    res.json(await adminService.atualizarUsuario(usuarioAlvoId, dados));
  } catch (erro) {
    next(erro);
  }
}

export async function removerUsuarioController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: usuarioSolicitanteId } = usuarioAutenticado(req);
    const { id: usuarioAlvoId } = req.params as unknown as { id: number };
    await adminService.removerUsuario(usuarioAlvoId, usuarioSolicitanteId);
    res.status(204).send();
  } catch (erro) {
    next(erro);
  }
}
