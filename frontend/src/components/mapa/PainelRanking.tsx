import { useMemo, useState } from 'react';
import type { MunicipioComIndicadores } from '../../types/api';
import { formatarValor } from '../../utils/formatadores';
import type { IndicadorMapa } from '../../utils/indicadores';

/**
 * Painel de ranking estadual (RF-030 a RF-036, parcial):
 * - RF-030: lista SÓ municípios da UF selecionada;
 * - RF-031: ordenado do maior para o menor valor do indicador da camada ativa;
 * - RF-032: posição, nome, valor em destaque (cor da rampa do indicador),
 *   barra horizontal (normalizada min–max dentro da UF) e badge "Vazio de
 *   Acesso" quando aplicável;
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
   * Chamado quando o usuário escolhe uma UF (recebe a sigla) — a PaginaMapa
   * usa isso para (1) disparar o fetch lazy da classificação de Vazios
   * (badges RF-032; antes o gatilho era "abrir o painel", que não existe mais
   * com a sidebar em abas) e (2) enquadrar o estado no mapa (foco por UF,
   * 14/07/2026).
   */
  aoEscolherUf?: (uf: string) => void;
}

interface ItemRanking {
  posicao: number;
  municipio: MunicipioComIndicadores;
  valor: number;
  /** 0–1, normalizado min–max dentro da UF (largura da barra, RF-032). */
  proporcao: number;
}

export function PainelRanking({
  municipios,
  indicador,
  codigosVazios,
  carregandoVazios,
  aoSelecionarMunicipio,
  aoEscolherUf,
}: PainelRankingProps) {
  const [uf, setUf] = useState('');
  const [filtroNome, setFiltroNome] = useState('');
  const [ordem, setOrdem] = useState<'desc' | 'asc'>('desc');

  const ufs = useMemo(() => {
    const porUf = new Map<string, string>();
    for (const m of municipios) porUf.set(m.uf, m.nomeEstado);
    return [...porUf.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [municipios]);

  const { itens, totalSemDado } = useMemo(() => {
    if (!uf) return { itens: [] as ItemRanking[], totalSemDado: 0 };

    const daUf = municipios.filter((m) => m.uf === uf);
    const comValor = daUf
      .map((m) => ({ municipio: m, valor: m[indicador.id] }))
      .filter((par): par is { municipio: MunicipioComIndicadores; valor: number } =>
        typeof par.valor === 'number',
      );

    const fator = ordem === 'desc' ? -1 : 1;
    comValor.sort((a, b) => (a.valor - b.valor) * fator);

    const valores = comValor.map((par) => par.valor);
    const minimo = Math.min(...valores);
    const maximo = Math.max(...valores);
    const amplitude = maximo - minimo;

    return {
      itens: comValor.map((par, i) => ({
        posicao: i + 1,
        municipio: par.municipio,
        valor: par.valor,
        proporcao: amplitude > 0 ? (par.valor - minimo) / amplitude : 1,
      })),
      totalSemDado: daUf.length - comValor.length,
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
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-100 bg-slate-50 p-3">
        <div className="mb-2">
          <span className="block font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Ordenação Prioritária
          </span>
          <h2 className="text-sm font-semibold text-slate-900">Ranking estadual</h2>
          <p className="text-xs text-slate-500">{indicador.rotulo}</p>
        </div>

        <select
          aria-label="Estado do ranking"
          value={uf}
          onChange={(evento) => {
            setUf(evento.target.value);
            // Chamado também com '' (voltar para "Selecione…") — a página usa
            // isso para LIMPAR o destaque do estado no mapa.
            aoEscolherUf?.(evento.target.value);
          }}
          className="mb-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
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
              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setOrdem((atual) => (atual === 'desc' ? 'asc' : 'desc'))}
              title={ordem === 'desc' ? 'Maior → menor (clique para inverter)' : 'Menor → maior (clique para inverter)'}
              className="shrink-0 rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            >
              {ordem === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!uf && (
          <p className="p-4 text-sm text-slate-500">
            Selecione um estado para ver o ranking dos municípios pelo indicador ativo do mapa.
          </p>
        )}

        {uf && itensVisiveis.length === 0 && (
          <p className="p-4 text-sm text-slate-500">
            {itens.length === 0
              ? 'Nenhum município deste estado tem dado para este indicador.'
              : 'Nenhum município encontrado com esse nome.'}
          </p>
        )}

        <ol>
          {itensVisiveis.map((item) => {
            const ehVazio = codigosVazios?.has(item.municipio.codigoIbge) ?? false;
            return (
              <li key={item.municipio.codigoIbge} className="px-2 py-1">
                <button
                  type="button"
                  onClick={() => aoSelecionarMunicipio(item.municipio.codigoIbge)}
                  className={`block w-full rounded-lg border px-2.5 py-2 text-left transition-all ${
                    ehVazio
                      ? 'border-violet-200 bg-violet-50/60 hover:bg-violet-50'
                      : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="w-8 shrink-0 text-right font-mono font-semibold text-slate-400">
                      {item.posicao}º
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-800">
                      {item.municipio.nome}
                    </span>
                    <span
                      className="shrink-0 font-mono font-bold whitespace-nowrap"
                      style={{ color: corDestaque }}
                    >
                      {formatarValor(item.valor, indicador.formato)}
                    </span>
                  </div>
                  <div className="mt-1.5 ml-10 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(2, item.proporcao * 100)}%`,
                        backgroundColor: corDestaque,
                      }}
                    />
                  </div>
                  {ehVazio && (
                    <span className="mt-1.5 ml-10 inline-block rounded-sm bg-violet-100 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide text-violet-700 uppercase">
                      Vazio de Acesso
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {uf && (
        <p className="border-t border-slate-200 p-2 text-center text-xs text-slate-400">
          {itens.length.toLocaleString('pt-BR')} municípios no ranking
          {totalSemDado > 0 && ` · ${totalSemDado.toLocaleString('pt-BR')} sem dado`}
          {carregandoVazios && ' · carregando badges…'}
        </p>
      )}
    </div>
  );
}
