import type { Quadrante } from '../types/api';

/**
 * Rótulos curtos e cores dos 4 quadrantes de Vazios de Acesso (RF-055/056)
 * para exibição compacta (badge de tabela/legenda) — a versão longa
 * (`quadranteRotulo` da API, ex.: "Vazio de Acesso (alto potencial, baixo
 * MMGD residencial)") fica disponível via atributo `title` de quem usa isto.
 * Cor de "Vazio de Acesso" é violeta de propósito — mesma identidade já
 * usada no destaque do mapa e no heatmap (RF-057).
 */
export const ROTULO_CURTO_QUADRANTE: Record<Quadrante, string> = {
  vazio_de_acesso: 'Vazio de Acesso',
  acesso_pleno: 'Acesso pleno',
  adocao_acima_do_potencial: 'Adoção acima do potencial',
  baixo_potencial_baixa_adocao: 'Baixo potencial / baixa adoção',
};

export const ESTILO_QUADRANTE: Record<Quadrante, string> = {
  vazio_de_acesso: 'bg-violet-100 text-violet-700',
  acesso_pleno: 'bg-emerald-100 text-emerald-700',
  adocao_acima_do_potencial: 'bg-sky-100 text-sky-700',
  baixo_potencial_baixa_adocao: 'bg-slate-100 text-slate-600',
};
