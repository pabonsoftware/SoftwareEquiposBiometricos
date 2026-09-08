import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { can, type Resource } from "@/lib/permissions";
import type { Rol } from "@/types/auth";

interface ProtectedRouteProps {
  roles?: Rol[];
  /**
   * Si se define, exige permiso de lectura sobre ese recurso (misma regla que
   * usa el menú lateral). Entrar por URL directa a un módulo que el rol no ve
   * redirige al panel en vez de mostrar un error de API.
   */
  resource?: Resource;
}

export function ProtectedRoute({ roles, resource }: ProtectedRouteProps) {
  const { usuario, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Preservamos la URL pretendida (ej. /admin/equipos/42 al escanear un QR)
    // para que LoginPage redirija de vuelta tras autenticarse.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }
  if (roles && usuario && !roles.includes(usuario.role)) {
    return <Navigate to="/admin" replace />;
  }
  if (resource && usuario && !can(usuario.role, resource, "view")) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
