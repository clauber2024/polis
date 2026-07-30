import {
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
import { corMunicipio } from '../../utils/paletaMunicipios';

interface GraficoRadarProps {
  municipios: MunicipioComIndicadores[];
  indicadores: IndicadorComparavel[];
}

/**
 * RF-053 — visão multidimensional dos municípios comparados (recharts, já
 * dependência do frontend). Cada eixo é um indicador selecionado,
 * normalizado min–max DENTRO do grupo comparado (0–1): o catálogo de
 * indicadores comparáveis (indicadoresComparacao.ts) não tem min/max fixo
 * por unidade. A normalização é só de ESCALA — não inverte o sentido de
 * indicadores "negativos" (ex.: IVS, pobreza): o eixo mostra magnitude
 * bruta normalizada, e o rótulo do eixo avisa quando "maior" significa
 * pior.
 *
 * Small multiples (30/07/2026, segunda resposta do usuário à pergunta sobre
 * salvar ou eliminar o radar — substitui o teto de 4 municípios/radar único
 * sobreposto da resposta anterior): em vez de UM `<RadarChart>` com N
 * `<Radar>` empilhados (onde a área semitransparente de cada polígono
 * escondia a dos outros), agora é um GRID com um `<RadarChart>` isolado por
 * município — cada card mostra só a "assinatura" daquele território, sem
 * nenhuma sobreposição possível. Isso resolve a causa raiz do problema de
 * legibilidade (não só a estética), então o teto de 4 municípios da versão
 * anterior deixou de ser necessário — funciona bem em qualquer N até 10
 * (MAXIMO_MUNICIPIOS). Normalização continua calculada UMA VEZ sobre todo o
 * grupo (não por município) — é o que torna as "assinaturas" comparáveis
 * entre si; só a APRESENTAÇÃO virou small multiples, a matemática é a mesma
 * de antes. Paleta compartilhada com GraficoComparacao/TabelaComparacao —
 * mesma cor para o mesmo município em toda a tela.
 */
export function GraficoRadar({ municipios, indicadores }: GraficoRadarProps) {
  if (municipios.length < 2 || indicadores.length < 3) {
    return (
      <p className="text-xs text-stone-400">
        Selecione ao menos 3 indicadores para o gráfico radar fazer sentido (um eixo por
        indicador).
      </p>
    );
  }

  const dadosPorIndicador = indicadores.map((indicador) => {
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {municipios.map((municipio, indice) => {
          const cor = corMunicipio(indice);
          const dadosMunicipio = dadosPorIndicador.map((linha) => ({
            indicador: linha.indicador,
            valor: linha[municipio.codigoIbge] as number,
          }));

          return (
            <div
              key={municipio.codigoIbge}
              className="flex flex-col items-center rounded-xl border border-stone-200/60 bg-white/50 p-4 shadow-sm backdrop-blur-md transition-shadow hover:shadow-md"
            >
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-black tracking-wide text-stone-900 uppercase">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: cor }}
                />
                {municipio.nome}
                <span className="font-bold text-stone-400">— {municipio.uf}</span>
              </h3>

              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={dadosMunicipio} outerRadius="65%">
                    <PolarGrid stroke="#e7e5e4" />
                    <PolarAngleAxis
                      dataKey="indicador"
                      tick={{ fill: '#78716c', fontSize: 9, fontWeight: 700 }}
                    />
                    {/* Domínio fixo 0–1 em TODOS os radares — sem isso, cada
                        mini-gráfico escalaria sozinho e um valor baixo num
                        município pareceria visualmente tão "cheio" quanto um
                        valor alto em outro, quebrando a comparação entre
                        cards que é o objetivo inteiro dos small multiples. */}
                    <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
                    <Tooltip
                      formatter={(valor) => (typeof valor === 'number' ? valor.toFixed(2) : valor)}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #e7e5e4',
                        fontWeight: 600,
                        fontSize: '11px',
                      }}
                    />
                    <Radar
                      name={`${municipio.nome} (${municipio.uf})`}
                      dataKey="valor"
                      stroke={cor}
                      fill={cor}
                      fillOpacity={0.4}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-stone-400">
        Eixos normalizados (0–1) pelo mínimo/máximo DENTRO do grupo comparado — não é uma escala
        absoluta. "▼" indica indicador onde valor maior é pior (ex.: IVS, pobreza).
      </p>
    </div>
  );
}
