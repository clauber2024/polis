import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buscarMunicipios } from '../../services/municipios.service';
import type { MunicipioComIndicadores } from '../../types/api';
import { ESTADOS_BRASIL, REGIOES_BRASIL } from '../../utils/estados';

/**
 * Seletor multi-município do Painel Analítico (RF-049/050: "seleção de dois
 * ou mais municípios"). Mesmo padrão de busca com debounce do
 * BuscaMunicipio.tsx (header), mas aqui a seleção ACUMULA em chips em vez de
 * navegar — motivo de ser um componente separado, não uma variante da busca
 * do header.
 *
 * Filtros de Região/Estado (feedback do usuário): permitem NAVEGAR os
 * municípios sem precisar já saber o nome — escolher Região e/ou Estado já
 * lista municípios daquele recorte; o campo de nome (opcional aqui, ao
 * contrário do header) refina dentro do recorte escolhido. Escolher uma
 * Região filtra as opções do select de Estado (não o contrário).
 */

const ATRASO_DEBOUNCE_MS = 300;
const MINIMO_CARACTERES = 2;
const RESULTADOS_POR_BUSCA = 30;
export const MINIMO_MUNICIPIOS = 2;
export const MAXIMO_MUNICIPIOS = 10;

interface SeletorMunicipiosProps {
  selecionados: MunicipioComIndicadores[];
  aoMudarSelecionados: (municipios: MunicipioComIndicadores[]) => void;
}

export function SeletorMunicipios({ selecionados, aoMudarSelecionados }: SeletorMunicipiosProps) {
  const [termo, setTermo] = useState('');
  const [regiaoFiltro, setRegiaoFiltro] = useState('');
  const [ufFiltro, setUfFiltro] = useState('');
  const [resultados, setResultados] = useState<MunicipioComIndicadores[]>([]);
  const [totalResultados, setTotalResultados] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const codigosSelecionados = new Set(selecionados.map((m) => m.codigoIbge));
  const atingiuMaximo = selecionados.length >= MAXIMO_MUNICIPIOS;

  // Select de Estado só mostra UFs da Região escolhida (se houver uma).
  const estadosDisponiveis = useMemo(
    () => (regiaoFiltro ? ESTADOS_BRASIL.filter((e) => e.regiao === regiaoFiltro) : ESTADOS_BRASIL),
    [regiaoFiltro],
  );

  function aoMudarRegiao(novaRegiao: string) {
    setRegiaoFiltro(novaRegiao);
    // Se o estado atual não pertence à nova região, limpa — evita filtro
    // impossível (ex.: Região=Sul + Estado=PE, que nunca bate nenhum município).
    if (ufFiltro && !ESTADOS_BRASIL.some((e) => e.uf === ufFiltro && e.regiao === novaRegiao)) {
      setUfFiltro('');
    }
  }

  useEffect(() => {
    const consulta = termo.trim();
    const temFiltroGeografico = Boolean(regiaoFiltro || ufFiltro);
    if (consulta.length < MINIMO_CARACTERES && !temFiltroGeografico) {
      setResultados([]);
      setTotalResultados(0);
      setAberto(false);
      setErro(null);
      setCarregando(false);
      return;
    }
    let ativo = true;
    setCarregando(true);
    const temporizador = setTimeout(() => {
      buscarMunicipios({
        nome: consulta.length >= MINIMO_CARACTERES ? consulta : undefined,
        regiao: regiaoFiltro || undefined,
        uf: ufFiltro || undefined,
        porPagina: RESULTADOS_POR_BUSCA,
      })
        .then((resposta) => {
          if (!ativo) return;
          setResultados(resposta.resultados);
          setTotalResultados(resposta.paginacao.totalResultados);
          setIndiceAtivo(-1);
          setErro(null);
          setAberto(true);
        })
        .catch((causa: unknown) => {
          if (!ativo) return;
          setErro(causa instanceof Error ? causa.message : 'Falha na busca de municípios.');
          setResultados([]);
          setAberto(true);
        })
        .finally(() => {
          if (ativo) setCarregando(false);
        });
    }, ATRASO_DEBOUNCE_MS);
    return () => {
      ativo = false;
      clearTimeout(temporizador);
    };
  }, [termo, regiaoFiltro, ufFiltro]);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  function adicionar(municipio: MunicipioComIndicadores) {
    if (codigosSelecionados.has(municipio.codigoIbge) || atingiuMaximo) return;
    aoMudarSelecionados([...selecionados, municipio]);
    setTermo('');
    setAberto(false);
    setResultados([]);
    setIndiceAtivo(-1);
  }

  function remover(codigoIbge: string) {
    aoMudarSelecionados(selecionados.filter((m) => m.codigoIbge !== codigoIbge));
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (!aberto || resultados.length === 0) {
      if (evento.key === 'Escape') setAberto(false);
      return;
    }
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setIndiceAtivo((atual) => (atual + 1) % resultados.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setIndiceAtivo((atual) => (atual - 1 + resultados.length) % resultados.length);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      adicionar(resultados[indiceAtivo >= 0 ? indiceAtivo : 0]);
    } else if (evento.key === 'Escape') {
      setAberto(false);
    }
  }

  // Resultados já selecionados ficam visíveis na lista (marcados), mas não
  // clicáveis de novo — evita duplicar e deixa claro por que sumiram do
  // "adicionável".
  const resultadosFiltrados = resultados.filter((m) => !codigosSelecionados.has(m.codigoIbge));

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {selecionados.map((municipio) => (
          <span
            key={municipio.codigoIbge}
            className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900"
          >
            {municipio.nome} <span className="text-xs text-amber-700">{municipio.uf}</span>
            <button
              type="button"
              aria-label={`Remover ${municipio.nome}`}
              onClick={() => remover(municipio.codigoIbge)}
              className="ml-1 text-amber-700 hover:text-amber-950"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <select
          aria-label="Filtrar por região"
          value={regiaoFiltro}
          disabled={atingiuMaximo}
          onChange={(evento) => aoMudarRegiao(evento.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="">Todas as regiões</option>
          {REGIOES_BRASIL.map((regiao) => (
            <option key={regiao} value={regiao}>
              {regiao}
            </option>
          ))}
        </select>

        <select
          aria-label="Filtrar por estado"
          value={ufFiltro}
          disabled={atingiuMaximo}
          onChange={(evento) => setUfFiltro(evento.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="">Todos os estados</option>
          {estadosDisponiveis.map((estado) => (
            <option key={estado.uf} value={estado.uf}>
              {estado.nome} ({estado.uf})
            </option>
          ))}
        </select>
      </div>

      <div ref={containerRef} className="relative mt-2 w-full max-w-sm">
        <input
          type="search"
          role="combobox"
          aria-expanded={aberto}
          aria-controls="seletor-municipios-resultados"
          aria-label="Adicionar município à comparação"
          placeholder={
            atingiuMaximo
              ? `Máximo de ${MAXIMO_MUNICIPIOS} municípios`
              : 'Refinar por nome (opcional)…'
          }
          value={termo}
          disabled={atingiuMaximo}
          onChange={(evento) => setTermo(evento.target.value)}
          onKeyDown={aoTeclar}
          onFocus={() => {
            if (resultadosFiltrados.length > 0 || erro) setAberto(true);
          }}
          className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
        />
        {carregando && (
          <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">…</span>
        )}

        {aberto && (
          <ul
            id="seletor-municipios-resultados"
            role="listbox"
            className="absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {erro && <li className="px-3 py-2 text-sm text-red-600">{erro}</li>}
            {!erro && resultadosFiltrados.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">Nenhum município encontrado.</li>
            )}
            {!erro &&
              resultadosFiltrados.map((municipio, indice) => (
                <li key={municipio.codigoIbge} role="option" aria-selected={indice === indiceAtivo}>
                  <button
                    type="button"
                    onMouseDown={(evento) => {
                      evento.preventDefault();
                      adicionar(municipio);
                    }}
                    onMouseEnter={() => setIndiceAtivo(indice)}
                    className={`block w-full px-3 py-1.5 text-left text-sm ${
                      indice === indiceAtivo ? 'bg-amber-50 text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    {municipio.nome}
                    <span className="ml-1 text-xs text-slate-400">
                      {municipio.uf} · {municipio.regiao}
                    </span>
                  </button>
                </li>
              ))}
            {!erro && totalResultados > resultados.length && (
              <li className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
                Mostrando {resultados.length} de {totalResultados.toLocaleString('pt-BR')} — refine
                com um nome ou estado para ver mais opções.
              </li>
            )}
          </ul>
        )}
      </div>

      {selecionados.length > 0 && selecionados.length < MINIMO_MUNICIPIOS && (
        <p className="mt-1 text-xs text-slate-500">
          Selecione pelo menos {MINIMO_MUNICIPIOS} municípios para comparar.
        </p>
      )}
    </div>
  );
}
