import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { authService } from "@/services/auth.service";
import { getApiErrorMessage } from "@/lib/api";

export function RestablecerPasswordPage() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const linkOk = Boolean(uid && token);

  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pwd.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (pwd !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await authService.confirmPasswordReset({ uid, token, new_password: pwd });
      setDone(true);
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "No se pudo restablecer la contraseña. El enlace puede haber expirado.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-muted p-6">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm font-medium text-app-muted hover:text-primary"
          >
            <ArrowLeft size={16} />
            Volver a iniciar sesión
          </Link>
          <ThemeToggle />
        </div>

        <Card padding="lg">
          {done ? (
            <div className="text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 size={28} />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-app">
                Contraseña actualizada
              </h1>
              <p className="mt-2 text-sm text-app-muted">
                Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
              <Link to="/login" className="mt-6 inline-block w-full">
                <Button fullWidth>Ir a iniciar sesión</Button>
              </Link>
            </div>
          ) : !linkOk ? (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-app">Enlace inválido</h1>
              <p className="mt-2 text-sm text-app-muted">
                El enlace de recuperación está incompleto o es incorrecto.
                Solicita uno nuevo.
              </p>
              <Link
                to="/recuperar-password"
                className="mt-6 inline-block w-full"
              >
                <Button fullWidth>Solicitar un nuevo enlace</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-start gap-3">
                <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <KeyRound size={22} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-app">
                    Nueva contraseña
                  </h1>
                  <p className="mt-1 text-sm text-app-muted">
                    Elige una contraseña de al menos 8 caracteres, con una
                    mayúscula, un número y un símbolo.
                  </p>
                </div>
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
                  label="Nueva contraseña"
                  name="new_password"
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  leftIcon={<Lock size={16} />}
                  autoComplete="new-password"
                  required
                />
                <Input
                  label="Confirmar nueva contraseña"
                  name="confirm_new_password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  leftIcon={<Lock size={16} />}
                  autoComplete="new-password"
                  required
                />

                <Button type="submit" loading={loading} fullWidth size="lg">
                  {loading ? "Guardando..." : "Restablecer contraseña"}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
