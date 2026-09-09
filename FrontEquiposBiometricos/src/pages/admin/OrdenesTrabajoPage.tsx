import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Ban,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ListChecks,
  Pencil,
  Play,
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
import { SemaphoreBadge } from "@/components/ui/SemaphoreBadge";
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
  EquipmentOperationalStatus,
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
  APPROVED: "Aprobada",
  IN_PROGRESS: "En proceso",
  FINISHED: "Terminada",
  CANCELLED: "Cancelada",
};

const STATUS_TONE: Record<
  WorkOrderStatus,
  "neutral" | "info" | "success" | "danger" | "warning"
> = {
  PENDING: "neutral",
  APPROVED: "warning",
  IN_PROGRESS: "info",
  FINISHED: "success",
  CANCELLED: "danger",
};

const EQUIPMENT_STATUS_LABEL: Record<EquipmentOperationalStatus, string> = {
  ACTIVE: "Operativo",
  INACTIVE: "Fuera de servicio",
  IN_MAINTENANCE: "En mantenimiento",
  IN_REPAIR: "En reparación",
};

const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  PHOTO: "Fotografía",
  VIDEO: "Video",
  DOCUMENT: "Documento",
  AUDIO: "Audio",
};

const SIGNATURE_LABEL: Record<SignatureRole, string> = {
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
};

export function OrdenesTrabajoPage() {
  const { usuario } = useAuth();
  const role = usuario?.role;
  const canCreate = can(role, "work_orders", "create");
  const canEdit = can(role, "work_orders", "edit");
  const canDelete = can(role, "work_orders", "delete");
  // Aprobar / cancelar / cerrar formalmente: Coordinador (4.1.2). El backend
  // lo vuelve a validar — ocultar el botón no es la única protección.
  const canApprove = can(role, "work_orders", "approve");

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
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completeSaving, setCompleteSaving] = useState(false);

  const [cancelling, setCancelling] = useState<WorkOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  // Acción de la máquina de estados en curso (id de la orden) para deshabilitar
  // los botones mientras el POST está en vuelo.
  const [transitioning, setTransitioning] = useState<number | null>(null);

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
        number: form.number?.trim() || undefined,
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

  // --- Máquina de estados (§9): las transiciones solo pasan por estas acciones.
  const runTransition = async (
    w: WorkOrder,
    fn: () => Promise<unknown>,
    fallback: string,
  ) => {
    setTransitioning(w.id);
    try {
      await fn();
      if (detail?.id === w.id) await reloadDetail();
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, fallback));
    } finally {
      setTransitioning(null);
    }
  };

  const approve = (w: WorkOrder) =>
    runTransition(w, () => workOrdersService.approve(w.id), "No se pudo aprobar la orden");
  const startWork = (w: WorkOrder) =>
    runTransition(w, () => workOrdersService.start(w.id), "No se pudo iniciar la orden");

  const openCancel = (w: WorkOrder) => {
    setCancelReason("");
    setCancelling(w);
  };

  const submitCancel = async () => {
    if (!cancelling) return;
    const reason = cancelReason.trim();
    if (!reason) return;
    setCancelSaving(true);
    try {
      await workOrdersService.cancel(cancelling.id, { reason });
      setCancelling(null);
      if (detail?.id === cancelling.id) setDetail(null);
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo cancelar la orden"));
    } finally {
      setCancelSaving(false);
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
    setCompleteError(null);
    setCompleting(w);
  };

  const submitComplete = async () => {
    if (!completing) return;
    const notes = completeObs.trim();
    if (!notes) {
      setCompleteError("Las observaciones de cierre son obligatorias.");
      return;
    }
    setCompleteError(null);
    setCompleteSaving(true);
    try {
      await workOrdersService.complete(completing.id, { closing_notes: notes });
      setCompleting(null);
      setCompleteObs("");
      setDetail(null);
      await load();
    } catch (err) {
      setCompleteError(
        getApiErrorMessage(err, "No se pudo cerrar la orden"),
      );
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
      activities: [],
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
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={STATUS_TONE[w.status]}>
                          {w.status_display ?? STATUS_LABEL[w.status]}
                        </Badge>
                        <SemaphoreBadge payload={w.semaphore} showDays />
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canApprove && w.status === "PENDING" && (
                          <Button
                            size="sm"
                            leftIcon={<BadgeCheck size={14} />}
                            loading={transitioning === w.id}
                            onClick={() => void approve(w)}
                          >
                            Aprobar
                          </Button>
                        )}
                        {canEdit && w.status === "APPROVED" && (
                          <Button
                            size="sm"
                            leftIcon={<Play size={14} />}
                            loading={transitioning === w.id}
                            onClick={() => void startWork(w)}
                          >
                            Iniciar
                          </Button>
                        )}
                        {canEdit && w.status === "IN_PROGRESS" && (
                          <Button
                            size="sm"
                            leftIcon={<Wrench size={14} />}
                            onClick={() => openComplete(w)}
                          >
                            Terminar
                          </Button>
                        )}
                        {canApprove &&
                          (w.status === "PENDING" || w.status === "APPROVED") && (
                            <Button
                              size="sm"
                              variant="danger"
                              leftIcon={<Ban size={14} />}
                              onClick={() => openCancel(w)}
                            >
                              Cancelar
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
                        {canEdit &&
                          w.status !== "FINISHED" &&
                          w.status !== "CANCELLED" && (
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
            value={form.number ?? ""}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
            hint={editing ? undefined : "Se genera automáticamente si lo dejas vacío"}
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
          {editing && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-app">Estado</span>
              <div className="flex items-center py-2">
                <Badge tone={STATUS_TONE[editing.status]}>
                  {editing.status_display ?? STATUS_LABEL[editing.status]}
                </Badge>
              </div>
              <p className="text-xs text-app-muted">
                El estado cambia con Aprobar · Iniciar · Terminar · Cancelar.
              </p>
            </div>
          )}
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
            canApprove={canApprove}
            transitioning={transitioning === detail.id}
            onChanged={reloadDetail}
            onApprove={() => void approve(detail)}
            onStart={() => void startWork(detail)}
            onCancel={() => openCancel(detail)}
            onComplete={() => {
              const w = detail;
              setDetail(null);
              openComplete(w);
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!completing}
        onClose={() => setCompleting(null)}
        title={completing ? `Terminar orden — ${completing.number}` : ""}
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
              <p>
                <span className="text-app-muted">Actividades registradas: </span>
                {completing.activities_count ?? 0}
              </p>
            </div>
            {(completing.activities_count ?? 0) === 0 && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                No se puede cerrar la orden sin al menos una actividad técnica.
                Agrégala desde <strong>Detalle → Actividades</strong>.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-app">
                Observaciones de cierre <span className="text-red-600">*</span>
              </label>
              <textarea
                value={completeObs}
                onChange={(e) => setCompleteObs(e.target.value)}
                rows={4}
                placeholder="Estado final del equipo, trabajo realizado, recomendaciones…"
                className="w-full rounded-lg border border-app bg-surface px-3 py-2.5 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            {completeError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {completeError}
              </p>
            )}
            <p className="text-xs text-app-muted">
              Al confirmar, la orden pasa a <strong>Terminada</strong>, se registra
              quién y cuándo la cerró, y el mantenimiento queda en la hoja de vida
              del equipo. Una orden terminada no se puede editar.
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
                disabled={(completing.activities_count ?? 0) === 0}
                onClick={() => void submitComplete()}
              >
                Terminar orden
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title={cancelling ? `Cancelar orden — ${cancelling.number}` : ""}
        size="md"
      >
        {cancelling && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-app-muted">
              La orden quedará <strong>Cancelada</strong> y no podrá reabrirse.
              Indica el motivo (queda en la auditoría).
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-app">
                Motivo <span className="text-red-600">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-app bg-surface px-3 py-2.5 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setCancelling(null)}
              >
                Volver
              </Button>
              <Button
                variant="danger"
                leftIcon={<Ban size={16} />}
                loading={cancelSaving}
                disabled={!cancelReason.trim()}
                onClick={() => void submitCancel()}
              >
                Cancelar orden
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
  canApprove,
  transitioning,
  onChanged,
  onApprove,
  onStart,
  onCancel,
  onComplete,
}: {
  detail: WorkOrderDetail;
  loading: boolean;
  canEdit: boolean;
  canApprove: boolean;
  transitioning: boolean;
  onChanged: () => Promise<void>;
  onApprove: () => void;
  onStart: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const closedOrCancelled =
    detail.status === "FINISHED" || detail.status === "CANCELLED";
  const canDocument = canEdit && !closedOrCancelled;
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
          <Badge tone={STATUS_TONE[detail.status]}>
            {detail.status_display ?? STATUS_LABEL[detail.status]}
          </Badge>
        </div>
        <div>
          <span className="text-app-muted">Cumplimiento: </span>
          <SemaphoreBadge payload={detail.semaphore} showDays />
        </div>
        {detail.approved_by_name && (
          <div>
            <span className="text-app-muted">Aprobó: </span>
            {detail.approved_by_name}
            {detail.approved_at
              ? ` · ${new Date(detail.approved_at).toLocaleString()}`
              : ""}
          </div>
        )}
        {detail.closed_by_name && (
          <div>
            <span className="text-app-muted">Cerró: </span>
            {detail.closed_by_name}
            {detail.closed_at
              ? ` · ${new Date(detail.closed_at).toLocaleString()}`
              : ""}
          </div>
        )}
        <div className="sm:col-span-2">
          <span className="text-app-muted">Descripción: </span>
          {detail.description}
        </div>
        {detail.closing_notes && (
          <div className="sm:col-span-2">
            <span className="text-app-muted">Observaciones de cierre: </span>
            {detail.closing_notes}
          </div>
        )}
        {detail.cancel_reason && (
          <div className="sm:col-span-2">
            <span className="text-app-muted">Motivo de cancelación: </span>
            {detail.cancel_reason}
          </div>
        )}
      </div>

      {!closedOrCancelled &&
        (canApprove || canEdit) &&
        detail.status !== "FINISHED" && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-3">
            <span className="text-sm text-app-muted">
              Ciclo de la orden:
            </span>
            {canApprove && detail.status === "PENDING" && (
              <Button
                size="sm"
                leftIcon={<BadgeCheck size={14} />}
                loading={transitioning}
                onClick={onApprove}
              >
                Aprobar
              </Button>
            )}
            {canEdit && detail.status === "APPROVED" && (
              <Button
                size="sm"
                leftIcon={<Play size={14} />}
                loading={transitioning}
                onClick={onStart}
              >
                Iniciar
              </Button>
            )}
            {canEdit && detail.status === "IN_PROGRESS" && (
              <Button
                size="sm"
                leftIcon={<Wrench size={14} />}
                onClick={onComplete}
              >
                Terminar orden
              </Button>
            )}
            {canApprove &&
              (detail.status === "PENDING" || detail.status === "APPROVED") && (
                <Button
                  size="sm"
                  variant="danger"
                  leftIcon={<Ban size={14} />}
                  onClick={onCancel}
                >
                  Cancelar
                </Button>
              )}
          </div>
        )}

      {loading && (
        <p className="text-sm text-app-muted">Cargando elementos...</p>
      )}

      <ActivitiesSection
        detail={detail}
        canEdit={canDocument}
        onChanged={onChanged}
      />

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

// ---------------------------------------------------------------------------
// Actividades técnicas (RF009): tarea, fecha/hora, responsable, hallazgos,
// recomendaciones, horómetro y estado operativo tras la intervención.
// Registrar la primera actividad mueve la orden a "En proceso".
// ---------------------------------------------------------------------------

const emptyActivity = {
  description: "",
  findings: "",
  recommendations: "",
  hourmeter: "",
  equipment_status_after: "" as EquipmentOperationalStatus | "",
};

function ActivitiesSection({
  detail,
  canEdit,
  onChanged,
}: {
  detail: WorkOrderDetail;
  canEdit: boolean;
  onChanged: () => Promise<void>;
}) {
  const rows = detail.activities ?? [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyActivity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!draft.description.trim()) {
      setError("La actividad realizada es obligatoria.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await workOrdersService.activity.create({
        work_order: detail.id,
        description: draft.description.trim(),
        findings: draft.findings.trim() || undefined,
        recommendations: draft.recommendations.trim() || undefined,
        hourmeter: draft.hourmeter.trim() || undefined,
        equipment_status_after: draft.equipment_status_after || undefined,
      });
      setDraft(emptyActivity);
      setAdding(false);
      await onChanged();
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo registrar la actividad"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await workOrdersService.activity.remove(id);
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
          Actividades técnicas{" "}
          <span className="font-normal text-app-muted">({rows.length})</span>
        </h3>
        {canEdit && !adding && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus size={14} />}
            onClick={() => {
              setDraft(emptyActivity);
              setError(null);
              setAdding(true);
            }}
          >
            Registrar actividad
          </Button>
        )}
      </div>

      {rows.length === 0 && !adding && (
        <p className="text-sm text-app-muted">
          Sin actividades registradas. Se necesita al menos una para poder
          terminar la orden.
        </p>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-app bg-app-muted p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-app">{a.description}</p>
                  <p className="text-xs text-app-muted">
                    {new Date(a.performed_at).toLocaleString()}
                    {a.performed_by_name ? ` · ${a.performed_by_name}` : ""}
                    {a.equipment_status_after_display
                      ? ` · Equipo: ${a.equipment_status_after_display}`
                      : ""}
                    {a.hourmeter ? ` · Horómetro: ${a.hourmeter}` : ""}
                  </p>
                  {a.findings && (
                    <p className="text-xs">
                      <span className="text-app-muted">Hallazgos: </span>
                      {a.findings}
                    </p>
                  )}
                  {a.recommendations && (
                    <p className="text-xs">
                      <span className="text-app-muted">Recomendaciones: </span>
                      {a.recommendations}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Eliminar actividad"
                    disabled={busy}
                    onClick={() => void remove(a.id)}
                    className="shrink-0 rounded p-1 text-app-muted hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="flex flex-col gap-3 rounded-lg border border-app bg-surface p-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-app">
              Actividad realizada <span className="text-red-600">*</span>
            </label>
            <textarea
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              rows={2}
              className="w-full rounded-lg border border-app bg-surface px-3 py-2 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-app">Hallazgos</label>
              <textarea
                value={draft.findings}
                onChange={(e) =>
                  setDraft({ ...draft, findings: e.target.value })
                }
                rows={2}
                className="w-full rounded-lg border border-app bg-surface px-3 py-2 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-app">
                Recomendaciones
              </label>
              <textarea
                value={draft.recommendations}
                onChange={(e) =>
                  setDraft({ ...draft, recommendations: e.target.value })
                }
                rows={2}
                className="w-full rounded-lg border border-app bg-surface px-3 py-2 text-sm text-app outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            <Input
              label="Horómetro / kilometraje"
              type="number"
              step="0.01"
              value={draft.hourmeter}
              onChange={(e) =>
                setDraft({ ...draft, hourmeter: e.target.value })
              }
            />
            <Select
              label="Estado del equipo tras la intervención"
              value={draft.equipment_status_after}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  equipment_status_after: e.target
                    .value as EquipmentOperationalStatus | "",
                })
              }
              options={[
                { value: "", label: "Sin cambio" },
                ...Object.entries(EQUIPMENT_STATUS_LABEL).map(
                  ([value, label]) => ({ value, label }),
                ),
              ]}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => setAdding(false)}
            >
              Cancelar
            </Button>
            <Button size="sm" loading={busy} onClick={() => void submit()}>
              Guardar actividad
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
