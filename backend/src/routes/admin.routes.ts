import { Router } from 'express';
import { validateRequest } from '../middlewares/validateRequest.js';
import { requireAutenticacao, requirePapel } from '../middlewares/auth.js';
import {
  atualizarMetadadoParamsSchema,
  atualizarMetadadoBodySchema,
  criarAprovacaoIndicadorBodySchema,
  decidirAprovacaoIndicadorParamsSchema,
  decidirAprovacaoIndicadorBodySchema,
  publicarVersaoBodySchema,
  atualizarUsuarioParamsSchema,
  atualizarUsuarioBodySchema,
  removerUsuarioParamsSchema,
} from '../schemas/admin.schema.js';
import {
  listarMetadadosBasesDadosController,
  atualizarMetadadoBaseDadosController,
  listarAprovacoesIndicadoresController,
  criarAprovacaoIndicadorController,
  decidirAprovacaoIndicadorController,
  listarVersoesPublicadasController,
  publicarVersaoController,
  listarUsuariosController,
  atualizarUsuarioController,
  removerUsuarioController,
} from '../controllers/admin.controller.js';

export const adminRouter = Router();

/** Tudo neste router é escrita/gestão do Administrador — só este papel (ver DRF.md Seção 2). */
const requireAdmin = [requireAutenticacao, requirePapel('administrador')];

// RF-071/072/073 — metadados técnicos das bases (leitura pública, escrita Admin)
adminRouter.get('/admin/metadados-bases-dados', listarMetadadosBasesDadosController);
adminRouter.put(
  '/admin/metadados-bases-dados/:baseDados',
  ...requireAdmin,
  validateRequest({ params: atualizarMetadadoParamsSchema, body: atualizarMetadadoBodySchema }),
  atualizarMetadadoBaseDadosController,
);

// RF-074 — fila de aprovação de indicadores (fila interna, tudo Admin)
adminRouter.get('/admin/aprovacoes-indicadores', ...requireAdmin, listarAprovacoesIndicadoresController);
adminRouter.post(
  '/admin/aprovacoes-indicadores',
  ...requireAdmin,
  validateRequest({ body: criarAprovacaoIndicadorBodySchema }),
  criarAprovacaoIndicadorController,
);
adminRouter.patch(
  '/admin/aprovacoes-indicadores/:id',
  ...requireAdmin,
  validateRequest({
    params: decidirAprovacaoIndicadorParamsSchema,
    body: decidirAprovacaoIndicadorBodySchema,
  }),
  decidirAprovacaoIndicadorController,
);

// RF-075 — versionamento de publicação (changelog público, publicar é Admin)
adminRouter.get('/admin/versoes-publicadas', listarVersoesPublicadasController);
adminRouter.post(
  '/admin/versoes-publicadas',
  ...requireAdmin,
  validateRequest({ body: publicarVersaoBodySchema }),
  publicarVersaoController,
);

// RF-076 — gestão de usuários (tudo Admin, nunca expõe senhaHash)
adminRouter.get('/admin/usuarios', ...requireAdmin, listarUsuariosController);
adminRouter.patch(
  '/admin/usuarios/:id',
  ...requireAdmin,
  validateRequest({ params: atualizarUsuarioParamsSchema, body: atualizarUsuarioBodySchema }),
  atualizarUsuarioController,
);
adminRouter.delete(
  '/admin/usuarios/:id',
  ...requireAdmin,
  validateRequest({ params: removerUsuarioParamsSchema }),
  removerUsuarioController,
);
