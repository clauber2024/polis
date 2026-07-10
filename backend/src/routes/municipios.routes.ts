import { Router } from 'express';
import {
  listarMunicipiosController,
  buscarMunicipioController,
  compararMunicipiosController,
  exportarMunicipiosController,
  exportarComparacaoController,
  mediasMunicipiosController,
} from '../controllers/municipios.controller.js';
import { relatorioTerritorioController } from '../controllers/relatorioTerritorio.controller.js';
import { setoresCensitariosController } from '../controllers/setoresCensitarios.controller.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import {
  listarMunicipiosQuerySchema,
  buscarMunicipioParamsSchema,
  compararMunicipiosQuerySchema,
  exportarMunicipiosQuerySchema,
  exportarComparacaoQuerySchema,
  mediasMunicipiosQuerySchema,
} from '../schemas/municipios.schema.js';

export const municipiosRouter = Router();

/**
 * GET /api/municipios (RF-016, RF-017, RF-026, RF-030 a RF-037, RF-046)
 *
 * Lista municípios com os indicadores consolidados (MMGD total e
 * residencial, irradiação solar, IVS, renda, pobreza, tarifa), com filtro
 * por uf/regiao/nome, ordenação por qualquer indicador e paginação. Ver
 * src/services/municipios.service.ts para os detalhes.
 *
 * Query params (todos opcionais): uf, regiao, nome, potenciaMin, potenciaMax
 * (RF-046, faixa de potência instalada em kW), ordenarPor, ordem, pagina,
 * porPagina — ver schemas/municipios.schema.ts.
 */
municipiosRouter.get(
  '/municipios',
  validateRequest({ query: listarMunicipiosQuerySchema }),
  listarMunicipiosController,
);

/**
 * GET /api/municipios/comparar (RF-049, RF-050)
 *
 * Comparação lado a lado de 2 a 10 municípios (Painel Analítico,
 * Cruzamento de Variáveis). IMPORTANTE: esta rota precisa vir ANTES de
 * '/municipios/:codigoIbge' no registro — como "comparar" tem o mesmo
 * formato de path que um código IBGE (um segmento após /municipios),
 * se a rota de parâmetro fosse registrada primeiro o Express tentaria
 * casar "comparar" como se fosse um codigoIbge.
 *
 * Query params: codigos (obrigatório) — string única separada por vírgula,
 * ex: ?codigos=3550308,3106200 — ver schemas/municipios.schema.ts.
 */
municipiosRouter.get(
  '/municipios/comparar',
  validateRequest({ query: compararMunicipiosQuerySchema }),
  compararMunicipiosController,
);

/**
 * GET /api/municipios/exportar (RF-047)
 *
 * Download de dados públicos em CSV ou GeoJSON (?formato=csv|geojson),
 * mesmos filtros de /api/municipios (uf/regiao/nome/potenciaMin/potenciaMax/
 * ordenarPor/ordem), sem paginação — exporta todos os municípios que
 * casarem o filtro. Registrada
 * ANTES de '/municipios/:codigoIbge' pelo mesmo motivo de '/comparar'
 * (mesmo formato de path que um código IBGE).
 */
municipiosRouter.get(
  '/municipios/exportar',
  validateRequest({ query: exportarMunicipiosQuerySchema }),
  exportarMunicipiosController,
);

/**
 * GET /api/municipios/comparar/exportar (RF-052)
 *
 * Exportação da tabela de comparação do Painel Analítico em CSV ou XLSX
 * (?formato=csv|xlsx). Mesmos parâmetros de '/comparar' (?codigos=...).
 * Path com 3 segmentos — não conflita com nenhuma rota de 2 segmentos
 * registrada acima, mas fica ao lado de '/comparar' por legibilidade.
 */
municipiosRouter.get(
  '/municipios/comparar/exportar',
  validateRequest({ query: exportarComparacaoQuerySchema }),
  exportarComparacaoController,
);

/**
 * GET /api/municipios/medias (Painel Analítico, RF-049/050)
 *
 * Média de referência nacional/regional/estadual (?uf= ou ?regiao=, ambos
 * opcionais e mutuamente priorizados por uf — ver
 * services/municipios.service.ts). Registrada ANTES de
 * '/municipios/:codigoIbge' pelo mesmo motivo de '/comparar' e '/exportar'
 * (mesmo formato de path que um código IBGE).
 */
municipiosRouter.get(
  '/municipios/medias',
  validateRequest({ query: mediasMunicipiosQuerySchema }),
  mediasMunicipiosController,
);

/**
 * GET /api/municipios/:codigoIbge (RF-025)
 *
 * Painel de detalhe de um único município (todos os indicadores
 * consolidados). Responde 404 se o código IBGE não existir.
 */
municipiosRouter.get(
  '/municipios/:codigoIbge',
  validateRequest({ params: buscarMunicipioParamsSchema }),
  buscarMunicipioController,
);

/**
 * GET /api/municipios/:codigoIbge/relatorio (RF-058)
 *
 * Relatório-resumo exportável em PDF do território (município) selecionado
 * — indicadores consolidados + classificação de vazio de acesso. Path com 3
 * segmentos, não conflita com '/municipios/:codigoIbge' (2 segmentos).
 */
municipiosRouter.get(
  '/municipios/:codigoIbge/relatorio',
  validateRequest({ params: buscarMunicipioParamsSchema }),
  relatorioTerritorioController,
);

/**
 * GET /api/municipios/:codigoIbge/setores-censitarios (RF-043, RF-045)
 *
 * Drill-down de granularidade fina — hoje só São Paulo tem dado (seed
 * sintético/ilustrativo, migration 0021). Município existente sem setores
 * retorna array vazio (não é erro).
 */
municipiosRouter.get(
  '/municipios/:codigoIbge/setores-censitarios',
  validateRequest({ params: buscarMunicipioParamsSchema }),
  setoresCensitariosController,
);
