import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Menu, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ROLE_LABEL } from "@/lib/permissions";

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { usuario, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const fullName = usuario
    ? [usuario.first_name, usuario.last_name].filter(Boolean).join(" ") ||
      usuario.username
    : "";

  // El botón "Ir al panel" sólo aparece cuando el usuario está autenticado
  // y NO está ya dentro del panel.
  const showGoToPanel =
    isAuthenticated && !location.pathname.startsWith("/admin");

  return (
    <header className="sticky top-0 z-30 border-b border-app bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-app hover:bg-app-muted lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
          )}
          <Link to="/" className="flex items-center gap-2">
            <div className="rounded-md bg-white p-1 shadow-sm">
              <img
                src="/icons/logo-clinica.png"
                alt="Clínica Pabón"
                className="h-9 w-auto"
              />
            </div>
            <div className="hidden flex-col leading-tight sm:flex">
              <span className="text-sm font-semibold text-app">
                Clínica Pabón
              </span>
              <span className="text-xs text-app-muted">
                Equipos Biomédicos
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {isAuthenticated && usuario ? (
            <>
              <div className="hidden items-center gap-2 rounded-lg border border-app bg-app-muted px-3 py-2 sm:flex">
                <User size={16} className="text-app-muted" />
                <span className="text-sm font-medium text-app">{fullName}</span>
                <span className="rounded bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
                  {ROLE_LABEL[usuario.role]}
                </span>
              </div>
              {showGoToPanel && (
                <Link
                  to="/admin"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-dark)]"
                >
                  <LayoutDashboard size={16} />
                  <span className="hidden sm:inline">Ir al panel</span>
                </Link>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-app bg-surface px-3 text-sm font-medium text-app transition hover:bg-app-muted"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="inline-flex h-10 items-center rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-dark)]"
            >
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
