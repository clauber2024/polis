/**
 * Erro de aplicação com status HTTP explícito — o que o errorHandler central
 * (src/middlewares/errorHandler.ts) usa para decidir o código de resposta e
 * montar o JSON de erro consistente (CLAUDE.md, Seção 4: "Controllers devem
 * retornar JSON consistente"). Qualquer erro esperado (validação, filtro
 * inválido, recurso não encontrado) deve ser lançado como AppError, nunca
 * como Error genérico — erros genéricos viram 500 automaticamente.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly detalhes?: unknown;

  constructor(statusCode: number, mensagem: string, detalhes?: unknown) {
    super(mensagem);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.detalhes = detalhes;
  }
}
