import { Link, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
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

/**
 * Layout do "app interno" (tudo que não é a landing pública): header fixo
 * com nav/busca/sessão + <Outlet/> para a rota filha. A landing (RF-001/002)
 * tem header próprio, mais simples (só logo + "Entrar") — por isso NÃO usa
 * este layout, ver App() abaixo.
 */
function LayoutApp() {
  const navigate = useNavigate();
  const { sessao, sair } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-6 border-b border-slate-200 bg-white px-6 py-3">
        <Link to="/" className="text-lg font-semibold text-slate-900">
          Atlas Solar <span className="text-amber-500">Justo</span>
        </Link>
        <nav className="flex gap-4 text-sm text-slate-600">
          <Link to="/mapa" className="hover:text-slate-900">
            Mapa
          </Link>
          <Link to="/painel-analitico" className="hover:text-slate-900">
            Painel Analítico
          </Link>
          <Link to="/ranking-distribuidoras" className="hover:text-slate-900">
            Ranking de Distribuidoras
          </Link>
          {sessao && (
            <Link to="/colaborador" className="hover:text-slate-900">
              Painel Colaborador
            </Link>
          )}
          {sessao?.usuario.papel === 'administrador' && (
            <Link to="/admin" className="hover:text-slate-900">
              Painel Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <BuscaMunicipio
            aoSelecionar={(municipio) => navigate(`/mapa?municipio=${municipio.codigoIbge}`)}
          />
          {sessao ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>
                {sessao.usuario.nome}{' '}
                <span className="text-xs text-slate-400">({sessao.usuario.papel})</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  sair();
                  navigate('/mapa');
                }}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                Sair
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Entrar
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
 * para "/mapa" (RF-015/016/017/055/056), que junto com "/painel-analitico"
 * (RF-049/050/052), "/login" (RF-009/013/014) e os painéis Colaborador
 * (RF-059 a RF-067)/Admin (RF-070 a RF-077) vivem sob LayoutApp (header
 * interno com nav/busca/sessão). Ver CLAUDE.md "Estado Real do Projeto".
 *
 * A busca de município fica no header do LayoutApp (RF-026). A seleção vira
 * navegação com `/mapa?municipio=<codigoIbge>` — a PaginaMapa consome o
 * parâmetro (voa até o município e abre o painel) e o remove da URL. Isso
 * desacopla header e página, e dá deep-link de graça
 * (ex.: /mapa?municipio=3550308).
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<PaginaLanding />} />
      <Route element={<LayoutApp />}>
        <Route path="/mapa" element={<PaginaMapa />} />
        <Route path="/painel-analitico" element={<PainelAnalitico />} />
        <Route path="/ranking-distribuidoras" element={<PaginaRankingDistribuidoras />} />
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
