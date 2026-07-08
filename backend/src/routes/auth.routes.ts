import { Router } from 'express';
import { validateRequest } from '../middlewares/validateRequest.js';
import { loginSchema } from '../schemas/auth.schema.js';
import { loginController, logoutController } from '../controllers/auth.controller.js';

export const authRouter = Router();

/**
 * POST /api/auth/login (RF-009, RF-013)
 *
 * Autentica papel Colaborador ou Administrador (papel Público não loga —
 * ver DRF.md Seção 2/4). Body: { email, senha }. Retorna { token, usuario }.
 */
authRouter.post('/auth/login', validateRequest({ body: loginSchema }), loginController);

/**
 * POST /api/auth/logout (RF-014)
 *
 * No-op no servidor (JWT stateless) — ver docstring de logoutController.
 */
authRouter.post('/auth/logout', logoutController);
