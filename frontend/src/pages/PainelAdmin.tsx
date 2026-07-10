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
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Painel Administrador</h1>
        <p className="text-sm text-slate-500">
          Olá, {sessao?.usuario.nome} — metadados, aprovação de indicadores, versionamento e
          usuários.
        </p>
      </div>
      <CartaoMetadadosBasesDados />
      <CartaoAprovacoesIndicadores />
      <CartaoVersoesPublicadas />
      <CartaoGestaoUsuarios />
    </div>
  );
}
