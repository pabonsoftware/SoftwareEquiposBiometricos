import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getApiErrorMessage } from "@/lib/api";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/featureFlags";

const features = [
  {
    title: "Hojas de vida",
    desc: "Registro completo y actualizado de cada equipo biomédico.",
  },
  {
    title: "Mantenimientos preventivos y correctivos",
    desc: "Programa, ejecuta y documenta intervenciones técnicas.",
  },
  {
    title: "Reportes y trazabilidad",
    desc: "Consulta el estado e historial de cada equipo en tiempo real.",
  },
  {
    title: "Usuarios y roles",
    desc: "Control de acceso por rol dentro de la clínica.",
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // ProtectedRoute pasa la URL pretendida en `state.from` (ej. al escanear un
  // QR sin sesión activa). Sólo respetamos rutas internas que arranquen en /.
  const fromState = (location.state as { from?: string } | null)?.from;
  const redirectTo =
    typeof fromState === "string" && fromState.startsWith("/") ? fromState : "/admin";

  const [formData, setFormData] = useState({ username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(formData);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Credenciales inválidas"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* PANEL IZQUIERDO — Branding (oculto en móvil) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#d71920] via-[#b2141a] to-[#7a0d12] p-12 text-white lg:flex">
        <div className="relative z-10 max-w-lg">
          <div className="inline-block rounded-xl bg-white p-4 shadow-lg">
            <img
              src="/icons/logo-clinica.png"
              alt="Clínica Pabón"
              className="h-20 w-auto"
            />
          </div>

          <h1 className="mt-10 text-4xl font-bold leading-tight">
            Gestión de Equipos <br /> Biomédicos
          </h1>
          <p className="mt-4 text-white/90">
            Plataforma interna de Clínica Pabón para controlar el inventario, el
            mantenimiento y la trazabilidad de todos los equipos biomédicos de
            la institución.
          </p>

          <ul className="mt-10 space-y-4">
            {features.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                  ✓
                </span>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-white/80">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-white/70">
          © {new Date().getFullYear()} Clínica Pabón — Todos los derechos
          reservados.
        </p>

        <img
          src="/images/paboncito.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -bottom-4 -right-4 h-80 w-80 select-none object-contain opacity-95 drop-shadow-2xl"
        />
      </aside>

      {/* PANEL DERECHO — Formulario */}
      <section className="flex items-center justify-center bg-app p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-app-muted transition hover:text-[var(--color-primary)]"
            >
              <ArrowLeft size={14} />
              Volver al inicio
            </Link>
            <ThemeToggle />
          </div>

          {/* Logo en móvil */}
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <img
                src="/icons/logo-clinica.png"
                alt="Clínica Pabón"
                className="h-16 w-auto"
              />
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-app">Bienvenido</h2>
            <p className="mt-2 text-sm text-app-muted">
              Ingresa tus credenciales para acceder al sistema.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Usuario"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="usuario"
              value={formData.username}
              onChange={handleChange}
              leftIcon={<UserIcon size={16} />}
              required
            />
            <Input
              label="Contraseña"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              leftIcon={<Lock size={16} />}
              required
            />

            <Button type="submit" loading={loading} fullWidth size="lg" className="mt-2">
              {loading ? "Ingresando..." : "Iniciar sesión"}
            </Button>
          </form>

          <div className="mt-6 flex flex-col items-start gap-2 text-sm">
            <Link
              to="/recuperar-password"
              className="text-primary hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
            {PUBLIC_REGISTRATION_ENABLED ? (
              <Link
                to="/registro"
                className="text-primary hover:underline"
              >
                ¿No tienes cuenta? Solicitar registro
              </Link>
            ) : (
              <p className="text-app-muted">
                ¿No tienes cuenta? El registro de nuevos usuarios lo realiza un
                administrador.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
