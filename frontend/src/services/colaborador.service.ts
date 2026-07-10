import type {
  BaseDadosCanonica,
  MaterialComunicacao,
  NotaMetodologica,
  ObservacaoBaseDados,
  RevisaoBaseDados,
  StatusMaterialComunicacao,
  StatusRevisaoBaseDados,
  SugestaoIndicador,
} from '../types/api';
import { enviarJson, obterJson } from './http';

// -- RF-059: revisão metodológica por base -----------------------------------

export function listarRevisoesBasesDados(): Promise<RevisaoBaseDados[]> {
  return obterJson<RevisaoBaseDados[]>('/api/bases-de-dados/revisoes');
}

export function atualizarRevisaoBaseDados(
  baseDados: BaseDadosCanonica,
  status: StatusRevisaoBaseDados,
  token: string,
): Promise<RevisaoBaseDados> {
  return enviarJson<RevisaoBaseDados>('PUT', `/api/bases-de-dados/${baseDados}/revisao`, {
    corpo: { status },
    token,
  });
}

// -- RF-060: observações sobre inconsistências -------------------------------

export function listarObservacoes(baseDados: BaseDadosCanonica): Promise<ObservacaoBaseDados[]> {
  return obterJson<ObservacaoBaseDados[]>(`/api/bases-de-dados/${baseDados}/observacoes`);
}

export function criarObservacao(
  baseDados: BaseDadosCanonica,
  mensagem: string,
  token: string,
): Promise<ObservacaoBaseDados> {
  return enviarJson<ObservacaoBaseDados>('POST', `/api/bases-de-dados/${baseDados}/observacoes`, {
    corpo: { mensagem },
    token,
  });
}

// -- RF-061: sugestões de melhoria em indicadores ----------------------------

export function listarSugestoes(): Promise<SugestaoIndicador[]> {
  return obterJson<SugestaoIndicador[]>('/api/indicadores/sugestoes');
}

export function criarSugestao(
  indicador: string,
  mensagem: string,
  token: string,
): Promise<SugestaoIndicador> {
  return enviarJson<SugestaoIndicador>('POST', '/api/indicadores/sugestoes', {
    corpo: { indicador, mensagem },
    token,
  });
}

// -- RF-064/065/066: notas metodológicas --------------------------------------

export function listarNotasMetodologicas(): Promise<NotaMetodologica[]> {
  return obterJson<NotaMetodologica[]>('/api/notas-metodologicas');
}

export function criarNotaMetodologica(
  topico: string,
  conteudo: string,
  forcaAchado: number | undefined,
  token: string,
): Promise<NotaMetodologica> {
  return enviarJson<NotaMetodologica>('POST', '/api/notas-metodologicas', {
    corpo: { topico, conteudo, forcaAchado },
    token,
  });
}

// -- RF-067: materiais de comunicação -----------------------------------------

export function listarMateriaisComunicacao(): Promise<MaterialComunicacao[]> {
  return obterJson<MaterialComunicacao[]>('/api/materiais-comunicacao');
}

export function criarMaterialComunicacao(
  titulo: string,
  token: string,
): Promise<MaterialComunicacao> {
  return enviarJson<MaterialComunicacao>('POST', '/api/materiais-comunicacao', {
    corpo: { titulo },
    token,
  });
}

export function atualizarMaterialComunicacao(
  id: number,
  status: StatusMaterialComunicacao,
  token: string,
): Promise<MaterialComunicacao> {
  return enviarJson<MaterialComunicacao>('PATCH', `/api/materiais-comunicacao/${id}`, {
    corpo: { status },
    token,
  });
}
