import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MunicipioComIndicadores } from '../../types/api';
import type { IndicadorComparavel } from '../../utils/indicadoresComparacao';
import { formatarValor } from '../../utils/formatadores';
import type { ColunaMedia } from './TabelaComparacao';

/**
 * Gráfico comparativo do Painel Analítico (RF-050). Um gráfico de barras POR
 * indicador (small multiples), não um único gráfico com todos os
 * indicadores juntos — os indicadores selecionados têm unidades muito
 * diferentes entre si (R$, %, kWh/m²·dia, kW/1.000 hab), então uma escala
 * única distorceria a leitura. Município no eixo X (rótulo curto: nome), cor
 * fixa por indicador (INDICADORES_COMPARAVEIS[].cor) para consistência com a
 * tabela ao lado.
 *
 * Linhas de referência (feedback do usuário): mesmas médias mostradas como
 * colunas na TabelaComparacao (`colunasMedia`), aqui como `ReferenceLine`
 * horizontal — nacional sempre, regional/estadual só quando aplicável (ver
 * PainelAnalitico.tsx, que decide quando incluir cada uma).
 *
 * DUAS CORREÇÕES de feedback do usuário (10/07/2026):
 * 1. Contraste: a paleta anterior (slate/teal/fuchsia) ficava apagada contra
 *    as barras e a grade — trocada por cores escuras e bem saturadas,
 *    escolhidas para não colidir com nenhuma cor de indicador
 *    (INDICADORES_COMPARAVEIS: azul, verde, vermelho, vermelho-escuro, âmbar).
 * 2. Sobreposição: quando as médias são parecidas, as linhas ficam próximas
 *    E os rótulos inline (`label` do ReferenceLine) colidiam entre si. Em vez
 *    de tentar empilhar rótulos (que colidem de novo se as 3 médias forem
 *    parecidas), a legenda virou um bloco ÚNICO acima da grade de gráficos
 *    (compartilhado por todos os indicadores, já que as cores são as
 *    mesmas em todo lugar) — as linhas em si não têm mais rótulo inline.
 */
const ESTILO_MEDIA: Record<string, { cor: string; dash: string }> = {
  nacional: { cor: '#0f172a', dash: '2 3' }, // slate-900, quase preto
  regiao: { cor: '#9333ea', dash: '8 4' }, // purple-600
  uf: { cor: '#db2777', dash: '1 4' }, // pink-600, pontilhado
};

interface GraficoComparacaoProps {
  municipios: MunicipioComIndicadores[];
  indicadores: IndicadorComparavel[];
  colunasMedia: ColunaMedia[];
}

export function GraficoComparacao({ municipios, indicadores, colunasMedia }: GraficoComparacaoProps) {
  return (
    <div>
      {colunasMedia.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-500">Linhas de referência:</span>
          {colunasMedia.map((coluna) => {
            const estilo = ESTILO_MEDIA[coluna.chave] ?? { cor: '#94a3b8', dash: '3 3' };
            return (
              <span key={coluna.chave} className="flex items-center gap-1.5">
                <svg width="20" height="8" aria-hidden="true">
                  <line
                    x1="0"
                    y1="4"
                    x2="20"
                    y2="4"
                    stroke={estilo.cor}
                    strokeWidth={2}
                    strokeDasharray={estilo.dash}
                  />
                </svg>
                {coluna.rotulo}
              </span>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {indicadores.map((indicador) => {
          const dados = municipios.map((municipio) => {
            const valor = municipio[indicador.id];
            return {
              nome: municipio.nome,
              valor: typeof valor === 'number' ? valor : null,
            };
          });

          return (
            <div key={indicador.id} className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-700">
                {indicador.rotulo}
                {indicador.unidade && (
                  <span className="ml-1 font-normal text-slate-400">({indicador.unidade})</span>
                )}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dados} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="nome"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(valor) =>
                      formatarValor(typeof valor === 'number' ? valor : null, indicador.formato)
                    }
                  />
                  <Bar dataKey="valor" fill={indicador.cor} radius={[3, 3, 0, 0]} />
                  {colunasMedia.map((coluna) => {
                    const valor = coluna.medias?.[indicador.id];
                    if (typeof valor !== 'number') return null;
                    const estilo = ESTILO_MEDIA[coluna.chave] ?? { cor: '#94a3b8', dash: '3 3' };
                    return (
                      <ReferenceLine
                        key={coluna.chave}
                        y={valor}
                        stroke={estilo.cor}
                        strokeWidth={2}
                        strokeDasharray={estilo.dash}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}
