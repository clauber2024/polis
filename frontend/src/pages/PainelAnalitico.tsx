import { useEffect, useMemo, useState } from 'react';
import {
  MINIMO_MUNICIPIOS,
  SeletorMunicipios,
} from '../components/painel-analitico/SeletorMunicipios';
import { TabelaComparacao, type ColunaMedia } from '../components/painel-analitico/TabelaComparacao';
import { GraficoComparacao } from '../components/painel-analitico/GraficoComparacao';
import { GraficoRadar } from '../components/painel-analitico/GraficoRadar';
import { DiagnosticoComparacao } from '../components/painel-analitico/DiagnosticoComparacao';
import {
  compararMunicipios,
  exportarComparacao,
  buscarMediasMunicipios,
} from '../services/comparacao.service';
import {
  buscarClassificacaoNacionalCompleta,
  classificarMunicipios,
  type VaziosDeAcessoCompleto,
} from '../services/vaziosDeAcesso.service';
import { GraficoQuadrantes } from '../components/painel-analitico/GraficoQuadrantes';
import type {
  MediasMunicipios,
  MunicipioClassificado,
  MunicipioComIndicadores,
} from '../types/api';
import { INDICADORES_COMPARAVEIS } from '../utils/indicadoresComparacao';
import { gerarDiagnosticos } from '../utils/diagnosticosComparacao';

/**
 * Painel Analítico / Cruzamento de Variáveis (RF-049 a RF-053).
 *
 * Escopo: seleção de indicadores (RF-049), comparação lado a lado com
 * tabela + gráfico (RF-050), exportação CSV/XLSX (RF-052), leitura analítica
 * automática por regras determinísticas (RF-051, 12/07/2026 — ver
 * utils/diagnosticosComparacao.ts) e visão multidimensional em radar
 * (RF-053, mesmo dia — ver components/painel-analitico/GraficoRadar.tsx).
 * RF-053 "série temporal" segue fora de escopo — o backend só serve o
 * snapshot mais recente de cada indicador (mesma limitação já documentada
 * para RF-034/ranking por variação).
 */
export function PainelAnalitico() {
  const [municipios, setMunicipios] = useState<MunicipioComIndicadores[]>([]);
  const [indicadoresIds, setIndicadoresIds] = useState<Set<string>>(
    () => new Set(INDICADORES_COMPARAVEIS.map((i) => i.id)),
  );

  const [resultado, setResultado] = useState<MunicipioComIndicadores[]>([]);
  const [naoEncontrados, setNaoEncontrados] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'csv' | 'xlsx' | null>(null);
  const [erroExportacao, setErroExportacao] = useState<string | null>(null);

  // Classificação de Vazios de Acesso (RF-055/056) dos municípios comparados
  // — busca por CÓDIGO ESPECÍFICO (GET /api/vazios-de-acesso/classificar),
  // não mais o Set binário "é vazio ou não" que existia antes (esse Set só
  // continha o quadrante "vazio_de_acesso", então um município fora dele
  // podia ser "outro quadrante" OU "sem dado" e a tela não distinguia os
  // dois — feedback do usuário). Efeito chaveado por codigos+podeComparar
  // (MESMO padrão do efeito de compararMunicipios acima) — de propósito SEM
  // carregandoClassificacao nas deps: colocar o próprio estado de loading que
  // o efeito seta como dependência dele mesmo já causou um bug real de
  // "loading eterno" aqui (o cleanup cancelava o fetch em andamento antes de
  // ele terminar) — mesmo tipo de bug já documentado no CLAUDE.md para
  // PaginaMapa/garantirVaziosCarregados.
  const [classificacoes, setClassificacoes] = useState<Map<string, MunicipioClassificado> | null>(
    null,
  );
  const [carregandoClassificacao, setCarregandoClassificacao] = useState(false);
  const [erroClassificacao, setErroClassificacao] = useState<string | null>(null);

  // Médias de referência (feedback do usuário): nacional sempre; regional e
  // estadual só quando TODOS os municípios comparados compartilham a mesma
  // região/UF — abaixo (regiaoComum/ufComum) derivado do resultado já
  // comparado, não da seleção bruta (nomes/UF confiáveis só depois do
  // backend confirmar os códigos).
  const [mediasNacionais, setMediasNacionais] = useState<MediasMunicipios | null>(null);
  const [mediasRegionais, setMediasRegionais] = useState<MediasMunicipios | null>(null);
  const [mediasEstaduais, setMediasEstaduais] = useState<MediasMunicipios | null>(null);

  const indicadoresSelecionados = INDICADORES_COMPARAVEIS.filter((i) =>
    indicadoresIds.has(i.id),
  );
  const codigos = municipios.map((m) => m.codigoIbge);
  const podeComparar = municipios.length >= MINIMO_MUNICIPIOS;

  // Derivado do RESULTADO da comparação (não da seleção bruta) — regiao/uf
  // confirmados pelo backend. null quando não há resultado ainda ou quando
  // os municípios comparados não compartilham a mesma região/UF.
  const regiaoComum =
    resultado.length > 0 && resultado.every((m) => m.regiao === resultado[0].regiao)
      ? resultado[0].regiao
      : null;
  const ufComum =
    resultado.length > 0 && resultado.every((m) => m.uf === resultado[0].uf)
      ? resultado[0].uf
      : null;

  useEffect(() => {
    if (!podeComparar) {
      setResultado([]);
      setNaoEncontrados([]);
      return;
    }
    let ativo = true;
    setCarregando(true);
    setErro(null);
    compararMunicipios(codigos)
      .then((resposta) => {
        if (!ativo) return;
        setResultado(resposta.resultados);
        setNaoEncontrados(resposta.codigosNaoEncontrados);
      })
      .catch((causa: unknown) => {
        if (!ativo) return;
        setErro(causa instanceof Error ? causa.message : 'Falha ao comparar municípios.');
        setResultado([]);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
    // codigos é derivado de municipios a cada render — comparar pelo conteúdo
    // (join) evita refetch por causa de uma nova referência de array idêntica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigos.join(','), podeComparar]);

  useEffect(() => {
    if (!podeComparar) {
      setClassificacoes(null);
      return;
    }
    let ativo = true;
    setCarregandoClassificacao(true);
    setErroClassificacao(null);
    classificarMunicipios(codigos)
      .then((resposta) => {
        if (!ativo) return;
        setClassificacoes(new Map(resposta.resultados.map((m) => [m.codigoIbge, m])));
      })
      .catch((causa: unknown) => {
        if (!ativo) return;
        setErroClassificacao(
          causa instanceof Error ? causa.message : 'Falha ao carregar classificação de Vazios de Acesso.',
        );
        setClassificacoes(null);
      })
      .finally(() => {
        if (ativo) setCarregandoClassificacao(false);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigos.join(','), podeComparar]);

  // Média nacional: carregada uma única vez (não depende da seleção).
  useEffect(() => {
    let ativo = true;
    buscarMediasMunicipios()
      .then((resposta) => {
        if (ativo) setMediasNacionais(resposta);
      })
      .catch(() => {
        // Falha aqui não impede a comparação em si — a coluna nacional
        // simplesmente não aparece (sem erro bloqueante na tela).
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Média regional: só busca quando os municípios comparados compartilham a
  // mesma região; refaz a busca se a região comum mudar.
  useEffect(() => {
    if (!regiaoComum) {
      setMediasRegionais(null);
      return;
    }
    let ativo = true;
    buscarMediasMunicipios({ regiao: regiaoComum })
      .then((resposta) => {
        if (ativo) setMediasRegionais(resposta);
      })
      .catch(() => {
        if (ativo) setMediasRegionais(null);
      });
    return () => {
      ativo = false;
    };
  }, [regiaoComum]);

  // Média estadual: mesma lógica, chaveada pela UF comum.
  useEffect(() => {
    if (!ufComum) {
      setMediasEstaduais(null);
      return;
    }
    let ativo = true;
    buscarMediasMunicipios({ uf: ufComum })
      .then((resposta) => {
        if (ativo) setMediasEstaduais(resposta);
      })
      .catch(() => {
        if (ativo) setMediasEstaduais(null);
      });
    return () => {
      ativo = false;
    };
  }, [ufComum]);

  // Feedback do usuário: "preciso de uma solução, talvez um filtro" para
  // municípios sem dado de Vazio de Acesso. Filtro PREVENTIVO (no seletor,
  // antes de comparar) exigiria classificar os ~5.570 municípios só para
  // filtrar o autocomplete — caro demais para o benefício. Em vez disso,
  // ação CORRETIVA aqui: assim que a classificação chega e revela municípios
  // sem dado, oferece um botão para removê-los da comparação com 1 clique.
  const codigosSemClassificacao = resultado
    .filter((m) => classificacoes?.get(m.codigoIbge)?.quadrante == null)
    .map((m) => m.codigoIbge);
  const temSemClassificacao =
    classificacoes !== null && !carregandoClassificacao && codigosSemClassificacao.length > 0;

  function removerSemClassificacao() {
    setMunicipios((atuais) => atuais.filter((m) => !codigosSemClassificacao.includes(m.codigoIbge)));
  }

  // RF-051: recalcula só quando resultado/indicadores/classificacoes mudam —
  // a função em si é pura (utils/diagnosticosComparacao.ts), sem fetch.
  const diagnostico = useMemo(
    () => gerarDiagnosticos(resultado, indicadoresSelecionados, classificacoes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resultado, indicadoresIds, classificacoes],
  );

  const colunasMedia: ColunaMedia[] = [
    { chave: 'nacional', rotulo: 'Média Nacional', medias: mediasNacionais?.medias ?? null },
    ...(regiaoComum
      ? [
          {
            chave: 'regiao',
            rotulo: `Média ${regiaoComum}`,
            medias: mediasRegionais?.medias ?? null,
          },
        ]
      : []),
    ...(ufComum
      ? [{ chave: 'uf', rotulo: `Média ${ufComum}`, medias: mediasEstaduais?.medias ?? null }]
      : []),
  ];

  function aoAlternarIndicador(id: string) {
    setIndicadoresIds((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) {
        // Sempre deixar pelo menos 1 indicador selecionado — tabela/gráfico
        // vazios não comunicam nada.
        if (novo.size > 1) novo.delete(id);
      } else {
        novo.add(id);
      }
      return novo;
    });
  }

  // Scatter nacional de quadrantes (14/07/2026) — LAZY por botão, nunca no
  // carregamento da página: é a maior rajada de requisições do frontend
  // (~28 páginas do endpoint de classificação). Mesmo padrão de handler (não
  // useEffect com loading nas deps) já usado em garantirVaziosCarregados.
  const [quadrantesNacionais, setQuadrantesNacionais] = useState<VaziosDeAcessoCompleto | null>(
    null,
  );
  const [carregandoQuadrantes, setCarregandoQuadrantes] = useState(false);
  const [erroQuadrantes, setErroQuadrantes] = useState<string | null>(null);

  function carregarQuadrantesNacionais() {
    if (quadrantesNacionais || carregandoQuadrantes) return;
    setCarregandoQuadrantes(true);
    setErroQuadrantes(null);
    buscarClassificacaoNacionalCompleta()
      .then(setQuadrantesNacionais)
      .catch((causa: unknown) => {
        setErroQuadrantes(
          causa instanceof Error ? causa.message : 'Falha ao carregar a classificação nacional.',
        );
      })
      .finally(() => setCarregandoQuadrantes(false));
  }

  async function aoExportar(formato: 'csv' | 'xlsx') {
    setExportando(formato);
    setErroExportacao(null);
    try {
      await exportarComparacao(codigos, formato);
    } catch (causa) {
      setErroExportacao(causa instanceof Error ? causa.message : 'Falha ao exportar.');
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 font-sans">
      <div className="rounded border border-slate-200 bg-white p-6 shadow-2xs">
        <span className="mb-1 inline-flex items-center gap-1.5 rounded bg-violet-50 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-violet-700 uppercase">
          Análise Científica Multidimensional
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Painel Analítico</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cruzamento de Variáveis: compare 2 a 10 municípios pelos indicadores do Atlas.
        </p>
      </div>

      <section className="mt-5">
        <h2 className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Municípios
        </h2>
        <div className="mt-2">
          <SeletorMunicipios selecionados={municipios} aoMudarSelecionados={setMunicipios} />
        </div>
      </section>

      <section className="mt-5">
        <h2 className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Indicadores
        </h2>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {INDICADORES_COMPARAVEIS.map((indicador) => (
            <label key={indicador.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={indicadoresIds.has(indicador.id)}
                onChange={() => aoAlternarIndicador(indicador.id)}
                className="h-4 w-4"
              />
              {indicador.rotulo}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Índice de Pobreza Energética Regional e Tarifa Social não aparecem aqui: ambos dependem
          do TSEE (Beneficiários da CDE/ANEEL), bloqueado até existir dado de jan/2026 em diante —
          ver ARQUITETURA.md.
        </p>
      </section>

      {!podeComparar && (
        <p className="mt-6 text-sm text-slate-500">
          Selecione pelo menos {MINIMO_MUNICIPIOS} municípios acima para ver a comparação.
        </p>
      )}

      {podeComparar && carregando && (
        <p className="mt-6 text-sm text-slate-500">Comparando…</p>
      )}

      {podeComparar && erro && !carregando && (
        <p className="mt-6 text-sm text-red-600">{erro}</p>
      )}

      {podeComparar && !carregando && !erro && resultado.length > 0 && (
        <>
          {naoEncontrados.length > 0 && (
            <p className="mt-4 text-xs text-amber-600">
              {naoEncontrados.length} código(s) IBGE não encontrado(s): {naoEncontrados.join(', ')}.
            </p>
          )}

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Tabela comparativa
                </h2>
                <p className="text-xs text-slate-400">
                  Colunas em itálico são médias de referência — nacional sempre; a regional e a
                  estadual só aparecem quando todos os municípios comparados são da mesma região ou
                  do mesmo estado, respectivamente.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => aoExportar('csv')}
                  disabled={exportando !== null}
                  className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {exportando === 'csv' ? 'Exportando…' : 'Exportar CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => aoExportar('xlsx')}
                  disabled={exportando !== null}
                  className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {exportando === 'xlsx' ? 'Exportando…' : 'Exportar XLSX'}
                </button>
              </div>
            </div>
            {erroExportacao && <p className="mt-1 text-xs text-red-600">{erroExportacao}</p>}
            {erroClassificacao && (
              <p className="mt-1 text-xs text-amber-600">
                Classificação de Vazios de Acesso indisponível: {erroClassificacao}
              </p>
            )}
            {temSemClassificacao && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>
                  {codigosSemClassificacao.length} município(s) selecionado(s) não têm dado
                  suficiente (MMGD residencial ou irradiação) para classificação de Vazio de Acesso.
                </span>
                <button
                  type="button"
                  onClick={removerSemClassificacao}
                  className="rounded border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800 hover:bg-amber-100"
                >
                  Remover da comparação
                </button>
              </div>
            )}
            <div className="mt-2">
              <TabelaComparacao
                municipios={resultado}
                indicadores={indicadoresSelecionados}
                classificacoes={classificacoes}
                carregandoClassificacao={carregandoClassificacao}
                colunasMedia={colunasMedia}
              />
            </div>
          </section>

          <section className="mt-6">
            <h2 className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Gráfico comparativo
            </h2>
            <div className="mt-2">
              <GraficoComparacao
                municipios={resultado}
                indicadores={indicadoresSelecionados}
                colunasMedia={colunasMedia}
              />
            </div>
          </section>

          <section className="mt-6 rounded border border-slate-200 bg-white p-6 shadow-2xs">
            <h2 className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Visão multidimensional (radar)
            </h2>
            <div className="mt-3">
              <GraficoRadar municipios={resultado} indicadores={indicadoresSelecionados} />
            </div>
          </section>

          <DiagnosticoComparacao diagnostico={diagnostico} />
        </>
      )}

      {/* Scatter nacional de quadrantes — independente da comparação acima
          (visão do país inteiro, não dos municípios selecionados). */}
      <section className="mt-8 rounded border border-slate-200 bg-white p-6 shadow-2xs">
        <h2 className="font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Quadrantes nacionais — Vazios de Acesso
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Dispersão dos ~5,5 mil municípios classificados pelo backend nos eixos reais da
          metodologia (irradiação solar × MMGD residencial per capita), com as medianas
          nacionais dividindo os quatro quadrantes.
        </p>

        {!quadrantesNacionais && (
          <div className="mt-3">
            <button
              type="button"
              onClick={carregarQuadrantesNacionais}
              disabled={carregandoQuadrantes}
              className="rounded-lg border border-violet-200 bg-white px-4 py-2.5 text-xs font-semibold text-violet-700 shadow-xs transition-all hover:bg-violet-50 disabled:opacity-50"
            >
              {carregandoQuadrantes
                ? 'Carregando a classificação nacional…'
                : 'Carregar gráfico de quadrantes'}
            </button>
            <p className="mt-1 text-xs text-slate-400">
              Busca a classificação completa no backend (~28 requisições paginadas) — por isso
              só carrega quando você pedir.
            </p>
            {erroQuadrantes && <p className="mt-1 text-xs text-red-600">{erroQuadrantes}</p>}
          </div>
        )}

        {quadrantesNacionais && (
          <div className="mt-4">
            <GraficoQuadrantes dados={quadrantesNacionais} />
          </div>
        )}
      </section>
    </div>
  );
}
