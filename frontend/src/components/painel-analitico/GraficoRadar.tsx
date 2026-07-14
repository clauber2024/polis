import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { MunicipioComIndicadores } from '../../types/api';
import type { IndicadorComparavel } from '../../utils/indicadoresComparacao';

const PALETA_MUNICIPIOS = [
  '#7c3aed',
  '#0f172a',
  '#d97706',
  '#0d9488',
  '#db2777',
  '#1d4ed8',
  '#15803d',
  '#b91c1c',
  '#7f1d1d',
  '#4338ca',
];

interface GraficoRadarProps {
  municipios: MunicipioComIndicadores[];
  indicadores: IndicadorComparavel[];
}

/**
 * RF-053 — visão multidimensional dos municípios comparados (recharts, já
 * dependência do frontend desde antes desta sessão — nunca tinha sido usado).
 * Cada eixo é um indicador selecionado, normalizado min–max DENTRO do grupo
 * comparado (0–1): o catálogo de indicadores comparáveis (indicadoresComparacao.ts)
 * não tem min/max fixo por unidade, diferente do que o protótipo do AI Studio
 * assumia (catálogo fictício com min/max por indicador). A normalização é só
 * de ESCALA — não inverte o sentido de indicadores "negativos" (ex.: IVS,
 * pobreza): o eixo mostra magnitude bruta normalizada, e o rótulo do eixo
 * avisa quando "maior" significa pior.
 */
export function GraficoRadar({ municipios, indicadores }: GraficoRadarProps) {
  if (municipios.length < 2 || indicadores.length < 3) {
    return (
      <p className="text-xs text-slate-400">
        Selecione ao menos 3 indicadores para o gráfico radar fazer sentido (um eixo por
        indicador).
      </p>
    );
  }

  const dados = indicadores.map((indicador) => {
    const valores = municipios
      .map((m) => m[indicador.id])
      .filter((v): v is number => typeof v === 'number');
    const minimo = valores.length > 0 ? Math.min(...valores) : 0;
    const maximo = valores.length > 0 ? Math.max(...valores) : 1;
    const amplitude = maximo - minimo;

    const ponto: Record<string, string | number> = {
      indicador: indicador.rotulo + (indicador.sentido === 'negativo' ? ' ▼' : ''),
    };
    municipios.forEach((m) => {
      const valor = m[indicador.id];
      ponto[m.codigoIbge] =
        typeof valor !== 'number' ? 0 : amplitude > 0 ? (valor - minimo) / amplitude : 1;
    });
    return ponto;
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={360}>
        <RadarChart data={dados} outerRadius="70%">
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="indicador" tick={{ fontSize: 10, fill: '#64748b' }} />
          <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
          {municipios.map((m, i) => (
            <Radar
              key={m.codigoIbge}
              name={`${m.nome} (${m.uf})`}
              dataKey={m.codigoIbge}
              stroke={PALETA_MUNICIPIOS[i % PALETA_MUNICIPIOS.length]}
              fill={PALETA_MUNICIPIOS[i % PALETA_MUNICIPIOS.length]}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          ))}
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Tooltip formatter={(valor) => (typeof valor === 'number' ? valor.toFixed(2) : valor)} />
        </RadarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[10px] text-slate-400">
        Eixos normalizados (0–1) pelo mínimo/máximo DENTRO do grupo comparado — não é uma escala
        absoluta. "▼" indica indicador onde valor maior é pior (ex.: IVS, pobreza).
      </p>
    </div>
  );
}
