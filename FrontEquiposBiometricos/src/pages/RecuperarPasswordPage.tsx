import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, KeyRound, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function RecuperarPasswordPage() {
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError("Ingresa un correo válido");
      return;
    }
    setLoading(true);
    // MOCK: cuando exista backend → api.post("/auth/recuperar", { correo })
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setSent(true);
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
          {!sent ? (
            <>
              <div className="mb-6 flex items-start gap-3">
                <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <KeyRound size={22} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-app">
                    Recuperar contraseña
                  </h1>
                  <p className="mt-1 text-sm text-app-muted">
                    Te enviaremos un enlace al correo registrado para que
                    puedas restablecer tu contraseña.
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
                  label="Correo institucional"
                  name="correo"
                  type="email"
                  placeholder="usuario@clinicapabon.com"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  leftIcon={<Mail size={16} />}
                  required
                />

                <Button type="submit" loading={loading} fullWidth size="lg">
                  {loading ? "Enviando..." : "Enviar enlace de recuperación"}
                </Button>
              </form>

              <p className="mt-6 text-center text-xs text-app-muted">
                ¿Recordaste tu contraseña?{" "}
                <Link
                  to="/login"
                  className="font-medium text-primary hover:underline"
                >
                  Inicia sesión
                </Link>
              </p>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <MailCheck size={28} />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-app">
                Revisa tu correo
              </h1>
              <p className="mt-2 text-sm text-app-muted">
                Si <strong className="text-app">{correo}</strong> está
                registrado en el sistema, recibirás un enlace para restablecer
                tu contraseña en los próximos minutos.
              </p>
              <p className="mt-2 text-xs text-app-muted">
                ¿No te llegó? Revisa la carpeta de spam o vuelve a intentarlo
                en unos minutos.
              </p>
              <Link to="/login" className="mt-6 inline-block w-full">
                <Button fullWidth>Volver a iniciar sesión</Button>
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
