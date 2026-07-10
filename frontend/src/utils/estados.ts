/**
 * Referência estática das 27 unidades federativas do Brasil (26 estados +
 * Distrito Federal), agrupadas nas 5 regiões oficiais do IBGE — mesma
 * divisão usada no backend (`REGIOES_VALIDAS`, vaziosDeAcesso.schema.ts).
 * Dado de referência fixo (não muda), por isso hardcoded aqui em vez de
 * derivado de uma chamada à API — usado para popular os filtros de
 * Região/Estado do Painel Analítico (RF-049/050).
 */
export interface EstadoBrasileiro {
  uf: string;
  nome: string;
  regiao: string;
}

export const REGIOES_BRASIL = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const;

export const ESTADOS_BRASIL: EstadoBrasileiro[] = [
  { uf: 'AC', nome: 'Acre', regiao: 'Norte' },
  { uf: 'AP', nome: 'Amapá', regiao: 'Norte' },
  { uf: 'AM', nome: 'Amazonas', regiao: 'Norte' },
  { uf: 'PA', nome: 'Pará', regiao: 'Norte' },
  { uf: 'RO', nome: 'Rondônia', regiao: 'Norte' },
  { uf: 'RR', nome: 'Roraima', regiao: 'Norte' },
  { uf: 'TO', nome: 'Tocantins', regiao: 'Norte' },
  { uf: 'AL', nome: 'Alagoas', regiao: 'Nordeste' },
  { uf: 'BA', nome: 'Bahia', regiao: 'Nordeste' },
  { uf: 'CE', nome: 'Ceará', regiao: 'Nordeste' },
  { uf: 'MA', nome: 'Maranhão', regiao: 'Nordeste' },
  { uf: 'PB', nome: 'Paraíba', regiao: 'Nordeste' },
  { uf: 'PE', nome: 'Pernambuco', regiao: 'Nordeste' },
  { uf: 'PI', nome: 'Piauí', regiao: 'Nordeste' },
  { uf: 'RN', nome: 'Rio Grande do Norte', regiao: 'Nordeste' },
  { uf: 'SE', nome: 'Sergipe', regiao: 'Nordeste' },
  { uf: 'DF', nome: 'Distrito Federal', regiao: 'Centro-Oeste' },
  { uf: 'GO', nome: 'Goiás', regiao: 'Centro-Oeste' },
  { uf: 'MS', nome: 'Mato Grosso do Sul', regiao: 'Centro-Oeste' },
  { uf: 'MT', nome: 'Mato Grosso', regiao: 'Centro-Oeste' },
  { uf: 'ES', nome: 'Espírito Santo', regiao: 'Sudeste' },
  { uf: 'MG', nome: 'Minas Gerais', regiao: 'Sudeste' },
  { uf: 'RJ', nome: 'Rio de Janeiro', regiao: 'Sudeste' },
  { uf: 'SP', nome: 'São Paulo', regiao: 'Sudeste' },
  { uf: 'PR', nome: 'Paraná', regiao: 'Sul' },
  { uf: 'RS', nome: 'Rio Grande do Sul', regiao: 'Sul' },
  { uf: 'SC', nome: 'Santa Catarina', regiao: 'Sul' },
].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
