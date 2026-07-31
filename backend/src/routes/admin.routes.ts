import { Router } from 'express';
import multer from 'multer';
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
  dispararAtualizacaoBaseParamsSchema,
  dispararComUploadParamsSchema,
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
  listarStatusExtratoresController,
  dispararAtualizacaoBaseController,
  listarStatusExtratoresComUploadController,
  dispararComUploadController,
} from '../controllers/admin.controller.js';

/**
 * Memória, não disco — o service (`uploadBases.service.ts`) grava os bytes
 * na pasta temporária com o nome exato que o extractor espera, não com o
 * nome original do upload. Limite generoso (50 MB/arquivo, até 3 arquivos —
 * cobre o caso de 3 GeoJSON do ZEIS São Paulo) mas não ilimitado, pra não
 * deixar a memória do container aberta a um upload absurdo.
 */
const uploadMemoria = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 3 },
});

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

// RF-070 revisitado (30/07/2026) — disparo de ETL pela interface, só bases
// da whitelist (ver utils/extractoresElegiveis.ts). Tudo Admin.
adminRouter.get('/admin/bases-de-dados/status-execucao', ...requireAdmin, listarStatusExtratoresController);
adminRouter.post(
  '/admin/bases-de-dados/:baseId/atualizar',
  ...requireAdmin,
  validateRequest({ params: dispararAtualizacaoBaseParamsSchema }),
  dispararAtualizacaoBaseController,
);

// RF-070 revisitado, fase 2 (31/07/2026) — fontes sem URL pública, exigem
// upload de arquivo (ver utils/extractoresComUpload.ts). Tudo Admin.
adminRouter.get(
  '/admin/bases-de-dados-upload/status-execucao',
  ...requireAdmin,
  listarStatusExtratoresComUploadController,
);
adminRouter.post(
  '/admin/bases-de-dados-upload/:baseId/atualizar',
  ...requireAdmin,
  validateRequest({ params: dispararComUploadParamsSchema }),
  uploadMemoria.array('arquivos', 3),
  dispararComUploadController,
);
