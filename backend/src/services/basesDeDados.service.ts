/**
 * SERVICE: Status das bases de dados primárias (RF-063)
 * ============================================================================
 * RF-063: "dashboard de status de cada base de dados primária (ANEEL, IBGE,
 * CadÚnico, TSEE, IVS/IPEA, INPE), com indicador de progresso" — Painel da
 * Equipe do Projeto (papel Colaborador, ver DRF Seção 2 — revisado 08/07/2026,
 * antigo P5). Este service calcula cobertura (% de municípios
 * com o dado presente) e a data do snapshot mais recente diretamente do
 * banco, sem depender de nenhuma tabela de controle manual — não existe
 * ainda workflow de revisão/aprovação (RF-059, RF-070 — Parceiro Técnico e
 * Admin) porque isso exigiria autenticação/RBAC, que continua PLANEJADO (ver
 * CLAUDE.md, "Estado Real do Projeto"). O status aqui é 100% derivado dos
 * dados já carregados: 'completo' (cobertura >= 95%), 'parcial' (0% < x <
 * 95%) ou 'bloqueado' (0%, com observação do motivo).
 *
 * Nomenclatura das 6 fontes segue literalmente o texto do RF-063 (ANEEL,
 * IBGE, CadÚnico, TSEE, IVS/IPEA, INPE) — cada uma representada por um
 * indicador "âncora" carregado a partir dela:
 *   - ANEEL      -> mmgd_indicadores.potencia_instalada_kw (MMGD)
 *   - IBGE       -> indicadores_sociais.percentual_agua_inadequada (Censo,
 *                   bloco Infraestrutura Urbana)
 *   - CadÚnico   -> indicadores_sociais.percentual_pobreza_cadunico
 *   - TSEE       -> bloqueado (percentual_tsee nem existe no schema ainda —
 *                   ver CLAUDE.md, aguardando dado ANEEL pós-jan/2026)
 *   - IVS/IPEA   -> indicadores_sociais.ivs (índice próprio, não o IVS oficial)
 *   - INPE       -> irradiacao_solar.irradiacao_media_kwh_m2_dia
 * ============================================================================
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export type StatusFonte = 'completo' | 'parcial' | 'bloqueado';

export interface StatusFonteDados {
  id: string;
  nome: string;
  municipiosCobertos: number;
  percentualCobertura: number;
  periodoReferenciaMaisRecente: string | null;
  status: StatusFonte;
  observacao: string | null;
}

export interface StatusBasesDeDadosResultado {
  atualizadoEm: string;
  totalMunicipios: number;
  fontes: StatusFonteDados[];
}

function calcularStatus(percentualCobertura: number): StatusFonte {
  if (percentualCobertura === 0) return 'bloqueado';
  if (percentualCobertura >= 95) return 'completo';
  return 'parcial';
}

/**
 * Cobertura de uma coluna de indicadores_sociais — conta município DISTINTO
 * (não linha) com a coluna preenchida em QUALQUER período, porque a tabela é
 * fragmentada por periodo_referencia (achado arquitetural da migration 0014:
 * um mesmo município pode ter até 4 linhas, cada uma parcialmente
 * preenchida). Sem o DISTINCT por unidade_espacial_id, um município com 2
 * linhas preenchidas seria contado 2x.
 */
async function cobrirColunaIndicadoresSociais(
  coluna: string,
): Promise<{ cobertos: number; periodo: string | null }> {
  const resultado = await db.execute(sql`
    SELECT
      COUNT(DISTINCT ue.id) FILTER (WHERE i.${sql.raw(coluna)} IS NOT NULL) AS cobertos,
      MAX(i.periodo_referencia) FILTER (WHERE i.${sql.raw(coluna)} IS NOT NULL) AS periodo
    FROM municipios m
    JOIN unidades_espaciais ue
      ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
    LEFT JOIN indicadores_sociais i ON i.unidade_espacial_id = ue.id;
  `);
  const linha = resultado.rows[0] as { cobertos: string | number; periodo: string | null };
  return { cobertos: Number(linha.cobertos), periodo: linha.periodo };
}

async function cobrirMmgd(): Promise<{ cobertos: number; periodo: string | null }> {
  const resultado = await db.execute(sql`
    WITH mmgd_latest AS (
        SELECT DISTINCT ON (unidade_espacial_id)
            unidade_espacial_id, potencia_instalada_kw, periodo_referencia
        FROM mmgd_indicadores
        ORDER BY unidade_espacial_id, periodo_referencia DESC
    )
    SELECT
      COUNT(*) FILTER (WHERE mmgd.potencia_instalada_kw IS NOT NULL) AS cobertos,
      MAX(mmgd.periodo_referencia) AS periodo
    FROM municipios m
    JOIN unidades_espaciais ue
      ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
    LEFT JOIN mmgd_latest mmgd ON mmgd.unidade_espacial_id = ue.id;
  `);
  const linha = resultado.rows[0] as { cobertos: string | number; periodo: string | null };
  return { cobertos: Number(linha.cobertos), periodo: linha.periodo };
}

async function cobrirIrradiacaoSolar(): Promise<{ cobertos: number; periodo: string | null }> {
  const resultado = await db.execute(sql`
    SELECT
      COUNT(DISTINCT irr.codigo_ibge) AS cobertos,
      MAX(irr.periodo_referencia) AS periodo
    FROM irradiacao_solar irr;
  `);
  const linha = resultado.rows[0] as { cobertos: string | number; periodo: string | null };
  return { cobertos: Number(linha.cobertos), periodo: linha.periodo };
}

export async function buscarStatusBasesDeDados(): Promise<StatusBasesDeDadosResultado> {
  const totalResultado = await db.execute(sql`SELECT COUNT(*) AS total FROM municipios;`);
  const totalMunicipios = Number((totalResultado.rows[0] as { total: string | number }).total);

  const [mmgd, ibge, cadunico, ivs, irradiacao] = await Promise.all([
    cobrirMmgd(),
    cobrirColunaIndicadoresSociais('percentual_agua_inadequada'),
    cobrirColunaIndicadoresSociais('percentual_pobreza_cadunico'),
    cobrirColunaIndicadoresSociais('ivs'),
    cobrirIrradiacaoSolar(),
  ]);

  function montarFonte(
    id: string,
    nome: string,
    dado: { cobertos: number; periodo: string | null },
    observacao: string | null = null,
  ): StatusFonteDados {
    const percentualCobertura =
      totalMunicipios > 0 ? Number(((dado.cobertos / totalMunicipios) * 100).toFixed(1)) : 0;
    return {
      id,
      nome,
      municipiosCobertos: dado.cobertos,
      percentualCobertura,
      periodoReferenciaMaisRecente: dado.periodo,
      status: calcularStatus(percentualCobertura),
      observacao,
    };
  }

  const fontes: StatusFonteDados[] = [
    montarFonte('aneel', 'ANEEL — Micro e Minigeração Distribuída (MMGD)', mmgd),
    montarFonte(
      'ibge',
      'IBGE — Censo 2022 (Infraestrutura Urbana, via SIDRA)',
      ibge,
      'Cobertura calculada pelo indicador "% água inadequada", representativo do bloco Infraestrutura Urbana carregado do Censo.',
    ),
    montarFonte('cadunico', 'CadÚnico (MDS/SAGI)', cadunico),
    montarFonte(
      'tsee',
      'TSEE — Tarifa Social de Energia Elétrica (ANEEL/CDE)',
      { cobertos: 0, periodo: null },
      'Bloqueado: a coluna percentual_tsee ainda não existe no schema. Aguardando dado ANEEL de Beneficiários da CDE pós-janeiro/2026 com a nova subclasse "Residencial Desconto Social" (Lei 15.235/2025) — ver CLAUDE.md.',
    ),
    montarFonte(
      'ivs_ipea',
      'IVS Consolidado (índice próprio, inspirado no IVS/IPEA)',
      ivs,
      'Construção própria do Atlas (média de 3 blocos normalizados), não o IVS oficial do IPEA — ver ARQUITETURA.md, "Índices compostos e metodologia de cruzamentos".',
    ),
    montarFonte('inpe', 'INPE — Irradiação Solar (Atlas Brasileiro de Energia Solar)', irradiacao),
  ];

  return {
    // CLAUDE.md: exibir data/hora em America/Sao_Paulo, nunca UTC bruto.
    atualizadoEm: new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'medium',
    }),
    totalMunicipios,
    fontes,
  };
}
