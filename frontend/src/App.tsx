import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { BuscaMunicipio } from './components/BuscaMunicipio';
import { PaginaMapa } from './pages/PaginaMapa';

/**
 * Rotas do Atlas. Por enquanto só o mapa (RF-016/017/055/056) — landing page,
 * painel analítico e telas de login/painéis (Colaborador/Admin) virão em
 * sessões futuras, ver CLAUDE.md "Estado Real do Projeto".
 *
 * A busca de município fica no header (RF-026). A seleção vira navegação com
 * `?municipio=<codigoIbge>` — a PaginaMapa consome o parâmetro (voa até o
 * município e abre o painel) e o remove da URL. Isso desacopla header e
 * página, e dá deep-link de graça (ex.: /?municipio=3550308).
 */
export function App() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-6 border-b border-slate-200 bg-white px-6 py-3">
        <Link to="/" className="text-lg font-semibold text-slate-900">
          Atlas Solar <span className="text-amber-500">Justo</span>
        </Link>
        <nav className="text-sm text-slate-600">
          <Link to="/" className="hover:text-slate-900">
            Mapa
          </Link>
        </nav>
        <div className="ml-auto">
          <BuscaMunicipio
            aoSelecionar={(municipio) => navigate(`/?municipio=${municipio.codigoIbge}`)}
          />
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<PaginaMapa />} />
        </Routes>
      </main>
    </div>
  );
}
