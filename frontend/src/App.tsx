import { Link, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { BuscaMunicipio } from './components/BuscaMunicipio';
import { RotaProtegida } from './components/RotaProtegida';
import { useAuth } from './contexts/AuthContext';
import { PaginaLanding } from './pages/PaginaLanding';
import { PaginaLogin } from './pages/PaginaLogin';
import { PaginaMapa } from './pages/PaginaMapa';
import { PainelAdmin } from './pages/PainelAdmin';
import { PainelAnalitico } from './pages/PainelAnalitico';
import { PainelColaborador } from './pages/PainelColaborador';
import { PaginaRankingDistribuidoras } from './pages/PaginaRankingDistribuidoras';
import { PaginaVaziosDeAcesso } from './pages/PaginaVaziosDeAcesso';
import { PaginaStatusDados } from './pages/PaginaStatusDados';

/**
 * Layout do "app interno" (tudo que não é a landing pública): header fixo
 * com nav/busca/sessão + <Outlet/> para a rota filha. A landing (RF-001/002)
 * tem header próprio, mais simples (só logo + "Entrar") — por isso NÃO usa
 * este layout, ver App() abaixo.
 */
/** Aba do header — sublinhado carmim quando a rota está ativa (paleta Pólis,
 * 25/07/2026 — antes era violeta, resíduo do protótipo AI Studio original;
 * NavLink dá o estado ativo de graça, sem estado manual). */
function classeAba({ isActive }: { isActive: boolean }) {
  return `flex h-full items-center border-b-2 px-1 transition-all ${
    isActive
      ? 'border-red-700 text-red-700'
      : 'border-transparent text-slate-500 hover:text-red-700'
  }`;
}

function LayoutApp() {
  const navigate = useNavigate();
  const { sessao, sair } = useAuth();

  return (
    <div className="flex h-full flex-col font-sans">
      <header className="flex h-16 shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-6 shadow-2xs">
        <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-95">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-stone-900">
            <span className="h-4 w-4 rounded-full border-2 border-white" />
          </span>
          <span>
            <span className="block font-display text-base leading-none font-bold tracking-tight text-slate-800">
              ATLAS SOLAR JUSTO
            </span>
            <span className="mt-1 block font-mono text-[10px] tracking-wider text-slate-400 uppercase">
              Justiça Energética • Brasil
            </span>
          </span>
        </Link>
        <nav className="flex h-full items-center gap-4 text-xs font-semibold">
          <NavLink to="/mapa" className={classeAba}>
            Mapa Interativo
          </NavLink>
          <NavLink to="/dossie-executivo" className={classeAba}>
            Dossiê Executivo
          </NavLink>
          <NavLink to="/visao-setorial" className={classeAba}>
            Visão Setorial
          </NavLink>
          <NavLink to="/base-de-evidencias" className={classeAba}>
            Base de Evidências
          </NavLink>
          {sessao && (
            <NavLink
              to="/colaborador"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 transition-all ${
                  isActive
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    : 'bg-amber-100/60 text-amber-800 hover:bg-amber-100'
                }`
              }
            >
              Painel Colaborador
            </NavLink>
          )}
          {sessao?.usuario.papel === 'administrador' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 transition-all ${
                  isActive
                    ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                    : 'bg-red-100/60 text-red-800 hover:bg-red-100'
                }`
              }
            >
              Painel Admin
            </NavLink>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <BuscaMunicipio
            aoSelecionar={(municipio) => navigate(`/mapa?municipio=${municipio.codigoIbge}`)}
          />
          {sessao ? (
            <div className="flex items-center gap-2">
              <span className="hidden flex-col items-end text-[11px] leading-tight text-slate-500 sm:flex">
                <span className="font-semibold text-slate-800">{sessao.usuario.nome}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">
                  {sessao.usuario.papel}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  sair();
                  navigate('/mapa');
                }}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                title="Sair da conta"
              >
                Sair
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-slate-800"
            >
              Acesso Técnico
            </Link>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Rotas do Atlas. "/" é a landing institucional pública (RF-001 a RF-008,
 * 10/07/2026) — antes desta sessão "/" ia direto para o mapa; o mapa migrou
 * para "/mapa" (RF-015/016/017/055/056), que junto com "/dossie-executivo"
 * (RF-049/050/052), "/login" (RF-009/013/014) e os painéis Colaborador
 * (RF-059 a RF-067)/Admin (RF-070 a RF-077) vivem sob LayoutApp (header
 * interno com nav/busca/sessão). Ver CLAUDE.md "Estado Real do Projeto".
 *
 * A busca de município fica no header do LayoutApp (RF-026). A seleção vira
 * navegação com `/mapa?municipio=<codigoIbge>` — a PaginaMapa consome o
 * parâmetro (voa até o município e abre o painel) e o remove da URL. Isso
 * desacopla header e página, e dá deep-link de graça
 * (ex.: /mapa?municipio=3550308).
 *
 * Taxonomia institucional do menu (30/07/2026, decisão do usuário): o header
 * deixou de nomear TELAS por resultado ("Vazios de Acesso", "Ranking") e
 * passou a nomear LENTES de análise — evita o tom de denúncia e escala
 * melhor quando novas metodologias entrarem. "/painel-analitico" virou
 * "/dossie-executivo" (rota E rótulo mudaram); "/ranking-distribuidoras"
 * virou "/visao-setorial"; "/status-dados" virou "/base-de-evidencias".
 * "/vazios-de-acesso" SAIU do menu, mas a rota continua existindo (não foi
 * deletada) — chegam nela a lente habitacional da landing (PaginaLanding,
 * CardExplicativo "Ligar a lente habitacional") e o link do TourAchados; a
 * mesma tela virou também um MODAL, aberto de dentro do Dossiê Executivo
 * (RankingPrioridadeExecutivo → "Carregar Top 50" → ModalDetalhamentoVazios),
 * sem duplicar lógica — ambos os pontos de entrada renderizam o mesmo
 * DetalhamentoTerritorialVazios (components/vazios-de-acesso/).
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<PaginaLanding />} />
      <Route element={<LayoutApp />}>
        <Route path="/mapa" element={<PaginaMapa />} />
        <Route path="/dossie-executivo" element={<PainelAnalitico />} />
        <Route path="/visao-setorial" element={<PaginaRankingDistribuidoras />} />
        <Route path="/vazios-de-acesso" element={<PaginaVaziosDeAcesso />} />
        <Route path="/base-de-evidencias" element={<PaginaStatusDados />} />
        <Route path="/login" element={<PaginaLogin />} />
        <Route
          path="/colaborador"
          element={
            <RotaProtegida papeis={['colaborador', 'administrador']}>
              <PainelColaborador />
            </RotaProtegida>
          }
        />
        <Route
          path="/admin"
          element={
            <RotaProtegida papeis={['administrador']}>
              <PainelAdmin />
            </RotaProtegida>
          }
        />
      </Route>
    </Routes>
  );
}
