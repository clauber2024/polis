import { useMemo, useState } from 'react';
import type { MunicipioComIndicadores } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';
import type { IndicadorMapa } from '../../utils/indicadores';
import { RankingItem } from '../ranking/RankingItem';

/**
 * Painel de ranking estadual (RF-030 a RF-036, parcial):
 * - RF-030: lista SÓ municípios da UF selecionada;
 * - RF-031: ordenado do maior para o menor valor do indicador da camada ativa;
 * - RF-032: posição, nome, valor em destaque (cor da rampa do indicador),
 *   barra horizontal (proporção do maior valor da UF, via RankingItem — ver
 *   components/ranking/RankingItem.tsx, extraído em 27/07/2026 para
 *   reaproveitar em outros rankings de valor único) com marcador da mediana
 *   NACIONAL do indicador ativo, e badge "Vazio de Acesso" quando aplicável;
 * - RF-033: filtro rápido por nome DENTRO do painel (preserva a posição real
 *   no ranking — filtrar não renumera);
 * - RF-034 PARCIAL: seletor crescente/decrescente implementado; "ranking por
 *   variação no período" NÃO — a API só serve o snapshot mais recente de cada
 *   indicador (ver CLAUDE.md);
 * - RF-036: reordenação automática ao trocar a camada é consequência de tudo
 *   ser derivado por useMemo de props/estado.
 * RF-037 (bloco IPER do estado) NÃO implementado — depende do RF-080,
 * bloqueado pelo TSEE (ver ARQUITETURA.md).
 *
 * Ranking calculado NO CLIENTE a partir do GeoJSON já carregado: é ordenação
 * simples, não metodologia (diferente da classificação de vazios, que vem
 * SEMPRE do backend — aqui ela só vira badge, via codigosVazios).
 */

interface PainelRankingProps {
  municipios: MunicipioComIndicadores[];
  indicador: IndicadorMapa;
  /** Códigos classificados como Vazio de Acesso (backend) ou null se ainda não carregado. */
  codigosVazios: ReadonlySet<string> | null;
  carregandoVazios: boolean;
  aoSelecionarMunicipio: (codigoIbge: string) => void;
  /**
   * UF selecionada, controlada pela PaginaMapa — permite que o clique num
   * estado no mapa (RF-027) atualize o ranking sem duplicar estado.
   */
  ufSelecionada: string;
  /**
   * Chamado quando o usuário escolhe uma UF (recebe a sigla, ou '' para
   * limpar) — a PaginaMapa sincroniza com o destaque do mapa, o foco e o
   * fetch lazy de Vazios de Acesso.
   */
  aoEscolherUf: (uf: string) => void;
}

interface ItemRanking {
  posicao: number;
  municipio: MunicipioComIndicadores;
  valor: number;
}

/** Mediana simples — só para o marcador de referência nacional do RankingItem, não é metodologia (essa é sempre do backend, ver classificação de Vazios de Acesso). */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

export function PainelRanking({
  municipios,
  indicador,
  codigosVazios,
  carregandoVazios,
  aoSelecionarMunicipio,
  ufSelecionada,
  aoEscolherUf,
}: PainelRankingProps) {
  const uf = ufSelecionada;
  const [filtroNome, setFiltroNome] = useState('');
  const [ordem, setOrdem] = useState<'desc' | 'asc'>('desc');

  const ufs = useMemo(() => {
    const porUf = new Map<string, string>();
    for (const m of municipios) porUf.set(m.uf, m.nomeEstado);
    return [...porUf.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [municipios]);

  // Mediana NACIONAL do indicador ativo (não da UF) — calculada sobre o
  // GeoJSON já carregado por inteiro, mesma fonte de dado do ranking, só que
  // sem o filtro de UF. É um cálculo de apresentação (marcador de
  // referência no RankingItem), não uma classificação — não confundir com
  // as medianas nacionais que definem Vazio de Acesso, essas sempre vêm do
  // backend.
  const medianaNacional = useMemo(() => {
    const valores = municipios
      .map((m) => m[indicador.id])
      .filter((valor): valor is number => typeof valor === 'number');
    return mediana(valores);
  }, [municipios, indicador.id]);

  const { itens, totalSemDado, maxRanking } = useMemo(() => {
    if (!uf) return { itens: [] as ItemRanking[], totalSemDado: 0, maxRanking: 0 };

    const daUf = municipios.filter((m) => m.uf === uf);
    const comValor = daUf
      .map((m) => ({ municipio: m, valor: m[indicador.id] }))
      .filter((par): par is { municipio: MunicipioComIndicadores; valor: number } =>
        typeof par.valor === 'number',
      );

    const fator = ordem === 'desc' ? -1 : 1;
    comValor.sort((a, b) => (a.valor - b.valor) * fator);

    const valores = comValor.map((par) => par.valor);

    return {
      itens: comValor.map((par, i) => ({
        posicao: i + 1,
        municipio: par.municipio,
        valor: par.valor,
      })),
      totalSemDado: daUf.length - comValor.length,
      maxRanking: valores.length > 0 ? Math.max(...valores) : 0,
    };
  }, [municipios, uf, indicador.id, ordem]);

  // RF-033: o filtro por nome NÃO renumera — mostra a posição real no ranking.
  const itensVisiveis = useMemo(() => {
    const termo = filtroNome.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return itens;
    return itens.filter((item) =>
      item.municipio.nome.toLocaleLowerCase('pt-BR').includes(termo),
    );
  }, [itens, filtroNome]);

  const corDestaque = indicador.cores[3];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-stone-200/70 p-3">
        <div className="mb-2">
          <span className="block font-mono text-[10px] font-bold tracking-wider text-stone-500 uppercase">
            Ordenação prioritária
          </span>
          <h2 className="text-sm font-bold text-stone-900">Ranking estadual</h2>
          <p className="text-xs text-stone-500">{indicador.rotulo}</p>
        </div>

        <select
          aria-label="Estado do ranking"
          value={uf}
          onChange={(evento) => {
            // '' → "Selecione…" limpa o destaque do estado no mapa.
            aoEscolherUf(evento.target.value);
          }}
          className="mb-2 w-full rounded-lg border border-stone-200/80 bg-white/70 px-2 py-1.5 text-sm text-stone-800 shadow-sm backdrop-blur-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
        >
          <option value="">Selecione um estado…</option>
          {ufs.map(([sigla, nomeEstado]) => (
            <option key={sigla} value={sigla}>
              {nomeEstado} ({sigla})
            </option>
          ))}
        </select>

        {uf && (
          <div className="flex items-center gap-2">
            <input
              type="search"
              aria-label="Filtrar municípios do ranking por nome"
              placeholder="Filtrar por nome…"
              value={filtroNome}
              onChange={(evento) => setFiltroNome(evento.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-stone-200/80 bg-white/70 px-2 py-1 text-sm text-stone-800 shadow-sm backdrop-blur-sm outline-none placeholder:text-stone-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
            />
            <button
              type="button"
              onClick={() => setOrdem((atual) => (atual === 'desc' ? 'asc' : 'desc'))}
              title={ordem === 'desc' ? 'Maior → menor (clique para inverter)' : 'Menor → maior (clique para inverter)'}
              className="shrink-0 rounded-lg border border-stone-200/80 bg-white/70 px-2 py-1 text-sm text-stone-600 shadow-sm backdrop-blur-sm hover:bg-white/90"
            >
              {ordem === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!uf && (
          <p className="p-4 text-sm text-stone-500">
            Selecione um estado para ver o ranking dos municípios pelo indicador ativo do mapa.
          </p>
        )}

        {uf && itensVisiveis.length === 0 && (
          <p className="p-4 text-sm text-stone-500">
            {itens.length === 0
              ? 'Nenhum município deste estado tem dado para este indicador.'
              : 'Nenhum município encontrado com esse nome.'}
          </p>
        )}

        <ol>
          {itensVisiveis.map((item) => {
            const ehVazio = codigosVazios?.has(item.municipio.codigoIbge) ?? false;
            return (
              <li key={item.municipio.codigoIbge}>
                <button
                  type="button"
                  onClick={() => aoSelecionarMunicipio(item.municipio.codigoIbge)}
                  className="block w-full text-left"
                >
                  <RankingItem
                    posicao={item.posicao}
                    nomeMunicipio={item.municipio.nome}
                    valor={item.valor}
                    valorFormatado={formatarValor(item.valor, indicador.formato)}
                    unidade={indicador.unidade}
                    medianaNacional={medianaNacional}
                    maxRanking={maxRanking}
                    ehVazioDeAcesso={ehVazio}
                    cor={corDestaque}
                  />
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {uf && (
        <p className="border-t border-stone-200/70 p-2 text-center text-xs text-stone-400">
          {itens.length.toLocaleString('pt-BR')} municípios no ranking
          {totalSemDado > 0 && ` · ${totalSemDado.toLocaleString('pt-BR')} sem dado`}
          {carregandoVazios && ' · carregando badges…'}
        </p>
      )}
    </div>
  );
}
