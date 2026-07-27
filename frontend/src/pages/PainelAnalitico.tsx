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

/** Ícones inline (mesmo padrão de CartaoVazioDeAcesso.tsx — sem dependência de lucide-react, ainda não usada no projeto). */
function IconeGrafico({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconeAlerta({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconePlay({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

/**
 * Cor do checkbox por indicador (feedback do usuário, 27/07/2026): a cor é
 * o primeiro nível de leitura do dado — verde para acesso/adoção, amarelo
 * para potencial natural, vermelho para vulnerabilidade — em vez do azul
 * padrão do navegador. Independente do campo `cor` de
 * utils/indicadoresComparacao.ts (usado nas barras do gráfico comparativo,
 * RF-050) — mudar aquele mudaria as cores do gráfico também, fora do
 * escopo deste ajuste.
 */
const COR_CHECKBOX_INDICADOR: Partial<Record<keyof MunicipioComIndicadores, string>> = {
  mmgdResidencialPer1000Hab: 'text-emerald-600 focus:ring-emerald-600',
  rendaMediaDomiciliar: 'text-red-600 focus:ring-red-600',
  percentualPobrezaCadunico: 'text-red-600 focus:ring-red-600',
  ivs: 'text-red-600 focus:ring-red-600',
  irradiacaoMediaKwhM2Dia: 'text-amber-500 focus:ring-amber-500',
};

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
 *
 * Redesign de 27/07/2026 (feedback do usuário): a tela tinha jargão de
 * arquitetura vazando para o usuário final ("ver ARQUITETURA.md", "~28
 * requisições paginadas") e o diagnóstico nacional de Vazios de Acesso —
 * o elemento de maior peso analítico da tela, e o único que não depende de
 * nenhuma seleção prévia — estava rebaixado a uma caixa secundária no fim
 * da página. Reordenado para logo após o cabeçalho, com CTA sólido em vez
 * de outline, e moldura glass (bg-white/70 + backdrop-blur) para dar peso
 * visual condizente com um instrumento de priorização, não um formulário de
 * consulta. A tabela/gráfico/radar de comparação de municípios (abaixo)
 * NÃO foram redesenhados nesta sessão — mesmo padrão visual de antes.
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
    <div className="min-h-full bg-gradient-to-br from-stone-50 to-stone-100 p-8 font-sans">
    <div className="mx-auto max-w-5xl">
      {/* Cabeçalho estratégico — ancorado na pergunta que a tela responde,
          não em nomenclatura de banco de dados (feedback do usuário,
          27/07/2026). */}
      <div className="rounded-2xl bg-white/70 p-8 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
        <span className="mb-4 inline-flex items-center gap-2 rounded bg-red-700/10 px-2.5 py-1 ring-1 ring-red-700/20">
          <IconeGrafico className="h-4 w-4 text-red-700" />
          <span className="text-[10px] font-black tracking-widest text-red-800 uppercase">
            Diagnóstico de Justiça Energética
          </span>
        </span>
        <h1 className="text-3xl font-black tracking-tight text-stone-900">
          Onde o sol não vira acesso
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed font-medium text-stone-500">
          Veja, no país inteiro, onde a abundância de potencial solar não se converte em adoção
          residencial — ou compare municípios específicos lado a lado pelos indicadores do Atlas.
        </p>
      </div>

      {/* Diagnóstico nacional de Vazios de Acesso — não depende de nenhuma
          seleção prévia, por isso vem primeiro: é o elemento de maior peso
          analítico da tela (feedback do usuário, 27/07/2026 — antes ficava
          rebaixado a uma caixa secundária no fim da página). */}
      <section className="mt-6 rounded-2xl bg-white/70 p-8 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
        <h2 className="text-lg font-black tracking-tight text-stone-900">
          Laboratório multidimensional
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-stone-500">
          Cruze qualquer par entre 7 indicadores dos ~5,5 mil municípios do país. O padrão é a
          Matriz oficial de Vazios de Acesso (irradiação solar × adoção residencial de MMGD per
          capita, medianas nacionais) — mude os eixos abaixo para explorar outros cruzamentos
          (ex.: renda × tarifa, IVSH × potencial solar); a cor de cada ponto continua sendo sempre
          a classificação oficial.
        </p>

        {!quadrantesNacionais && (
          <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-stone-50/50 p-10 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-stone-200">
              <IconeGrafico className="h-5 w-5 text-stone-400" />
            </div>
            <h3 className="mb-1 text-sm font-bold text-stone-900">Laboratório pronto para carregar</h3>
            <p className="mb-6 max-w-md text-xs font-medium text-stone-500">
              Carrega os ~5.500 municípios do país com a classificação oficial de Vazio de Acesso —
              depois é só escolher os eixos que quiser cruzar. Pode levar alguns segundos.
            </p>
            <button
              type="button"
              onClick={carregarQuadrantesNacionais}
              disabled={carregandoQuadrantes}
              className="group relative inline-flex items-center gap-2 rounded-lg bg-red-700 px-6 py-3 font-bold text-white shadow-sm transition-all hover:bg-red-800 focus:ring-2 focus:ring-red-700 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
            >
              <IconePlay className="h-4 w-4 fill-white transition-transform group-hover:scale-110" />
              {carregandoQuadrantes ? 'Carregando…' : 'Carregar laboratório'}
            </button>
            {erroQuadrantes && <p className="mt-3 text-xs text-red-600">{erroQuadrantes}</p>}
          </div>
        )}

        {quadrantesNacionais && (
          <div className="mt-6 rounded-xl bg-white p-4 ring-1 ring-stone-200">
            <GraficoQuadrantes dados={quadrantesNacionais} />
          </div>
        )}
      </section>

      {/* Comparação de municípios selecionados — agrupada num único contêiner
          visual (antes os campos ficavam soltos, sem moldura). */}
      <section className="mt-6 rounded-2xl bg-white/70 p-8 shadow-lg shadow-stone-200/50 ring-1 ring-stone-900/5 backdrop-blur-xl">
        <h2 className="text-lg font-black tracking-tight text-stone-900">
          Comparação lado a lado
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Escolha de 2 a 10 municípios específicos para comparar pelos indicadores do Atlas.
        </p>

        <div className="mt-6">
          <h3 className="mb-2 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
            Municípios
          </h3>
          <SeletorMunicipios selecionados={municipios} aoMudarSelecionados={setMunicipios} />
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
            Indicadores
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {INDICADORES_COMPARAVEIS.map((indicador) => (
              <label key={indicador.id} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={indicadoresIds.has(indicador.id)}
                  onChange={() => aoAlternarIndicador(indicador.id)}
                  className={`h-4 w-4 rounded border-stone-300 ${COR_CHECKBOX_INDICADOR[indicador.id] ?? 'text-stone-600 focus:ring-stone-600'}`}
                />
                <span className="text-sm font-medium text-stone-700">{indicador.rotulo}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-md border border-stone-200/60 bg-stone-100/50 p-3 text-xs text-stone-500">
            <IconeAlerta className="h-4 w-4 shrink-0 text-stone-400" />
            <p>
              Índice de Pobreza Energética Regional e Tarifa Social não aparecem aqui: ambos
              dependem de um indicador regulatório (benefício tarifário social da ANEEL) ainda sem
              cobertura nacional.
            </p>
          </div>
        </div>
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
    </div>
    </div>
  );
}
