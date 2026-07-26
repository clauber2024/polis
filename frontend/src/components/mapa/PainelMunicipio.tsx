import { useEffect, useState } from 'react';
import type { MunicipioComIndicadores, SetorCensitario, SetoresCensitariosResultado } from '../../types/api';
import { baixarRelatorioTerritorio, buscarSetoresCensitarios } from '../../services/municipios.service';
import { formatarValor, type FormatoIndicador } from '../../utils/formatadores';
import { NOTAS_MUNICIPIO, notaAusencia, type CampoNumerico } from '../../utils/notasAusencia';
import { CartaoDescompassoMorfologico } from './CartaoDescompassoMorfologico';
import { CartaoVazioDeAcesso } from './CartaoVazioDeAcesso';
import { CartaoDeficitCredito } from './CartaoDeficitCredito';

interface PainelMunicipioProps {
  municipio: MunicipioComIndicadores;
  aoFechar: () => void;
  /** Mediana nacional de irradiação (GET /api/vazios-de-acesso, mesmo lazy load do destaque/heatmap) — usada pelo CartaoVazioDeAcesso e pelo CartaoDescompassoMorfologico; null enquanto não carregou. */
  medianaIrradiacao: number | null;
  /** Mediana nacional de MMGD residencial per capita (mesmo lazy load acima) — usada pelo CartaoVazioDeAcesso; null enquanto não carregou. */
  medianaMmgdResidencialPer1000Hab: number | null;
  /** Percentil 90 nacional de precariedade habitacional (mesmo lazy load acima) — usado pelo CartaoDescompassoMorfologico; null enquanto não carregou. */
  limiarPrecariedadeHabitacionalAlta: number | null;
  /** `alertaDeficitCredito` já classificado (GET /api/vazios-de-acesso, mesmo lazy load acima) — usado pelo CartaoDeficitCredito; `false` enquanto não carregou (card não aparece até então). */
  alertaDeficitCredito: boolean;
  /** Datas-base da lente "Déficit de Crédito Crítico" — usado pelo CartaoDeficitCredito; `null` enquanto não carregou. */
  periodoReferenciaLenteDeficitCredito: {
    mmgdMaisRecente: string | null;
    casaBrasilSolar: string | null;
  } | null;
}

/**
 * RF-043/RF-045: drill-down das sub-regiões, no mesmo padrão visual (posição
 * implícita pela ordenação + barra proporcional) já usado em
 * PainelRanking.tsx. Ordenado por potência instalada (RF-043 não define um
 * indicador padrão — potência total é o mais direto de justificar aqui).
 */
function DetalhamentoSetores({ setores }: { setores: SetorCensitario[] }) {
  // Nulo nunca vira 0: um setor sem potência medida não é "setor com potência
  // zero" (mesma regra de ordenarMunicipios em municipios.service.ts) — nulos
  // sempre por último, independente do valor, para não sugerir uma magnitude
  // que a fonte não mediu.
  const ordenados = [...setores].sort((a, b) => {
    if (a.potenciaInstaladaKw === null && b.potenciaInstaladaKw === null) return 0;
    if (a.potenciaInstaladaKw === null) return 1;
    if (b.potenciaInstaladaKw === null) return -1;
    return b.potenciaInstaladaKw - a.potenciaInstaladaKw;
  });
  const valoresValidos = ordenados
    .map((s) => s.potenciaInstaladaKw)
    .filter((valor): valor is number => valor !== null);
  const maximo = Math.max(1, ...valoresValidos);

  return (
    <ol className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
      {ordenados.map((setor) => (
        <li key={setor.id} className="rounded-lg border border-slate-100 p-2 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-slate-700">{setor.nomeExibicao}</span>
            <span className="shrink-0 font-mono font-semibold text-red-700">
              {formatarValor(setor.potenciaInstaladaKw, 'numero')} kW
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
            {setor.potenciaInstaladaKw !== null && (
              <div
                className="h-full rounded-full bg-red-400"
                style={{
                  width: `${Math.max(2, (setor.potenciaInstaladaKw / maximo) * 100)}%`,
                }}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between text-slate-400">
            <span>{formatarValor(setor.areaKm2, 'numero')} km²</span>
            <span>{formatarValor(setor.numeroUcsComMmgd, 'inteiro')} UCs com MMGD</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

interface LinhaIndicador {
  campo: CampoNumerico;
  rotulo: string;
  formato: FormatoIndicador;
  unidade?: string;
  /** Esclarecimento metodológico — mesmo critério de utils/indicadores.ts. */
  descricao?: string;
  /** Marca o indicador-âncora da seção — ganha cartão próprio de 2 colunas em vez de célula do grid. No máximo um por grupo. */
  destaque?: boolean;
}

/**
 * Painel de detalhe do município clicado (RF-025). Usa direto as properties
 * do GeoJSON já carregado — mesmos campos de GET /api/municipios/:codigoIbge,
 * sem necessidade de nova requisição.
 *
 * Ausência de dado: "—" acompanhado da justificativa quando ela é conhecida e
 * documentada (utils/notasAusencia.ts) — "—" sem nota é lacuna sem explicação
 * mapeada. Municípios especiais (ex.: instalado em 2025, distrito estadual)
 * ganham uma nota geral no topo do painel.
 */
export function PainelMunicipio({
  municipio,
  aoFechar,
  medianaIrradiacao,
  medianaMmgdResidencialPer1000Hab,
  limiarPrecariedadeHabitacionalAlta,
  alertaDeficitCredito,
  periodoReferenciaLenteDeficitCredito,
}: PainelMunicipioProps) {
  // RF-058: geração do relatório-resumo em PDF do território selecionado.
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [erroRelatorio, setErroRelatorio] = useState<string | null>(null);

  // RF-043/RF-045: drill-down de setores censitários — busca lazy a cada
  // município selecionado; hoje só São Paulo (3550308) tem granularidade
  // fina real (seed ilustrativo), qualquer outro responde
  // temGranularidadeFina: false, o que não é erro (fica em silêncio, sem
  // seção extra no painel).
  const [setores, setSetores] = useState<SetoresCensitariosResultado | null>(null);
  const [detalhamentoAberto, setDetalhamentoAberto] = useState(false);

  useEffect(() => {
    let ativo = true;
    setSetores(null);
    setDetalhamentoAberto(false);
    buscarSetoresCensitarios(municipio.codigoIbge)
      .then((resultado) => {
        if (ativo) setSetores(resultado);
      })
      .catch(() => {
        // Falha na busca do drill-down não deve quebrar o painel principal —
        // a seção de detalhamento simplesmente não aparece.
      });
    return () => {
      ativo = false;
    };
  }, [municipio.codigoIbge]);

  async function aoBaixarRelatorio() {
    setGerandoRelatorio(true);
    setErroRelatorio(null);
    try {
      await baixarRelatorioTerritorio(municipio.codigoIbge, municipio.nome);
    } catch (causa) {
      setErroRelatorio(causa instanceof Error ? causa.message : 'Falha ao gerar o relatório.');
    } finally {
      setGerandoRelatorio(false);
    }
  }

  const grupos: Array<{ titulo: string; linhas: LinhaIndicador[] }> = [
    {
      titulo: 'Energia solar',
      linhas: [
        {
          campo: 'irradiacaoMediaKwhM2Dia',
          rotulo: 'Irradiação média',
          formato: 'numero',
          unidade: 'kWh/m²·dia',
          descricao:
            'Média climatológica 1999–2015 (Atlas Solar 2017, LABREN/CCST/INPE), não um ano específico.',
        },
        {
          campo: 'mmgdResidencialPer1000Hab',
          rotulo: 'MMGD residencial per capita',
          formato: 'numero',
          unidade: 'kW/1.000 hab',
          destaque: true,
        },
        {
          campo: 'potenciaInstaladaKw',
          rotulo: 'Potência instalada (total)',
          formato: 'numero',
          unidade: 'kW',
        },
        {
          campo: 'potenciaResidencialKw',
          rotulo: 'Potência residencial',
          formato: 'numero',
          unidade: 'kW',
        },
        { campo: 'numeroUcsComMmgd', rotulo: 'UCs com MMGD', formato: 'inteiro' },
        {
          campo: 'tarifaEnergiaResidencial',
          rotulo: 'Tarifa residencial (TUSD+TE)',
          formato: 'numero',
          unidade: 'R$/kWh',
        },
      ],
    },
    {
      titulo: 'Indicadores sociais',
      linhas: [
        { campo: 'ivs', rotulo: 'IVS', formato: 'numero', destaque: true },
        {
          campo: 'ivsh',
          rotulo: 'IVSH (sócio-habitacional)',
          formato: 'numero',
          descricao:
            'Média entre IVS, precariedade física da moradia (cortiços, paredes inadequadas, favelas) e insegurança da posse da terra — inclui a dimensão de moradia que o IVS consolidado exclui de propósito. Fundamenta os alertas de Descompasso Morfológico.',
        },
        { campo: 'rendaMediaDomiciliar', rotulo: 'Renda média domiciliar', formato: 'moeda' },
        {
          campo: 'percentualCadunico',
          rotulo: 'População no CadÚnico',
          formato: 'percentual',
          descricao:
            '% da população total (Censo 2022) cadastrada no CadÚnico — mede alcance do Cadastro, inclui famílias não pobres.',
        },
        {
          campo: 'percentualPobrezaCadunico',
          rotulo: 'Pobreza entre famílias do CadÚnico',
          formato: 'percentual',
          descricao:
            '% das famílias cadastradas no CadÚnico em pobreza ou extrema pobreza — não é % da população do município.',
        },
        {
          campo: 'percentualTarifaSocial',
          rotulo: 'Tarifa social (TSEE)',
          formato: 'percentual',
        },
        { campo: 'taxaAlfabetizacao', rotulo: 'Alfabetização', formato: 'percentual' },
        {
          campo: 'taxaMortalidadeInfantil',
          rotulo: 'Mortalidade infantil',
          formato: 'numero',
          unidade: '/1.000 nascidos vivos',
        },
      ],
    },
    {
      titulo: 'Acesso a financiamento',
      linhas: [
        {
          campo: 'numeroContratosReformaCasaBrasilSolar',
          rotulo: 'Contratos Reforma Casa Brasil Solar',
          formato: 'inteiro',
          descricao:
            'Programa Reforma Casa Brasil (Caixa/Ministério das Cidades), modalidade solar — extrato pontual nov/2025–abr/2026, fonte não pública.',
        },
        {
          campo: 'valorLiberadoReformaCasaBrasilSolar',
          rotulo: 'Valor liberado (Reforma Casa Brasil Solar)',
          formato: 'moeda',
        },
      ],
    },
    {
      titulo: 'Território',
      linhas: [
        {
          campo: 'populacaoEstimada',
          rotulo: 'População (estimada)',
          formato: 'inteiro',
          unidade: 'hab',
          descricao: 'Estimativa (densidade × área, Censo 2022) — não é contagem censitária direta.',
        },
        { campo: 'areaKm2', rotulo: 'Área', formato: 'numero', unidade: 'km²' },
        {
          campo: 'densidadePopulacional',
          rotulo: 'Densidade populacional',
          formato: 'numero',
          unidade: 'hab/km²',
        },
      ],
    },
  ];

  const notaMunicipio = NOTAS_MUNICIPIO[municipio.codigoIbge];

  /**
   * Notas metodológicas e de ausência da seção, reunidas numa "gaveta" única
   * no rodapé em vez de intercaladas linha a linha — o KPI não pode competir
   * visualmente com a nota que o explica.
   */
  function notasDaSecao(grupo: { linhas: LinhaIndicador[] }) {
    return grupo.linhas
      .map((linha) => {
        const valor = municipio[linha.campo];
        const nota = valor === null ? notaAusencia(linha.campo, municipio) : null;
        return { rotulo: linha.rotulo, texto: nota ?? linha.descricao };
      })
      .filter((item): item is { rotulo: string; texto: string } => !!item.texto);
  }

  return (
    <aside className="flex h-full w-80 flex-col overflow-hidden rounded-3xl border border-white/90 bg-white/85 shadow-[0_12px_40px_rgb(0,0,0,0.12)] backdrop-blur-2xl">
      {/* Cabeçalho fixo: identificação + PDF sempre visíveis, mesmo com a lista rolada. */}
      <div className="sticky top-0 z-10 border-b border-stone-200/70 bg-white/90 p-5 backdrop-blur-md">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <h2 className="font-display text-lg leading-tight font-bold text-slate-900">
              {municipio.nome}
            </h2>
            <p className="font-mono text-[10px] tracking-wider text-slate-400 uppercase">
              {municipio.nomeEstado} ({municipio.uf}) · {municipio.regiao} · IBGE{' '}
              {municipio.codigoIbge}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar painel"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* RF-058: relatório-resumo exportável em PDF do território selecionado. */}
        <button
          type="button"
          onClick={aoBaixarRelatorio}
          disabled={gerandoRelatorio}
          className="mt-4 w-full rounded-lg border border-stone-300 bg-white py-2 text-xs font-bold text-stone-700 shadow-sm transition-colors hover:bg-stone-50 disabled:opacity-60"
        >
          {gerandoRelatorio ? 'Gerando relatório…' : 'Baixar relatório-resumo (PDF)'}
        </button>
        {erroRelatorio && <p className="mt-1.5 text-xs text-red-600">{erroRelatorio}</p>}
      </div>

      {/* Área de rolagem: só o corpo de dados rola por baixo do cabeçalho fixo. */}
      <div className="flex-1 overflow-y-auto">
        {notaMunicipio && (
          <p className="border-b border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs leading-relaxed text-amber-900">
            {notaMunicipio}
          </p>
        )}

        <CartaoVazioDeAcesso
          municipio={municipio}
          medianaIrradiacao={medianaIrradiacao}
          medianaMmgdResidencialPer1000Hab={medianaMmgdResidencialPer1000Hab}
        />

        <CartaoDescompassoMorfologico
          municipio={municipio}
          medianaIrradiacao={medianaIrradiacao}
          limiarPrecariedadeHabitacionalAlta={limiarPrecariedadeHabitacionalAlta}
        />

        <CartaoDeficitCredito
          alertaDeficitCredito={alertaDeficitCredito}
          periodoReferenciaLenteDeficitCredito={periodoReferenciaLenteDeficitCredito}
        />

        {grupos.map((grupo) => {
          const notas = notasDaSecao(grupo);
          return (
            <section key={grupo.titulo} className="border-b border-stone-200/70 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-[10px] font-extrabold tracking-widest text-stone-400 uppercase">
                {grupo.titulo}
                <span className="h-px flex-1 bg-stone-200" aria-hidden="true" />
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                {grupo.linhas.map((linha) => {
                  const valor = municipio[linha.campo];
                  const semDado = valor === null;

                  if (linha.destaque) {
                    return (
                      <div
                        key={linha.rotulo}
                        className="col-span-2 rounded-xl border border-stone-200/60 bg-white p-4 shadow-sm"
                      >
                        <span className="text-[10px] font-bold tracking-widest text-stone-500 uppercase">
                          {linha.rotulo}
                        </span>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span
                            className={`text-3xl font-black ${semDado ? 'text-stone-300' : 'text-red-700'}`}
                          >
                            {formatarValor(valor, linha.formato)}
                          </span>
                          {!semDado && linha.unidade && (
                            <span className="text-xs font-bold text-stone-400">{linha.unidade}</span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={linha.rotulo} className={`flex flex-col ${semDado ? 'opacity-60' : ''}`}>
                      <span className="text-[9px] font-bold tracking-widest text-stone-500 uppercase">
                        {linha.rotulo}
                      </span>
                      <div className="mt-0.5 flex items-baseline gap-1">
                        {semDado ? (
                          <span className="text-sm font-bold text-stone-400 italic">Não disponível</span>
                        ) : (
                          <>
                            <span className="text-lg font-black whitespace-nowrap text-stone-900">
                              {formatarValor(valor, linha.formato)}
                            </span>
                            {linha.unidade && (
                              <span className="text-[10px] font-semibold text-stone-500">
                                {linha.unidade}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Gaveta metodológica: notas técnicas e justificativas de ausência
                  reunidas no rodapé da seção, fora do ritmo de leitura dos KPIs. */}
              {notas.length > 0 && (
                <div className="mt-4 rounded-lg bg-stone-100/50 p-3 text-[9px] leading-relaxed text-stone-500">
                  <strong className="mb-1 block font-bold text-stone-700">Notas técnicas</strong>
                  <ul className="ml-4 list-outside list-disc space-y-1">
                    {notas.map((nota) => (
                      <li key={nota.rotulo}>
                        <strong className="font-semibold text-stone-600">{nota.rotulo}:</strong>{' '}
                        {nota.texto}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}

        {/* RF-043/RF-045: drill-down de setores censitários — só aparece quando
            o backend confirma granularidade fina disponível para este
            município (hoje, só São Paulo). */}
        {setores?.temGranularidadeFina && (
          <section className="border-b border-stone-200/70 p-5">
            <button
              type="button"
              onClick={() => setDetalhamentoAberto((aberto) => !aberto)}
              className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-left text-sm font-semibold text-red-800 hover:bg-red-50"
            >
              <span>Ver detalhamento interno ({setores.setores.length} setores censitários)</span>
              <span aria-hidden="true">{detalhamentoAberto ? '▲' : '▼'}</span>
            </button>

            {detalhamentoAberto && (
              <div className="mt-3 space-y-2">
                {setores.avisoIlustrativo && (
                  <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-relaxed text-amber-900">
                    {setores.avisoIlustrativo}
                  </p>
                )}
                <DetalhamentoSetores setores={setores.setores} />
              </div>
            )}
          </section>
        )}

        <p className="p-4 font-mono text-[10px] text-slate-400">
          Referências: MMGD {municipio.periodoReferenciaMmgd ?? '—'} · irradiação{' '}
          {municipio.periodoReferenciaIrradiacao ?? '—'}
        </p>
      </div>
    </aside>
  );
}
