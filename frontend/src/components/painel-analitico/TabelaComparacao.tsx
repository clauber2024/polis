import type { MunicipioClassificado, MunicipioComIndicadores } from '../../types/api';
import type { IndicadorComparavel } from '../../utils/indicadoresComparacao';
import { formatarValor } from '../../utils/formatadores';
import { ESTILO_QUADRANTE, ROTULO_CURTO_QUADRANTE } from '../../utils/quadrantes';
import { corMunicipio } from '../../utils/paletaMunicipios';

/**
 * Tabela do Painel Analítico (RF-050): linhas = indicadores selecionados,
 * colunas = municípios — layout "lado a lado" pedido pelo RF, e escala melhor
 * que o inverso quando poucos municípios têm muitos indicadores (caso comum
 * aqui: até 10 municípios x até 5 indicadores).
 *
 * Linha extra "Classificação (Vazios de Acesso)" (RF-055/056): mostra o
 * QUADRANTE de cada município (não um binário "é vazio ou não" como na
 * versão anterior) — feedback do usuário: o badge Sim/Não confundia "não é
 * Vazio de Acesso" (classificado em outro quadrante) com "sem dado" (excluído
 * da classificação por falta de MMGD residencial/irradiação), e ainda tinha
 * um bug real de loading eterno (ver PainelAnalitico.tsx). `classificacoes`
 * vem SEMPRE do backend (GET /api/vazios-de-acesso/classificar), nunca
 * recalculada aqui; `null` = ainda carregando; uma entrada com
 * `quadrante: null` = município genuinamente sem dado (mostra "Sem dado",
 * não "Não").
 *
 * Swatch de cor por município no cabeçalho (30/07/2026, "Regra de Ouro da
 * Comparação"): mesma paleta/índice de GraficoComparacao.tsx e
 * GraficoRadar.tsx — o quadradinho ao lado do nome deixa explícito que
 * aquela cor identifica ESTE município em qualquer gráfico da tela, sem
 * precisar abrir o radar para descobrir. A tabela em si continua com fundo
 * sólido (não glassmorphism) DE PROPÓSITO — é dado denso, tabular, em
 * potencialmente 10 colunas × N linhas, e um fundo desfocado atrás de texto
 * pequeno prejudicaria a leitura; o cartão glass que envolve a tabela
 * (PainelAnalitico.tsx) já dá a mesma linguagem visual por fora.
 */
export interface ColunaMedia {
  chave: string;
  rotulo: string;
  /** null = ainda carregando. */
  medias: Partial<Record<keyof MunicipioComIndicadores, number | null>> | null;
}

interface TabelaComparacaoProps {
  municipios: MunicipioComIndicadores[];
  indicadores: IndicadorComparavel[];
  classificacoes: Map<string, MunicipioClassificado> | null;
  carregandoClassificacao: boolean;
  colunasMedia: ColunaMedia[];
}

export function TabelaComparacao({
  municipios,
  indicadores,
  classificacoes,
  carregandoClassificacao,
  colunasMedia,
}: TabelaComparacaoProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200/70">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="bg-stone-50 text-left text-stone-600">
            <th className="sticky left-0 bg-stone-50 px-3 py-2 font-bold">Indicador</th>
            {municipios.map((municipio, indice) => (
              <th key={municipio.codigoIbge} className="px-3 py-2 font-bold whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: corMunicipio(indice) }}
                  />
                  {municipio.nome}
                  <span className="font-normal text-stone-400">{municipio.uf}</span>
                </span>
              </th>
            ))}
            {colunasMedia.map((coluna) => (
              <th
                key={coluna.chave}
                className="bg-stone-100 px-3 py-2 font-bold whitespace-nowrap text-stone-500 italic"
              >
                {coluna.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-stone-100 bg-violet-50/40">
            <th scope="row" className="sticky left-0 bg-violet-50 px-3 py-2 text-left font-semibold text-stone-700">
              Classificação (Vazios de Acesso)
            </th>
            {municipios.map((municipio) => {
              const classificacao = classificacoes?.get(municipio.codigoIbge);
              return (
                <td key={municipio.codigoIbge} className="px-3 py-2 whitespace-nowrap">
                  {classificacoes === null && carregandoClassificacao ? (
                    <span className="text-xs text-stone-400">carregando…</span>
                  ) : classificacao?.quadrante ? (
                    <span
                      title={classificacao.quadranteRotulo ?? undefined}
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${ESTILO_QUADRANTE[classificacao.quadrante]}`}
                    >
                      {ROTULO_CURTO_QUADRANTE[classificacao.quadrante]}
                    </span>
                  ) : (
                    <span
                      title="Município excluído da classificação por falta de MMGD residencial ou irradiação solar — não significa que não é Vazio de Acesso, significa que não há dado suficiente para classificar."
                      className="text-xs text-stone-400 italic"
                    >
                      Sem dado
                    </span>
                  )}
                </td>
              );
            })}
            {colunasMedia.map((coluna) => (
              <td key={coluna.chave} className="bg-stone-50 px-3 py-2 text-center text-stone-300">
                —
              </td>
            ))}
          </tr>
          {indicadores.map((indicador) => (
            <tr key={indicador.id} className="border-t border-stone-100">
              <th
                scope="row"
                className="sticky left-0 bg-white px-3 py-2 text-left font-semibold text-stone-700"
              >
                {indicador.rotulo}
                {indicador.unidade && (
                  <span className="ml-1 font-normal text-stone-400">({indicador.unidade})</span>
                )}
              </th>
              {municipios.map((municipio) => {
                const valor = municipio[indicador.id];
                return (
                  <td key={municipio.codigoIbge} className="px-3 py-2 whitespace-nowrap text-stone-800">
                    {formatarValor(typeof valor === 'number' ? valor : null, indicador.formato)}
                  </td>
                );
              })}
              {colunasMedia.map((coluna) => {
                const valor = coluna.medias?.[indicador.id];
                return (
                  <td
                    key={coluna.chave}
                    className="bg-stone-50 px-3 py-2 whitespace-nowrap text-stone-500 italic"
                  >
                    {coluna.medias === null
                      ? 'carregando…'
                      : formatarValor(typeof valor === 'number' ? valor : null, indicador.formato)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
