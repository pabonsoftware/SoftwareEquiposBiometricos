import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import { failuresService } from "@/services/failures.service";
import { equipmentService } from "@/services/equipment.service";
import { can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import type { Equipment } from "@/types/equipment";
import type {
  FailureInput,
  FailureReport,
  FailureSeverity,
} from "@/types/failure";

const SEV_LABEL: Record<FailureSeverity, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

const SEV_TONE: Record<FailureSeverity, "info" | "warning" | "danger" | "neutral"> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

const empty: FailureInput = {
  equipment: 0,
  description: "",
  severity: "MEDIUM",
};

export function FallasPage() {
  const { usuario } = useAuth();
  const role = usuario?.role;

  const [items, setItems] = useState<FailureReport[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [resolvedFilter, setResolvedFilter] = useState("");

  const [editing, setEditing] = useState<FailureReport | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FailureInput>(empty);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<FailureReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [resolveTarget, setResolveTarget] = useState<FailureReport | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolving, setResolving] = useState(false);

  const canCreate = can(role, "failures", "create");
  const canEdit = can(role, "failures", "edit");
  const canDelete = can(role, "failures", "delete");

  const equipmentOptions = useMemo(
    () =>
      equipment.map((e) => ({
        value: String(e.id),
        label: `${e.name} (${e.asset_tag})`,
      })),
    [equipment],
  );

  const equipmentLabel = (id: number) => {
    const e = equipment.find((x) => x.id === id);
    return e ? `${e.name} (${e.asset_tag})` : `Equipo #${id}`;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await failuresService.list({
        ordering: "-reported_at",
        search: search || undefined,
        severity: severityFilter || undefined,
        resolved:
          resolvedFilter === "true"
            ? true
            : resolvedFilter === "false"
              ? false
              : undefined,
      });
      setItems(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar las fallas"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([
      load(),
      equipmentService.list({ ordering: "name" }).then(setEquipment).catch(() => null),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setForm({ ...empty, equipment: equipment[0]?.id ?? 0 });
    setCreating(true);
  };

  const openEdit = (f: FailureReport) => {
    setForm({
      equipment: f.equipment,
      description: f.description,
      severity: f.severity,
    });
    setEditing(f);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm(empty);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await failuresService.update(editing.id, form);
      } else {
        await failuresService.create(form);
      }
      closeModal();
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "Error al guardar"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await failuresService.remove(toDelete.id);
      setToDelete(null);
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  const submitResolve = async () => {
    if (!resolveTarget) return;
    setResolving(true);
    try {
      await failuresService.resolve(resolveTarget.id, resolveNotes || undefined);
      setResolveTarget(null);
      setResolveNotes("");
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo resolver"));
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app sm:text-3xl">
            Reportes de falla
          </h1>
          <p className="text-sm text-app-muted">
            Registra y resuelve fallas reportadas en los equipos biomédicos.
          </p>
        </div>
        {canCreate && (
          <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
            Nuevo reporte
          </Button>
        )}
      </div>

      <Card>
        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
          <Select
            placeholder="Toda severidad"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            options={Object.entries(SEV_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Select
            placeholder="Todos"
            value={resolvedFilter}
            onChange={(e) => setResolvedFilter(e.target.value)}
            options={[
              { value: "false", label: "Sin resolver" },
              { value: "true", label: "Resueltas" },
            ]}
          />
          <Button variant="secondary" onClick={() => void load()}>
            Aplicar filtros
          </Button>
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
                <th className="pb-2 font-medium">Descripción</th>
                <th className="pb-2 font-medium">Severidad</th>
                <th className="pb-2 font-medium">Reportada</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2 font-medium text-right">Acciones</th>
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
                    Sin reportes.
                  </td>
                </tr>
              ) : (
                items.map((f) => (
                  <tr key={f.id} className="text-app">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                          <AlertTriangle size={14} />
                        </span>
                        <div>
                          <p className="font-medium">
                            {f.equipment_asset_tag
                              ? f.equipment_asset_tag
                              : equipmentLabel(f.equipment)}
                          </p>
                          {f.branch_name && (
                            <p className="text-xs text-app-muted">{f.branch_name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-app-muted">
                      <p className="line-clamp-2 max-w-md">{f.description}</p>
                    </td>
                    <td className="py-3">
                      <Badge tone={SEV_TONE[f.severity]}>
                        {SEV_LABEL[f.severity]}
                      </Badge>
                    </td>
                    <td className="py-3 text-app-muted">
                      {new Date(f.reported_at).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <Badge tone={f.resolved ? "success" : "warning"}>
                        {f.resolved ? "Resuelta" : "Abierta"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {canEdit && !f.resolved && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<CheckCheck size={14} />}
                            onClick={() => {
                              setResolveTarget(f);
                              setResolveNotes("");
                            }}
                          >
                            Resolver
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => openEdit(f)}
                          >
                            Editar
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="danger"
                            leftIcon={<Trash2 size={14} />}
                            onClick={() => setToDelete(f)}
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={creating || !!editing}
        onClose={closeModal}
        title={editing ? "Editar reporte" : "Nuevo reporte de falla"}
        size="lg"
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Equipo"
            value={String(form.equipment)}
            onChange={(e) =>
              setForm({ ...form, equipment: Number(e.target.value) })
            }
            options={equipmentOptions}
            placeholder="Selecciona un equipo"
            required
            className="sm:col-span-2"
          />
          <Select
            label="Severidad"
            value={form.severity}
            onChange={(e) =>
              setForm({ ...form, severity: e.target.value as FailureSeverity })
            }
            options={Object.entries(SEV_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-app">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              required
              className="w-full rounded-lg border border-app bg-surface px-3 py-2.5 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={closeModal} type="button">
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar reporte"
        description="¿Eliminar este reporte de falla? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />

      <Modal
        open={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        title="Marcar falla como resuelta"
        size="md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-app-muted">
            Documenta cómo se resolvió la falla. Las notas son opcionales pero
            recomendadas.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-app">
              Notas de resolución
            </label>
            <textarea
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-app bg-surface px-3 py-2.5 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResolveTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={submitResolve} loading={resolving}>
              Marcar resuelta
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
