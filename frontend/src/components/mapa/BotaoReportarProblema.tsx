import { useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import * as colaboradorService from '../../services/colaborador.service';
import { ErroDeApi } from '../../services/http';
import { BASES_DE_DADOS_CANONICAS, type BaseDadosCanonica } from '../../types/api';

interface BotaoReportarProblemaProps {
  nomeMunicipio: string;
  ufMunicipio: string;
}

/**
 * Botão contextual "Reportar erro ou sugestão" no painel de detalhe do
 * município (01/08/2026, pedido do usuário). Reaproveita 100% a
 * infraestrutura de observações do Colaborador (RF-060, `criarObservacao`)
 * — nenhum endpoint/tabela nova, só empacota o mesmo formulário com o
 * contexto do município já embutido na mensagem, em vez de exigir que o
 * usuário abra o Painel Colaborador e digite tudo na mão. Decisão do
 * usuário: só visível pra quem está logado (Colaborador/Admin) — o Atlas
 * ainda não tem nenhuma escrita pública sem login.
 */
export function BotaoReportarProblema({ nomeMunicipio, ufMunicipio }: BotaoReportarProblemaProps) {
  const { sessao } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [base, setBase] = useState<BaseDadosCanonica>('aneel');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  if (!sessao) return null;

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!sessao || !mensagem.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await colaboradorService.criarObservacao(
        base,
        `[${nomeMunicipio}/${ufMunicipio}] ${mensagem.trim()}`,
        sessao.token,
      );
      setMensagem('');
      setEnviado(true);
      setTimeout(() => {
        setEnviado(false);
        setAberto(false);
      }, 2000);
    } catch (causa) {
      setErro(causa instanceof ErroDeApi ? causa.message : 'Falha ao enviar.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-center text-[11px] font-semibold text-emerald-700">
        Enviado — obrigado!
      </p>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-2 w-full rounded-lg border border-stone-200 bg-white py-1.5 text-[11px] font-semibold text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700"
      >
        Reportar erro ou sugestão sobre {nomeMunicipio}
      </button>
    );
  }

  return (
    <form
      onSubmit={aoSubmeter}
      className="mt-2 space-y-1.5 rounded-lg border border-stone-200 bg-stone-50/80 p-2.5"
    >
      <div className="flex items-center gap-1.5">
        <label
          htmlFor="reportar-base"
          className="text-[9px] font-bold tracking-widest text-stone-400 uppercase"
        >
          Base
        </label>
        <select
          id="reportar-base"
          value={base}
          onChange={(evento) => setBase(evento.target.value as BaseDadosCanonica)}
          className="rounded border border-stone-300 px-1 py-0.5 text-[10px] text-stone-700 uppercase"
        >
          {BASES_DE_DADOS_CANONICAS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={mensagem}
        onChange={(evento) => setMensagem(evento.target.value)}
        placeholder={`Descreva o erro ou sugestão sobre ${nomeMunicipio}…`}
        maxLength={4000}
        rows={3}
        className="w-full rounded border border-stone-300 px-2 py-1.5 text-xs"
      />
      {erro && <p className="text-[10px] text-red-600">{erro}</p>}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded px-2 py-1 text-[10px] font-semibold text-stone-500 hover:bg-stone-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando || !mensagem.trim()}
          className="rounded bg-stone-800 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-stone-900 disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </form>
  );
}
