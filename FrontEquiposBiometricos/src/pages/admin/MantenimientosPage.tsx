import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, FileText, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TechnicianSelect } from "@/components/ui/TechnicianSelect";
import { assignedFirstName, assignmentPayload } from "@/lib/users";
import { useAuth } from "@/context/AuthContext";
import { maintenanceService } from "@/services/maintenance.service";
import { equipmentService } from "@/services/equipment.service";
import { schedulingService } from "@/services/scheduling.service";
import { usersService } from "@/services/users.service";
import { can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import type { Equipment } from "@/types/equipment";
import type { Usuario } from "@/types/auth";
import type {
  MaintenanceInput,
  MaintenanceKind,
  MaintenanceRecord,
} from "@/types/maintenance";
import type { ScheduledMaintenance } from "@/types/scheduling";

const TECHNICIAN_ROLES = ["tecnico", "ingeniero"];

const KIND_LABEL: Record<MaintenanceKind, string> = {
  PREVENTIVE: "Preventivo",
  CORRECTIVE: "Correctivo",
  REPAIR: "Reparación",
};

const KIND_TONE: Record<MaintenanceKind, "info" | "warning" | "danger"> = {
  PREVENTIVE: "info",
  CORRECTIVE: "warning",
  REPAIR: "danger",
};

const empty: MaintenanceInput = {
  equipment: 0,
  kind: "PREVENTIVE",
  date: "",
  description: "",
  assigned_technician: null,
  assigned_engineer: null,
  cost: "",
  scheduled_maintenance: null,
};

export function MantenimientosPage() {
  const { usuario } = useAuth();
  const role = usuario?.role;
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<MaintenanceRecord[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState("");

  const [editing, setEditing] = useState<MaintenanceRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<MaintenanceInput>(empty);
  const [pdf, setPdf] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<MaintenanceRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [technicians, setTechnicians] = useState<Usuario[]>([]);
  const [technicianListAvailable, setTechnicianListAvailable] = useState(false);

  const [pendingSchedules, setPendingSchedules] = useState<ScheduledMaintenance[]>(
    [],
  );

  const canCreate = can(role, "maintenance", "create");
  const canEdit = can(role, "maintenance", "edit");
  const canDelete = can(role, "maintenance", "delete");

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

  // Opciones de agendamientos pendientes para el equipo actual del formulario.
  // Si se está editando y el agendamiento vinculado ya quedó cumplido (porque
  // el backend lo cerró al crear este mantenimiento), se inyecta a mano para
  // que el select no quede vacío.
  const scheduleOptions = useMemo(() => {
    const list = pendingSchedules.filter((s) => s.equipment === form.equipment);
    if (
      editing?.scheduled_maintenance &&
      editing.scheduled_maintenance_detail &&
      !list.some((s) => s.id === editing.scheduled_maintenance)
    ) {
      list.unshift(editing.scheduled_maintenance_detail);
    }
    return list.map((s) => ({
      value: String(s.id),
      label: `${s.scheduled_date} · ${s.kind === "PREVENTIVE" ? "Preventivo" : "Reparación"}${s.notes ? ` — ${s.notes}` : ""}`,
    }));
  }, [pendingSchedules, form.equipment, editing]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await maintenanceService.list({
        ordering: "-date",
        search: search || undefined,
        kind: kindFilter || undefined,
        equipment: equipmentFilter ? Number(equipmentFilter) : undefined,
      });
      setItems(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar los mantenimientos"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([
      load(),
      equipmentService.list({ ordering: "name" }).then(setEquipment).catch(() => null),
      schedulingService
        .list({ is_completed: false, ordering: "scheduled_date" })
        .then(setPendingSchedules)
        .catch(() => null),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si entramos desde "Realizar mantenimiento" de un agendamiento, abrimos
  // el modal pre-llenado con sus datos (equipo, tipo, asignado, FK) y la
  // fecha de hoy como ejecución. El parámetro se limpia al cerrar o guardar.
  useEffect(() => {
    const idStr = searchParams.get("scheduling");
    if (!idStr) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await schedulingService.retrieve(id);
        if (cancelled) return;
        if (s.is_completed) {
          alert("Ese agendamiento ya fue cumplido.");
          setSearchParams({}, { replace: true });
          return;
        }
        setPendingSchedules((prev) =>
          prev.some((p) => p.id === s.id) ? prev : [s, ...prev],
        );
        setForm({
          equipment: s.equipment,
          kind: s.kind,
          date: new Date().toISOString().slice(0, 10),
          description: s.notes ?? "",
          assigned_technician: s.assigned_technician ?? null,
          assigned_engineer: s.assigned_engineer ?? null,
          cost: "",
          scheduled_maintenance: s.id,
        });
        setPdf(null);
        setCreating(true);
      } catch (err) {
        alert(getApiErrorMessage(err, "No se pudo cargar el agendamiento"));
        setSearchParams({}, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  // Carga la lista de técnicos disponibles. Si el usuario no tiene permiso
  // para listar usuarios (coordinador/ingeniero), simplemente no se muestra
  // el select y volvemos al input de texto libre.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lists = await Promise.all(
          TECHNICIAN_ROLES.map((r) =>
            usersService.list({ role: r, is_active: true, ordering: "first_name" }),
          ),
        );
        if (cancelled) return;
        const flat = lists.flat();
        // Dedup por id
        const map = new Map<number, Usuario>();
        flat.forEach((u) => map.set(u.id, u));
        setTechnicians(Array.from(map.values()));
        setTechnicianListAvailable(true);
      } catch {
        if (!cancelled) {
          setTechnicians([]);
          setTechnicianListAvailable(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // El responsable viene en los campos anidados que devuelve el backend
  // (assigned_technician_detail / assigned_engineer_detail). Como fallback,
  // se usa el campo legacy de texto libre `technician` si existe.
  const labelForTechnician = (m: MaintenanceRecord) =>
    assignedFirstName(m.assigned_technician_detail) ??
    assignedFirstName(m.assigned_engineer_detail) ??
    (m.technician?.trim().split(/\s+/)[0] || "—");

  const openCreate = () => {
    setForm({ ...empty, equipment: equipment[0]?.id ?? 0 });
    setPdf(null);
    setCreating(true);
  };

  const openEdit = (m: MaintenanceRecord) => {
    setForm({
      equipment: m.equipment,
      kind: m.kind,
      date: m.date,
      description: m.description,
      assigned_technician: m.assigned_technician ?? null,
      assigned_engineer: m.assigned_engineer ?? null,
      cost: m.cost ?? "",
      scheduled_maintenance: m.scheduled_maintenance ?? null,
    });
    setPdf(null);
    setEditing(m);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm(empty);
    setPdf(null);
    if (searchParams.get("scheduling")) {
      setSearchParams({}, { replace: true });
    }
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await maintenanceService.update(editing.id, form);
      } else if (pdf) {
        await maintenanceService.createWithFile(form, pdf);
      } else {
        await maintenanceService.create(form);
      }
      closeModal();
      await Promise.all([
        load(),
        schedulingService
          .list({ is_completed: false, ordering: "scheduled_date" })
          .then(setPendingSchedules)
          .catch(() => null),
      ]);
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
      await maintenanceService.remove(toDelete.id);
      setToDelete(null);
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app sm:text-3xl">
            Historial de mantenimientos
          </h1>
          <p className="text-sm text-app-muted">
            Mantenimientos preventivos, correctivos y reparaciones realizados.
          </p>
        </div>
        {canCreate && (
          <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
            Nuevo mantenimiento
          </Button>
        )}
      </div>

      <Card>
        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Buscar descripción, técnico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
          <Select
            placeholder="Todos los equipos"
            value={equipmentFilter}
            onChange={(e) => setEquipmentFilter(e.target.value)}
            options={equipmentOptions}
          />
          <Select
            placeholder="Todos los tipos"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            options={Object.entries(KIND_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
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
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 font-medium">Fecha</th>
                <th className="pb-2 font-medium">Técnico</th>
                <th className="pb-2 font-medium">Costo</th>
                <th className="pb-2 font-medium">PDF</th>
                <th className="pb-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-app-muted">
                    Cargando...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-app-muted">
                    Sin registros.
                  </td>
                </tr>
              ) : (
                items.map((m) => (
                  <tr key={m.id} className="text-app">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                          <Wrench size={14} />
                        </span>
                        <div>
                          <p className="font-medium">
                            {m.equipment_name ?? equipmentLabel(m.equipment)}
                          </p>
                          {m.equipment_asset_tag && (
                            <p className="text-xs text-app-muted">
                              <span className="font-mono">{m.equipment_asset_tag}</span>
                            </p>
                          )}
                          {m.scheduled_maintenance_detail && (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs text-app-muted">
                              <CalendarClock size={11} />
                              Programado para{" "}
                              {m.scheduled_maintenance_detail.scheduled_date}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge tone={KIND_TONE[m.kind]}>{KIND_LABEL[m.kind]}</Badge>
                    </td>
                    <td className="py-3 text-app-muted">{m.date}</td>
                    <td className="py-3 text-app-muted">{labelForTechnician(m)}</td>
                    <td className="py-3 text-app-muted">
                      {m.cost ? `$${m.cost}` : "—"}
                    </td>
                    <td className="py-3">
                      {m.pdf_file_url ? (
                        <a
                          href={m.pdf_file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <FileText size={12} /> Ver PDF
                        </a>
                      ) : (
                        <span className="text-xs text-app-muted">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => openEdit(m)}
                          >
                            Editar
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="danger"
                            leftIcon={<Trash2 size={14} />}
                            onClick={() => setToDelete(m)}
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
        title={editing ? "Editar mantenimiento" : "Nuevo mantenimiento"}
        size="lg"
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Equipo"
            value={String(form.equipment)}
            onChange={(e) =>
              setForm({
                ...form,
                equipment: Number(e.target.value),
                scheduled_maintenance: null,
              })
            }
            options={equipmentOptions}
            placeholder="Selecciona un equipo"
            required
            className="sm:col-span-2"
          />
          <Select
            label="Cumple agendamiento (opcional)"
            value={
              form.scheduled_maintenance != null
                ? String(form.scheduled_maintenance)
                : ""
            }
            onChange={(e) =>
              setForm({
                ...form,
                scheduled_maintenance: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
            options={scheduleOptions}
            placeholder={
              scheduleOptions.length === 0
                ? "No hay agendamientos pendientes para este equipo"
                : "Sin agendamiento asociado"
            }
            disabled={scheduleOptions.length === 0}
            hint="Si lo asocias, el agendamiento se marcará como cumplido automáticamente."
            className="sm:col-span-2"
          />
          <Select
            label="Tipo"
            value={form.kind}
            onChange={(e) =>
              setForm({ ...form, kind: e.target.value as MaintenanceKind })
            }
            options={Object.entries(KIND_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Input
            label="Fecha"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
          {technicianListAvailable ? (
            <TechnicianSelect
              label="Técnico o ingeniero"
              value={form.assigned_technician ?? form.assigned_engineer ?? null}
              onChange={(_id, user) =>
                setForm({ ...form, ...assignmentPayload(user ?? null) })
              }
              technicians={technicians}
              required
              hint="Búscalo por nombre, usuario o correo. Sólo técnicos / ingenieros activos."
            />
          ) : (
            <Input
              label="ID del técnico"
              type="number"
              value={form.assigned_technician ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  assigned_technician: e.target.value
                    ? Number(e.target.value)
                    : null,
                  assigned_engineer: null,
                })
              }
              required
              hint="Tu rol no permite listar usuarios; ingresa el ID del técnico manualmente."
            />
          )}
          <Input
            label="Costo (opcional)"
            type="number"
            step="0.01"
            value={form.cost ?? ""}
            onChange={(e) => setForm({ ...form, cost: e.target.value })}
          />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-app">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              required
              className="w-full rounded-lg border border-app bg-surface px-3 py-2.5 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          {!editing && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-app">
                Adjuntar PDF (opcional)
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                className="text-sm text-app-muted"
              />
              <p className="text-xs text-app-muted">
                Máximo 10 MB. Solo .pdf.
              </p>
            </div>
          )}
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
        title="Eliminar mantenimiento"
        description="¿Eliminar este registro? Si tiene PDF también se borrará."
        confirmText="Eliminar"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
