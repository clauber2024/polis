import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buscarEstatisticasNacionais } from '../services/estatisticasNacionais.service';
import type { EstatisticasNacionais } from '../types/api';
import { formatarValor } from '../utils/formatadores';

/**
 * Landing page institucional (RF-001 a RF-008) — implementada em 10/07/2026.
 * Antes desta sessão "/" ia direto para o mapa (ver App.tsx); agora "/" é
 * esta página pública, e o mapa/dashboard vive em "/mapa".
 *
 * Header próprio (RF-002), não o LayoutApp usado pelo resto do app — a
 * landing é a porta de entrada institucional, não uma tela analítica, então
 * não faz sentido ela já vir com nav de Painel Analítico/busca de município.
 */

interface FonteDados {
  nome: string;
  descricao: string;
}

/** RF-006: fontes de dados primárias — mesmas 6 bases canônicas do backend (basesDeDadosCanonicas.ts). */
const FONTES_DE_DADOS: FonteDados[] = [
  { nome: 'ANEEL/MMGD', descricao: 'Micro e minigeração distribuída — potência instalada e unidades consumidoras conectadas.' },
  { nome: 'IBGE Censo', descricao: 'Infraestrutura urbana, moradia, alfabetização, densidade populacional.' },
  { nome: 'CadÚnico', descricao: 'Cobertura e pobreza entre famílias cadastradas no Cadastro Único.' },
  { nome: 'TSEE', descricao: 'Tarifa Social de Energia Elétrica — beneficiários por subclasse residencial.' },
  { nome: 'IVS/IPEA', descricao: 'Índice de Vulnerabilidade Social, consolidado por município.' },
  { nome: 'Irradiação Solar/INPE', descricao: 'Média climatológica 1999–2015 (LABREN/CCST/INPE), condição de licenciamento.' },
];

export function PaginaLanding() {
  const [estatisticas, setEstatisticas] = useState<EstatisticasNacionais | null>(null);
  const [erroEstatisticas, setErroEstatisticas] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarEstatisticasNacionais()
      .then((resultado) => {
        if (ativo) setEstatisticas(resultado);
      })
      .catch((causa: unknown) => {
        if (ativo) {
          setErroEstatisticas(
            causa instanceof Error ? causa.message : 'Falha ao carregar os indicadores nacionais.',
          );
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-white text-slate-800">
      {/* RF-002: header fixo com botão Entrar no canto superior direito. */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <span className="text-lg font-semibold text-slate-900">
          Atlas Solar <span className="text-amber-500">Justo</span>
        </span>
        <Link
          to="/login"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Entrar
        </Link>
      </header>

      {/* RF-003: hero com headline + 2 CTAs. */}
      <section className="bg-gradient-to-b from-amber-50 to-white px-6 py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold text-slate-900 sm:text-5xl">
          Justiça energética é saber{' '}
          <span className="text-amber-500">quem tem acesso</span> à energia solar no Brasil
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          O Atlas Solar Justo cruza potencial solar, vulnerabilidade social e acesso efetivo à
          geração distribuída para identificar territórios prioritários de política pública.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/mapa"
            className="rounded bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Explorar o Atlas
          </Link>
          <a
            href="#sobre"
            className="rounded border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Saiba mais
          </a>
        </div>
      </section>

      {/* RF-004: seção explicativa do objetivo da plataforma. */}
      <section id="sobre" className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-2xl font-semibold text-slate-900">O que o Atlas faz</h2>
        <p className="mt-4 leading-relaxed text-slate-600">
          A energia solar distribuída (MMGD) cresce rápido no Brasil, mas seu acesso não é
          uniforme: municípios com alto potencial de irradiação solar podem, ao mesmo tempo, ter
          baixa adoção de MMGD e alta vulnerabilidade social — um sinal de que o benefício da
          transição energética não está chegando a quem mais precisa. O Atlas cruza três eixos —
          potencial solar (INPE), vulnerabilidade social (IVS/IPEA, CadÚnico, renda) e acesso
          efetivo à energia limpa (MMGD/ANEEL) — para tornar esse descompasso visível, município
          a município, e apoiar a priorização de políticas públicas de justiça energética.
        </p>
      </section>

      {/* RF-005: indicadores nacionais em destaque. */}
      <section className="bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold text-slate-900">
            O Brasil em números
          </h2>
          {estatisticas?.periodoReferencia && (
            <p className="mt-1 text-center text-xs text-slate-400">
              Snapshot mais recente disponível: {estatisticas.periodoReferencia}
            </p>
          )}

          {erroEstatisticas && !estatisticas && (
            <p className="mt-6 text-center text-sm text-red-600">{erroEstatisticas}</p>
          )}

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
              <p className="text-3xl font-bold text-amber-500">
                {estatisticas?.totalInstalacoesMmgd !== null &&
                estatisticas?.totalInstalacoesMmgd !== undefined
                  ? formatarValor(estatisticas.totalInstalacoesMmgd, 'inteiro')
                  : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">Sistemas MMGD conectados</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
              <p className="text-3xl font-bold text-amber-500">
                {estatisticas ? formatarValor(estatisticas.totalUcsBeneficiadas, 'inteiro') : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">UCs beneficiadas por crédito de energia</p>
            </div>
            {/* RF-005 item 4: ESTIMATIVA, nunca contagem exata — UCs
                residenciais beneficiadas × média nacional de moradores por
                domicílio (IBGE, Censo 2022). Rótulo "(estimativa)" fica
                sempre visível, sem tooltip escondendo isso. */}
            <div
              className="rounded-lg border border-slate-200 bg-white p-6 text-center"
              title={
                estatisticas
                  ? `${formatarValor(estatisticas.pessoasBeneficiadas.totalUcsResidenciaisBeneficiadas, 'inteiro')} UCs residenciais beneficiadas × ${estatisticas.pessoasBeneficiadas.mediaPessoasPorDomicilio} pessoas/domicílio. Fonte: ${estatisticas.pessoasBeneficiadas.fonteMediaPessoasPorDomicilio}`
                  : undefined
              }
            >
              <p className="text-3xl font-bold text-amber-500">
                {estatisticas
                  ? formatarValor(estatisticas.pessoasBeneficiadas.pessoasBeneficiadasEstimativa, 'inteiro')
                  : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Pessoas beneficiadas <span className="text-slate-400">(estimativa)</span>
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
              <p className="text-3xl font-bold text-amber-500">
                {estatisticas
                  ? `${formatarValor(estatisticas.potenciaTotalInstaladaKw / 1000, 'numero')} MW`
                  : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">Potência total instalada</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
              <p className="text-3xl font-bold text-amber-500">
                {estatisticas
                  ? formatarValor(estatisticas.totalMunicipiosComMmgd, 'inteiro')
                  : '—'}
              </p>
              <p className="mt-1 text-sm text-slate-600">Municípios com presença de MMGD</p>
            </div>
          </div>

          {estatisticas && (
            <p className="mt-3 text-center text-xs text-slate-400">
              "Pessoas beneficiadas" é estimativa ({estatisticas.pessoasBeneficiadas.mediaPessoasPorDomicilio}{' '}
              pessoas/domicílio, {estatisticas.pessoasBeneficiadas.fonteMediaPessoasPorDomicilio}), não contagem exata.
            </p>
          )}

          {/* RF-005 pede também "participação na matriz nacional" e "projeção
              futura" — não calculáveis com o schema atual (ver
              estatisticasNacionais.service.ts, backend). Exibidos como "em
              breve" com o motivo real, nunca com número inventado — mesmo
              princípio das notas de ausência documentada do painel de
              município (utils/notasAusencia.ts). */}
          {estatisticas && estatisticas.indicadoresIndisponiveis.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 mx-auto max-w-2xl">
              {estatisticas.indicadoresIndisponiveis.map((indicador) => (
                <div
                  key={indicador.id}
                  title={indicador.motivo}
                  className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center"
                >
                  <p className="text-sm font-semibold text-slate-400">Em breve</p>
                  <p className="mt-1 text-xs text-slate-500">{indicador.rotulo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* RF-006: fontes de dados primárias. */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold text-slate-900">Fontes de dados</h2>
        <p className="mt-2 text-sm text-slate-500">
          Todos os indicadores do Atlas vêm de bases públicas oficiais.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FONTES_DE_DADOS.map((fonte) => (
            <div key={fonte.nome} className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">{fonte.nome}</p>
              <p className="mt-1 text-sm text-slate-600">{fonte.descricao}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RF-007/RT-005/RF-078: Referências Metodológicas — seção DISTINTA das
          fontes de dados. O OBEPE inspira a metodologia do Índice de Pobreza
          Energética Regional (ver ARQUITETURA.md), mas nunca é listado como
          fonte de dado primário. */}
      <section className="bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-semibold text-slate-900">Referências metodológicas</h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            O Índice de Pobreza Energética Regional do Atlas é elaboração própria, construída a
            partir das fontes primárias já listadas acima (IBGE, CadÚnico, TSEE, IVS/IPEA), mas
            inspirada na abordagem metodológica do{' '}
            <strong>Observatório Brasileiro de Erradicação da Pobreza Energética (OBEPE)</strong>.
            O OBEPE é uma referência de diálogo metodológico, não uma fonte de dado bruto do
            Atlas — por isso aparece aqui, separado da seção de Fontes de Dados.
          </p>

          {/* RF-005 item 5 ("participação da solar distribuída na matriz
              elétrica nacional") — decisão do usuário (10/07/2026): o Atlas
              não calcula esse número (não tem o total de geração elétrica
              nacional como denominador, ver indicadoresIndisponiveis /
              estatisticasNacionais.service.ts), mas cita o número oficial da
              EPE como referência externa, no mesmo espírito do OBEPE acima —
              citação rotulada com fonte e ano, nunca misturada aos cartões de
              KPI calculados pelo próprio Atlas. */}
          <p className="mt-6 leading-relaxed text-slate-600">
            Como contexto nacional adicional, a Empresa de Pesquisa Energética (EPE) registra no
            Balanço Energético Nacional 2026 (ano-base 2025) que a micro e minigeração distribuída
            (MMGD) representou <strong>7,0%</strong> da geração elétrica total do Brasil em 2025.
            É uma citação de fonte externa — não um KPI calculado pelo Atlas, que não tem acesso
            ao total de geração elétrica nacional como denominador para reproduzir esse cálculo
            (ver indicador "Em breve" na seção "O Brasil em números").
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Fonte: EPE, Balanço Energético Nacional 2026 — ano-base 2025 (Relatório Síntese,
            publicado em 03/06/2026).
          </p>
        </div>
      </section>

      {/* RF-008: footer institucional. */}
      <footer className="border-t border-slate-200 px-6 py-8 text-center text-sm text-slate-500">
        <p>Atlas Solar Justo — plataforma de justiça energética.</p>
        <p className="mt-1 text-xs text-slate-400">
          Dados públicos oficiais · Metodologia documentada · Ver ARQUITETURA.md do projeto.
        </p>
      </footer>
    </div>
  );
}
