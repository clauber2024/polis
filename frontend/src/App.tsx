import { Link, Route, Routes } from 'react-router-dom';
import { PaginaMapa } from './pages/PaginaMapa';

/**
 * Rotas do Atlas. Por enquanto só o mapa (RF-016/017/055/056) — landing page,
 * painel analítico e telas de login/painéis (Colaborador/Admin) virão em
 * sessões futuras, ver CLAUDE.md "Estado Real do Projeto".
 */
export function App() {
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
      </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<PaginaMapa />} />
        </Routes>
      </main>
    </div>
  );
}
