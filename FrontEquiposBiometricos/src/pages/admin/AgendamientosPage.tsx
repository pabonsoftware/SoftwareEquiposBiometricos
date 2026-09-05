import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarClock,
  Check,
  Pencil,
  Plus,
  Trash2,
  User,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TechnicianSelect } from "@/components/ui/TechnicianSelect";
import { assignedUserName, assignmentPayload } from "@/lib/users";
import { useAuth } from "@/context/AuthContext";
import { schedulingService } from "@/services/scheduling.service";
import { equipmentService } from "@/services/equipment.service";
import { usersService } from "@/services/users.service";
import { can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import type { Equipment } from "@/types/equipment";
import type { Usuario } from "@/types/auth";
import type {
  ScheduleInput,
  ScheduleKind,
  ScheduledMaintenance,
} from "@/types/scheduling";

const TECHNICIAN_ROLES = ["tecnico", "ingeniero"];

const KIND_LABEL: Record<ScheduleKind, string> = {
  PREVENTIVE: "Preventivo",
  REPAIR: "Reparación",
};

const empty: ScheduleInput = {
  equipment: 0,
  kind: "PREVENTIVE",
  scheduled_date: "",
  notes: "",
  assigned_technician: null,
  assigned_engineer: null,
};

export function AgendamientosPage() {
  const { usuario } = useAuth();
  const role = usuario?.role;
  const navigate = useNavigate();

  const [items, setItems] = useState<ScheduledMaintenance[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [completedFilter, setCompletedFilter] = useState("");

  const [editing, setEditing] = useState<ScheduledMaintenance | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ScheduleInput>(empty);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<ScheduledMaintenance | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [technicians, setTechnicians] = useState<Usuario[]>([]);
  const [technicianListAvailable, setTechnicianListAvailable] = useState(false);

  const canCreate = can(role, "scheduling", "create");
  const canEdit = can(role, "scheduling", "edit");
  const canDelete = can(role, "scheduling", "delete");
  const canRegisterMaintenance = can(role, "maintenance", "create");

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
      const data = await schedulingService.list({
        ordering: "scheduled_date",
        search: search || undefined,
        is_completed:
          completedFilter === "true"
            ? true
            : completedFilter === "false"
              ? false
              : undefined,
      });
      setItems(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar los agendamientos"));
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

  // Carga la lista de técnicos disponibles. Si el rol no puede listar
  // usuarios (coordinador/ingeniero), el form cae al input numérico.
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

  // El backend devuelve el responsable en dos campos anidados según el rol:
  // assigned_technician_detail (técnico) o assigned_engineer_detail (ingeniero).
  const labelForScheduleTechnician = (s: ScheduledMaintenance) =>
    assignedUserName(s.assigned_technician_detail) ??
    assignedUserName(s.assigned_engineer_detail);

  const openCreate = () => {
    setForm({ ...empty, equipment: equipment[0]?.id ?? 0 });
    setCreating(true);
  };

  const openEdit = (s: ScheduledMaintenance) => {
    setForm({
      equipment: s.equipment,
      kind: s.kind,
      scheduled_date: s.scheduled_date,
      notes: s.notes ?? "",
      assigned_technician: s.assigned_technician ?? null,
      assigned_engineer: s.assigned_engineer ?? null,
    });
    setEditing(s);
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
        await schedulingService.update(editing.id, form);
      } else {
        await schedulingService.create(form);
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
      await schedulingService.remove(toDelete.id);
      setToDelete(null);
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  const completeOne = async (s: ScheduledMaintenance) => {
    try {
      await schedulingService.complete(s.id);
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo marcar como cumplido"));
    }
  };

  const notifyOne = async (s: ScheduledMaintenance) => {
    try {
      await schedulingService.notify(s.id);
      alert("Notificación encolada.");
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo notificar"));
    }
  };

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app sm:text-3xl">
            Agendamientos
          </h1>
          <p className="text-sm text-app-muted">
            Programación de mantenimientos futuros. Al crear se envía un correo
            de notificación.
          </p>
        </div>
        {canCreate && (
          <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
            Nuevo agendamiento
          </Button>
        )}
      </div>

      <Card>
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Buscar por nota o tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
          <Select
            placeholder="Todos"
            value={completedFilter}
            onChange={(e) => setCompletedFilter(e.target.value)}
            options={[
              { value: "false", label: "Pendientes" },
              { value: "true", label: "Cumplidos" },
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
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 font-medium">Fecha</th>
                <th className="pb-2 font-medium">Técnico</th>
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
                    Sin agendamientos.
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id} className="text-app">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                          <CalendarClock size={14} />
                        </span>
                        <div>
                          <p className="font-medium">
                            {s.equipment_name ?? equipmentLabel(s.equipment)}
                          </p>
                          {s.notes && (
                            <p className="text-xs text-app-muted">{s.notes}</p>
                          )}
                          {s.maintenance_record_detail && (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs text-app-muted">
                              <Wrench size={11} />
                              Cumplido por mantenimiento #
                              {s.maintenance_record_detail.id} ·{" "}
                              {s.maintenance_record_detail.date}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge tone={s.kind === "PREVENTIVE" ? "info" : "danger"}>
                        {KIND_LABEL[s.kind]}
                      </Badge>
                    </td>
                    <td className="py-3 text-app-muted">{s.scheduled_date}</td>
                    <td className="py-3 text-app-muted">
                      {labelForScheduleTechnician(s) ? (
                        <span className="inline-flex items-center gap-1.5">
                          <User size={12} className="text-app-muted" />
                          <span className="text-app">
                            {labelForScheduleTechnician(s)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs italic">Sin asignar</span>
                      )}
                    </td>
                    <td className="py-3">
                      <Badge tone={s.is_completed ? "success" : "warning"}>
                        {s.is_completed ? "Cumplido" : "Pendiente"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {canRegisterMaintenance && !s.is_completed && (
                          <Button
                            size="sm"
                            leftIcon={<Wrench size={14} />}
                            onClick={() =>
                              navigate(`/admin/mantenimientos?scheduling=${s.id}`)
                            }
                          >
                            Realizar mantenimiento
                          </Button>
                        )}
                        {canEdit && !s.is_completed && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Check size={14} />}
                            onClick={() => void completeOne(s)}
                          >
                            Cumplir
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Bell size={14} />}
                            onClick={() => void notifyOne(s)}
                          >
                            Notificar
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => openEdit(s)}
                          >
                            Editar
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="danger"
                            leftIcon={<Trash2 size={14} />}
                            onClick={() => setToDelete(s)}
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
        title={editing ? "Editar agendamiento" : "Nuevo agendamiento"}
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
            label="Tipo"
            value={form.kind}
            onChange={(e) =>
              setForm({ ...form, kind: e.target.value as ScheduleKind })
            }
            options={Object.entries(KIND_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Input
            label="Fecha programada"
            type="date"
            value={form.scheduled_date}
            onChange={(e) =>
              setForm({ ...form, scheduled_date: e.target.value })
            }
            required
          />
          <div className="sm:col-span-2">
            {technicianListAvailable ? (
              <TechnicianSelect
                label="Técnico o ingeniero asignado"
                value={form.assigned_technician ?? form.assigned_engineer ?? null}
                onChange={(_id, user) =>
                  setForm({ ...form, ...assignmentPayload(user ?? null) })
                }
                technicians={technicians}
                hint="Búscalo por nombre, usuario o correo. Opcional — puedes asignarlo más tarde."
              />
            ) : (
              <Input
                label="ID del técnico (opcional)"
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
                hint="Tu rol no permite listar usuarios; ingresa el ID manualmente o déjalo vacío."
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-app">Notas</label>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
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
        title="Cancelar agendamiento"
        description="¿Eliminar este agendamiento? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
