import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const USER_KEY = "biometric_user";

// El access/refresh token ya NO se guarda en localStorage: el backend los
// entrega como cookies httpOnly (ver api/v1/common/views.py), así que un
// XSS no puede leerlos ni robarlos. El navegador las adjunta solo con
// `withCredentials: true`. Lo único que seguimos cacheando localmente es el
// perfil del usuario (no sensible) para pintar la UI al instante.
export const userCache = {
  get(): unknown | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  set(user: unknown) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(USER_KEY);
  },
};

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

// Timeout global (ms). Si el backend no responde, las peticiones se cortan
// para que la UI no se quede colgada con un spinner eterno.
const REQUEST_TIMEOUT_MS = 15000;

const UNSAFE_METHODS = new Set(["post", "put", "patch", "delete"]);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Cliente "raw" para refresh — sin el interceptor de response (que dispara
// el propio refresh en un 401) para no entrar en bucles. Sí lleva el
// interceptor de CSRF, porque el refresh es un POST autenticado por cookie.
const rawClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Django exige el header X-CSRFToken (double-submit cookie) en requests que
// mutan estado cuando la autenticación viaja por cookie. El valor de la
// cookie `csrftoken` es legible por JS a propósito (no es httpOnly).
function attachCsrfHeader(config: InternalAxiosRequestConfig) {
  const method = config.method?.toLowerCase();
  if (method && UNSAFE_METHODS.has(method)) {
    const csrfToken = readCookie("csrftoken");
    if (csrfToken) {
      config.headers.set("X-CSRFToken", csrfToken);
    }
  }
  return config;
}

api.interceptors.request.use(attachCsrfHeader);
rawClient.interceptors.request.use(attachCsrfHeader);

let isRefreshing = false;
let pending: Array<(ok: boolean) => void> = [];

function notifyAll(ok: boolean) {
  pending.forEach((cb) => cb(ok));
  pending = [];
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    // /auth/token/cookie/refresh/ (no /auth/token/refresh/): esa otra ruta
    // es la variante "clásica" para la app móvil, que espera el refresh
    // token en el body — acá viaja en la cookie httpOnly.
    await rawClient.post("/auth/token/cookie/refresh/");
    return true;
  } catch {
    return false;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const url = original?.url ?? "";

    const isAuthEndpoint = url.includes("/auth/token/");

    if (status !== 401 || original?._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pending.push((ok) => {
          if (!ok) {
            reject(error);
            return;
          }
          original._retry = true;
          resolve(api(original));
        });
      });
    }

    original._retry = true;
    isRefreshing = true;
    const refreshed = await refreshAccessToken();
    isRefreshing = false;
    notifyAll(refreshed);

    if (!refreshed) {
      userCache.clear();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
      return Promise.reject(error);
    }

    return api(original);
  },
);

export function getApiErrorMessage(error: unknown, fallback = "Ocurrió un error"): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      // DRF suele devolver { detail: "..." } o { campo: ["msg"] }
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
      const firstField = Object.values(data as Record<string, unknown>)[0];
      if (Array.isArray(firstField) && typeof firstField[0] === "string") {
        return firstField[0];
      }
      if (typeof firstField === "string") return firstField;
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
