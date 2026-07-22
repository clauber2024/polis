/**
 * SERVICE: Identificação e ranking de "Vazios de Acesso" (RF-055, RF-056, RF-057)
 * ============================================================================
 * Reimplementação, no backend Node/Express, da metodologia validada em
 * `backend/src/etl/analises/identificar_vazios_de_acesso.py` (script Python,
 * PROTÓTIPO DE VALIDAÇÃO — ver docstring daquele arquivo e ARQUITETURA.md,
 * seção "Identificação e ranking de Vazios de Acesso", item 3 da fila de
 * trabalho). Este service é a implementação FINAL, conforme já decidido:
 * "a lógica de quadrante é calculada no BACKEND considerando a direção,
 * mantendo os números exibidos idênticos aos armazenados".
 *
 * METODOLOGIA (não inventa critério novo — reaproveita decisões já fechadas
 * em ARQUITETURA.md, seção "Índices compostos e metodologia de cruzamentos"):
 *   - Eixo X: potencial solar = irradiação média (GHI, INPE/LABREN).
 *   - Eixo Y: MMGD RESIDENCIAL per capita (não total — mistura agronegócio/
 *     irrigação, ver ARQUITETURA.md). Persistida desde a migration 0020;
 *     municípios cujo snapshot de `mmgd_indicadores` é anterior a essa
 *     migration ainda não têm esse valor (ver `precisaReextrairMmgd` no
 *     retorno) e são EXCLUÍDOS da classificação até o extractor rodar de novo.
 *   - Limiar dos quadrantes: MEDIANA NACIONAL de cada eixo (não média —
 *     distribuições assimétricas, decisão já validada).
 *   - "Vazio de Acesso" = alto potencial (>= mediana) E baixo MMGD residencial
 *     per capita (< mediana).
 *   - Priorização padrão (RF-056): IVS Consolidado (indicador NEGATIVO —
 *     maior = mais vulnerável), mas a API aceita reordenar por outros
 *     critérios (ver schemas/vaziosDeAcesso.schema.ts) — incluindo `ivsh`
 *     (migration 0028, ver vw_ivsh_consolidado): IVS + precariedade
 *     habitacional + insegurança da posse, para quem quer priorizar
 *     considerando moradia (o IVS puro exclui moradia de propósito, ver
 *     migration 0015 — `ivsh` é a alternativa para quem precisa da leitura
 *     combinada, sem alterar o IVS original).
 *
 * RESSALVA METODOLÓGICA (RF-055/RF-056; ver `notaMetodologica` no retorno de
 * `listarVaziosDeAcesso` — precisa aparecer na resposta da API, não só aqui):
 * este é um corte bivariado simples, sem controlar renda. Parte da
 * concentração de Vazios de Acesso no Nordeste (já observada com os dados
 * reais, ver ARQUITETURA.md) reflete o gargalo de renda documentado
 * alhures, não só potencial solar desperdiçado. Mesmo cuidado já previsto
 * para o Índice de Pobreza Energética Regional (RF-080).
 * ============================================================================
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { CLASSIFICACAO_IVSH_VALIDAS } from '../schemas/vaziosDeAcesso.schema.js';
import type { ListarVaziosDeAcessoQuery } from '../schemas/vaziosDeAcesso.schema.js';

export type ClassificacaoIvsh = (typeof CLASSIFICACAO_IVSH_VALIDAS)[number];

export const ROTULOS_QUADRANTE = {
  vazio_de_acesso: 'Vazio de Acesso (alto potencial, baixo MMGD residencial)',
  acesso_pleno: 'Acesso pleno (alto potencial, alto MMGD residencial)',
  adocao_acima_do_potencial: 'Adoção acima do potencial (baixo potencial, alto MMGD residencial)',
  baixo_potencial_baixa_adocao: 'Baixo potencial, baixa adoção (esperado)',
} as const;

export type Quadrante = keyof typeof ROTULOS_QUADRANTE;

interface LinhaPainelBruta {
  codigoIbge: string;
  nome: string;
  uf: string;
  regiao: string;
  areaKm2: number | null;
  densidadePopulacional: number | null;
  mmgdRegistroExiste: string | null; // não-nulo quando existe linha em mmgd_indicadores (mesmo que residencial ainda não tenha sido re-extraído)
  potenciaResidencialKw: number | null;
  irradiacaoMediaKwhM2Dia: number | null;
  ivs: number | null;
  ivsh: number | null;
  rendaMediaDomiciliar: number | null;
  percentualPobrezaCadunico: number | null;
  indicePrecariedadeMoradia: number | null;
  percentualApartamento: number | null;
}

export interface MunicipioClassificado {
  codigoIbge: string;
  nome: string;
  uf: string;
  regiao: string;
  irradiacaoMediaKwhM2Dia: number | null;
  mmgdResidencialPer1000Hab: number | null;
  quadrante: Quadrante | null;
  quadranteRotulo: string | null;
  ivs: number | null;
  ivsh: number | null;
  rendaMediaDomiciliar: number | null;
  percentualPobrezaCadunico: number | null;
  /**
   * Mesma condição de CartaoDescompassoMorfologico.tsx (frontend), agora
   * calculada uma vez aqui para poder virar camada nacional do mapa: alta
   * irradiação (>= mediana nacional) desperdiçada por alta precariedade
   * habitacional (indicePrecariedadeMoradia > P90 nacional) OU alta
   * verticalização (percentualApartamento > 50%). Nunca true se algum dos
   * indicadores envolvidos estiver ausente.
   */
  descompassoMorfologico: boolean;
  /**
   * Quintil de IVSH dentro do quadrante vazio_de_acesso (não nacional) — só
   * preenchido por `listarVaziosDeAcesso` (é ranking-específico); `null` nos
   * demais usos de MunicipioClassificado (Painel Analítico, RF-058).
   */
  classificacaoIvsh: ClassificacaoIvsh | null;
}

/**
 * Busca o painel município x MMGD residencial x irradiação x indicadores
 * sociais consolidados — mesma estrutura de JOIN (CTEs `mmgd_latest` /
 * `irr_latest`, filtro `ue.tipo = 'municipio'`) já usada e documentada em
 * `analisar_correlacao_mmgd_renda.py` (`carregar_dados`), reaproveitada aqui
 * via Drizzle (`db.execute(sql\`...\`)`) em vez de reimplementada do zero,
 * para não divergir da lógica já validada com dado real.
 *
 * Por quê `ue.tipo = 'municipio'`: sem esse filtro o JOIN faria fan-out
 * (Favelas/Comunidades Urbanas e ZEIS/AEIS também apontam para o mesmo
 * município pai), inflando o n artificialmente.
 *
 * Por quê `DISTINCT ON`: ambas as fontes (MMGD, irradiação) são snapshot
 * único por município na prática, mas o schema permite mais de um
 * `periodo_referencia` — `DISTINCT ON ... ORDER BY periodo_referencia DESC`
 * garante 1 linha por município mesmo que isso mude no futuro.
 */
async function buscarPainelBruto(): Promise<LinhaPainelBruta[]> {
  const resultado = await db.execute(sql`
    WITH mmgd_latest AS (
        SELECT DISTINCT ON (unidade_espacial_id)
            unidade_espacial_id,
            potencia_residencial_kw,
            periodo_referencia
        FROM mmgd_indicadores
        ORDER BY unidade_espacial_id, periodo_referencia DESC
    ),
    irr_latest AS (
        SELECT DISTINCT ON (codigo_ibge)
            codigo_ibge,
            irradiacao_media_kwh_m2_dia,
            periodo_referencia
        FROM irradiacao_solar
        ORDER BY codigo_ibge, periodo_referencia DESC
    )
    SELECT
        m.codigo_ibge                     AS "codigoIbge",
        m.nome                            AS "nome",
        m.uf                              AS "uf",
        m.regiao                          AS "regiao",
        m.area_km2                        AS "areaKm2",
        vsc.densidade_populacional        AS "densidadePopulacional",
        mmgd.unidade_espacial_id          AS "mmgdRegistroExiste",
        mmgd.potencia_residencial_kw      AS "potenciaResidencialKw",
        irr.irradiacao_media_kwh_m2_dia   AS "irradiacaoMediaKwhM2Dia",
        vsc.ivs                           AS "ivs",
        ivsh.ivsh                         AS "ivsh",
        vsc.renda_media_domiciliar        AS "rendaMediaDomiciliar",
        vsc.percentual_pobreza_cadunico   AS "percentualPobrezaCadunico",
        moradia.indice_precariedade_moradia AS "indicePrecariedadeMoradia",
        vsc.percentual_apartamento        AS "percentualApartamento"
    FROM municipios m
    JOIN unidades_espaciais ue
        ON ue.municipio_pai_codigo_ibge = m.codigo_ibge AND ue.tipo = 'municipio'
    LEFT JOIN mmgd_latest mmgd ON mmgd.unidade_espacial_id = ue.id
    LEFT JOIN vw_indicadores_sociais_consolidado vsc ON vsc.unidade_espacial_id = ue.id
    LEFT JOIN irr_latest irr ON irr.codigo_ibge = m.codigo_ibge
    LEFT JOIN vw_ivsh_consolidado ivsh ON ivsh.codigo_ibge = m.codigo_ibge
    LEFT JOIN vw_indices_compostos_moradia_infraestrutura moradia ON moradia.codigo_ibge = m.codigo_ibge
    ORDER BY m.codigo_ibge;
  `);

  return resultado.rows as unknown as LinhaPainelBruta[];
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

/**
 * Percentil por rank mais próximo (mesmo método já usado no scatter de
 * quadrantes do frontend, GraficoQuadrantes.tsx) — usado para o limiar de
 * "alta precariedade habitacional" do CartaoDescompassoMorfologico. Corte
 * fixo (0,5) testado antes era inatingível na prática: `indice_precariedade_
 * moradia` é a média de 3 sub-índices cada um normalizado min-max
 * independentemente (migration 0014), então o composto nacional real nunca
 * chega perto de 1 — máximo observado em 20/07/2026 era 0,358 (Fernando de
 * Noronha), mediana 0,0066. O corte precisa vir da distribuição real, não de
 * um valor assumido.
 */
function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const indice = Math.min(
    ordenados.length - 1,
    Math.max(0, Math.ceil(p * ordenados.length) - 1),
  );
  return ordenados[indice];
}

function classificarQuadrante(
  irradiacao: number | null,
  mmgdPerCapita: number | null,
  medianaIrradiacao: number,
  medianaMmgd: number,
): Quadrante | null {
  if (irradiacao === null || mmgdPerCapita === null) return null;

  const altoPotencial = irradiacao >= medianaIrradiacao;
  const altoMmgd = mmgdPerCapita >= medianaMmgd;

  if (altoPotencial && !altoMmgd) return 'vazio_de_acesso';
  if (altoPotencial && altoMmgd) return 'acesso_pleno';
  if (!altoPotencial && altoMmgd) return 'adocao_acima_do_potencial';
  return 'baixo_potencial_baixa_adocao';
}

/**
 * Mesma lógica de CartaoDescompassoMorfologico.tsx (frontend, 18-20/07/2026),
 * agora calculada no backend para virar camada nacional do mapa em vez de só
 * um alerta por município selecionado. Nenhum limiar fabricado: mediana de
 * irradiação e P90 de precariedade vêm da distribuição real (mesmos usados
 * no quadrante), e 50% de verticalização é leitura direta (maioria dos
 * domicílios sem telhado individual) — ver docstring do componente frontend
 * para o histórico completo (inclusive a correção do corte fixo 0,5 que
 * nunca disparava).
 */
function calcularDescompassoMorfologico(
  linha: LinhaPainelBruta,
  medianaIrradiacao: number,
  precariedadeHabitacionalAltaP90: number,
): boolean {
  if (linha.irradiacaoMediaKwhM2Dia === null) return false;
  if (linha.indicePrecariedadeMoradia === null && linha.percentualApartamento === null) return false;

  const irradiacaoAlta = linha.irradiacaoMediaKwhM2Dia >= medianaIrradiacao;
  const precariedadeAlta =
    linha.indicePrecariedadeMoradia !== null &&
    linha.indicePrecariedadeMoradia > precariedadeHabitacionalAltaP90;
  const verticalizacaoAlta = linha.percentualApartamento !== null && linha.percentualApartamento > 50;

  return irradiacaoAlta && (precariedadeAlta || verticalizacaoAlta);
}

/**
 * Quintil de IVSH dentro de uma população específica (ex.: só o quadrante
 * vazio_de_acesso, não os ~5.570 municípios do país) — "muito_alto" = 20%
 * mais vulneráveis (IVSH é indicador negativo). Município sem IVSH fica de
 * fora do Map (classificacaoIvsh permanece null no resultado final).
 */
function calcularClassificacaoIvsh(populacao: MunicipioClassificado[]): Map<string, ClassificacaoIvsh> {
  const valores = populacao
    .map((m) => m.ivsh)
    .filter((valor): valor is number => valor !== null);

  const mapa = new Map<string, ClassificacaoIvsh>();
  if (valores.length === 0) return mapa;

  const p20 = percentil(valores, 0.2) as number;
  const p40 = percentil(valores, 0.4) as number;
  const p60 = percentil(valores, 0.6) as number;
  const p80 = percentil(valores, 0.8) as number;

  for (const municipio of populacao) {
    if (municipio.ivsh === null) continue;
    let classificacao: ClassificacaoIvsh;
    if (municipio.ivsh <= p20) classificacao = 'muito_baixo';
    else if (municipio.ivsh <= p40) classificacao = 'baixo';
    else if (municipio.ivsh <= p60) classificacao = 'medio';
    else if (municipio.ivsh <= p80) classificacao = 'alto';
    else classificacao = 'muito_alto';
    mapa.set(municipio.codigoIbge, classificacao);
  }
  return mapa;
}

interface PainelClassificado {
  municipios: MunicipioClassificado[];
  medianaIrradiacao: number;
  medianaMmgdResidencialPerCapita: number;
  /** Percentil 90 nacional de indice_precariedade_moradia — ver `percentil()`. */
  precariedadeHabitacionalAltaP90: number;
  totalMunicipios: number;
  totalClassificados: number;
  totalExcluidosSemDado: number;
  totalPrecisaReextrairMmgd: number;
}

/**
 * Calcula população estimada (densidade x área — mesmo método já usado em
 * `calcular_indicadores_per_capita` e na migration 0014, já que o Atlas não
 * guarda população absoluta diretamente), MMGD residencial per capita,
 * medianas nacionais e classificação de quadrante para todos os municípios.
 */
function classificarPainel(linhas: LinhaPainelBruta[]): PainelClassificado {
  let totalPrecisaReextrairMmgd = 0;

  const comMmgdPerCapita = linhas.map((linha) => {
    const populacaoEstimada =
      linha.densidadePopulacional !== null && linha.areaKm2 !== null
        ? linha.densidadePopulacional * linha.areaKm2
        : null;

    // Distingue "nenhum registro de MMGD para este município" (trata como 0
    // — ausência de instalação é dado válido, mesmo raciocínio já
    // documentado em calcular_indicadores_per_capita) de "registro existe,
    // mas ainda não tem a quebra residencial" (migration 0020 aplicada, mas
    // extrair_mmgd_aneel.py ainda não rodou de novo — dado genuinamente
    // desconhecido, não pode virar 0 silenciosamente).
    let potenciaResidencialKw: number | null;
    if (linha.mmgdRegistroExiste === null) {
      potenciaResidencialKw = 0;
    } else if (linha.potenciaResidencialKw === null) {
      potenciaResidencialKw = null;
      totalPrecisaReextrairMmgd += 1;
    } else {
      potenciaResidencialKw = linha.potenciaResidencialKw;
    }

    const mmgdResidencialPer1000Hab =
      populacaoEstimada !== null && populacaoEstimada > 0 && potenciaResidencialKw !== null
        ? (potenciaResidencialKw / populacaoEstimada) * 1000
        : null;

    return { linha, mmgdResidencialPer1000Hab };
  });

  const subsetValido = comMmgdPerCapita.filter(
    ({ linha, mmgdResidencialPer1000Hab }) =>
      linha.irradiacaoMediaKwhM2Dia !== null && mmgdResidencialPer1000Hab !== null,
  );

  const medianaIrradiacao = mediana(
    subsetValido.map(({ linha }) => linha.irradiacaoMediaKwhM2Dia as number),
  );
  const medianaMmgdResidencialPerCapita = mediana(
    subsetValido.map(({ mmgdResidencialPer1000Hab }) => mmgdResidencialPer1000Hab as number),
  );

  // Distribuição nacional de precariedade habitacional — independente dos
  // dois eixos acima (irradiação/MMGD), por isso calculada sobre TODAS as
  // linhas com o indicador presente, não só `subsetValido`.
  const precariedadeHabitacionalAltaP90 =
    percentil(
      linhas
        .map((linha) => linha.indicePrecariedadeMoradia)
        .filter((valor): valor is number => valor !== null),
      0.9,
    ) ?? 0;

  // Só ocorre se não houver NENHUM município com os dois eixos válidos
  // (ex: banco recém-criado, sem irradiação ou MMGD carregados ainda).
  if (medianaIrradiacao === null || medianaMmgdResidencialPerCapita === null) {
    return {
      municipios: [],
      medianaIrradiacao: 0,
      medianaMmgdResidencialPerCapita: 0,
      precariedadeHabitacionalAltaP90,
      totalMunicipios: linhas.length,
      totalClassificados: 0,
      totalExcluidosSemDado: linhas.length,
      totalPrecisaReextrairMmgd,
    };
  }

  const municipios: MunicipioClassificado[] = comMmgdPerCapita.map(({ linha, mmgdResidencialPer1000Hab }) => {
    const quadrante = classificarQuadrante(
      linha.irradiacaoMediaKwhM2Dia,
      mmgdResidencialPer1000Hab,
      medianaIrradiacao,
      medianaMmgdResidencialPerCapita,
    );

    return {
      codigoIbge: linha.codigoIbge,
      nome: linha.nome,
      uf: linha.uf,
      regiao: linha.regiao,
      irradiacaoMediaKwhM2Dia: linha.irradiacaoMediaKwhM2Dia,
      mmgdResidencialPer1000Hab,
      quadrante,
      quadranteRotulo: quadrante ? ROTULOS_QUADRANTE[quadrante] : null,
      ivs: linha.ivs,
      ivsh: linha.ivsh,
      rendaMediaDomiciliar: linha.rendaMediaDomiciliar,
      percentualPobrezaCadunico: linha.percentualPobrezaCadunico,
      descompassoMorfologico: calcularDescompassoMorfologico(
        linha,
        medianaIrradiacao,
        precariedadeHabitacionalAltaP90,
      ),
      classificacaoIvsh: null,
    };
  });

  const totalClassificados = municipios.filter((m) => m.quadrante !== null).length;

  return {
    municipios,
    medianaIrradiacao,
    medianaMmgdResidencialPerCapita,
    precariedadeHabitacionalAltaP90,
    totalMunicipios: linhas.length,
    totalClassificados,
    totalExcluidosSemDado: linhas.length - totalClassificados,
    totalPrecisaReextrairMmgd,
  };
}

export const NOTA_METODOLOGICA =
  'Esta classificação é um corte bivariado simples (irradiação solar x MMGD residencial ' +
  'per capita), SEM controlar renda. A análise de correlação MMGD x indicadores sociais ' +
  'já mostrou que renda é o preditor mais robusto de MMGD nacionalmente — parte da ' +
  'concentração de Vazios de Acesso em regiões de menor renda (ex: Nordeste) reflete o ' +
  'próprio gargalo de renda documentado, não só um efeito "puro" de potencial solar ' +
  'desperdiçado. Isso não invalida o resultado para fins de RF-055/RF-056 (que pedem ' +
  'justamente esse corte simples, potencial x acesso), mas deve ser lido com essa ' +
  'ressalva — mesmo cuidado metodológico já previsto para o Índice de Pobreza Energética ' +
  'Regional (RF-080). Ver ARQUITETURA.md, seção "Identificação e ranking de Vazios de Acesso". ' +
  'O campo "ivsh" (IVS + precariedade habitacional + insegurança da posse, migration 0028) é ' +
  'uma alternativa de priorização para quem quer considerar moradia — auditoria de 18/07/2026 ' +
  '(docs/RELATORIO_AUDITORIA_MORADIA_SOLAR.md) confirmou que precariedade habitacional e este ' +
  'quadrante (potencial solar x MMGD residencial) são dimensões parcialmente independentes: o ' +
  'IVS puro (usado como padrão) não captura moradia de propósito (migration 0015).';

export interface ListarVaziosDeAcessoResultado {
  metodologia: {
    eixoX: string;
    eixoY: string;
    criterioQuadrante: string;
    criterioPriorizacaoPadrao: string;
    medianaNacional: {
      potencialSolarKwhM2Dia: number;
      mmgdResidencialPer1000Hab: number;
    };
    /** Percentil 90 nacional de indice_precariedade_moradia — limiar de "alta precariedade habitacional" usado pelo CartaoDescompassoMorfologico (frontend). Não é um corte fixo: recalculado a partir da distribuição real a cada requisição, ver `percentil()`. */
    limiarPrecariedadeHabitacionalAlta: number;
  };
  notaMetodologica: string;
  avisos: {
    totalMunicipios: number;
    totalClassificados: number;
    totalExcluidosSemDado: number;
    totalPrecisaReextrairMmgd: number;
  };
  resumoPorQuadrante: Record<Quadrante, number>;
  /** Contagem de municípios com descompassoMorfologico=true no recorte já filtrado por geografia (não por quadrante — o alerta é independente de quadrante). */
  resumoDescompasso: number;
  filtrosAplicados: {
    uf: string | null;
    regiao: string | null;
    quadrante: string | null;
    classificacaoIvsh: string | null;
    descompassoMorfologico: boolean | null;
  };
  paginacao: {
    pagina: number;
    porPagina: number;
    totalResultados: number;
    totalPaginas: number;
  };
  resultados: MunicipioClassificado[];
}

export async function listarVaziosDeAcesso(
  query: ListarVaziosDeAcessoQuery,
): Promise<ListarVaziosDeAcessoResultado> {
  const linhasBrutas = await buscarPainelBruto();
  const painel = classificarPainel(linhasBrutas);

  // classificacaoIvsh é quintil DENTRO do quadrante vazio_de_acesso (não
  // nacional) — calculado sobre a população NACIONAL desse quadrante, antes
  // do filtro de geografia, pelo mesmo motivo das medianas de quadrante: um
  // filtro por UF não pode mudar o que "muito_alto" significa.
  const populacaoVazioDeAcesso = painel.municipios.filter((m) => m.quadrante === 'vazio_de_acesso');
  const mapaClassificacaoIvsh = calcularClassificacaoIvsh(populacaoVazioDeAcesso);
  const municipiosComClassificacaoIvsh = painel.municipios.map((municipio) => ({
    ...municipio,
    classificacaoIvsh: mapaClassificacaoIvsh.get(municipio.codigoIbge) ?? null,
  }));

  // Filtro geográfico (uf/regiao) é aplicado DEPOIS da classificação — as
  // medianas que definem os quadrantes são sempre NACIONAIS (mesma decisão
  // do script de validação: um filtro geográfico não pode mudar o que
  // "alto potencial"/"alto MMGD" significa).
  const filtradoPorGeografia = municipiosComClassificacaoIvsh.filter((municipio) => {
    if (query.uf && municipio.uf !== query.uf) return false;
    if (query.regiao && municipio.regiao !== query.regiao) return false;
    return true;
  });

  const resumoPorQuadrante = filtradoPorGeografia.reduce(
    (acc, municipio) => {
      if (municipio.quadrante) acc[municipio.quadrante] += 1;
      return acc;
    },
    {
      vazio_de_acesso: 0,
      acesso_pleno: 0,
      adocao_acima_do_potencial: 0,
      baixo_potencial_baixa_adocao: 0,
    } as Record<Quadrante, number>,
  );
  const resumoDescompasso = filtradoPorGeografia.filter((m) => m.descompassoMorfologico).length;

  const filtradoPorQuadrante = query.quadrante
    ? filtradoPorGeografia.filter((municipio) => municipio.quadrante === query.quadrante)
    : filtradoPorGeografia;

  const filtradoPorIvsh = query.classificacaoIvsh
    ? filtradoPorQuadrante.filter((municipio) => municipio.classificacaoIvsh === query.classificacaoIvsh)
    : filtradoPorQuadrante;

  const filtradoPorDescompasso =
    query.descompassoMorfologico === undefined
      ? filtradoPorIvsh
      : filtradoPorIvsh.filter((municipio) => municipio.descompassoMorfologico === query.descompassoMorfologico);

  const ordenado = ordenarMunicipios(filtradoPorDescompasso, query.ordenarPor, query.ordem);

  const totalResultados = ordenado.length;
  const totalPaginas = Math.max(1, Math.ceil(totalResultados / query.porPagina));
  const inicio = (query.pagina - 1) * query.porPagina;
  const resultados = ordenado.slice(inicio, inicio + query.porPagina);

  return {
    metodologia: {
      eixoX: 'Irradiação solar média (GHI, kWh/m².dia — INPE/LABREN)',
      eixoY: 'MMGD residencial instalada per capita (kW/1.000 hab)',
      criterioQuadrante:
        'Mediana nacional de cada eixo. "Vazio de Acesso" = irradiação >= mediana E MMGD residencial per capita < mediana.',
      criterioPriorizacaoPadrao:
        'IVS Consolidado, decrescente (indicador negativo — maior valor = mais vulnerável primeiro). ' +
        'Reordenável via ?ordenarPor — inclui "ivsh" (IVS + precariedade habitacional + insegurança ' +
        'da posse, migration 0028) para priorização que considera moradia, já que o IVS puro exclui ' +
        'essa dimensão de propósito (ver notaMetodologica).',
      medianaNacional: {
        potencialSolarKwhM2Dia: painel.medianaIrradiacao,
        mmgdResidencialPer1000Hab: painel.medianaMmgdResidencialPerCapita,
      },
      limiarPrecariedadeHabitacionalAlta: painel.precariedadeHabitacionalAltaP90,
    },
    notaMetodologica: NOTA_METODOLOGICA,
    avisos: {
      totalMunicipios: painel.totalMunicipios,
      totalClassificados: painel.totalClassificados,
      totalExcluidosSemDado: painel.totalExcluidosSemDado,
      totalPrecisaReextrairMmgd: painel.totalPrecisaReextrairMmgd,
    },
    resumoPorQuadrante,
    resumoDescompasso,
    filtrosAplicados: {
      uf: query.uf ?? null,
      regiao: query.regiao ?? null,
      quadrante: query.quadrante ?? null,
      classificacaoIvsh: query.classificacaoIvsh ?? null,
      descompassoMorfologico: query.descompassoMorfologico ?? null,
    },
    paginacao: {
      pagina: query.pagina,
      porPagina: query.porPagina,
      totalResultados,
      totalPaginas,
    },
    resultados,
  };
}

function ordenarMunicipios(
  municipios: MunicipioClassificado[],
  criterio: ListarVaziosDeAcessoQuery['ordenarPor'],
  ordem: ListarVaziosDeAcessoQuery['ordem'],
): MunicipioClassificado[] {
  const fator = ordem === 'asc' ? 1 : -1;

  return [...municipios].sort((a, b) => {
    const valorA = a[criterio];
    const valorB = b[criterio];

    // Valores nulos sempre vão para o fim, independente da direção da
    // ordenação — não faz sentido "nulo é o menor/maior valor".
    if (valorA === null && valorB === null) return 0;
    if (valorA === null) return 1;
    if (valorB === null) return -1;

    return valorA < valorB ? -1 * fator : valorA > valorB ? 1 * fator : 0;
  });
}

export interface ClassificarMunicipiosResultado {
  notaMetodologica: string;
  medianaNacional: {
    potencialSolarKwhM2Dia: number;
    mmgdResidencialPer1000Hab: number;
  };
  codigosNaoEncontrados: string[];
  resultados: MunicipioClassificado[];
}

/**
 * Painel Analítico (RF-049/050, feedback do usuário): classificação de
 * quadrante de um conjunto específico de municípios (não paginação
 * nacional). Resolve uma ambiguidade real do badge binário que existia antes
 * no frontend ("Sim"/"Não" a partir de `codigosVazios`, que só continha o
 * quadrante "vazio_de_acesso" — um município fora desse Set podia estar
 * classificado em OUTRO quadrante OU simplesmente excluído por falta de
 * dado, e o frontend não tinha como distinguir os dois casos). Aqui
 * `quadrante`/`quadranteRotulo` vêm null explicitamente quando o município
 * está excluído (`classificarQuadrante` já retorna null nesse caso — ver
 * `totalExcluidosSemDado`/`totalPrecisaReextrairMmgd` em `listarVaziosDeAcesso`
 * para o mesmo motivo em escala nacional).
 *
 * Reaproveita buscarPainelBruto/classificarPainel (mesmas funções do
 * endpoint de listagem e de classificarMunicipioIndividual) — a classificação
 * depende de MEDIANAS NACIONAIS, então sempre calcula o painel completo antes
 * de filtrar pelos códigos pedidos (não dá pra saber "vazio ou não" sem isso).
 */
export async function classificarMunicipios(
  codigos: string[],
): Promise<ClassificarMunicipiosResultado> {
  const linhasBrutas = await buscarPainelBruto();
  const painel = classificarPainel(linhasBrutas);
  const porCodigo = new Map(painel.municipios.map((m) => [m.codigoIbge, m]));

  const resultados = codigos
    .map((codigo) => porCodigo.get(codigo))
    .filter((municipio): municipio is MunicipioClassificado => municipio !== undefined);

  const codigosNaoEncontrados = codigos.filter((codigo) => !porCodigo.has(codigo));

  return {
    notaMetodologica: NOTA_METODOLOGICA,
    medianaNacional: {
      potencialSolarKwhM2Dia: painel.medianaIrradiacao,
      mmgdResidencialPer1000Hab: painel.medianaMmgdResidencialPerCapita,
    },
    codigosNaoEncontrados,
    resultados,
  };
}

export interface ClassificacaoMunicipioIndividual {
  quadrante: Quadrante | null;
  quadranteRotulo: string | null;
  irradiacaoMediaKwhM2Dia: number | null;
  mmgdResidencialPer1000Hab: number | null;
  medianaNacional: {
    potencialSolarKwhM2Dia: number;
    mmgdResidencialPer1000Hab: number;
  };
}

/**
 * RF-058: classificação de vazio de acesso de UM único município, para uso
 * no relatório-resumo em PDF (relatorioTerritorio.service.ts). Reaproveita
 * buscarPainelBruto/classificarPainel (as mesmas funções do endpoint de
 * listagem) porque a classificação depende de MEDIANAS NACIONAIS — não dá
 * pra calcular o quadrante de um município isolado sem primeiro calcular o
 * painel completo. Retorna null se o código IBGE não existir na base
 * territorial (o chamador decide como tratar isso).
 */
export async function classificarMunicipioIndividual(
  codigoIbge: string,
): Promise<ClassificacaoMunicipioIndividual | null> {
  const linhasBrutas = await buscarPainelBruto();
  const painel = classificarPainel(linhasBrutas);
  const municipio = painel.municipios.find((m) => m.codigoIbge === codigoIbge);
  if (!municipio) return null;

  return {
    quadrante: municipio.quadrante,
    quadranteRotulo: municipio.quadranteRotulo,
    irradiacaoMediaKwhM2Dia: municipio.irradiacaoMediaKwhM2Dia,
    mmgdResidencialPer1000Hab: municipio.mmgdResidencialPer1000Hab,
    medianaNacional: {
      potencialSolarKwhM2Dia: painel.medianaIrradiacao,
      mmgdResidencialPer1000Hab: painel.medianaMmgdResidencialPerCapita,
    },
  };
}
