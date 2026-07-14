import { CartaoAprovacoesIndicadores } from '../components/admin/CartaoAprovacoesIndicadores';
import { CartaoGestaoUsuarios } from '../components/admin/CartaoGestaoUsuarios';
import { CartaoMetadadosBasesDados } from '../components/admin/CartaoMetadadosBasesDados';
import { CartaoVersoesPublicadas } from '../components/admin/CartaoVersoesPublicadas';
import { useAuth } from '../contexts/AuthContext';

/**
 * Painel Admin (RF-070 a RF-077) — só papel Administrador acessa (ver
 * RotaProtegida em App.tsx). RF-070 (upload de arquivo real) não
 * implementado por decisão do projeto — carga de dado continua via ETL
 * Python; aqui só o workflow/status.
 */
export function PainelAdmin() {
  const { sessao } = useAuth();

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6 font-sans">
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-6 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 font-mono text-[10px] font-semibold text-red-700">
            Ambiente Administrativo de Auditoria
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Painel Administrador
          </h1>
          <p className="text-xs text-slate-500">
            Olá, {sessao?.usuario.nome} — metadados, aprovação de indicadores, versionamento e
            usuários.
          </p>
        </div>
      </div>

      {/* Telemetria de uso — pedida no restyle do protótipo do AI Studio
          (12/07/2026), mas o protótipo usa números FIXOS/inventados no
          código (acessos por página, exportações por semana). Este projeto
          nunca fabrica indicador sem fonte real (mesmo princípio de
          indicadoresIndisponiveis em estatisticasNacionais.service.ts e das
          notas de ausência documentada do painel de município) — não há
          instrumentação de analytics real hoje, então o card mostra isso
          honestamente em vez de inventar um gráfico. Se/quando o projeto
          decidir instrumentar acessos de verdade (ex.: tabela de eventos +
          endpoint agregador), é essa seção que ganha o gráfico real. */}
      <section className="rounded border border-dashed border-slate-300 bg-slate-50/60 p-4">
        <span className="block font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Telemetria de uso e auditoria de acessos
        </span>
        <p className="mt-1 text-xs text-slate-500">
          Não implementado: o Atlas ainda não instrumenta eventos de acesso/exportação (não há
          tabela ou endpoint para isso). O protótipo visual do AI Studio mostra gráficos aqui, mas
          com números fixos no código — este painel não reproduz isso sem uma fonte real, mesmo
          critério de "Em breve" já usado na Landing (RF-005).
        </p>
      </section>

      <CartaoMetadadosBasesDados />
      <CartaoAprovacoesIndicadores />
      <CartaoVersoesPublicadas />
      <CartaoGestaoUsuarios />
    </div>
  );
}
