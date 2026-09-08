import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import { workOrdersService } from "@/services/workorders.service";
import { equipmentService } from "@/services/equipment.service";
import { usersService } from "@/services/users.service";
import { can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import type { Equipment } from "@/types/equipment";
import type { Usuario } from "@/types/auth";
import type {
  EvidenceType,
  SignatureRole,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderInput,
  WorkOrderServiceType,
  WorkOrderStatus,
} from "@/types/workorders";

const TYPE_LABEL: Record<WorkOrderServiceType, string> = {
  PREVENTIVE: "Preventivo",
  CORRECTIVE: "Correctivo",
  CALIBRATION: "Calibración",
  INSTALLATION: "Instalación",
  INSPECTION: "Inspección",
};

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En proceso",
  FINISHED: "Terminada",
  CANCELLED: "Cancelada",
};

const STATUS_TONE: Record<
  WorkOrderStatus,
  "neutral" | "info" | "success" | "danger"
> = {
  PENDING: "neutral",
  IN_PROGRESS: "info",
  FINISHED: "success",
  CANCELLED: "danger",
};

const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  PHOTO: "Fotografía",
  VIDEO: "Video",
  DOCUMENT: "Documento",
  AUDIO: "Audio",
};

const SIGNATURE_LABEL: Record<SignatureRole, string> = {
  TECHNICIAN: "Técnico",
  ENGINEER: "Ingeniero",
  CLIENT: "Cliente",
  SUPERVISOR: "Supervisor",
};

const today = () => new Date().toISOString().slice(0, 16);
const PAGE_SIZE = 20;

const emptyForm: WorkOrderInput = {
  equipment: 0,
  number: "",
  service_type: "PREVENTIVE",
  start_date: today(),
  end_date: "",
  description: "",
  technician: null,
  status: "PENDING",
};

export function OrdenesTrabajoPage() {
  const { usuario } = useAuth();
  const role = usuario?.role;
  const canCreate = can(role, "work_orders", "create");
  const canEdit = can(role, "work_orders", "edit");
  const canDelete = can(role, "work_orders", "delete");

  const [items, setItems] = useState<WorkOrder[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  // Si la carga (silenciosa) de equipos falla, lo avisamos en el <Select> del
  // formulario en vez de dejar un desplegable vacío sin explicación.
  const [equipmentError, setEquipmentError] = useState(false);
  const [technicians, setTechnicians] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<WorkOrderInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<WorkOrder | null>(null);
  const [deleting, setDeleting] = useState(false);

  // "Realizar mantenimiento": el responsable cierra su orden y queda el
  // registro en la hoja de vida del equipo.
  const [completing, setCompleting] = useState<WorkOrder | null>(null);
  const [completeObs, setCompleteObs] = useState("");
  const [completeSaving, setCompleteSaving] = useState(false);

  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const equipmentOptions = useMemo(
    () =>
      equipment.map((e) => ({
        value: String(e.id),
        label: `${e.name} (${e.asset_tag})`,
      })),
    [equipment],
  );

  const technicianOptions = useMemo(
    () => [
      { value: "", label: "Sin asignar" },
      ...technicians
        .filter((u) => u.role === "ingeniero")
        .map((u) => ({
          value: String(u.id),
          label: `${u.first_name} ${u.last_name}`.trim() || u.username,
        })),
    ],
    [technicians],
  );

  const load = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const data = await workOrdersService.listPaginated({
        ordering: "-start_date",
        search: search || undefined,
        status: statusFilter || undefined,
        service_type: typeFilter || undefined,
        page: targetPage,
        page_size: PAGE_SIZE,
      });
      setItems(data.results);
      setCount(data.count);
      setPage(targetPage);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar las órdenes"));
    } finally {
      setLoading(false);
    }
  };

  // Cada aplicación de filtros (Enter o botón) vuelve a la página 1.
  const applyFilters = () => void load(1);

  useEffect(() => {
    // El fetch inicial vive en una función anidada: así los setState quedan en
    // un callback diferido y no en el cuerpo síncrono del efecto.
    void (async () => {
      await Promise.all([
        load(1),
        equipmentService
          .list({ ordering: "name" })
          .then((data) => {
            setEquipment(data);
            setEquipmentError(false);
          })
          .catch(() => setEquipmentError(true)),
        usersService
          .list({ is_active: true })
          .then(setTechnicians)
          .catch(() => setTechnicians([])),
      ]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      start_date: today(),
      equipment: equipment[0]?.id ?? 0,
    });
    setCreating(true);
  };

  const openEdit = (w: WorkOrder) => {
    setForm({
      equipment: w.equipment,
      number: w.number,
      service_type: w.service_type,
      start_date: w.start_date?.slice(0, 16) ?? today(),
      end_date: w.end_date?.slice(0, 16) ?? "",
      description: w.description,
      technician: w.technician ?? null,
      status: w.status,
    });
    setEditing(w);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      const payload: WorkOrderInput = {
        ...form,
        end_date: form.end_date ? form.end_date : null,
        technician: form.technician || null,
      };
      if (editing) {
        await workOrdersService.update(editing.id, payload);
      } else {
        await workOrdersService.create(payload);
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
      await workOrdersService.remove(toDelete.id);
      setToDelete(null);
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  const openComplete = (w: WorkOrder) => {
    setCompleteObs("");
    setCompleting(w);
  };

  const submitComplete = async () => {
    if (!completing) return;
    setCompleteSaving(true);
    try {
      await workOrdersService.complete(completing.id, {
        observations: completeObs.trim() || undefined,
      });
      setCompleting(null);
      setCompleteObs("");
      setDetail(null);
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo registrar el mantenimiento"));
    } finally {
      setCompleteSaving(false);
    }
  };

  const openDetail = async (w: WorkOrder) => {
    setDetailLoading(true);
    setDetail({
      ...w,
      spare_parts: [],
      measurements: [],
      evidences: [],
      signatures: [],
      cost: null,
    });
    try {
      setDetail(await workOrdersService.details(w.id));
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo cargar el detalle"));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const reloadDetail = async () => {
    if (!detail) return;
    setDetail(await workOrdersService.details(detail.id));
    await load();
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const start = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, count);

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app sm:text-3xl">
            Órdenes de trabajo
          </h1>
          <p className="text-sm text-app-muted">
            Registro de intervenciones en equipos: repuestos, mediciones,
            evidencias, firmas y costos.
          </p>
        </div>
        {canCreate && (
          <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
            Nueva orden
          </Button>
        )}
      </div>

      <Card>
        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Buscar por número, equipo, técnico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
          <Select
            placeholder="Todo estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={Object.entries(STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Select
            placeholder="Todo tipo"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={Object.entries(TYPE_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Button variant="secondary" onClick={applyFilters}>
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
              <tr className="border-b border-app text-left text-xs uppercase tracking-wider text-app-muted [&>th]:pb-2 [&>th]:pr-6 [&>th]:font-medium [&>th]:whitespace-nowrap">
                <th>Orden</th>
                <th>Equipo</th>
                <th>Tipo</th>
                <th>Inicio</th>
                <th>Técnico</th>
                <th>Estado</th>
                <th className="pr-0 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] [&>tr>td]:pr-6 [&>tr>td]:align-top">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-app-muted">
                    Cargando...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-app-muted">
                    Sin órdenes de trabajo.
                  </td>
                </tr>
              ) : (
                items.map((w) => (
                  <tr key={w.id} className="text-app">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                          <ClipboardList size={14} />
                        </span>
                        <div>
                          <span className="font-medium">{w.number}</span>
                          {w.schedule_info && (
                            <p className="text-xs text-app-muted">
                              De solicitud
                              {w.schedule_info.scheduled_date
                                ? ` · programada ${w.schedule_info.scheduled_date}`
                                : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-app-muted">
                      {w.equipment_name ?? `Equipo #${w.equipment}`}
                      {w.equipment_asset_tag && (
                        <span className="ml-1 font-mono text-xs">
                          {w.equipment_asset_tag}
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <Badge tone="info">
                        {w.service_type_display ?? TYPE_LABEL[w.service_type]}
                      </Badge>
                    </td>
                    <td className="py-3 text-app-muted whitespace-nowrap">
                      {new Date(w.start_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-app-muted">
                      {w.technician_name ?? (
                        <span className="text-xs italic">Sin asignar</span>
                      )}
                    </td>
                    <td className="py-3">
                      <Badge tone={STATUS_TONE[w.status]}>
                        {w.status_display ?? STATUS_LABEL[w.status]}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canEdit &&
                          (w.status === "PENDING" ||
                            w.status === "IN_PROGRESS") && (
                            <Button
                              size="sm"
                              leftIcon={<Wrench size={14} />}
                              onClick={() => openComplete(w)}
                            >
                              Realizar mantenimiento
                            </Button>
                          )}
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<ListChecks size={14} />}
                          onClick={() => void openDetail(w)}
                        >
                          Detalle
                        </Button>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => openEdit(w)}
                          >
                            Editar
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="danger"
                            leftIcon={<Trash2 size={14} />}
                            onClick={() => setToDelete(w)}
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

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-app pt-3 text-xs text-app-muted">
          <p>
            {count === 0
              ? "Sin resultados"
              : `Mostrando ${start}–${end} de ${count}`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<ChevronLeft size={14} />}
              disabled={page <= 1 || loading}
              onClick={() => void load(Math.max(1, page - 1))}
            >
              Anterior
            </Button>
            <span className="px-2 text-app">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              rightIcon={<ChevronRight size={14} />}
              disabled={page >= totalPages || loading}
              onClick={() => void load(Math.min(totalPages, page + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={creating || !!editing}
        onClose={closeModal}
        title={
          editing ? `Editar orden ${editing.number}` : "Nueva orden de trabajo"
        }
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
            error={
              equipmentOptions.length === 0 && equipmentError
                ? "No se pudieron cargar los equipos. Recarga la página e inténtalo de nuevo."
                : undefined
            }
            hint={
              equipmentOptions.length === 0 && !equipmentError
                ? "Aún no hay equipos registrados en el sistema."
                : undefined
            }
          />
          <Input
            label="Número de orden"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
            required
          />
          <Select
            label="Tipo"
            value={form.service_type}
            onChange={(e) =>
              setForm({
                ...form,
                service_type: e.target.value as WorkOrderServiceType,
              })
            }
            options={Object.entries(TYPE_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Input
            label="Inicio"
            type="datetime-local"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            required
          />
          <Input
            label="Fin (opcional)"
            type="datetime-local"
            value={form.end_date ?? ""}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
          <Select
            label="Técnico responsable"
            value={form.technician ? String(form.technician) : ""}
            onChange={(e) =>
              setForm({
                ...form,
                technician: e.target.value ? Number(e.target.value) : null,
              })
            }
            options={technicianOptions}
          />
          <Select
            label="Estado"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as WorkOrderStatus })
            }
            options={Object.entries(STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-app">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
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
        title="Eliminar orden de trabajo"
        description={`¿Eliminar la orden ${toDelete?.number}? Se borran también sus repuestos, mediciones, evidencias y firmas.`}
        confirmText="Eliminar"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Orden ${detail.number}` : ""}
        size="xl"
      >
        {detail && (
          <WorkOrderDetailView
            key={detail.id}
            detail={detail}
            loading={detailLoading}
            canEdit={canEdit}
            onChanged={reloadDetail}
            onRealizarMantenimiento={
              canEdit &&
              (detail.status === "PENDING" || detail.status === "IN_PROGRESS")
                ? () => {
                    const w = detail;
                    setDetail(null);
                    openComplete(w);
                  }
                : undefined
            }
          />
        )}
      </Modal>

      <Modal
        open={!!completing}
        onClose={() => setCompleting(null)}
        title={
          completing ? `Realizar mantenimiento — ${completing.number}` : ""
        }
        size="lg"
      >
        {completing && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-1 rounded-lg border border-app bg-app-muted p-3 text-sm">
              <p>
                <span className="text-app-muted">Equipo: </span>
                {completing.equipment_name ?? `Equipo #${completing.equipment}`}
              </p>
              <p>
                <span className="text-app-muted">Tarea: </span>
                {completing.description}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-app">
                Observaciones / trabajo realizado (opcional)
              </label>
              <textarea
                value={completeObs}
                onChange={(e) => setCompleteObs(e.target.value)}
                rows={4}
                placeholder="Hallazgos, repuestos cambiados, recomendaciones…"
                className="w-full rounded-lg border border-app bg-surface px-3 py-2.5 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            <p className="text-xs text-app-muted">
              Al confirmar, la orden queda como <strong>Terminada</strong> y el
              mantenimiento se registra en la hoja de vida del equipo. Los
              repuestos, mediciones y evidencias se agregan desde{" "}
              <strong>Detalle</strong>, antes o después.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setCompleting(null)}
              >
                Cancelar
              </Button>
              <Button
                leftIcon={<Wrench size={16} />}
                loading={completeSaving}
                onClick={() => void submitComplete()}
              >
                Confirmar mantenimiento
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalle de una orden: repuestos / mediciones / evidencias / firmas / costos
// ---------------------------------------------------------------------------

function WorkOrderDetailView({
  detail,
  loading,
  canEdit,
  onChanged,
  onRealizarMantenimiento,
}: {
  detail: WorkOrderDetail;
  loading: boolean;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  /** Si se define, se muestra el botón para cerrar la orden desde el detalle. */
  onRealizarMantenimiento?: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-2 rounded-lg border border-app bg-app-muted p-3 text-sm sm:grid-cols-2">
        <div>
          <span className="text-app-muted">Equipo: </span>
          {detail.equipment_name}{" "}
          <span className="font-mono text-xs">{detail.equipment_asset_tag}</span>
        </div>
        <div>
          <span className="text-app-muted">Tipo: </span>
          {detail.service_type_display ?? detail.service_type}
        </div>
        <div>
          <span className="text-app-muted">Estado: </span>
          {detail.status_display ?? detail.status}
        </div>
        <div>
          <span className="text-app-muted">Técnico: </span>
          {detail.technician_name ?? "Sin asignar"}
        </div>
        <div className="sm:col-span-2">
          <span className="text-app-muted">Descripción: </span>
          {detail.description}
        </div>
      </div>

      {onRealizarMantenimiento && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-3">
          <p className="text-sm text-app-muted">
            Cuando termines el trabajo, márcalo como realizado para dejarlo en la
            hoja de vida del equipo.
          </p>
          <Button
            size="sm"
            leftIcon={<Wrench size={14} />}
            onClick={onRealizarMantenimiento}
          >
            Realizar mantenimiento
          </Button>
        </div>
      )}

      {loading && (
        <p className="text-sm text-app-muted">Cargando elementos...</p>
      )}

      <ChildSection
        title="Repuestos"
        rows={detail.spare_parts}
        columns={["Nombre", "Ref.", "Cant.", "C. unit.", "Total"]}
        renderRow={(r) => [
          r.name,
          r.reference,
          r.quantity,
          r.unit_cost,
          r.total_cost,
        ]}
        canEdit={canEdit}
        fields={[
          { name: "name", label: "Nombre", required: true },
          { name: "reference", label: "Referencia", required: true },
          {
            name: "quantity",
            label: "Cantidad",
            type: "number",
            required: true,
          },
          {
            name: "unit_cost",
            label: "Costo unitario",
            type: "number",
            required: true,
          },
        ]}
        onAdd={(data) =>
          workOrdersService.sparePart.create({
            work_order: detail.id,
            ...data,
          })
        }
        onRemove={(id) => workOrdersService.sparePart.remove(id)}
        onChanged={onChanged}
      />

      <ChildSection
        title="Mediciones"
        rows={detail.measurements}
        columns={["Parámetro", "Esperado", "Medido", "Unidad", "OK"]}
        renderRow={(r) => [
          r.parameter,
          r.expected_value,
          r.measured_value,
          r.unit,
          r.passed ? "Sí" : "No",
        ]}
        canEdit={canEdit}
        fields={[
          { name: "parameter", label: "Parámetro", required: true },
          { name: "expected_value", label: "Valor esperado", required: true },
          { name: "measured_value", label: "Valor medido", required: true },
          { name: "unit", label: "Unidad", required: true },
          {
            name: "passed",
            label: "¿Pasa?",
            type: "select",
            options: [
              { value: "true", label: "Sí" },
              { value: "false", label: "No" },
            ],
          },
        ]}
        onAdd={(data) =>
          workOrdersService.measurement.create({
            work_order: detail.id,
            ...data,
            passed: data.passed === undefined ? true : data.passed === "true",
          })
        }
        onRemove={(id) => workOrdersService.measurement.remove(id)}
        onChanged={onChanged}
      />

      <ChildSection
        title="Evidencias"
        rows={detail.evidences}
        columns={["Tipo", "Descripción"]}
        renderRow={(r) => [
          EVIDENCE_LABEL[r.evidence_type],
          r.description,
        ]}
        canEdit={canEdit}
        fields={[
          {
            name: "evidence_type",
            label: "Tipo",
            type: "select",
            options: Object.entries(EVIDENCE_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
            required: true,
          },
          { name: "description", label: "Descripción", required: true },
        ]}
        onAdd={(data) =>
          workOrdersService.evidence.create({
            work_order: detail.id,
            ...data,
          })
        }
        onRemove={(id) => workOrdersService.evidence.remove(id)}
        onChanged={onChanged}
      />

      <ChildSection
        title="Firmas"
        rows={detail.signatures}
        columns={["Rol", "Firmó", "Fecha"]}
        renderRow={(r) => [
          SIGNATURE_LABEL[r.role],
          r.signed_by,
          r.signed_at ? new Date(r.signed_at).toLocaleString() : "",
        ]}
        canEdit={canEdit}
        fields={[
          {
            name: "role",
            label: "Rol",
            type: "select",
            options: Object.entries(SIGNATURE_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
            required: true,
          },
          { name: "signed_by", label: "Nombre de quien firma", required: true },
        ]}
        onAdd={(data) =>
          workOrdersService.signature.create({
            work_order: detail.id,
            ...data,
          })
        }
        onRemove={(id) => workOrdersService.signature.remove(id)}
        onChanged={onChanged}
      />

      <CostSection detail={detail} canEdit={canEdit} onChanged={onChanged} />
    </div>
  );
}

interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "number" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
}

function ChildSection<T extends { id: number }>({
  title,
  rows,
  columns,
  renderRow,
  canEdit,
  fields,
  onAdd,
  onRemove,
  onChanged,
}: {
  title: string;
  rows: T[];
  columns: string[];
  renderRow: (r: T) => (string | number)[];
  canEdit: boolean;
  fields: FieldDef[];
  onAdd: (data: Record<string, string>) => Promise<unknown>;
  onRemove: (id: number) => Promise<unknown>;
  onChanged: () => Promise<void>;
}) {
  const list = rows ?? [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const openAdd = () => {
    const initial: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "select") initial[f.name] = f.options?.[0]?.value ?? "";
    }
    setDraft(initial);
    setAdding(true);
  };

  const submitAdd = async () => {
    setBusy(true);
    try {
      await onAdd(draft);
      setDraft({});
      setAdding(false);
      await onChanged();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo agregar"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await onRemove(id);
      await onChanged();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app">
          {title}{" "}
          <span className="font-normal text-app-muted">({list.length})</span>
        </h3>
        {canEdit && !adding && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus size={14} />}
            onClick={openAdd}
          >
            Agregar
          </Button>
        )}
      </div>

      {list.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app bg-app-muted text-left text-xs text-app-muted [&>th]:px-3 [&>th]:py-2">
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                {canEdit && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {list.map((r) => (
                <tr key={r.id} className="text-app [&>td]:px-3 [&>td]:py-2">
                  {renderRow(r).map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                  {canEdit && (
                    <td>
                      <button
                        type="button"
                        onClick={() => void remove(r.id)}
                        disabled={busy}
                        className="text-app-muted hover:text-red-600"
                        aria-label="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <div className="grid gap-2 rounded-lg border border-app bg-app-muted p-3 sm:grid-cols-2">
          {fields.map((f) =>
            f.type === "select" ? (
              <Select
                key={f.name}
                label={f.label}
                value={draft[f.name] ?? f.options?.[0]?.value ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, [f.name]: e.target.value })
                }
                options={f.options ?? []}
              />
            ) : (
              <Input
                key={f.name}
                label={f.label}
                type={f.type ?? "text"}
                value={draft[f.name] ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, [f.name]: e.target.value })
                }
              />
            ),
          )}
          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAdding(false);
                setDraft({});
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submitAdd()}>
              Agregar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function CostSection({
  detail,
  canEdit,
  onChanged,
}: {
  detail: WorkOrderDetail;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const c = detail.cost;
  const [form, setForm] = useState(() => ({
    labor_cost: c?.labor_cost ?? "0",
    spare_parts_cost: c?.spare_parts_cost ?? "0",
    transport_cost: c?.transport_cost ?? "0",
    other_cost: c?.other_cost ?? "0",
  }));
  const [busy, setBusy] = useState(false);

  const total =
    Number(form.labor_cost || 0) +
    Number(form.spare_parts_cost || 0) +
    Number(form.transport_cost || 0) +
    Number(form.other_cost || 0);

  const save = async () => {
    setBusy(true);
    try {
      if (c) {
        await workOrdersService.cost.update(c.id, form);
      } else {
        await workOrdersService.cost.create({
          work_order: detail.id,
          ...form,
        });
      }
      await onChanged();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo guardar el costo"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-app">Costos</h3>
      <div className="grid gap-2 rounded-lg border border-app bg-app-muted p-3 sm:grid-cols-4">
        {(
          [
            ["labor_cost", "Mano de obra"],
            ["spare_parts_cost", "Repuestos"],
            ["transport_cost", "Transporte"],
            ["other_cost", "Otros"],
          ] as const
        ).map(([key, label]) => (
          <Input
            key={key}
            label={label}
            type="number"
            step="0.01"
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            disabled={!canEdit}
          />
        ))}
        <div className="flex items-end text-sm sm:col-span-2">
          <span className="text-app-muted">Total:&nbsp;</span>
          <span className="font-semibold text-app">
            ${total.toLocaleString()}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-end justify-end sm:col-span-2">
            <Button size="sm" loading={busy} onClick={() => void save()}>
              {c ? "Actualizar costos" : "Guardar costos"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
