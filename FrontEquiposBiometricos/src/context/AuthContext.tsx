import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { tokenStorage, USER_KEY } from "@/lib/api";
import { authService } from "@/services/auth.service";
import type { LoginRequest, Usuario } from "@/types/auth";

interface AuthContextValue {
  usuario: Usuario | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (data: LoginRequest) => Promise<Usuario>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadCachedUser(): Usuario | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Usuario;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedUser = loadCachedUser();
  const [usuario, setUsuario] = useState<Usuario | null>(cachedUser);
  // Sólo bloqueamos la app si NO hay caché de usuario pero sí hay token.
  // Si el caché existe, renderizamos al instante y refrescamos en segundo
  // plano sin bloquear la UI.
  const [loading, setLoading] = useState<boolean>(
    !!tokenStorage.getAccess() && !cachedUser,
  );

  useEffect(() => {
    let cancelled = false;
    const token = tokenStorage.getAccess();

    // Sin token → nada que hidratar.
    if (!token) {
      setLoading(false);
      return;
    }

    // Hidratación: refrescar desde /users/me/. Si la petición falla o se
    // pasa del timeout, el .catch limpia tokens y caché y la app queda en
    // estado público (sin spinner permanente).
    authService
      .me()
      .then((u) => {
        if (cancelled) return;
        setUsuario(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
      })
      .catch(() => {
        if (cancelled) return;
        // Sólo limpiamos si tampoco había caché; si había caché, mantenemos
        // la sesión optimistamente (el siguiente request 401 disparará el
        // refresh + redirect).
        if (!cachedUser) {
          tokenStorage.clear();
          setUsuario(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (data: LoginRequest) => {
    const tokens = await authService.login(data);
    tokenStorage.setTokens(tokens.access, tokens.refresh);
    const u = await authService.me();
    setUsuario(u);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    return u;
  };

  const logout = () => {
    tokenStorage.clear();
    setUsuario(null);
  };

  const refreshUser = async () => {
    const u = await authService.me();
    setUsuario(u);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  };

  return (
    <AuthContext.Provider
      value={{
        usuario,
        isAuthenticated: !!usuario,
        loading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
