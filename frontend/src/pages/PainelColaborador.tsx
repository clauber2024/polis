import { CartaoMateriaisComunicacao } from '../components/colaborador/CartaoMateriaisComunicacao';
import { CartaoNotasMetodologicas } from '../components/colaborador/CartaoNotasMetodologicas';
import { CartaoObservacoes } from '../components/colaborador/CartaoObservacoes';
import { CartaoRevisoesBasesDados } from '../components/colaborador/CartaoRevisoesBasesDados';
import { CartaoSugestoesIndicadores } from '../components/colaborador/CartaoSugestoesIndicadores';
import { useAuth } from '../contexts/AuthContext';

/**
 * Painel Colaborador (RF-059 a RF-067) — funde as antigas seções "Parceiro
 * Técnico" e "Equipe do Projeto" do DRF (ver DRF.md Seção 2). Cada seção é um
 * cartão independente que busca e escreve direto no service correspondente;
 * a página só orquestra o layout, sem lógica de negócio própria.
 */
export function PainelColaborador() {
  const { sessao } = useAuth();

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Painel Colaborador</h1>
        <p className="text-sm text-slate-500">
          Olá, {sessao?.usuario.nome} — revisão de bases, observações, sugestões e comunicação.
        </p>
      </div>
      <CartaoRevisoesBasesDados />
      <CartaoObservacoes />
      <CartaoSugestoesIndicadores />
      <CartaoNotasMetodologicas />
      <CartaoMateriaisComunicacao />
    </div>
  );
}
