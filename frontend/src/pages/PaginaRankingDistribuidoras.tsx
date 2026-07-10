import { useEffect, useState } from 'react';
import { buscarRankingDistribuidoras } from '../services/rankingDistribuidoras.service';
import type { DistribuidoraRanking, RankingDistribuidorasResultado } from '../types/api';
import { formatarValor } from '../utils/formatadores';

/**
 * Ranking público de distribuidoras por desempenho em conexão de MMGD +
 * justiça energética (10/07/2026) — produto priorizado pelo usuário em
 * 06/07/2026 (ver ARQUITETURA.md, "Ideia de produto: ranking público de
 * distribuidoras"), sem RF numerado no DRF (fora do escopo original de
 * justiça energética por município).
 *
 * Implementa as 3 decisões do ADR (docs/DECISOES.md, "Ranking público de
 * distribuidoras — exibição, ponderação e nota metodológica", 10/07/2026):
 *   1. SEGREGAÇÃO VISUAL: duas seções distintas, nunca a mesma posição
 *      ordinal — `rankingPrincipal` (os dois eixos + prazo confiável) e
 *      `distribuidorasComDadosIncompletos` (com o motivo explícito de cada
 *      uma, nunca escondido).
 *   2. IVS ponderado por população — já calculado no backend, aqui só exibido.
 *   3. Nota metodológica fixa e VISÍVEL (não em tooltip) sobre a concentração
 *      da Equatorial fora-GO refletir também vulnerabilidade social regional.
 */
export function PaginaRankingDistribuidoras() {
  const [dados, setDados] = useState<RankingDistribuidorasResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarRankingDistribuidoras()
      .then((resultado) => {
        if (ativo) setDados(resultado);
      })
      .catch((causa: unknown) => {
        if (ativo) {
          setErro(causa instanceof Error ? causa.message : 'Falha ao carregar o ranking.');
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="text-xl font-semibold text-slate-900">Ranking de distribuidoras</h1>
      <p className="mt-1 text-sm text-slate-500">
        Desempenho em conexão de MMGD (taxa de conexão e cumprimento de prazo regulatório) +
        justiça energética (IVS médio dos municípios atendidos, ponderado por população).
      </p>

      {erro && !dados && <p className="mt-6 text-sm text-red-600">{erro}</p>}
      {!dados && !erro && <p className="mt-6 text-sm text-slate-500">Carregando ranking…</p>}

      {dados && (
        <>
          {/* Metodologia — resumo curto, sempre visível (não em tooltip). */}
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p>
              <strong className="text-slate-700">Eixo técnico:</strong> {dados.metodologia.eixoTecnico}
            </p>
            <p className="mt-1">
              <strong className="text-slate-700">Eixo de justiça energética:</strong>{' '}
              {dados.metodologia.eixoJustica}
            </p>
            <p className="mt-1">
              <strong className="text-slate-700">Score composto:</strong>{' '}
              {dados.metodologia.composicaoScore}
            </p>
          </div>

          {/* Decisão 3 do ADR: nota metodológica fixa sobre Equatorial fora-GO
              / vulnerabilidade regional — visível, não em tooltip. */}
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            {dados.notaMetodologicaJustica}
          </div>

          <h2 className="mt-8 text-base font-semibold text-slate-900">
            Ranking principal
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({dados.rankingPrincipal.length} distribuidoras — os dois eixos disponíveis e prazo confiável)
            </span>
          </h2>
          <TabelaRanking
            itens={dados.rankingPrincipal}
            colunaScore="scoreComposto"
            rotuloScore="Score composto"
          />

          <h2 className="mt-10 text-base font-semibold text-slate-900">
            Dados incompletos
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({dados.distribuidorasComDadosIncompletos.length} distribuidoras — não competem pela mesma posição do ranking principal)
            </span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">{dados.notaMetodologicaDadosIncompletos}</p>
          <TabelaRanking
            itens={dados.distribuidorasComDadosIncompletos}
            colunaScore="eixoTecnico"
            rotuloScore="Eixo técnico"
            mostrarMotivos
          />
        </>
      )}
    </div>
  );
}

interface TabelaRankingProps {
  itens: DistribuidoraRanking[];
  colunaScore: 'scoreComposto' | 'eixoTecnico';
  rotuloScore: string;
  mostrarMotivos?: boolean;
}

function TabelaRanking({ itens, colunaScore, rotuloScore, mostrarMotivos }: TabelaRankingProps) {
  if (itens.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">Nenhuma distribuidora nesta seção.</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Distribuidora</th>
            <th className="px-3 py-2 font-medium">Região</th>
            <th className="px-3 py-2 font-medium text-right">Pedidos</th>
            <th className="px-3 py-2 font-medium text-right">% conectado</th>
            <th className="px-3 py-2 font-medium text-right">% no prazo</th>
            <th className="px-3 py-2 font-medium text-right">IVS ponderado</th>
            <th className="px-3 py-2 font-medium text-right">{rotuloScore}</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item, i) => (
            <tr key={item.distribuidora} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-400">{i + 1}º</td>
              <td className="px-3 py-2 font-medium text-slate-800">
                {item.distribuidora}
                {item.amostraPequena && (
                  <span
                    title="Menos de 1.000 pedidos — amostra estatisticamente menos robusta."
                    className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 align-middle text-[10px] font-semibold text-slate-500"
                  >
                    amostra pequena
                  </span>
                )}
                {mostrarMotivos && item.motivosDadosIncompletos.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs font-normal text-slate-500">
                    {item.motivosDadosIncompletos.map((motivo) => (
                      <li key={motivo}>{motivo}</li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-3 py-2 text-slate-600 capitalize">{item.regiaoPrincipal}</td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatarValor(item.nPedidos, 'inteiro')}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatarValor(item.pctConectado, 'percentual')}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {item.prazoConfiavel ? (
                  formatarValor(item.pctDentroDoPrazo, 'percentual')
                ) : (
                  <span title="Prazo regulatório (DatLim) ausente na fonte — NÃO é 0%, é dado indisponível.">
                    sem dado
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {item.ivsMedioPonderadoPorPopulacao !== null
                  ? formatarValor(item.ivsMedioPonderadoPorPopulacao, 'numero')
                  : 'sem dado'}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-amber-600">
                {formatarValor(item[colunaScore], 'numero')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
