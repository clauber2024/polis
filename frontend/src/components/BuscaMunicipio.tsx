import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { buscarMunicipiosPorNome } from '../services/municipios.service';
import type { MunicipioComIndicadores } from '../types/api';

/**
 * Campo de busca de município (RF-026 — header das telas com mapa).
 * Autocomplete com debounce sobre GET /api/municipios?nome=... (service já
 * existente, busca paginada de 10). Não é componente de mapa: só entrega o
 * município escolhido via `aoSelecionar` — quem decide voar/abrir painel é
 * quem o usa (App → navegação com ?municipio=..., consumida pela PaginaMapa).
 */

const ATRASO_DEBOUNCE_MS = 300;
const MINIMO_CARACTERES = 2;

interface BuscaMunicipioProps {
  aoSelecionar: (municipio: MunicipioComIndicadores) => void;
}

export function BuscaMunicipio({ aoSelecionar }: BuscaMunicipioProps) {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<MunicipioComIndicadores[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  // Selecionar preenche o input com o nome do município — sem isso, esse
  // próprio preenchimento re-dispararia a busca e reabriria o dropdown.
  const suprimirBuscaRef = useRef(false);

  // Busca com debounce. O flag `ativo` descarta respostas de consultas já
  // superadas (mesmo padrão anti-corrida da PaginaMapa).
  useEffect(() => {
    if (suprimirBuscaRef.current) {
      suprimirBuscaRef.current = false;
      return;
    }
    const consulta = termo.trim();
    if (consulta.length < MINIMO_CARACTERES) {
      setResultados([]);
      setAberto(false);
      setErro(null);
      setCarregando(false);
      return;
    }
    let ativo = true;
    setCarregando(true);
    const temporizador = setTimeout(() => {
      buscarMunicipiosPorNome(consulta)
        .then((resposta) => {
          if (!ativo) return;
          setResultados(resposta.resultados);
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
  }, [termo]);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  function selecionar(municipio: MunicipioComIndicadores) {
    suprimirBuscaRef.current = true;
    setTermo(`${municipio.nome} (${municipio.uf})`);
    setAberto(false);
    setResultados([]);
    setIndiceAtivo(-1);
    aoSelecionar(municipio);
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
      selecionar(resultados[indiceAtivo >= 0 ? indiceAtivo : 0]);
    } else if (evento.key === 'Escape') {
      setAberto(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-72">
      <input
        type="search"
        role="combobox"
        aria-expanded={aberto}
        aria-controls="busca-municipio-resultados"
        aria-label="Buscar município"
        placeholder="Buscar município…"
        value={termo}
        onChange={(evento) => setTermo(evento.target.value)}
        onKeyDown={aoTeclar}
        onFocus={() => {
          if (resultados.length > 0 || erro) setAberto(true);
        }}
        className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none"
      />
      {carregando && (
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">…</span>
      )}

      {aberto && (
        <ul
          id="busca-municipio-resultados"
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {erro && <li className="px-3 py-2 text-sm text-red-600">{erro}</li>}
          {!erro && resultados.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">Nenhum município encontrado.</li>
          )}
          {!erro &&
            resultados.map((municipio, indice) => (
              <li key={municipio.codigoIbge} role="option" aria-selected={indice === indiceAtivo}>
                <button
                  type="button"
                  // mousedown em vez de click: dispara antes do blur/clique-fora
                  // fechar o dropdown e descartar a seleção.
                  onMouseDown={(evento) => {
                    evento.preventDefault();
                    selecionar(municipio);
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
        </ul>
      )}
    </div>
  );
}
