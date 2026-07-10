import type {
  AprovacaoIndicador,
  GranularidadeEspacial,
  IdMetadadoBaseDados,
  MetadadoBaseDados,
  Papel,
  StatusAprovacaoIndicador,
  StatusMetadadoBaseDados,
  UsuarioAdmin,
  VersaoPublicada,
} from '../types/api';
import { enviarJson, obterJson } from './http';

// -- RF-071/072/073: metadados técnicos das bases (leitura pública) ---------

export function listarMetadadosBasesDados(): Promise<MetadadoBaseDados[]> {
  return obterJson<MetadadoBaseDados[]>('/api/admin/metadados-bases-dados');
}

export function atualizarMetadadoBaseDados(
  baseDados: IdMetadadoBaseDados,
  dados: {
    granularidadeEspacial?: GranularidadeEspacial;
    status?: StatusMetadadoBaseDados;
    observacao?: string;
  },
  token: string,
): Promise<MetadadoBaseDados> {
  return enviarJson<MetadadoBaseDados>('PUT', `/api/admin/metadados-bases-dados/${baseDados}`, {
    corpo: dados,
    token,
  });
}

// -- RF-074: fila de aprovação de indicadores (tudo Admin) -------------------

export function listarAprovacoesIndicadores(token: string): Promise<AprovacaoIndicador[]> {
  return obterJson<AprovacaoIndicador[]>('/api/admin/aprovacoes-indicadores', undefined, token);
}

export function criarAprovacaoIndicador(
  indicador: string,
  token: string,
): Promise<AprovacaoIndicador> {
  return enviarJson<AprovacaoIndicador>('POST', '/api/admin/aprovacoes-indicadores', {
    corpo: { indicador },
    token,
  });
}

export function decidirAprovacaoIndicador(
  id: number,
  status: Exclude<StatusAprovacaoIndicador, 'pendente'>,
  motivo: string | undefined,
  token: string,
): Promise<AprovacaoIndicador> {
  return enviarJson<AprovacaoIndicador>('PATCH', `/api/admin/aprovacoes-indicadores/${id}`, {
    corpo: { status, motivo },
    token,
  });
}

// -- RF-075: versionamento de publicação (changelog público) -----------------

export function listarVersoesPublicadas(): Promise<VersaoPublicada[]> {
  return obterJson<VersaoPublicada[]>('/api/admin/versoes-publicadas');
}

export function publicarVersao(
  versao: string,
  descricao: string,
  token: string,
): Promise<VersaoPublicada> {
  return enviarJson<VersaoPublicada>('POST', '/api/admin/versoes-publicadas', {
    corpo: { versao, descricao },
    token,
  });
}

// -- RF-076: gestão de usuários (tudo Admin) ----------------------------------

export function listarUsuarios(token: string): Promise<UsuarioAdmin[]> {
  return obterJson<UsuarioAdmin[]>('/api/admin/usuarios', undefined, token);
}

export function atualizarUsuario(
  id: number,
  dados: { nome?: string; papel?: Papel; ativo?: boolean },
  token: string,
): Promise<UsuarioAdmin> {
  return enviarJson<UsuarioAdmin>('PATCH', `/api/admin/usuarios/${id}`, { corpo: dados, token });
}

/** Guard de "último administrador" e "não pode remover a própria conta" vêm do backend — ver admin.service.ts. */
export function removerUsuario(id: number, token: string): Promise<void> {
  return enviarJson<void>('DELETE', `/api/admin/usuarios/${id}`, { token });
}
