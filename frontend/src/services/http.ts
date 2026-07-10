import type { ErroApi } from '../types/api';

/**
 * Cliente HTTP central — todo acesso à API passa por aqui (CLAUDE.md Seção 4:
 * nenhuma chamada fetch direta em componentes). Em desenvolvimento a base é
 * vazia (caminhos relativos /api/..., resolvidos pelo proxy do Vite — ver
 * vite.config.ts); VITE_API_URL permite apontar para outra origem se preciso.
 */
const BASE_URL: string = import.meta.env.VITE_API_URL ?? '';

/** Erro de API com a mensagem do formato central do backend ({ erro: { mensagem } }). */
export class ErroDeApi extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
    public readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroDeApi';
  }
}

export async function obterJson<T>(caminho: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  const resposta = await fetch(`${BASE_URL}${caminho}${query}`, {
    headers: { Accept: 'application/json' },
  });

  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status} ao chamar ${caminho}`;
    let detalhes: unknown;
    try {
      const corpo = (await resposta.json()) as ErroApi;
      mensagem = corpo.erro?.mensagem ?? mensagem;
      detalhes = corpo.erro?.detalhes;
    } catch {
      // corpo não-JSON (ex: proxy caiu) — mantém a mensagem genérica
    }
    throw new ErroDeApi(resposta.status, mensagem, detalhes);
  }

  return (await resposta.json()) as T;
}

/**
 * Baixa um arquivo binário (CSV/XLSX/PDF) e dispara o download no navegador.
 * Usado pelas exportações (RF-047/RF-052/RF-058) — mesmo tratamento de erro
 * de obterJson (formato { erro: { mensagem } } do backend), mas a resposta de
 * sucesso é um Blob, não JSON.
 */
export async function baixarArquivo(
  caminho: string,
  params: Record<string, string>,
  nomeArquivo: string,
): Promise<void> {
  const query = `?${new URLSearchParams(params).toString()}`;
  const resposta = await fetch(`${BASE_URL}${caminho}${query}`);

  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status} ao chamar ${caminho}`;
    try {
      const corpo = (await resposta.json()) as ErroApi;
      mensagem = corpo.erro?.mensagem ?? mensagem;
    } catch {
      // corpo não-JSON — mantém a mensagem genérica
    }
    throw new ErroDeApi(resposta.status, mensagem);
  }

  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
