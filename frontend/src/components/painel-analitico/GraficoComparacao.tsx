import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MunicipioComIndicadores } from '../../types/api';
import type { IndicadorComparavel } from '../../utils/indicadoresComparacao';
import { formatarValor } from '../../utils/formatadores';
import { corMunicipio } from '../../utils/paletaMunicipios';
import type { ColunaMedia } from './TabelaComparacao';

/**
 * Gráfico comparativo do Painel Analítico (RF-050). Um gráfico de barras POR
 * indicador (small multiples), não um único gráfico com todos os
 * indicadores juntos — os indicadores selecionados têm unidades muito
 * diferentes entre si (R$, %, kWh/m²·dia, kW/1.000 hab), então uma escala
 * única distorceria a leitura.
 *
 * Cor FIXA POR MUNICÍPIO, não por indicador (30/07/2026, correção de feedback
 * do usuário: "Regra de Ouro da Comparação" — quando o gráfico compara
 * territórios, a cor pertence ao território, sempre a mesma em qualquer
 * gráfico da tela. Antes, cada barra usava `indicador.cor` — todas as barras
 * de um mesmo indicador saíam da mesma cor, sem relação com a cor daquele
 * município no radar ao lado, o que confundia quem olhava as duas
 * visualizações juntas). Cada barra usa `corMunicipio(índice)` — MESMA
 * paleta e MESMO índice que GraficoRadar.tsx e TabelaComparacao.tsx, ordem
 * de `municipios` idêntica em todo lugar (vem de `resultado` em
 * PainelAnalitico.tsx). `indicador.cor` foi removido do catálogo
 * (indicadoresComparacao.ts) — não tinha mais nenhum uso depois desta troca.
 *
 * Linhas de referência (feedback do usuário): mesmas médias mostradas como
 * colunas na TabelaComparacao (`colunasMedia`), aqui como `ReferenceLine`
 * horizontal — nacional sempre, regional/estadual só quando aplicável (ver
 * PainelAnalitico.tsx, que decide quando incluir cada uma).
 *
 * DUAS CORREÇÕES de feedback do usuário (10/07/2026):
 * 1. Contraste: a paleta anterior (slate/teal/fuchsia) ficava apagada contra
 *    as barras e a grade — trocada por cores escuras e bem saturadas.
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
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-stone-200/60 bg-white/60 px-3.5 py-2.5 text-xs text-stone-600 shadow-sm backdrop-blur-md">
        <span className="font-bold text-stone-500">Municípios:</span>
        {municipios.map((municipio, indice) => (
          <span key={municipio.codigoIbge} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: corMunicipio(indice) }}
            />
            {municipio.nome} <span className="text-stone-400">{municipio.uf}</span>
          </span>
        ))}
      </div>

      {colunasMedia.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-stone-200/60 bg-white/60 px-3.5 py-2.5 text-xs text-stone-600 shadow-sm backdrop-blur-md">
          <span className="font-bold text-stone-500">Linhas de referência:</span>
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
            <div
              key={indicador.id}
              className="rounded-xl border border-stone-200/60 bg-white/60 p-4 shadow-sm backdrop-blur-md"
            >
              <p className="mb-2 text-sm font-bold text-stone-700">
                {indicador.rotulo}
                {indicador.unidade && (
                  <span className="ml-1 font-normal text-stone-400">({indicador.unidade})</span>
                )}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dados} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
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
                    cursor={{ fill: 'rgba(231, 229, 228, 0.4)' }}
                    contentStyle={{ borderRadius: '10px', border: '1px solid #e7e5e4', fontWeight: 600 }}
                    formatter={(valor) =>
                      formatarValor(typeof valor === 'number' ? valor : null, indicador.formato)
                    }
                  />
                  <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
                    {municipios.map((municipio, indice) => (
                      <Cell key={municipio.codigoIbge} fill={corMunicipio(indice)} />
                    ))}
                  </Bar>
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
