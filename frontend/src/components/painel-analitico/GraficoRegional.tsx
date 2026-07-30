import { useMemo } from 'react';
import type { VaziosDeAcessoCompleto } from '../../services/vaziosDeAcesso.service';
import type { Quadrante } from '../../types/api';
import { COR_QUADRANTE, ROTULO_FALLBACK, TODOS_QUADRANTES } from './GraficoQuadrantes';

/**
 * Agregador Regional — "Visão Executiva" do Painel Analítico (Nível 1,
 * 30/07/2026, decisão do usuário: substituir a leitura de overplotting do
 * scatter por proporção territorial inquestionável). Barras 100% empilhadas
 * por região, ordenadas pela pior proporção de Vazio de Acesso primeiro —
 * o gestor bate o olho na barra do topo e já sabe onde priorizar, sem
 * precisar escolher eixos (isso fica na aba "Visão Exploratória",
 * GraficoQuadrantes.tsx). Cor/rótulo dos quadrantes SEMPRE os mesmos do
 * scatter (import de GraficoQuadrantes.tsx — nunca duplicar a paleta).
 *
 * Sem caixa de aviso "leitura exploratória, sem validação": diferente do
 * scatter em eixos livres, isto é sempre a classificação oficial agregada
 * (irradiação × MMGD residencial per capita, medianas nacionais) — nunca um
 * cruzamento ad hoc, então não há disclaimer estatístico a fazer aqui.
 *
 * SVG próprio, sem lib de gráfico (mesma decisão de GraficoQuadrantes/
 * GraficoComparacao/GraficoRadar).
 */

const LARGURA = 720;
const ALTURA_BARRA = 34;
const ESPACO_ENTRE_BARRAS = 14;
const MARGEM = { topo: 8, direita: 8, base: 8, esquerda: 128 };

const formatoPercentual = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

interface GraficoRegionalProps {
  dados: VaziosDeAcessoCompleto;
}

interface LinhaRegional {
  regiao: string;
  totalClassificados: number;
  percentuais: Record<Quadrante, number>;
  contagens: Record<Quadrante, number>;
}

export function GraficoRegional({ dados }: GraficoRegionalProps) {
  const { linhas, rotulos } = useMemo(() => {
    const classificados = dados.municipios.filter((m) => m.quadrante !== null);

    const rotulos = { ...ROTULO_FALLBACK };
    for (const m of classificados) {
      if (m.quadrante && m.quadranteRotulo) rotulos[m.quadrante] = m.quadranteRotulo;
    }

    const porRegiao = new Map<string, typeof classificados>();
    for (const m of classificados) {
      const lista = porRegiao.get(m.regiao) ?? [];
      lista.push(m);
      porRegiao.set(m.regiao, lista);
    }

    const linhas: LinhaRegional[] = [...porRegiao.entries()].map(([regiao, municipiosRegiao]) => {
      const total = municipiosRegiao.length;
      const contagens = TODOS_QUADRANTES.reduce(
        (acc, q) => {
          acc[q] = municipiosRegiao.filter((m) => m.quadrante === q).length;
          return acc;
        },
        {} as Record<Quadrante, number>,
      );
      const percentuais = TODOS_QUADRANTES.reduce(
        (acc, q) => {
          acc[q] = total > 0 ? (contagens[q] / total) * 100 : 0;
          return acc;
        },
        {} as Record<Quadrante, number>,
      );
      return { regiao, totalClassificados: total, percentuais, contagens };
    });

    // Pior proporção de Vazio de Acesso primeiro — é a leitura que a Visão
    // Executiva existe para entregar em 5 segundos.
    linhas.sort((a, b) => b.percentuais.vazio_de_acesso - a.percentuais.vazio_de_acesso);

    return { linhas, rotulos };
  }, [dados]);

  const alturaUtil = linhas.length * ALTURA_BARRA + (linhas.length - 1) * ESPACO_ENTRE_BARRAS;
  const altura = MARGEM.topo + alturaUtil + MARGEM.base;
  const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${LARGURA} ${altura}`}
        role="img"
        aria-label="Composição regional dos quadrantes de Vazios de Acesso — barras 100% empilhadas por região, ordenadas pela maior proporção de Vazio de Acesso"
        className="w-full bg-white"
      >
        {linhas.map((linha, indice) => {
          const y = MARGEM.topo + indice * (ALTURA_BARRA + ESPACO_ENTRE_BARRAS);
          let xAcumulado = MARGEM.esquerda;
          return (
            <g key={linha.regiao}>
              <text
                x={MARGEM.esquerda - 10}
                y={y + ALTURA_BARRA / 2 + 4}
                textAnchor="end"
                fontSize={12}
                fontWeight={800}
                fill="#292524"
              >
                {linha.regiao}
              </text>
              {TODOS_QUADRANTES.map((quadrante) => {
                const percentual = linha.percentuais[quadrante];
                const largura = (percentual / 100) * larguraUtil;
                const x = xAcumulado;
                xAcumulado += largura;
                if (largura <= 0) return null;
                return (
                  <rect
                    key={quadrante}
                    x={x}
                    y={y}
                    width={largura}
                    height={ALTURA_BARRA}
                    fill={COR_QUADRANTE[quadrante]}
                  >
                    <title>
                      {`${linha.regiao} — ${rotulos[quadrante]}: ${formatoPercentual.format(percentual)}% (${linha.contagens[quadrante].toLocaleString('pt-BR')} de ${linha.totalClassificados.toLocaleString('pt-BR')} municípios classificados)`}
                    </title>
                  </rect>
                );
              })}
              {linha.percentuais.vazio_de_acesso >= 8 && (
                <text
                  x={MARGEM.esquerda + (linha.percentuais.vazio_de_acesso / 100) * larguraUtil * 0.5}
                  y={y + ALTURA_BARRA / 2 + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={800}
                  fill="#fff"
                >
                  {formatoPercentual.format(linha.percentuais.vazio_de_acesso)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-stone-100 pt-3 text-xs font-semibold text-stone-600">
        {TODOS_QUADRANTES.map((quadrante) => (
          <span key={quadrante} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COR_QUADRANTE[quadrante] }}
            />
            {rotulos[quadrante]}
          </span>
        ))}
      </div>

      <p className="text-xs text-stone-400">
        Proporção dentro de cada região, entre os municípios com classificação oficial de Vazio de
        Acesso ({classificadosTotais(linhas).toLocaleString('pt-BR')} de{' '}
        {dados.avisos.totalMunicipios.toLocaleString('pt-BR')}
        {dados.avisos.totalExcluidosSemDado > 0 &&
          ` — ${dados.avisos.totalExcluidosSemDado.toLocaleString('pt-BR')} sem classificação oficial`}
        ).
      </p>
    </div>
  );
}

function classificadosTotais(linhas: LinhaRegional[]): number {
  return linhas.reduce((soma, linha) => soma + linha.totalClassificados, 0);
}
