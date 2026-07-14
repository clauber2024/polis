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
    <div className="mx-auto max-w-4xl space-y-4 p-6 font-sans">
      <div className="flex flex-col gap-1 rounded-2xl bg-slate-900 p-6 text-white shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <span className="block font-mono text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
            Ambiente de Trabalho Científico
          </span>
          <h1 className="text-xl font-bold tracking-tight">Painel Colaborador</h1>
          <p className="text-xs text-slate-300">
            Olá, {sessao?.usuario.nome} — revisão de bases, observações, sugestões e comunicação.
          </p>
        </div>
      </div>
      <CartaoRevisoesBasesDados />
      <CartaoObservacoes />
      <CartaoSugestoesIndicadores />
      <CartaoNotasMetodologicas />
      <CartaoMateriaisComunicacao />
    </div>
  );
}
