import { useEffect, useState } from "react";
import {
  Activity,
  Building2,
  CalendarClock,
  Calendar as CalendarIcon,
  Download,
  FileText,
  Pencil,
  Timer,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { maintenanceService } from "@/services/maintenance.service";
import { schedulingService } from "@/services/scheduling.service";
import { assignedUserName } from "@/lib/users";
import type { Equipment, EquipmentStatus } from "@/types/equipment";
import type {
  MaintenanceKind,
  MaintenanceRecord,
} from "@/types/maintenance";
import type {
  ScheduleKind,
  ScheduledMaintenance,
} from "@/types/scheduling";

const STATUS_LABEL: Record<EquipmentStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  IN_MAINTENANCE: "En mantenimiento",
  IN_REPAIR: "En reparación",
};

const STATUS_TONE: Record<EquipmentStatus, "success" | "neutral" | "warning" | "danger"> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  IN_MAINTENANCE: "warning",
  IN_REPAIR: "danger",
};

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

// Formatea horas decimales en una unidad legible. El backend manda string|null
// (DecimalField), así que aceptamos ambos extremos.
function formatHours(value: string | null | undefined): string {
  if (value == null || value === "") return "Sin datos";
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) return "Sin datos";
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} min`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)} h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours - days * 24);
  return remainingHours > 0 ? `${days} d ${remainingHours} h` : `${days} d`;
}

interface ContentProps {
  equipment: Equipment | null;
  branchName?: (id: number) => string;
  // Acciones opcionales según rol
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: (eq: Equipment) => void;
  onDelete?: (eq: Equipment) => void;
}

interface Props extends ContentProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "info" | "historial" | "programados";

export function EquipoFicha({
  open,
  equipment,
  onClose,
  branchName,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Hoja de vida · ${equipment?.name ?? ""}`}
      size="xl"
    >
      <EquipoFichaContent
        equipment={equipment}
        branchName={branchName}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </Modal>
  );
}

export function EquipoFichaContent({
  equipment,
  branchName,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: ContentProps) {
  const [tab, setTab] = useState<Tab>("info");
  const [history, setHistory] = useState<MaintenanceRecord[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledMaintenance[]>([]);
  const [loadingH, setLoadingH] = useState(false);
  const [loadingS, setLoadingS] = useState(false);
  const [scheduledKind, setScheduledKind] = useState<string>("");
  const [eq, setEq] = useState<Equipment | null>(equipment);

  useEffect(() => {
    setEq(equipment);
    setTab("info");
    setHistory([]);
    setScheduled([]);
    setScheduledKind("");
  }, [equipment]);

  useEffect(() => {
    if (!eq) return;
    setLoadingH(true);
    maintenanceService
      .list({ equipment: eq.id, ordering: "-date" })
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoadingH(false));
  }, [eq]);

  useEffect(() => {
    if (!eq) return;
    setLoadingS(true);
    schedulingService
      .list({
        equipment: eq.id,
        ordering: "scheduled_date",
        kind: scheduledKind || undefined,
      })
      .then(setScheduled)
      .catch(() => setScheduled([]))
      .finally(() => setLoadingS(false));
  }, [eq, scheduledKind]);

  if (!eq) return null;

  const branchLabel =
    eq.branch_name ?? (branchName ? branchName(eq.branch) : `Sede #${eq.branch}`);

  const downloadQr = async () => {
    if (!eq.qr_code_url) return;
    try {
      const res = await fetch(eq.qr_code_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-${eq.asset_tag}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(eq.qr_code_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado: tarjeta con QR + info principal */}
        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl border border-app bg-white p-3">
              {eq.qr_code_url ? (
                <img
                  src={eq.qr_code_url}
                  alt={`QR del equipo ${eq.asset_tag}`}
                  className="h-40 w-40 object-contain"
                />
              ) : (
                <div className="flex h-40 w-40 items-center justify-center text-xs text-app-muted">
                  Sin QR
                </div>
              )}
            </div>
            <p className="font-mono text-xs text-app-muted">{eq.asset_tag}</p>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Download size={14} />}
              disabled={!eq.qr_code_url}
              onClick={() => void downloadQr()}
            >
              Descargar QR
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-app">{eq.name}</h3>
              <Badge tone={STATUS_TONE[eq.status]}>{STATUS_LABEL[eq.status]}</Badge>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Marca / Modelo">
                {(eq.brand_name ?? "—") +
                  " · " +
                  (eq.equipment_model_name ?? `Modelo #${eq.equipment_model}`)}
              </Field>
              <Field label="Fecha de compra" icon={<CalendarIcon size={12} />}>
                {eq.purchase_date}
              </Field>
              <Field label="Sede" icon={<Building2 size={12} />}>
                {branchLabel}
              </Field>
              <Field label="Ubicación">{eq.location}</Field>
            </dl>

            {(canEdit || canDelete) && (
              <div className="mt-1 flex flex-wrap gap-2">
                {canEdit && onEdit && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Pencil size={14} />}
                    onClick={() => onEdit(eq)}
                  >
                    Editar
                  </Button>
                )}
                {canDelete && onDelete && (
                  <Button
                    size="sm"
                    variant="danger"
                    leftIcon={<Trash2 size={14} />}
                    onClick={() => onDelete(eq)}
                  >
                    Eliminar
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-app">
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            Información
          </TabButton>
          <TabButton active={tab === "historial"} onClick={() => setTab("historial")}>
            <Wrench size={14} className="mr-1.5 inline" />
            Mantenimientos realizados
          </TabButton>
          <TabButton active={tab === "programados"} onClick={() => setTab("programados")}>
            <CalendarClock size={14} className="mr-1.5 inline" />
            Programados
          </TabButton>
        </div>

        {/* Tab content */}
        {tab === "info" && (
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-app-muted">
              Este equipo tiene actualmente{" "}
              <strong className="text-app">{history.length}</strong> mantenimientos
              registrados y{" "}
              <strong className="text-app">
                {scheduled.filter((s) => !s.is_completed).length}
              </strong>{" "}
              agendamientos pendientes.
            </p>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-app-muted">
                Confiabilidad del servicio
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-lg border border-app bg-app-muted p-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                    <Activity size={16} />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs text-app-muted">
                      MTBF — Tiempo medio entre fallas
                    </p>
                    <p className="text-lg font-semibold text-app">
                      {formatHours(eq.mtbf_hours)}
                    </p>
                    <p className="mt-0.5 text-xs text-app-muted">
                      Mayor es mejor: indica que el equipo presenta pocas fallas
                      en el tiempo.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-app bg-app-muted p-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                    <Timer size={16} />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs text-app-muted">
                      MTTR — Tiempo medio de reparación
                    </p>
                    <p className="text-lg font-semibold text-app">
                      {formatHours(eq.mttr_hours)}
                    </p>
                    <p className="mt-0.5 text-xs text-app-muted">
                      Menor es mejor: indica reparaciones eficientes y menor
                      tiempo de inactividad.
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-app-muted">
                Valores calculados automáticamente a partir del historial de
                fallas reportadas. No editables.
              </p>
            </div>
          </div>
        )}

        {tab === "historial" && (
          <div className="flex flex-col gap-2">
            {loadingH ? (
              <p className="py-6 text-center text-sm text-app-muted">Cargando...</p>
            ) : history.length === 0 ? (
              <p className="py-6 text-center text-sm text-app-muted">
                Este equipo aún no tiene mantenimientos registrados.
              </p>
            ) : (
              history.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 rounded-lg border border-app bg-app-muted p-3 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                    <Wrench size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={KIND_TONE[m.kind]}>{KIND_LABEL[m.kind]}</Badge>
                      <span className="text-xs text-app-muted">{m.date}</span>
                      <span className="text-xs text-app-muted">
                        Técnico:{" "}
                        <span className="text-app">
                          {assignedUserName(m.assigned_technician_detail) ??
                            assignedUserName(m.assigned_engineer_detail) ??
                            (m.technician?.trim() || "—")}
                        </span>
                      </span>
                      {m.cost && (
                        <span className="text-xs text-app-muted">
                          Costo: <span className="text-app">${m.cost}</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-app">{m.description}</p>
                  </div>
                  {m.pdf_file_url && (
                    <a
                      href={m.pdf_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 self-start rounded-lg border border-app bg-surface px-2.5 py-1 text-xs font-medium text-app hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]"
                    >
                      <FileText size={12} /> PDF
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "programados" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-app-muted">Filtrar por tipo:</span>
              <div className="w-44">
                <Select
                  placeholder="Todos"
                  value={scheduledKind}
                  onChange={(e) => setScheduledKind(e.target.value)}
                  options={[
                    { value: "PREVENTIVE", label: "Preventivo" },
                    { value: "REPAIR", label: "Reparación" },
                  ]}
                />
              </div>
            </div>
            {loadingS ? (
              <p className="py-6 text-center text-sm text-app-muted">Cargando...</p>
            ) : scheduled.length === 0 ? (
              <p className="py-6 text-center text-sm text-app-muted">
                No hay mantenimientos programados con los filtros actuales.
              </p>
            ) : (
              scheduled.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col gap-2 rounded-lg border border-app bg-app-muted p-3 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                    <CalendarClock size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={kindToneScheduled(s.kind)}>
                        {kindLabelScheduled(s.kind)}
                      </Badge>
                      <span className="text-xs text-app-muted">{s.scheduled_date}</span>
                      <Badge tone={s.is_completed ? "success" : "warning"}>
                        {s.is_completed ? "Cumplido" : "Pendiente"}
                      </Badge>
                    </div>
                    {s.notes && (
                      <p className="mt-1 text-sm text-app">{s.notes}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
    </div>
  );
}

function kindLabelScheduled(k: ScheduleKind): string {
  return k === "PREVENTIVE" ? "Preventivo" : "Reparación";
}

function kindToneScheduled(k: ScheduleKind): "info" | "danger" {
  return k === "PREVENTIVE" ? "info" : "danger";
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-[var(--color-primary)] text-[var(--color-primary)]"
          : "border-transparent text-app-muted hover:text-app"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs uppercase tracking-wider text-app-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-app">{children}</dd>
    </div>
  );
}