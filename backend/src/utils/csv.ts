/**
 * UTIL: serialização simples de CSV (RFC 4180), sem dependência externa.
 * --------------------------------------------------------------------------
 * Escapa aspas duplas e envolve em aspas qualquer campo que contenha vírgula,
 * aspas ou quebra de linha. Usa `\r\n` como terminador de linha (padrão RFC
 * 4180) e cabeçalho na primeira linha, com as chaves do primeiro objeto do
 * array (todas as linhas do Atlas vêm de um SELECT com colunas fixas, então
 * as chaves são sempre as mesmas entre os objetos de um mesmo array).
 * --------------------------------------------------------------------------
 */

function escaparCampoCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  if (/["\r\n,]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function paraCsv(linhas: ReadonlyArray<Record<string, unknown>>): string {
  if (linhas.length === 0) return '';

  const colunas = Object.keys(linhas[0]);
  const cabecalho = colunas.map(escaparCampoCsv).join(',');
  const corpo = linhas.map((linha) =>
    colunas.map((coluna) => escaparCampoCsv(linha[coluna])).join(','),
  );

  return [cabecalho, ...corpo].join('\r\n') + '\r\n';
}
