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
import * as atualizacaoBasesService from '../services/atualizacaoBases.service.js';
import * as uploadBasesService from '../services/uploadBases.service.js';
import type { IdMetadadoBaseDados } from '../utils/basesDeDadosCanonicas.js';
import type { IdExtratorElegivel } from '../utils/extractoresElegiveis.js';
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

// -- disparo de ETL pela interface (RF-070 revisitado) ------------------------

export async function listarStatusExtratoresController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await atualizacaoBasesService.listarStatusExtratores());
  } catch (erro) {
    next(erro);
  }
}

export async function dispararAtualizacaoBaseController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: usuarioId } = usuarioAutenticado(req);
    const { baseId } = req.params as unknown as { baseId: IdExtratorElegivel };
    res.status(202).json(await atualizacaoBasesService.dispararAtualizacao(baseId, usuarioId));
  } catch (erro) {
    next(erro);
  }
}

// -- upload de arquivo + disparo de ETL (RF-070 revisitado, fase 2) ----------

export async function listarStatusExtratoresComUploadController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.json(await uploadBasesService.listarStatusExtratoresComUpload());
  } catch (erro) {
    next(erro);
  }
}

export async function dispararComUploadController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: usuarioId } = usuarioAutenticado(req);
    const { baseId } = req.params as unknown as { baseId: string };
    const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (arquivos.length === 0) {
      throw new AppError(400, 'Nenhum arquivo enviado.');
    }
    res
      .status(202)
      .json(await uploadBasesService.dispararComUpload(baseId, arquivos, usuarioId));
  } catch (erro) {
    next(erro);
  }
}
