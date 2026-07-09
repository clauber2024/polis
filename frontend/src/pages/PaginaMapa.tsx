import { useEffect, useMemo, useState } from 'react';
import { MapaMunicipios } from '../components/mapa/MapaMunicipios';
import { Legenda } from '../components/mapa/Legenda';
import { PainelMunicipio } from '../components/mapa/PainelMunicipio';
import { buscarGeoJsonNacional } from '../services/municipios.service';
import {
  buscarTodosVaziosDeAcesso,
  type VaziosDeAcessoCompleto,
} from '../services/vaziosDeAcesso.service';
import type { FeatureCollectionMunicipios, MunicipioComIndicadores } from '../types/api';
import { INDICADORES_MAPA, calcularQuebrasQuantis } from '../utils/indicadores';

/**
 * Mapa interativo do Atlas (RF-016/017 choropleth; RF-055/056 destaque dos
 * Vazios de Acesso). Toda a busca de dado fica aqui (via services) — o
 * componente de mapa só renderiza o que recebe.
 */
export function PaginaMapa() {
  const [dados, setDados] = useState<FeatureCollectionMunicipios | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [indicadorId, setIndicadorId] = useState(INDICADORES_MAPA[0].id);
  const indicador = INDICADORES_MAPA.find((i) => i.id === indicadorId) ?? INDICADORES_MAPA[0];

  const [destaqueLigado, setDestaqueLigado] = useState(false);
  const [vazios, setVazios] = useState<VaziosDeAcessoCompleto | null>(null);
  const [carregandoVazios, setCarregandoVazios] = useState(false);
  const [erroVazios, setErroVazios] = useState<string | null>(null);

  const [municipioSelecionado, setMunicipioSelecionado] =
    useState<MunicipioComIndicadores | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    buscarGeoJsonNacional()
      .then((geojson) => {
        if (ativo) setDados(geojson);
      })
      .catch((causa: unknown) => {
        if (ativo) setErro(causa instanceof Error ? causa.message : 'Falha ao carregar o mapa.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Busca a classificação de Vazios de Acesso na primeira vez que o destaque
  // é ligado. De propósito NO HANDLER, não em useEffect: a primeira versão
  // usava um efeito com `carregandoVazios` nas dependências, e o próprio
  // setCarregandoVazios(true) re-disparava o efeito — o cleanup marcava a
  // busca em andamento como cancelada e o resultado era descartado (spinner
  // eterno). Bug real encontrado na validação de 09/07/2026.
  function aoAlternarDestaque(ligado: boolean) {
    setDestaqueLigado(ligado);
    if (!ligado || vazios || carregandoVazios) return;
    setCarregandoVazios(true);
    setErroVazios(null);
    buscarTodosVaziosDeAcesso()
      .then(setVazios)
      .catch((causa: unknown) => {
        setErroVazios(
          causa instanceof Error ? causa.message : 'Falha ao carregar os Vazios de Acesso.',
        );
        setDestaqueLigado(false);
      })
      .finally(() => setCarregandoVazios(false));
  }

  const quebras = useMemo(() => {
    if (!dados) return [];
    const valores = dados.features
      .map((f) => f.properties[indicador.id])
      .filter((v): v is number => typeof v === 'number');
    return calcularQuebrasQuantis(valores);
  }, [dados, indicador.id]);

  const codigosDestaque = useMemo(
    () => (destaqueLigado && vazios ? vazios.municipios.map((m) => m.codigoIbge) : null),
    [destaqueLigado, vazios],
  );

  // Índice codigoIbge → município do GeoJSON original: o clique no mapa só
  // devolve o código (as properties do feature perdem os nulos na conversão
  // interna do MapLibre para tile vetorial — ver MapaMunicipios).
  const municipioPorCodigo = useMemo(
    () => new Map(dados?.features.map((f) => [f.properties.codigoIbge, f.properties]) ?? []),
    [dados],
  );

  return (
    <div className="relative flex h-full">
      <div className="relative min-w-0 flex-1">
        <MapaMunicipios
          dados={dados}
          indicador={indicador}
          quebras={quebras}
          codigosDestaque={codigosDestaque}
          aoClicarMunicipio={(codigoIbge) =>
            setMunicipioSelecionado(municipioPorCodigo.get(codigoIbge) ?? null)
          }
        />

        {/* Controles */}
        <div className="absolute top-4 left-4 w-72 rounded-lg border border-slate-200 bg-white/95 p-3 shadow">
          <label htmlFor="seletor-indicador" className="mb-1 block text-xs font-semibold text-slate-600">
            Indicador do mapa
          </label>
          <select
            id="seletor-indicador"
            value={indicador.id}
            onChange={(evento) =>
              setIndicadorId(evento.target.value as (typeof INDICADORES_MAPA)[number]['id'])
            }
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
          >
            {INDICADORES_MAPA.map((opcao) => (
              <option key={opcao.id} value={opcao.id}>
                {opcao.rotulo}
              </option>
            ))}
          </select>

          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={destaqueLigado}
              onChange={(evento) => aoAlternarDestaque(evento.target.checked)}
              className="h-4 w-4"
            />
            Destacar Vazios de Acesso
            {carregandoVazios && <span className="text-xs text-slate-400">carregando…</span>}
          </label>
          {erroVazios && <p className="mt-1 text-xs text-red-600">{erroVazios}</p>}
          {destaqueLigado && vazios && vazios.avisos.totalPrecisaReextrairMmgd > 0 && (
            <p className="mt-1 text-xs text-amber-600">
              {vazios.avisos.totalPrecisaReextrairMmgd.toLocaleString('pt-BR')} municípios fora da
              classificação (MMGD residencial pendente de re-extração — ver CLAUDE.md).
            </p>
          )}
        </div>

        {/* Legenda */}
        <div className="absolute bottom-6 left-4">
          <Legenda
            indicador={indicador}
            quebras={quebras}
            destaqueLigado={destaqueLigado && !!vazios}
            totalDestacados={vazios?.municipios.length ?? 0}
          />
        </div>

        {/* Estados de carga/erro do GeoJSON nacional */}
        {carregando && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <p className="rounded-lg bg-white px-4 py-2 text-sm text-slate-600 shadow">
              Carregando a malha municipal (~5.570 municípios)…
            </p>
          </div>
        )}
        {erro && !carregando && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <div className="rounded-lg bg-white px-4 py-3 text-sm shadow">
              <p className="text-red-600">{erro}</p>
              <p className="mt-1 text-slate-500">
                O backend está rodando? (<code>make dev</code> na raiz do projeto)
              </p>
            </div>
          </div>
        )}
      </div>

      {municipioSelecionado && (
        <PainelMunicipio
          municipio={municipioSelecionado}
          aoFechar={() => setMunicipioSelecionado(null)}
        />
      )}
    </div>
  );
}
