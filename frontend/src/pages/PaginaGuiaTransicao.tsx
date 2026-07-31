import { useState } from 'react';
import type { SVGProps } from 'react';

/**
 * Guia de Operação e Governança (30/07/2026) — manual interno de handoff para
 * a equipe do Instituto Pólis, complementando `docs/DEPLOY_TEMPORARIO.md`
 * (esse cobre infraestrutura; este cobre rotina operacional e argumentação
 * institucional). Rota protegida (`RotaProtegida` sem `papeis` — qualquer
 * Colaborador ou Administrador autenticado), não pública: conteúdo de
 * orientação interna, não achado do Atlas para divulgação.
 *
 * Texto de metodologia (Índice de Fricção, penalidade por dado ausente)
 * reaproveita literalmente a redação já validada em
 * `PaginaRankingDistribuidoras.tsx` — evita reintroduzir "média ponderada"
 * (era impreciso, corrigido nesta mesma sessão para "média simples") ou o
 * termo "opacidade regulatória" (rejeitado explicitamente pelo usuário como
 * acusação não verificada; a nota real cita a Cemig-D como contraevidência
 * de que a causa é ambígua, não afirma culpa da concessionária).
 */
export function PaginaGuiaTransicao() {
  const [secaoAberta, setSecaoAberta] = useState<string | null>('governanca');

  function alternarSecao(id: string) {
    setSecaoAberta((atual) => (atual === id ? null : id));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-6 font-sans">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded bg-red-50 px-2.5 py-1 text-[10px] font-black tracking-widest text-red-700 uppercase">
          <IconeLivro className="h-3 w-3" /> Manual de Transição Institucional
        </div>
        <h1 className="text-xl font-black tracking-tight text-stone-900">
          Guia de Operação e Governança — Instituto Pólis
        </h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed font-medium text-stone-500">
          Documentação operacional de referência para a equipe gestora do Instituto Pólis.
          Este painel reúne as regras metodológicas, a trilha de auditoria dos dados de
          Microgeração Distribuída (MMGD) e as diretrizes de resposta institucional a
          questionamentos de concessionárias.
        </p>
      </div>

      <div className="space-y-4">
        <SecaoAcordeao
          id="governanca"
          titulo="1. Escopo e Propósito da Plataforma"
          icone={<IconePredio className="h-4 w-4 text-stone-700" />}
          aberta={secaoAberta === 'governanca'}
          aoAlternar={alternarSecao}
        >
          <p className="pt-3 leading-relaxed">
            O <strong>Atlas Solar Justo</strong> é uma ferramenta de incidência pública e
            controle social focada na transição energética, com ênfase nas barreiras de
            conexão de Microgeração Distribuída (MMGD) e nos vazios socioterritoriais de
            acesso.
          </p>
          <p className="leading-relaxed">
            Com a transferência da plataforma para o Instituto Pólis, o objetivo é manter a
            autonomia na publicação de relatórios voltados para imprensa, órgãos reguladores
            e sociedade civil — sustentada por metodologia documentada e rastreável, não por
            afirmações não verificadas.
          </p>
        </SecaoAcordeao>

        <SecaoAcordeao
          id="metodologia"
          titulo="2. Metodologia: Índice de Fricção e Tratamento de Dado Ausente"
          icone={<IconeDocumento className="h-4 w-4 text-stone-700" />}
          aberta={secaoAberta === 'metodologia'}
          aoAlternar={alternarSecao}
        >
          <p className="pt-3 leading-relaxed">
            <strong>Índice de Fricção (escala de 0 a 1):</strong> média simples de dois
            indicadores operacionais — taxa de não conexão e taxa de descumprimento de prazo
            regulatório da ANEEL — cada um normalizado independentemente entre as
            concessionárias (mínimo–máximo, 0 a 1). Valores mais próximos de 1 indicam maior
            barreira, lentidão e fricção na conexão. Fatores socioeconômicos da região
            atendida são deliberadamente isolados desta pontuação, para refletir
            exclusivamente o desempenho regulatório operacional da concessionária.
          </p>
          <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3">
            <span className="block text-[11px] font-black tracking-wider text-red-900 uppercase">
              Tratamento de dado ausente
            </span>
            <p className="text-[11px] leading-relaxed text-red-800">
              Concessionárias sem o campo de prazo regulatório (<code>DatLim</code>) na fonte
              ANEEL não são omitidas nem recebem pontuação neutra: vazio de dado em fonte
              oficial recebe a penalidade máxima, para não favorecer quem tem dado ausente
              sobre quem tem dado desfavorável. Essa ausência já foi identificada em
              distribuidoras de vários grupos econômicos, incluindo a maior do país
              (Cemig-D) — não é possível, só com este dado, determinar se a causa é falha de
              reporte da distribuidora ou lacuna da própria base pública da ANEEL.
            </p>
          </div>
        </SecaoAcordeao>

        <SecaoAcordeao
          id="atualizacao"
          titulo="3. Rotina de Verificação e Atualização"
          icone={<IconeAtualizar className="h-4 w-4 text-stone-700" />}
          aberta={secaoAberta === 'atualizacao'}
          aoAlternar={alternarSecao}
        >
          <p className="pt-3 leading-relaxed">
            Os dados principais vêm dos repositórios abertos e painéis públicos da ANEEL. A
            verificação deve seguir esta rotina:
          </p>
          <ul className="list-disc space-y-1.5 pl-4 font-medium">
            <li>
              <strong>Validação de status:</strong> acesse a aba{' '}
              <em>Base de Evidências</em> para conferir se as barras de cobertura estão
              atualizadas e se cada fonte mostra a data de referência correta.
            </li>
            <li>
              <strong>Novo extrato/dataset:</strong> ao obter uma versão mais recente de
              alguma fonte, execute o extractor correspondente em{' '}
              <code>backend/src/etl/loaders/</code> e confirme no resumo do próprio script
              quantos municípios foram atualizados sem falha.
            </li>
            <li>
              <strong>Transparência temporal:</strong> mantenha sempre visível, nas telas de
              ranking, a janela de tempo real coberta pelo dataset de origem — nunca uma data
              genérica ou estimada.
            </li>
          </ul>
        </SecaoAcordeao>

        <SecaoAcordeao
          id="juridico"
          titulo="4. Resposta a Questionamentos de Concessionárias"
          icone={<IconeEscudoAlerta className="h-4 w-4 text-stone-700" />}
          aberta={secaoAberta === 'juridico'}
          aoAlternar={alternarSecao}
        >
          <p className="pt-3 leading-relaxed">
            Caso uma concessionária questione sua posição no ranking ou a penalidade por
            dado ausente, a resposta deve se ater estritamente ao que a metodologia
            documentada sustenta — nunca afirmar como fato uma causa que o dado disponível
            não permite comprovar.
          </p>
          <div className="space-y-2 pt-1">
            <div className="rounded border border-stone-200 bg-stone-50 p-2.5">
              <span className="block font-bold text-stone-800">
                "O dado da nossa distribuidora está incorreto ou ausente"
              </span>
              <p className="mt-0.5 text-stone-500">
                <strong>Resposta:</strong> o ranking usa exclusivamente o campo regulatório
                público (<code>DatLim</code>) do dataset aberto da ANEEL, sem edição manual.
                A mesma lacuna aparece em distribuidoras de grupos econômicos diferentes,
                incluindo a maior do país — não afirmamos de quem é a falha, só aplicamos a
                mesma regra de penalidade máxima a qualquer dado ausente, documentada e
                igual para todas.
              </p>
            </div>
            <div className="rounded border border-stone-200 bg-stone-50 p-2.5">
              <span className="block font-bold text-stone-800">
                "Fatores socioeconômicos regionais desfavorecem nossa operação"
              </span>
              <p className="mt-0.5 text-stone-500">
                <strong>Resposta:</strong> fatores externos e vulnerabilidade socioeconômica
                são deliberadamente isolados da pontuação de fricção. O índice mede
                exclusivamente cumprimento de prazo e taxa de conexão — indicadores
                operacionais sob controle direto da concessionária.
              </p>
            </div>
          </div>
        </SecaoAcordeao>
      </div>
    </div>
  );
}

function SecaoAcordeao({
  id,
  titulo,
  icone,
  aberta,
  aoAlternar,
  children,
}: {
  id: string;
  titulo: string;
  icone: React.ReactNode;
  aberta: boolean;
  aoAlternar: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50/50">
      <button
        type="button"
        onClick={() => aoAlternar(id)}
        aria-expanded={aberta}
        className="flex w-full items-center justify-between p-4 text-left font-bold text-stone-900 transition-colors hover:bg-stone-100/60"
      >
        <span className="flex items-center gap-3">
          {icone}
          <span className="text-xs tracking-wider uppercase">{titulo}</span>
        </span>
        {aberta ? (
          <IconeChevronCima className="h-4 w-4 shrink-0 text-stone-500" />
        ) : (
          <IconeChevronBaixo className="h-4 w-4 shrink-0 text-stone-500" />
        )}
      </button>
      {aberta && (
        <div className="space-y-3 border-t border-stone-200/60 bg-white p-4 pt-0 text-xs text-stone-600">
          {children}
        </div>
      )}
    </div>
  );
}

function iconeBase(props: SVGProps<SVGSVGElement>) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    ...props,
  };
}

function IconeLivro(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconeBase(props)}>
      <path d="M12 6c-1.5-1-4-1.5-6-1v13c2-.5 4.5 0 6 1M12 6c1.5-1 4-1.5 6-1v13c-2-.5-4.5 0-6 1M12 6v14" />
    </svg>
  );
}

function IconePredio(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconeBase(props)}>
      <path d="M6 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15" />
      <path d="M14 21V10a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v11" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </svg>
  );
}

function IconeDocumento(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconeBase(props)}>
      <path d="M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function IconeAtualizar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconeBase(props)}>
      <path d="M20 11A8 8 0 1 0 18 16" />
      <polyline points="20 4 20 11 13 11" />
    </svg>
  );
}

function IconeEscudoAlerta(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconeBase(props)}>
      <path d="M12 2l8 3.5v6c0 5-3.5 8.5-8 10.5-4.5-2-8-5.5-8-10.5v-6z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="16.5" x2="12" y2="16.5" />
    </svg>
  );
}

function IconeChevronBaixo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconeBase(props)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconeChevronCima(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconeBase(props)}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}
