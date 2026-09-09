import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { getApiErrorMessage } from "@/lib/api";
import { auditService } from "@/services/audit.service";
import type { AuditLog } from "@/types/audit";

const ACTION_OPTIONS = [
  { value: "", label: "Todas las acciones" },
  { value: "create", label: "Creación" },
  { value: "update", label: "Actualización" },
  { value: "delete", label: "Eliminación" },
  { value: "approve", label: "Aprobación" },
  { value: "close", label: "Cierre" },
  { value: "cancel", label: "Cancelación" },
];

const ACTION_TONE: Record<string, "success" | "info" | "danger" | "warning" | "neutral"> = {
  create: "success",
  update: "info",
  delete: "danger",
  approve: "success",
  close: "neutral",
  cancel: "warning",
};

const PAGE_SIZE = 20;

/** RFN009 §12 — consulta del rastro de auditoría (solo Admin y Coordinador). */
export function AuditoriaPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState("");
  const [model, setModel] = useState("");
  const [search, setSearch] = useState("");

  const load = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditService.list({
        action: action || undefined,
        model_label: model || undefined,
        search: search || undefined,
        page: targetPage,
      });
      setItems(data.results);
      setCount(data.count);
      setPage(targetPage);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo cargar la auditoría"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Carga inicial (misma deuda de lint que el resto del panel admin: el
    // `setState` ocurre tras el `await` de la petición, no de forma síncrona).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-app sm:text-3xl">
          Auditoría
        </h1>
        <p className="text-sm text-app-muted">
          Rastro de acciones sensibles: quién, cuándo, qué cambió (RFN009).
        </p>
      </div>

      <Card>
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Acción"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            options={ACTION_OPTIONS}
          />
          <Input
            label="Modelo (ej. equipment.equipment)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <Input
            label="Buscar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load(1);
            }}
          />
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => void load(1)}>
              Aplicar filtros
            </Button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-left text-xs uppercase tracking-wider text-app-muted [&>th]:pb-2">
                <th>Fecha</th>
                <th>Actor</th>
                <th>Acción</th>
                <th>Objeto</th>
                <th>Cambios</th>
                <th>IP</th>
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
                    Sin registros para los filtros actuales.
                  </td>
                </tr>
              ) : (
                items.map((log) => (
                  <tr key={log.id} className="text-app [&>td]:py-2 align-top">
                    <td className="whitespace-nowrap text-app-muted">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck size={12} className="text-app-muted" />
                        {log.actor_name}
                      </span>
                    </td>
                    <td>
                      <Badge tone={ACTION_TONE[log.action] ?? "neutral"}>
                        {log.action_display}
                      </Badge>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-app-muted">
                        {log.model_label}#{log.object_id}
                      </span>
                      <p className="text-xs text-app-muted">{log.object_repr}</p>
                    </td>
                    <td className="max-w-sm">
                      {log.changes?.fields ? (
                        <ul className="text-xs">
                          {Object.entries(log.changes.fields).map(([f, c]) => (
                            <li key={f}>
                              <span className="text-app-muted">{f}: </span>
                              <span className="line-through opacity-60">
                                {String(c.from)}
                              </span>{" "}
                              → <span>{String(c.to)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : Object.keys(log.changes ?? {}).length > 0 ? (
                        <code className="text-xs text-app-muted">
                          {JSON.stringify(log.changes)}
                        </code>
                      ) : (
                        <span className="text-xs text-app-muted">—</span>
                      )}
                    </td>
                    <td className="text-xs text-app-muted">
                      {log.ip_address ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-app pt-3 text-xs text-app-muted">
          <span>{count} registro(s)</span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<ChevronLeft size={14} />}
              disabled={page <= 1 || loading}
              onClick={() => void load(page - 1)}
            >
              Anterior
            </Button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              rightIcon={<ChevronRight size={14} />}
              disabled={page >= totalPages || loading}
              onClick={() => void load(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
