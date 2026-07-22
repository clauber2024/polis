/**
 * SERVICE: Nota Metodológica geral do Atlas, em PDF
 * ============================================================================
 * Pedido do usuário (21/07/2026): a Landing Page precisa de uma explicação
 * metodológica com opção de download. Este documento resume, para o público
 * em geral, os critérios que a plataforma usa — mas REAPROVEITA os textos
 * metodológicos já validados e expostos pela própria API (em especial
 * `NOTA_METODOLOGICA` de vaziosDeAcesso.service.ts, a mesma ressalva que já
 * acompanha `GET /api/vazios-de-acesso`), em vez de reescrever a metodologia
 * do zero — evita duas versões divergentes do mesmo texto ao longo do tempo.
 *
 * Geração via `pdfkit`, mesmo padrão de relatorioTerritorio.service.ts
 * (RF-058) — sem nova dependência.
 * ============================================================================
 */

import PDFDocument from 'pdfkit';
import { NOTA_METODOLOGICA } from './vaziosDeAcesso.service.js';

export async function gerarNotaMetodologicaPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // --- Cabeçalho ---
    doc.fontSize(20).font('Helvetica-Bold').text('Atlas Solar Justo');
    doc.fontSize(13).font('Helvetica').text('Nota Metodológica', { paragraphGap: 10 });
    doc
      .fontSize(9)
      .fillColor('#555555')
      .text(
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

    doc
      .fontSize(10)
      .text(
        'O Atlas Solar Justo cruza três eixos — potencial solar, vulnerabilidade social e ' +
          'acesso efetivo à geração distribuída (MMGD) — para identificar territórios ' +
          'prioritários de política pública de justiça energética. Este documento resume os ' +
          'critérios que a plataforma usa para essa classificação.',
        { align: 'left' },
      );

    // --- Vazio de Acesso: reaproveita o texto oficial já servido pela API ---
    tituloSecao('Vazio de Acesso (classificação de território prioritário)');
    doc.text(NOTA_METODOLOGICA, { align: 'left' });

    // --- IVS / IVSH ---
    tituloSecao('Índice de Vulnerabilidade Social (IVS) e IVSH');
    doc.text(
      'O IVS Consolidado do Atlas combina infraestrutura urbana, renda e trabalho e capital ' +
        'humano — por desenho, EXCLUI moradia, para não confundir o efeito da moradia com o da ' +
        'vulnerabilidade social geral ao testar hipóteses sobre acesso à energia solar. O IVSH ' +
        '(Índice de Vulnerabilidade Sócio-Habitacional-Energética) é a média entre o IVS, a ' +
        'precariedade física da moradia (cortiços, paredes inadequadas, presença de favela) e a ' +
        'insegurança da posse da terra — uma métrica complementar, disponível como critério de ' +
        'priorização alternativo (?ordenarPor=ivsh), não um substituto do IVS.',
      { align: 'left' },
    );

    // --- Fontes de dados (mesmas 11 categorias da Landing Page) ---
    tituloSecao('Fontes de dados');
    doc.text(
      'ANEEL (micro e minigeração distribuída, tarifa residencial, qualidade de fornecimento); ' +
        'IBGE/Censo 2022 (infraestrutura urbana, moradia, tipo de domicílio, alfabetização, ' +
        'densidade populacional, Cadastro Nacional de Favelas e Comunidades Urbanas); CadÚnico ' +
        '(cobertura e pobreza entre famílias cadastradas); Tarifa Social de Energia Elétrica ' +
        '(TSEE); IVS/IPEA; INPE (irradiação solar — Atlas Solar 2017/LABREN, média ' +
        'climatológica 1999–2015; precipitação mensal — MERGE/CPTEC); RAIS/Ministério do ' +
        'Trabalho, via BigQuery (renda e trabalho); DATASUS (mortalidade infantil, SIM + ' +
        'SINASC); Caixa/FGTS e Ministério das Cidades (Programa Minha Casa Minha Vida); ' +
        'prefeituras municipais (Zonas Especiais de Interesse Social — hoje São Paulo, Recife, ' +
        'Rio Branco e Rio de Janeiro); Caixa Econômica Federal (Programa Reforma Casa Brasil ' +
        'Solar — fonte pontual, obtida via Lei de Acesso à Informação, não uma base pública/' +
        'automatizável como as demais).',
      { align: 'left' },
    );

    // --- Referências metodológicas (RF-007) ---
    tituloSecao('Referências metodológicas');
    doc.text(
      'O Índice de Pobreza Energética Regional do Atlas é elaboração própria, inspirada na ' +
        'abordagem metodológica do Observatório Brasileiro de Erradicação da Pobreza Energética ' +
        '(OBEPE — EPE/Ministério de Minas e Energia/BID). O OBEPE é uma referência de diálogo ' +
        'metodológico, não uma fonte de dado primário do Atlas.',
      { align: 'left' },
    );

    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor('#777777')
      .text(
        'Este documento resume a metodologia pública do Atlas Solar Justo. "Vazio de Acesso" e ' +
          'IVSH são construções metodológicas originais do Instituto Pólis, ainda não submetidas ' +
          'a validação externa por pares.',
        { align: 'left' },
      );

    doc.end();
  });
}
