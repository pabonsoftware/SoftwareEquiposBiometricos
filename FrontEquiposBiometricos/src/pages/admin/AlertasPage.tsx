import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import { alertsService } from "@/services/alerts.service";
import type { MaintenanceAlert } from "@/types/scheduling";

type Tab = "open" | "history";

/** HU011 / HU015 — panel de alertas automáticas de mantenimiento preventivo. */
export function AlertasPage() {
  const { usuario } = useAuth();
  // Atender una alerta es un acto sobre la programación: mismo permiso `edit`.
  const canAcknowledge = can(usuario?.role, "scheduling", "edit");

  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<MaintenanceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<MaintenanceAlert | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // `reload` la usan el efecto y los handlers. No pone `loading=true` de forma
  // síncrona: el spinner inicial ya viene del useState, y en un cambio de
  // pestaña se muestra la lista previa un instante (evita el parpadeo).
  const reload = async (which: Tab) => {
    try {
      setItems(await alertsService.list({ open: which === "open" }));
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar las alertas"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Recarga al cambiar de pestaña. El linter marca todo `setState` alcanzable
    // desde un efecto (misma deuda que el resto del panel admin); aquí es
    // deliberado: se hace tras el `await` de la petición.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(tab);
  }, [tab]);

  const submitAck = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await alertsService.acknowledge(target.id, note.trim() || undefined);
      setTarget(null);
      setNote("");
      await reload(tab);
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo atender la alerta"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-app sm:text-3xl">
          Alertas de mantenimiento
        </h1>
        <p className="text-sm text-app-muted">
          Se generan automáticamente antes del vencimiento de cada preventivo o
          calibración programada.
        </p>
      </div>

      <Card>
        <div className="mb-4 flex gap-2">
          {(
            [
              ["open", "Sin atender"],
              ["history", "Historial"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={
                tab === value
                  ? "rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg px-3 py-1.5 text-sm font-medium text-app-muted hover:bg-app-muted"
              }
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-left text-xs uppercase tracking-wider text-app-muted">
                <th className="pb-2 font-medium">Equipo</th>
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 font-medium">Vence</th>
                <th className="pb-2 font-medium">Mensaje</th>
                {tab === "history" && (
                  <th className="pb-2 font-medium">Atendida</th>
                )}
                {tab === "open" && (
                  <th className="pb-2 font-medium text-right">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-app-muted">
                    Cargando...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-app-muted">
                    {tab === "open"
                      ? "No hay alertas sin atender. 🎉"
                      : "Sin alertas atendidas todavía."}
                  </td>
                </tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id} className="text-app">
                    <td className="py-3">
                      <Link
                        to={`/admin/equipos/${a.equipment}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.equipment_asset_tag}
                      </Link>
                      <p className="text-xs text-app-muted">
                        {a.equipment_name} · {a.branch_name}
                      </p>
                    </td>
                    <td className="py-3">
                      <Badge
                        tone={a.alert_type === "OVERDUE" ? "danger" : "warning"}
                      >
                        {a.alert_type_display}
                      </Badge>
                    </td>
                    <td className="py-3 text-app-muted whitespace-nowrap">
                      {a.due_date}
                    </td>
                    <td className="py-3 text-app-muted">{a.message}</td>
                    {tab === "history" && (
                      <td className="py-3 text-app-muted">
                        <p>{a.acknowledged_by_name ?? "—"}</p>
                        {a.acknowledged_at && (
                          <p className="text-xs">
                            {new Date(a.acknowledged_at).toLocaleString()}
                          </p>
                        )}
                        {a.acknowledgement_note && (
                          <p className="text-xs italic">
                            “{a.acknowledgement_note}”
                          </p>
                        )}
                      </td>
                    )}
                    {tab === "open" && (
                      <td className="py-3">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<CheckCheck size={14} />}
                            disabled={!canAcknowledge}
                            title={
                              canAcknowledge
                                ? undefined
                                : "No tienes permiso para atender alertas"
                            }
                            onClick={() => {
                              setTarget(a);
                              setNote("");
                            }}
                          >
                            Atender
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={
          target
            ? `Atender alerta — ${target.equipment_asset_tag}`
            : ""
        }
        size="md"
      >
        {target && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-app bg-app-muted p-3 text-sm">
              <BellRing size={16} className="mt-0.5 text-app-muted" />
              <p>{target.message}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-app">
                Nota (opcional): qué acción se tomó
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Ej.: se reprogramó con el proveedor para el 12/03."
                className="w-full rounded-lg border border-app bg-surface px-3 py-2.5 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            <p className="text-xs text-app-muted">
              La alerta pasa al historial. Si el mantenimiento sigue vencido, el
              sistema no vuelve a alertar sobre él (ya quedó registrado que lo
              estás gestionando).
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setTarget(null)}
              >
                Cancelar
              </Button>
              <Button loading={saving} onClick={() => void submitAck()}>
                Marcar como atendida
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
