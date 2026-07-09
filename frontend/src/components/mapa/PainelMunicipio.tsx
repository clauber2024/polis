import type { MunicipioComIndicadores } from '../../types/api';
import { formatarValor, type FormatoIndicador } from '../../utils/formatadores';

interface PainelMunicipioProps {
  municipio: MunicipioComIndicadores;
  aoFechar: () => void;
}

interface LinhaIndicador {
  rotulo: string;
  valor: number | null;
  formato: FormatoIndicador;
  unidade?: string;
}

/**
 * Painel de detalhe do município clicado (RF-025). Usa direto as properties
 * do GeoJSON já carregado — mesmos campos de GET /api/municipios/:codigoIbge,
 * sem necessidade de nova requisição.
 */
export function PainelMunicipio({ municipio, aoFechar }: PainelMunicipioProps) {
  const grupos: Array<{ titulo: string; linhas: LinhaIndicador[] }> = [
    {
      titulo: 'Energia solar',
      linhas: [
        {
          rotulo: 'Irradiação média',
          valor: municipio.irradiacaoMediaKwhM2Dia,
          formato: 'numero',
          unidade: 'kWh/m²·dia',
        },
        {
          rotulo: 'MMGD residencial per capita',
          valor: municipio.mmgdResidencialPer1000Hab,
          formato: 'numero',
          unidade: 'kW/1.000 hab',
        },
        {
          rotulo: 'Potência instalada (total)',
          valor: municipio.potenciaInstaladaKw,
          formato: 'numero',
          unidade: 'kW',
        },
        {
          rotulo: 'Potência residencial',
          valor: municipio.potenciaResidencialKw,
          formato: 'numero',
          unidade: 'kW',
        },
        { rotulo: 'UCs com MMGD', valor: municipio.numeroUcsComMmgd, formato: 'inteiro' },
        {
          rotulo: 'Tarifa residencial (TUSD+TE)',
          valor: municipio.tarifaEnergiaResidencial,
          formato: 'numero',
          unidade: 'R$/kWh',
        },
      ],
    },
    {
      titulo: 'Indicadores sociais',
      linhas: [
        { rotulo: 'IVS', valor: municipio.ivs, formato: 'numero' },
        { rotulo: 'Renda média domiciliar', valor: municipio.rendaMediaDomiciliar, formato: 'moeda' },
        {
          rotulo: 'Pobreza (CadÚnico)',
          valor: municipio.percentualPobrezaCadunico,
          formato: 'percentual',
        },
        {
          rotulo: 'Tarifa social (TSEE)',
          valor: municipio.percentualTarifaSocial,
          formato: 'percentual',
        },
        { rotulo: 'Alfabetização', valor: municipio.taxaAlfabetizacao, formato: 'percentual' },
        {
          rotulo: 'Mortalidade infantil',
          valor: municipio.taxaMortalidadeInfantil,
          formato: 'numero',
          unidade: '/1.000 nascidos vivos',
        },
      ],
    },
    {
      titulo: 'Território',
      linhas: [
        { rotulo: 'Área', valor: municipio.areaKm2, formato: 'numero', unidade: 'km²' },
        {
          rotulo: 'Densidade populacional',
          valor: municipio.densidadePopulacional,
          formato: 'numero',
          unidade: 'hab/km²',
        },
      ],
    },
  ];

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

      {grupos.map((grupo) => (
        <section key={grupo.titulo} className="border-b border-slate-100 p-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {grupo.titulo}
          </h3>
          <dl className="space-y-1.5">
            {grupo.linhas.map((linha) => (
              <div key={linha.rotulo} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-slate-600">{linha.rotulo}</dt>
                <dd className="text-right font-medium whitespace-nowrap text-slate-900">
                  {formatarValor(linha.valor, linha.formato)}
                  {linha.valor !== null && linha.unidade ? (
                    <span className="ml-1 font-normal text-slate-400">{linha.unidade}</span>
                  ) : null}
                </dd>
              </div>
            ))}
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
