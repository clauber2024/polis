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
 * (5) "participação na matriz elétrica nacional" — RESOLVIDO em 21/07/2026:
 * migration 0030 (`indicadores_energia_nacional`) + dois extractors manuais
 * (`extrair_geracao_eletrica_nacional_epe.py`, denominador via BEN Anexo X;
 * `extrair_geracao_mmgd_epe_pdgd.py`, numerador via PDGD "Estimativa da
 * Geração no Ano"). Ver docs/DECISOES.md, ADR "Integração da participação
 * da MMGD na matriz elétrica nacional (EPE/PDGD)". Nenhuma das duas fontes
 * tem API — snapshot repetível sob demanda, não automático (mesmo padrão de
 * irradiação solar/INPE e Reforma Casa Brasil Solar). Validação: o
 * percentual calculado para 2025 (~7,02%) bate com o número da EPE já
 * citado nas Referências Metodológicas da landing (7,0%). Exposto agora em
 * `participacaoMatrizNacional` (não mais em indicadoresIndisponiveis) — pode
 * vir `null` se os extractors nunca rodaram no ambiente, mas não é o caso
 * aqui.
 *
 * (6) ainda exige dado que o Atlas não tem: "projeção futura" é modelo de
 * projeção — achado em sessão anterior que o schema JÁ comporta histórico
 * (`mmgd_indicadores` tem chave única em unidade_espacial_id +
 * periodo_referencia, não só unidade_espacial_id), mas ainda não se sabe se
 * já existem múltiplos períodos carregados de fato (ver ARQUITETURA.md para
 * o passo de verificação). Mesmo princípio já seguido no resto do projeto
 * (RF-034/TSEE): nunca fabricar número — expor como indicador indisponível,
 * com o motivo.
 * ============================================================================
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export interface IndicadorIndisponivel {
  id: 'projecaoFuturaPotencia';
  rotulo: string;
  motivo: string;
}

/**
 * Participação da MMGD na geração elétrica nacional (RF-005 item 5) —
 * calculada como geracaoMmgdGwh / geracaoEletricaNacionalGwh, mesmo ano.
 * `null` se nenhum dos dois extractors de indicadores_energia_nacional
 * rodou ainda neste ambiente — nunca fabricar um percentual sem os dois
 * lados carregados. Ver docstring do módulo para a metodologia e fontes.
 */
export interface ParticipacaoMatrizNacional {
  periodoReferencia: string;
  geracaoMmgdGwh: number;
  geracaoEletricaNacionalGwh: number;
  participacaoPercentual: number;
  fonteGeracaoNacional: string | null;
  fonteMmgd: string | null;
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
  participacaoMatrizNacional: ParticipacaoMatrizNacional | null;
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
    id: 'projecaoFuturaPotencia',
    rotulo: 'Projeção futura de potência instalada',
    motivo: 'É uma projeção/modelo, não um fato observado nas fontes primárias já carregadas.',
  },
];

interface LinhaParticipacaoMatriz {
  periodoReferencia: string;
  geracaoMmgdGwh: string | number;
  geracaoEletricaNacionalGwh: string | number;
  fonteGeracaoNacional: string | null;
  fonteMmgd: string | null;
}

/**
 * Ano mais recente com AMBOS os lados carregados (geração MMGD e geração
 * nacional) — nunca calcula participação com um dos dois em falta.
 */
async function buscarParticipacaoMatrizNacional(): Promise<ParticipacaoMatrizNacional | null> {
  const resultado = await db.execute(sql`
    SELECT
        periodo_referencia          AS "periodoReferencia",
        geracao_mmgd_gwh            AS "geracaoMmgdGwh",
        geracao_eletrica_nacional_gwh AS "geracaoEletricaNacionalGwh",
        fonte_geracao_nacional      AS "fonteGeracaoNacional",
        fonte_mmgd                  AS "fonteMmgd"
    FROM indicadores_energia_nacional
    WHERE geracao_mmgd_gwh IS NOT NULL AND geracao_eletrica_nacional_gwh IS NOT NULL
    ORDER BY periodo_referencia DESC
    LIMIT 1;
  `);

  const linha = resultado.rows[0] as unknown as LinhaParticipacaoMatriz | undefined;
  if (!linha) return null;

  const geracaoMmgdGwh = Number(linha.geracaoMmgdGwh);
  const geracaoEletricaNacionalGwh = Number(linha.geracaoEletricaNacionalGwh);

  return {
    periodoReferencia: linha.periodoReferencia,
    geracaoMmgdGwh,
    geracaoEletricaNacionalGwh,
    participacaoPercentual: (geracaoMmgdGwh / geracaoEletricaNacionalGwh) * 100,
    fonteGeracaoNacional: linha.fonteGeracaoNacional,
    fonteMmgd: linha.fonteMmgd,
  };
}

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
  const participacaoMatrizNacional = await buscarParticipacaoMatrizNacional();

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
    participacaoMatrizNacional,
    indicadoresIndisponiveis: INDICADORES_INDISPONIVEIS,
  };
}
