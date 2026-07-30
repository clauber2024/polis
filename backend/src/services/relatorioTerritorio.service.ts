/**
 * SERVICE: Relatório-resumo em PDF do território (RF-058)
 * ============================================================================
 * "Botão para geração de relatório-resumo exportável (PDF) do território
 * selecionado" — Painel de Gestão Pública (papel Público, ver DRF Seção 2 —
 * revisado 08/07/2026, antigo P3), ligado à seção de
 * "Territórios Prioritários" (RF-055 a RF-057). O "território" aqui é um
 * município (unidade de análise principal do Atlas, ver DRF Seção 1) — o
 * relatório combina os indicadores consolidados já expostos em
 * GET /api/municipios/:codigoIbge com a classificação de vazio de acesso
 * (GET /api/vazios-de-acesso), reaproveitando os dois services já validados
 * em vez de duplicar cálculo.
 *
 * Geração via `pdfkit` (stream-based, desenho imperativo — não é HTML/CSS
 * impresso, então o layout abaixo é montado com rect()/text() explícitos,
 * não com grid/flexbox) — o documento é construído em memória e devolvido
 * como Buffer, mesmo padrão de retorno das funções de exportação XLSX em
 * municipios.service.ts, pra o controller decidir os detalhes HTTP.
 *
 * Layout "Dossiê Executivo" (26/07/2026, auditoria de UX/UI): o relatório
 * original era uma lista corrida de "rótulo: valor" sem hierarquia visual —
 * lia como o clássico "print de página web". Virou: card de diagnóstico em
 * destaque logo no topo (a classificação do território é a informação mais
 * importante do documento, não deveria estar no meio de um parágrafo),
 * títulos de seção com barra de cor + linha (em vez de linha cinza solta) e
 * as duas seções mais densas (Indicadores Sociais, MMGD) em grid de 2
 * colunas. Nenhum dado foi alterado — mesmos dois services, mesmos campos.
 * ============================================================================
 */

import PDFDocument from 'pdfkit';
import { buscarMunicipioPorCodigoIbge, calcularMediasMunicipios } from './municipios.service.js';
import {
  classificarMunicipioIndividual,
  ROTULOS_QUADRANTE,
  type ClassificacaoMunicipioIndividual,
} from './vaziosDeAcesso.service.js';

const COR_CARMIM = '#b91c1c';
const COR_CARMIM_FUNDO = '#fef2f2';
const COR_CARMIM_BORDA = '#fecaca';
const COR_CARMIM_TITULO = '#991b1b';
const COR_CARMIM_TEXTO = '#7f1d1d';
const COR_TEXTO_PRINCIPAL = '#1c1917';
const COR_TEXTO_SECUNDARIO = '#57534e';
const COR_RETULO = '#78716c';
const COR_BORDA = '#e7e5e4';

/**
 * Tags estáticas de diagnóstico (auditoria de UX/UI, 30/07/2026) — mesma
 * lógica e paleta do termômetro de comparação nacional da Ficha do Município
 * na web (ver frontend/src/components/mapa/TermometroComparativo.tsx), aqui
 * "impressas" (o PDF não tem hover/tooltip, então o diagnóstico precisa
 * aparecer sempre visível ao lado do número). "maiorMelhor" (ex.: MMGD,
 * renda) ou "menorMelhor" (ex.: IVS, mortalidade infantil) — o lado
 * desfavorável é sempre a mesma frase franca nos dois sentidos.
 */
type SemanticaIndicador = 'maiorMelhor' | 'menorMelhor';

interface TagDiagnostico {
  texto: string;
  fundo: string;
  borda: string;
  textoCor: string;
}

const COR_TAG_ALERTA = { fundo: '#fef2f2', borda: '#fecaca', textoCor: '#b91c1c' };
const COR_TAG_FAVORAVEL = { fundo: '#ecfdf5', borda: '#a7f3d0', textoCor: '#047857' };

/**
 * Mesma regra de negócio do termômetro web: "melhor" só se aplica quando
 * MENOR é melhor — para "maior é melhor", o lado favorável é só "acima da
 * média" (não é necessariamente "ótimo", só não é o alerta). `null` quando
 * o município ou a média nacional não têm o dado.
 */
function tagDiagnostico(
  valor: number | null,
  mediaNacional: number | null | undefined,
  semantica: SemanticaIndicador,
): TagDiagnostico | null {
  if (valor === null || mediaNacional === null || mediaNacional === undefined) return null;

  const favoravel = semantica === 'maiorMelhor' ? valor >= mediaNacional : valor <= mediaNacional;

  if (!favoravel) {
    return { texto: 'PIOR QUE A MÉDIA — ALERTA', ...COR_TAG_ALERTA };
  }
  return {
    texto: semantica === 'maiorMelhor' ? 'ACIMA DA MÉDIA' : 'MELHOR QUE A MÉDIA',
    ...COR_TAG_FAVORAVEL,
  };
}

function formatarNumero(valor: number | null, casasDecimais = 2, sufixo = ''): string {
  if (valor === null) return 'Sem dado';
  return `${valor.toFixed(casasDecimais)}${sufixo}`;
}

function formatarInteiro(valor: number | null): string {
  if (valor === null) return 'Sem dado';
  return valor.toLocaleString('pt-BR');
}

function formatarPeriodo(periodo: string | null): string {
  if (!periodo) return 'Sem dado';
  // periodo_referencia vem do banco como 'YYYY-MM-DD' (date) — exibir só
  // ano-mês, que é a granularidade real do dado (snapshot mensal/anual).
  return periodo.slice(0, 7);
}

/**
 * Tese de uma linha só contrastando os dois eixos da classificação — a
 * mesma lógica de "Vazio de Acesso" (irradiação >= mediana E MMGD < mediana)
 * já usada no mapa/ficha do frontend, aqui só descrita em texto corrido.
 * Funciona pros 4 quadrantes (não só vazio_de_acesso), porque compara contra
 * a mediana real em vez de assumir uma direção fixa.
 */
function construirTeseClassificacao(classificacao: ClassificacaoMunicipioIndividual): string | null {
  const { irradiacaoMediaKwhM2Dia, mmgdResidencialPer1000Hab, medianaNacional } = classificacao;
  if (irradiacaoMediaKwhM2Dia === null || mmgdResidencialPer1000Hab === null) return null;

  const irradiacaoAcima = irradiacaoMediaKwhM2Dia >= medianaNacional.potencialSolarKwhM2Dia;
  const mmgdAcima = mmgdResidencialPer1000Hab >= medianaNacional.mmgdResidencialPer1000Hab;

  return (
    `Irradiação solar ${irradiacaoAcima ? 'acima' : 'abaixo'} da mediana nacional ` +
    `(${irradiacaoMediaKwhM2Dia.toFixed(2)} vs. ${medianaNacional.potencialSolarKwhM2Dia.toFixed(2)} kWh/m².dia) ` +
    `× MMGD residencial per capita ${mmgdAcima ? 'acima' : 'abaixo'} da mediana nacional ` +
    `(${mmgdResidencialPer1000Hab.toFixed(2)} vs. ${medianaNacional.mmgdResidencialPer1000Hab.toFixed(2)} kW/1.000 hab).`
  );
}

/**
 * Título de seção (auditoria de UX/UI, 30/07/2026): trocou a barra de cor
 * institucional lateral por uma linha horizontal sutil + texto em maiúsculas
 * espaçadas na cor de rótulo (mesma dupla `border-b border-stone-200` +
 * `uppercase tracking-widest text-stone-500` da Ficha do Município na web) —
 * a cor viva (carmim) fica reservada só para o card de alerta/tags, não para
 * decoração estrutural do documento.
 */
function tituloSecao(doc: PDFKit.PDFDocument, texto: string): void {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 80) doc.addPage();
  doc.moveDown(0.9);

  const margemEsq = doc.page.margins.left;
  const larguraConteudo = doc.page.width - margemEsq - doc.page.margins.right;

  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(COR_RETULO)
    .text(texto.toUpperCase(), margemEsq, doc.y, {
      width: larguraConteudo,
      characterSpacing: 0.6,
    });

  doc.moveDown(0.3);
  doc
    .moveTo(margemEsq, doc.y)
    .lineTo(margemEsq + larguraConteudo, doc.y)
    .strokeColor(COR_BORDA)
    .lineWidth(0.75)
    .stroke();
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(10).fillColor(COR_TEXTO_PRINCIPAL);
}

/**
 * Desenha a tag estática de diagnóstico (pill arredondado) na posição dada.
 * Largura calculada pelo próprio texto — pdfkit não tem "auto width" de CSS,
 * então a caixa precisa ser medida antes de desenhada.
 */
function desenharTag(doc: PDFKit.PDFDocument, tag: TagDiagnostico, x: number, y: number): number {
  const paddingX = 4;
  const paddingY = 2.5;
  doc.font('Helvetica-Bold').fontSize(6.5);
  const largura = doc.widthOfString(tag.texto) + paddingX * 2;
  const altura = doc.currentLineHeight() + paddingY * 2;

  doc.roundedRect(x, y, largura, altura, 2).lineWidth(0.75).fillAndStroke(tag.fundo, tag.borda);

  doc
    .font('Helvetica-Bold')
    .fontSize(6.5)
    .fillColor(tag.textoCor)
    .text(tag.texto, x + paddingX, y + paddingY, { lineBreak: false, characterSpacing: 0.2 });

  return altura;
}

/**
 * Uma célula rotulo/valor do grid — rótulo pequeno em maiúsculas acima,
 * valor abaixo, tag estática de diagnóstico (opcional, auditoria de UX/UI
 * 30/07/2026) logo abaixo do valor, borda inferior fina. Devolve a altura
 * ocupada (pra sincronizar as duas colunas da mesma linha).
 */
function celula(
  doc: PDFKit.PDFDocument,
  rotulo: string,
  valor: string,
  x: number,
  y: number,
  largura: number,
  tag?: TagDiagnostico | null,
): number {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COR_RETULO);
  doc.text(rotulo.toUpperCase(), x, y, { width: largura, characterSpacing: 0.3 });

  doc.font('Helvetica').fontSize(10.5).fillColor(COR_TEXTO_PRINCIPAL);
  doc.text(valor, x, doc.y + 1, { width: largura });

  let yTag = doc.y + 3;
  if (tag) {
    const alturaTag = desenharTag(doc, tag, x, yTag);
    yTag += alturaTag + 3;
    doc.fillColor(COR_TEXTO_PRINCIPAL); // desenharTag muda a cor de preenchimento — restaura pro próximo texto.
  }

  const yFinal = tag ? yTag + 2 : doc.y + 5;
  doc
    .moveTo(x, yFinal)
    .lineTo(x + largura, yFinal)
    .strokeColor(COR_BORDA)
    .lineWidth(0.75)
    .stroke();

  return yFinal - y;
}

/**
 * Grade de 2 colunas — cada par de itens vira uma linha, com a altura da
 * linha sincronizada pelo maior dos dois (texto mais longo pode quebrar em 2
 * linhas sem desalinhar a coluna vizinha). Terceiro elemento da tupla é a
 * tag estática de diagnóstico (auditoria de UX/UI, 30/07/2026) — omitido ou
 * `null` quando o indicador não tem semântica de comparação (valores
 * absolutos) ou a média nacional não está disponível.
 */
function grid2Colunas(
  doc: PDFKit.PDFDocument,
  itens: Array<[string, string, TagDiagnostico?]>,
): void {
  const margemEsq = doc.page.margins.left;
  const larguraConteudo = doc.page.width - margemEsq - doc.page.margins.right;
  const espaco = 24;
  const larguraColuna = (larguraConteudo - espaco) / 2;
  const x1 = margemEsq;
  const x2 = margemEsq + larguraColuna + espaco;

  for (let i = 0; i < itens.length; i += 2) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
    const y = doc.y;
    const alturas = [celula(doc, itens[i][0], itens[i][1], x1, y, larguraColuna, itens[i][2])];
    const par = itens[i + 1];
    if (par) alturas.push(celula(doc, par[0], par[1], x2, y, larguraColuna, par[2]));
    doc.y = y + Math.max(...alturas) + 6;
    doc.x = margemEsq;
  }
}

/**
 * Card de diagnóstico executivo — a classificação do território é a
 * informação mais importante do relatório (é o que motiva a decisão de
 * política pública), então vira a "capa" logo abaixo do cabeçalho em vez de
 * uma linha perdida no meio de uma lista de rótulos. Estilo (auditoria de
 * UX/UI, 30/07/2026): fundo sólido leve + borda fina (`bg-red-50 border-
 * red-200` da web), sem a faixa de cor lateral da versão anterior — a borda
 * já demarca o card.
 */
function cardDiagnostico(doc: PDFKit.PDFDocument, classificacao: ClassificacaoMunicipioIndividual | null): void {
  const margemEsq = doc.page.margins.left;
  const larguraConteudo = doc.page.width - margemEsq - doc.page.margins.right;
  const preenchimento = 14;
  const larguraTexto = larguraConteudo - preenchimento * 2;

  const rotulo = classificacao?.quadrante
    ? (classificacao.quadranteRotulo ?? ROTULOS_QUADRANTE[classificacao.quadrante])
    : 'Classificação indisponível (irradiação ou MMGD residencial ausentes)';
  const tese = classificacao ? construirTeseClassificacao(classificacao) : null;

  doc.font('Helvetica-Bold').fontSize(13);
  const alturaRotulo = doc.heightOfString(rotulo.toUpperCase(), { width: larguraTexto, characterSpacing: 0.4 });
  let alturaTese = 0;
  if (tese) {
    doc.font('Helvetica').fontSize(9.5);
    alturaTese = doc.heightOfString(tese, { width: larguraTexto }) + 6;
  }
  const alturaCard = preenchimento * 2 + alturaRotulo + alturaTese;

  const y0 = doc.y;
  doc
    .roundedRect(margemEsq, y0, larguraConteudo, alturaCard, 4)
    .lineWidth(1)
    .fillAndStroke(COR_CARMIM_FUNDO, COR_CARMIM_BORDA);

  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(COR_CARMIM_TITULO)
    .text(rotulo.toUpperCase(), margemEsq + preenchimento, y0 + preenchimento, {
      width: larguraTexto,
      characterSpacing: 0.4,
    });

  if (tese) {
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(COR_CARMIM_TEXTO)
      .text(tese, margemEsq + preenchimento, doc.y + 6, { width: larguraTexto });
  }

  doc.x = margemEsq;
  doc.y = y0 + alturaCard + 16;
  doc.fillColor(COR_TEXTO_PRINCIPAL);
}

/**
 * RF-058: gera o PDF do relatório-resumo de um município. Lança o mesmo
 * AppError(404) de buscarMunicipioPorCodigoIbge se o código IBGE não
 * existir — o controller repassa ao errorHandler central normalmente.
 */
export async function gerarRelatorioTerritorioPdf(codigoIbge: string): Promise<Buffer> {
  const municipio = await buscarMunicipioPorCodigoIbge(codigoIbge);
  const classificacao = await classificarMunicipioIndividual(codigoIbge);
  // Médias nacionais (mesmo endpoint/cálculo do Painel Analítico e da Ficha
  // do Município na web, GET /api/municipios/medias) — alimenta as tags
  // estáticas de diagnóstico abaixo, mesma lógica/fonte de dado dos dois.
  const { medias } = await calcularMediasMunicipios({});

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // --- Cabeçalho ---
    doc.fontSize(20).font('Helvetica-Bold').fillColor(COR_TEXTO_PRINCIPAL).text('Atlas Solar Justo');
    doc
      .fontSize(12)
      .font('Helvetica')
      .fillColor(COR_TEXTO_SECUNDARIO)
      .text('Relatório-resumo de território', { paragraphGap: 8 });

    const margemEsq = doc.page.margins.left;
    const larguraConteudo = doc.page.width - margemEsq - doc.page.margins.right;
    doc
      .moveTo(margemEsq, doc.y)
      .lineTo(margemEsq + larguraConteudo, doc.y)
      .strokeColor(COR_TEXTO_PRINCIPAL)
      .lineWidth(1.5)
      .stroke();
    doc.moveDown(0.9);

    doc
      .fontSize(17)
      .font('Helvetica-Bold')
      .fillColor(COR_TEXTO_PRINCIPAL)
      .text(`${municipio.nome} — ${municipio.uf}`);
    doc
      .fontSize(9.5)
      .font('Helvetica')
      .fillColor(COR_TEXTO_SECUNDARIO)
      .text(
        `Código IBGE ${municipio.codigoIbge} · ${municipio.nomeEstado} · Região ${municipio.regiao}`,
      );
    doc.text(
      `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`,
    );
    doc.moveDown(0.9);

    // --- Card de diagnóstico executivo (Classificação — RF-055/056/057) ---
    cardDiagnostico(doc, classificacao);

    // --- Detalhamento da classificação ---
    if (classificacao?.quadrante) {
      tituloSecao(doc, 'Detalhamento da classificação');
      grid2Colunas(doc, [
        [
          'Irradiação solar do território',
          `${formatarNumero(classificacao.irradiacaoMediaKwhM2Dia, 3)} kWh/m².dia (mediana nacional: ${classificacao.medianaNacional.potencialSolarKwhM2Dia.toFixed(3)})`,
        ],
        [
          'MMGD residencial per capita',
          `${formatarNumero(classificacao.mmgdResidencialPer1000Hab, 2)} kW/1.000 hab (mediana nacional: ${classificacao.medianaNacional.mmgdResidencialPer1000Hab.toFixed(2)})`,
        ],
      ]);
    }

    // --- Indicadores Sociais ---
    // Tags estáticas (auditoria de UX/UI, 30/07/2026): mesma semântica
    // maiorMelhor/menorMelhor da Ficha do Município na web — IVS/pobreza/
    // mortalidade infantil "menor é melhor"; renda/alfabetização "maior é
    // melhor". Tarifa residencial fica sem tag aqui de propósito: no PDF ela
    // aparece com ressalva de dado ausente por distribuidora múltipla, sinal
    // de que a comparação direta contra a média nacional já é frágil.
    tituloSecao(doc, 'Indicadores Sociais');
    grid2Colunas(doc, [
      [
        'IVS Consolidado (índice próprio)',
        formatarNumero(municipio.ivs, 3),
        tagDiagnostico(municipio.ivs, medias.ivs, 'menorMelhor') ?? undefined,
      ],
      [
        'Renda média domiciliar',
        municipio.rendaMediaDomiciliar !== null ? `R$ ${formatarNumero(municipio.rendaMediaDomiciliar, 2)}` : 'Sem dado',
        tagDiagnostico(municipio.rendaMediaDomiciliar, medias.rendaMediaDomiciliar, 'maiorMelhor') ?? undefined,
      ],
      [
        '% pobreza CadÚnico',
        formatarNumero(municipio.percentualPobrezaCadunico, 1, '%'),
        tagDiagnostico(municipio.percentualPobrezaCadunico, medias.percentualPobrezaCadunico, 'menorMelhor') ??
          undefined,
      ],
      [
        'Taxa de alfabetização',
        formatarNumero(municipio.taxaAlfabetizacao, 1, '%'),
        tagDiagnostico(municipio.taxaAlfabetizacao, medias.taxaAlfabetizacao, 'maiorMelhor') ?? undefined,
      ],
      [
        'Mortalidade infantil',
        formatarNumero(municipio.taxaMortalidadeInfantil, 2, ' por mil nascidos vivos'),
        tagDiagnostico(municipio.taxaMortalidadeInfantil, medias.taxaMortalidadeInfantil, 'menorMelhor') ??
          undefined,
      ],
      [
        'Tarifa residencial (TUSD+TE)',
        municipio.tarifaEnergiaResidencial !== null
          ? `R$ ${formatarNumero(municipio.tarifaEnergiaResidencial, 2)}/MWh`
          : 'Sem dado (município com múltiplas distribuidoras, ou dado ainda não carregado)',
      ],
    ]);

    // --- MMGD (ANEEL) ---
    // Só o per capita RESIDENCIAL leva tag (mesmo indicador-âncora tagueado
    // na web) — potência/UCs absolutas e o per capita TOTAL ficam sem tag de
    // propósito, mesmo raciocínio já registrado no frontend (valor absoluto
    // favorece cidade grande, comparação direta seria enganosa).
    tituloSecao(doc, 'Micro e Minigeração Distribuída (ANEEL)');
    grid2Colunas(doc, [
      [
        'Potência instalada (total)',
        municipio.potenciaInstaladaKw !== null ? `${formatarNumero(municipio.potenciaInstaladaKw, 2)} kW` : 'Sem dado',
      ],
      [
        'Potência instalada (residencial)',
        municipio.potenciaResidencialKw !== null ? `${formatarNumero(municipio.potenciaResidencialKw, 2)} kW` : 'Sem dado',
      ],
      ['UCs com MMGD (total)', formatarInteiro(municipio.numeroUcsComMmgd)],
      ['UCs com MMGD (residencial)', formatarInteiro(municipio.numeroUcsResidencial)],
      ['MMGD per capita (total)', formatarNumero(municipio.mmgdPer1000Hab, 2, ' kW/1.000 hab')],
      [
        'MMGD per capita (residencial)',
        formatarNumero(municipio.mmgdResidencialPer1000Hab, 2, ' kW/1.000 hab'),
        tagDiagnostico(municipio.mmgdResidencialPer1000Hab, medias.mmgdResidencialPer1000Hab, 'maiorMelhor') ??
          undefined,
      ],
      ['Período de referência (snapshot ANEEL)', formatarPeriodo(municipio.periodoReferenciaMmgd)],
    ]);

    // --- Irradiação Solar (INPE) ---
    tituloSecao(doc, 'Irradiação Solar (INPE/LABREN)');
    grid2Colunas(doc, [
      ['Irradiação média (GHI)', formatarNumero(municipio.irradiacaoMediaKwhM2Dia, 3, ' kWh/m².dia')],
      ['Período de referência', formatarPeriodo(municipio.periodoReferenciaIrradiacao)],
    ]);

    // --- Nota metodológica ---
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
    doc.moveDown(0.8);
    doc
      .moveTo(margemEsq, doc.y)
      .lineTo(margemEsq + larguraConteudo, doc.y)
      .strokeColor(COR_BORDA)
      .lineWidth(0.75)
      .stroke();
    doc.moveDown(0.5);
    // Rodapé institucional (auditoria de UX/UI, 30/07/2026): removida a
    // referência a ARQUITETURA.md (arquivo interno do repositório — vazamento
    // de jargão de desenvolvimento num documento de política pública). Mantém
    // só a definição curta da metodologia + fontes primárias.
    doc
      .fontSize(7.5)
      .font('Helvetica-Oblique')
      .fillColor('#a8a29e')
      .text(
        'Nota metodológica: a classificação de "Vazio de Acesso" é um corte bivariado simples ' +
          '(irradiação solar × MMGD residencial per capita, mediana nacional). ' +
          'Fontes primárias: ANEEL (MMGD, tarifa), INPE/LABREN (irradiação solar), IBGE/Censo 2022 (alfabetização), ' +
          'MDS/SAGI (CadÚnico), SIM/SINASC-DATASUS (mortalidade infantil). Processamento de dados: Atlas Solar Justo.',
        { align: 'left' },
      );

    doc.end();
  });
}
