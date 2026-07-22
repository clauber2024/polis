/**
 * Atalho para os dashboards da EPE usados na participação da MMGD na matriz
 * elétrica nacional (RF-005) — ver ADR em docs/DECISOES.md, "Integração da
 * participação da MMGD na matriz elétrica nacional (EPE/PDGD)". Nenhum dos
 * dois painéis tem API/download automatizável (PDGD é uma app Shiny sem
 * endpoint estável; BEN não tem API REST) — este cartão só poupa a
 * navegação manual até a aba certa. O download em si, e a carga no banco,
 * continuam manuais via ETL Python (mesmo padrão de irradiação solar/INPE e
 * Reforma Casa Brasil Solar — RF-070 não permite upload real disparando ETL
 * pela interface).
 */

const LINKS = [
  {
    titulo: 'PDGD (abre na aba "Capacidade Instalada")',
    descricao:
      'O link abaixo NÃO troca de aba sozinho (Shiny não segue âncora de URL) — depois de abrir, clique manualmente em "Geração de Eletricidade" no menu à esquerda. Lá dentro: sem filtro de UF/Município/Distribuidora, visão "Acumulado Anual", botão "Baixar Dados dos Gráficos". Se nada baixar de imediato, espere alguns segundos (o arquivo é gerado no servidor antes do download começar).',
    url: 'https://dashboard.epe.gov.br/apps/pdgd',
  },
  {
    titulo: 'BEN — Anexo IX (mil tep)',
    descricao:
      'Balanço energético consolidado em mil tep. Não é a unidade usada pelo Atlas (GWh) — ver Anexo X abaixo.',
    url: 'https://dashboard.epe.gov.br/apps/livro-ben/livro/pt/anexo_9.html',
  },
  {
    titulo: 'BEN — Anexo X (unidades comerciais, GWh)',
    descricao:
      'Geração elétrica total do Brasil em GWh — denominador da participação da MMGD na matriz. Exportar no formato "tabela (tidyverse)", não "matriz".',
    url: 'https://dashboard.epe.gov.br/apps/livro-ben/livro/pt/anexo_10.html',
  },
];

export function CartaoAtualizacaoIndicadoresExternos() {
  return (
    <section className="rounded border border-slate-200 bg-white p-4 shadow-2xs">
      <h2 className="text-base font-semibold text-slate-900">
        Atualizar participação da MMGD na matriz elétrica (EPE)
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Abre os dashboards da EPE direto na aba usada por este indicador — os links não baixam
        nem carregam nada sozinhos. Depois de baixar os arquivos, a carga no banco segue pelo ETL
        Python, mesmo padrão das demais fontes sem API (ver docs/PLANO_ATUAL.md).
      </p>
      <div className="space-y-2">
        {LINKS.map((link) => (
          <div
            key={link.url}
            className="flex flex-col gap-1 rounded border border-slate-100 p-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-medium text-slate-700">{link.titulo}</p>
              <p className="text-xs text-slate-500">{link.descricao}</p>
            </div>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded border border-slate-300 px-2 py-1 text-center text-xs whitespace-nowrap hover:bg-slate-50"
            >
              Abrir dashboard ↗
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
