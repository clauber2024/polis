import type { MunicipioComIndicadores } from '../../types/api';
import { formatarValor, type FormatoIndicador } from '../../utils/formatadores';
import { NOTAS_MUNICIPIO, notaAusencia, type CampoNumerico } from '../../utils/notasAusencia';

interface PainelMunicipioProps {
  municipio: MunicipioComIndicadores;
  aoFechar: () => void;
}

interface LinhaIndicador {
  campo: CampoNumerico;
  rotulo: string;
  formato: FormatoIndicador;
  unidade?: string;
  /** Esclarecimento metodológico — mesmo critério de utils/indicadores.ts. */
  descricao?: string;
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
export function PainelMunicipio({ municipio, aoFechar }: PainelMunicipioProps) {
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
        { campo: 'ivs', rotulo: 'IVS', formato: 'numero' },
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

  return (
    <aside className="flex h-full w-80 flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-lg">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{municipio.nome}</h2>
          <p className="text-sm text-slate-500">
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

      {notaMunicipio && (
        <p className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
          {notaMunicipio}
        </p>
      )}

      {grupos.map((grupo) => (
        <section key={grupo.titulo} className="border-b border-slate-100 p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {grupo.titulo}
          </h3>
          <dl className="space-y-1.5">
            {grupo.linhas.map((linha) => {
              const valor = municipio[linha.campo];
              const nota = valor === null ? notaAusencia(linha.campo, municipio) : null;
              return (
                <div key={linha.rotulo} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-600">{linha.rotulo}</dt>
                    <dd className="text-right font-medium whitespace-nowrap text-slate-900">
                      {formatarValor(valor, linha.formato)}
                      {valor !== null && linha.unidade ? (
                        <span className="ml-1 font-normal text-slate-400">{linha.unidade}</span>
                      ) : null}
                    </dd>
                  </div>
                  {linha.descricao && (
                    <p className="mt-0.5 text-xs leading-snug text-slate-400">
                      {linha.descricao}
                    </p>
                  )}
                  {nota && (
                    <p className="mt-0.5 text-xs leading-snug text-slate-400 italic">{nota}</p>
                  )}
                </div>
              );
            })}
          </dl>
        </section>
      ))}

      <p className="p-4 text-xs text-slate-400">
        Referências: MMGD {municipio.periodoReferenciaMmgd ?? '—'} · irradiação{' '}
        {municipio.periodoReferenciaIrradiacao ?? '—'}
      </p>
    </aside>
  );
}
