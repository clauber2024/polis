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
 * Geração via `pdfkit` (stream-based) — o documento é construído em memória
 * e devolvido como Buffer, mesmo padrão de retorno das funções de exportação
 * XLSX em municipios.service.ts, pra o controller decidir os detalhes HTTP.
 * ============================================================================
 */

import PDFDocument from 'pdfkit';
import { buscarMunicipioPorCodigoIbge } from './municipios.service.js';
import { classificarMunicipioIndividual, ROTULOS_QUADRANTE } from './vaziosDeAcesso.service.js';

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
 * RF-058: gera o PDF do relatório-resumo de um município. Lança o mesmo
 * AppError(404) de buscarMunicipioPorCodigoIbge se o código IBGE não
 * existir — o controller repassa ao errorHandler central normalmente.
 */
export async function gerarRelatorioTerritorioPdf(codigoIbge: string): Promise<Buffer> {
  const municipio = await buscarMunicipioPorCodigoIbge(codigoIbge);
  const classificacao = await classificarMunicipioIndividual(codigoIbge);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // --- Cabeçalho ---
    doc.fontSize(20).font('Helvetica-Bold').text('Atlas Solar Justo');
    doc.fontSize(13).font('Helvetica').text('Relatório-resumo de território', { paragraphGap: 10 });
    doc.moveDown(0.5);

    doc
      .fontSize(17)
      .font('Helvetica-Bold')
      .text(`${municipio.nome} — ${municipio.uf}`);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555555')
      .text(
        `Código IBGE ${municipio.codigoIbge} · ${municipio.nomeEstado} · Região ${municipio.regiao}`,
      );
    doc.text(
      `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`,
    );
    doc.fillColor('#000000');
    doc.moveDown(1);

    function tituloSecao(texto: string): void {
      doc.moveDown(0.5);
      doc.fontSize(13).font('Helvetica-Bold').text(texto);
      doc
        .moveTo(doc.x, doc.y + 2)
        .lineTo(545, doc.y + 2)
        .strokeColor('#cccccc')
        .stroke();
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica');
    }

    function linha(rotulo: string, valor: string): void {
      doc.font('Helvetica-Bold').text(`${rotulo}: `, { continued: true }).font('Helvetica').text(valor);
    }

    // --- Classificação: Vazios de Acesso (RF-055/056/057) ---
    tituloSecao('Classificação — Território Prioritário / Vazio de Acesso');
    if (classificacao?.quadrante) {
      linha('Classificação', classificacao.quadranteRotulo ?? ROTULOS_QUADRANTE[classificacao.quadrante]);
      linha(
        'Irradiação solar do município',
        `${formatarNumero(classificacao.irradiacaoMediaKwhM2Dia, 3)} kWh/m².dia (mediana nacional: ${classificacao.medianaNacional.potencialSolarKwhM2Dia.toFixed(3)})`,
      );
      linha(
        'MMGD residencial per capita',
        `${formatarNumero(classificacao.mmgdResidencialPer1000Hab, 2)} kW/1.000 hab (mediana nacional: ${classificacao.medianaNacional.mmgdResidencialPer1000Hab.toFixed(2)})`,
      );
    } else {
      doc.text('Dado insuficiente para classificar este município (irradiação ou MMGD residencial ausentes).');
    }

    // --- Indicadores Sociais ---
    tituloSecao('Indicadores Sociais');
    linha('IVS Consolidado (índice próprio)', formatarNumero(municipio.ivs, 3));
    linha('Renda média domiciliar', municipio.rendaMediaDomiciliar !== null ? `R$ ${formatarNumero(municipio.rendaMediaDomiciliar, 2)}` : 'Sem dado');
    linha('% pobreza CadÚnico', formatarNumero(municipio.percentualPobrezaCadunico, 1, '%'));
    linha('Taxa de alfabetização', formatarNumero(municipio.taxaAlfabetizacao, 1, '%'));
    linha('Mortalidade infantil', formatarNumero(municipio.taxaMortalidadeInfantil, 2, ' por mil nascidos vivos'));
    linha(
      'Tarifa residencial (TUSD+TE)',
      municipio.tarifaEnergiaResidencial !== null
        ? `R$ ${formatarNumero(municipio.tarifaEnergiaResidencial, 2)}/MWh`
        : 'Sem dado (município com múltiplas distribuidoras, ou dado ainda não carregado)',
    );

    // --- MMGD (ANEEL) ---
    tituloSecao('Micro e Minigeração Distribuída (ANEEL)');
    linha('Potência instalada (total)', municipio.potenciaInstaladaKw !== null ? `${formatarNumero(municipio.potenciaInstaladaKw, 2)} kW` : 'Sem dado');
    linha('Potência instalada (residencial)', municipio.potenciaResidencialKw !== null ? `${formatarNumero(municipio.potenciaResidencialKw, 2)} kW` : 'Sem dado');
    linha('UCs com MMGD (total)', formatarInteiro(municipio.numeroUcsComMmgd));
    linha('UCs com MMGD (residencial)', formatarInteiro(municipio.numeroUcsResidencial));
    linha('MMGD per capita (total)', formatarNumero(municipio.mmgdPer1000Hab, 2, ' kW/1.000 hab'));
    linha('MMGD per capita (residencial)', formatarNumero(municipio.mmgdResidencialPer1000Hab, 2, ' kW/1.000 hab'));
    linha('Período de referência (snapshot ANEEL)', formatarPeriodo(municipio.periodoReferenciaMmgd));

    // --- Irradiação Solar (INPE) ---
    tituloSecao('Irradiação Solar (INPE/LABREN)');
    linha('Irradiação média (GHI)', formatarNumero(municipio.irradiacaoMediaKwhM2Dia, 3, ' kWh/m².dia'));
    linha('Período de referência', formatarPeriodo(municipio.periodoReferenciaIrradiacao));

    // --- Nota metodológica ---
    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor('#777777')
      .text(
        'Nota metodológica: a classificação de "Vazio de Acesso" é um corte bivariado simples ' +
          '(irradiação solar x MMGD residencial per capita, mediana nacional), sem controlar renda — ' +
          'ver ARQUITETURA.md, seção "Identificação e ranking de Vazios de Acesso", para a ressalva completa. ' +
          'Fontes primárias: ANEEL (MMGD, tarifa), INPE/LABREN (irradiação solar), IBGE/Censo 2022 (alfabetização), ' +
          'MDS/SAGI (CadÚnico), SIM/SINASC-DATASUS (mortalidade infantil). Dados carregados no Atlas Solar Justo.',
        { align: 'left' },
      );

    doc.end();
  });
}
