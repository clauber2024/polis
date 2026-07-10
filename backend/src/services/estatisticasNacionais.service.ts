/**
 * SERVICE: agregados nacionais para a Landing Page (RF-005)
 * ============================================================================
 * RF-005 pede 6 números em destaque: (1) sistemas MMGD conectados, (2)
 * potência total instalada, (3) municípios com presença de MMGD, (4) pessoas
 * beneficiadas por créditos de energia, (5) participação da solar distribuída
 * na matriz elétrica nacional, (6) projeção futura de potência instalada.
 *
 * (1), (2) e (3) são calculáveis a partir do schema atual. **CORREÇÃO
 * IMPORTANTE (sessão 10/07/2026)**: (1) foi implementado errado na primeira
 * versão — `numero_ucs_com_mmgd` NUNCA foi contagem de instalações, sempre
 * foi soma de UCs beneficiadas por crédito (ver docstring da coluna,
 * schema/mmgd_indicadores.ts). Agora expostos como dois números distintos:
 * `totalUcsBeneficiadas` (UCs beneficiadas — este é, na prática, o mesmo
 * conceito pedido pelo item 4 do RF-005, só que em UCs, não em pessoas) e
 * `totalInstalacoesMmgd` (contagem real de instalações, coluna
 * `numero_empreendimentos`, migration 0025 — NULL até o extractor rodar de
 * novo). Ver ARQUITETURA.md, seção "RF-005", para o achado completo.
 *
 * (4) "pessoas beneficiadas por créditos de energia" — RESOLVIDO nesta sessão
 * como ESTIMATIVA (decisão do usuário, 10/07/2026): `numero_ucs_residencial`
 * (UCs beneficiadas por crédito, só classe Residencial, já existe desde a
 * migration 0020) × média nacional de moradores por domicílio (IBGE, Censo
 * 2022 = 2,79 — caiu de 3,31 em 2010). Usa RESIDENCIAL, não o total de
 * `totalUcsBeneficiadas` — UC comercial/industrial/rural não é "domicílio",
 * multiplicar o total seria metodologicamente errado. Exposto em
 * `pessoasBeneficiadas`, sempre com o rótulo "estimativa" e a fonte — nunca
 * como contagem exata.
 *
 * (5) e (6) ainda exigem dado que o Atlas não tem:
 * - "participação na matriz elétrica nacional" precisa do total de geração
 *   do Brasil (denominador fora do nosso banco) — permanece como KPI
 *   indisponível aqui (nunca calculado pelo Atlas). DECISÃO DO USUÁRIO
 *   (10/07/2026): em vez de fabricar ou de simplesmente esconder o dado, o
 *   número oficial mais recente (EPE, Balanço Energético Nacional 2026,
 *   ano-base 2025: MMGD = 7,0% da geração elétrica nacional em 2025) é
 *   citado como referência externa na seção "Referências metodológicas" da
 *   landing (`PaginaLanding.tsx`) — mesmo tratamento já dado ao OBEPE:
 *   citação rotulada com fonte/ano, nunca misturada aos KPIs computados pelo
 *   próprio Atlas. Por isso o `motivo` abaixo aponta pra essa seção. Ver
 *   ARQUITETURA.md, seção "RF-005", para o histórico completo (inclusive por
 *   que o valor de 2024/PDE 2035 citado numa sessão anterior, 5,6%, não deve
 *   ser reaproveitado — vem de outro documento/ano-base, não do BEN 2026);
 * - "projeção futura" é modelo de projeção — achado nesta sessão que o
 *   schema JÁ comporta histórico (`mmgd_indicadores` tem chave única em
 *   unidade_espacial_id + periodo_referencia, não só unidade_espacial_id),
 *   mas ainda não se sabe se já existem múltiplos períodos carregados de
 *   fato (ver ARQUITETURA.md para o passo de verificação).
 * Mesmo princípio já seguido no resto do projeto (RF-034/TSEE): nunca
 * fabricar número — expor como indicador indisponível, com o motivo.
 * ============================================================================
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export interface IndicadorIndisponivel {
  id: 'participacaoMatrizNacional' | 'projecaoFuturaPotencia';
  rotulo: string;
  motivo: string;
}

/**
 * Estimativa de pessoas beneficiadas por crédito de energia (RF-005 item 4)
 * — SEMPRE rotular como estimativa na UI, nunca como contagem exata. Ver
 * docstring do módulo para a metodologia completa.
 */
export interface PessoasBeneficiadasEstimativa {
  totalUcsResidenciaisBeneficiadas: number;
  mediaPessoasPorDomicilio: number;
  fonteMediaPessoasPorDomicilio: string;
  pessoasBeneficiadasEstimativa: number;
}

export interface EstatisticasNacionais {
  /**
   * UCs BENEFICIADAS por crédito de energia (SUM de QtdUCRecebeCredito,
   * campo numero_ucs_com_mmgd) — NÃO é contagem de instalações. Renomeado
   * nesta sessão (era `totalSistemasMmgd`, rótulo errado — ver
   * ARQUITETURA.md "RF-005"). Pode ser maior que totalInstalacoesMmgd em
   * modalidade Compartilhada/Auto consumo remoto.
   */
  totalUcsBeneficiadas: number;
  /**
   * Número real de instalações/sistemas MMGD conectados (COUNT de
   * empreendimentos, campo numero_empreendimentos, migration 0025). NULL se
   * o extractor ainda não rodou desde a migration 0025 — nunca 0 fabricado.
   */
  totalInstalacoesMmgd: number | null;
  potenciaTotalInstaladaKw: number;
  totalMunicipiosComMmgd: number;
  /** Período de referência mais recente entre os snapshots de MMGD usados no cálculo. */
  periodoReferencia: string | null;
  pessoasBeneficiadas: PessoasBeneficiadasEstimativa;
  indicadoresIndisponiveis: IndicadorIndisponivel[];
}

interface LinhaAgregada {
  totalUcsBeneficiadas: string | number | null;
  totalInstalacoesMmgd: string | number | null;
  totalUcsResidenciaisBeneficiadas: string | number | null;
  potenciaTotalInstaladaKw: string | number | null;
  totalMunicipiosComMmgd: string | number | null;
  periodoReferencia: string | null;
}

/**
 * IBGE, Censo Demográfico 2022 — média nacional de moradores por domicílio
 * (caiu de 3,31 em 2010 para 2,79 em 2022). Fonte: Agência de Notícias IBGE,
 * "País tem 90 milhões de domicílios, 34% a mais que em 2010"
 * (agenciadenoticias.ibge.gov.br/agencia-noticias/2012-agencia-de-noticias/
 * noticias/37238). É média NACIONAL — não varia por município/UF no Atlas
 * (o IBGE publica por UF, mas o Atlas não guarda essa quebra ainda).
 */
const MEDIA_PESSOAS_POR_DOMICILIO_IBGE_2022 = 2.79;
const FONTE_MEDIA_PESSOAS_POR_DOMICILIO =
  'IBGE, Censo Demográfico 2022 (média nacional de moradores por domicílio, 2,79 — caiu de 3,31 em 2010).';

const INDICADORES_INDISPONIVEIS: IndicadorIndisponivel[] = [
  {
    id: 'participacaoMatrizNacional',
    rotulo: 'Participação da solar distribuída na matriz elétrica nacional',
    motivo:
      'Exige o total de geração elétrica do Brasil como denominador (ex.: EPE/ONS), fonte não integrada ao Atlas. ' +
      'O número mais recente da EPE (MMGD = 7,0% da geração elétrica nacional em 2025, Balanço Energético ' +
      'Nacional 2026) está citado como referência externa na seção "Referências metodológicas" desta página.',
  },
  {
    id: 'projecaoFuturaPotencia',
    rotulo: 'Projeção futura de potência instalada',
    motivo: 'É uma projeção/modelo, não um fato observado nas fontes primárias já carregadas.',
  },
];

/**
 * Reaproveita a mesma CTE `mmgd_latest` (DISTINCT ON por período mais
 * recente) já validada em municipios.service.ts e vaziosDeAcesso.service.ts
 * — aqui só agrega em vez de listar por município.
 */
export async function calcularEstatisticasNacionais(): Promise<EstatisticasNacionais> {
  const resultado = await db.execute(sql`
    WITH mmgd_latest AS (
        SELECT DISTINCT ON (unidade_espacial_id)
            unidade_espacial_id,
            potencia_instalada_kw,
            numero_ucs_com_mmgd,
            numero_empreendimentos,
            numero_ucs_residencial,
            periodo_referencia
        FROM mmgd_indicadores
        ORDER BY unidade_espacial_id, periodo_referencia DESC
    )
    SELECT
        COALESCE(SUM(mmgd.numero_ucs_com_mmgd), 0)      AS "totalUcsBeneficiadas",
        SUM(mmgd.numero_empreendimentos)                AS "totalInstalacoesMmgd",
        COALESCE(SUM(mmgd.numero_ucs_residencial), 0)   AS "totalUcsResidenciaisBeneficiadas",
        COALESCE(SUM(mmgd.potencia_instalada_kw), 0)    AS "potenciaTotalInstaladaKw",
        COUNT(*) FILTER (WHERE mmgd.potencia_instalada_kw > 0) AS "totalMunicipiosComMmgd",
        MAX(mmgd.periodo_referencia)                    AS "periodoReferencia"
    FROM municipios m
    JOIN unidades_espaciais ue
        ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
    LEFT JOIN mmgd_latest mmgd ON mmgd.unidade_espacial_id = ue.id;
  `);

  const linha = resultado.rows[0] as unknown as LinhaAgregada;

  const totalUcsResidenciaisBeneficiadas = Number(linha.totalUcsResidenciaisBeneficiadas ?? 0);

  return {
    totalUcsBeneficiadas: Number(linha.totalUcsBeneficiadas ?? 0),
    totalInstalacoesMmgd:
      linha.totalInstalacoesMmgd === null || linha.totalInstalacoesMmgd === undefined
        ? null
        : Number(linha.totalInstalacoesMmgd),
    potenciaTotalInstaladaKw: Number(linha.potenciaTotalInstaladaKw ?? 0),
    totalMunicipiosComMmgd: Number(linha.totalMunicipiosComMmgd ?? 0),
    periodoReferencia: linha.periodoReferencia ?? null,
    pessoasBeneficiadas: {
      totalUcsResidenciaisBeneficiadas,
      mediaPessoasPorDomicilio: MEDIA_PESSOAS_POR_DOMICILIO_IBGE_2022,
      fonteMediaPessoasPorDomicilio: FONTE_MEDIA_PESSOAS_POR_DOMICILIO,
      pessoasBeneficiadasEstimativa: Math.round(
        totalUcsResidenciaisBeneficiadas * MEDIA_PESSOAS_POR_DOMICILIO_IBGE_2022,
      ),
    },
    indicadoresIndisponiveis: INDICADORES_INDISPONIVEIS,
  };
}
