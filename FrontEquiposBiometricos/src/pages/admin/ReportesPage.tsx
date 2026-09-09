import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { getApiErrorMessage } from "@/lib/api";
import { SEMAPHORE_META, type SemaphoreCode } from "@/lib/semaphore";
import { reportsService } from "@/services/reports.service";
import { branchesService } from "@/services/branches.service";
import type { Branch } from "@/types/branch";
import type {
  CertificateDoc,
  EquipmentStatusReport,
  MaintenanceReport,
  WorkOrderReport,
} from "@/types/reports";

type Tab = "maintenance" | "equipment-status" | "work-orders" | "certificates";

const TABS: { id: Tab; label: string }[] = [
  { id: "maintenance", label: "Mantenimientos" },
  { id: "equipment-status", label: "Estado de equipos" },
  { id: "work-orders", label: "Órdenes de trabajo" },
  { id: "certificates", label: "Certificados" },
];

const MAINT_KINDS = [
  { value: "", label: "Todos los tipos" },
  { value: "PREVENTIVE", label: "Preventivo" },
  { value: "CORRECTIVE", label: "Correctivo" },
  { value: "CALIBRATION", label: "Calibración" },
  { value: "REPAIR", label: "Reparación mayor" },
  { value: "INSPECTION", label: "Inspección" },
];

const EQUIPMENT_STATUSES = [
  { value: "", label: "Todos los estados" },
  { value: "ACTIVE", label: "Operativo" },
  { value: "IN_MAINTENANCE", label: "En mantenimiento" },
  { value: "IN_REPAIR", label: "En reparación" },
  { value: "INACTIVE", label: "Fuera de servicio" },
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-app bg-app-muted p-3">
      <p className="text-xs text-app-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-app">{value}</p>
    </div>
  );
}

export function ReportesPage() {
  const [tab, setTab] = useState<Tab>("maintenance");
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    void branchesService
      .list()
      .then((b) => setBranches(Array.isArray(b) ? b : []))
      .catch(() => setBranches([]));
  }, []);

  const branchOptions = useMemo(
    () => [
      { value: "", label: "Todas las sedes" },
      ...branches.map((b) => ({ value: String(b.id), label: b.name })),
    ],
    [branches],
  );

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-app sm:text-3xl">Reportes</h1>
        <p className="text-sm text-app-muted">
          Reportes de gestión con filtros y descarga en CSV (RF012).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-lg px-3 py-1.5 text-sm font-medium text-app-muted hover:bg-app-muted"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "maintenance" && <MaintenanceReportTab branchOptions={branchOptions} />}
      {tab === "equipment-status" && (
        <EquipmentStatusReportTab branchOptions={branchOptions} />
      )}
      {tab === "work-orders" && <WorkOrderReportTab branchOptions={branchOptions} />}
      {tab === "certificates" && <CertificatesTab branchOptions={branchOptions} />}
    </div>
  );
}

interface Opt {
  value: string;
  label: string;
}

function DateRange({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <>
      <Input
        label="Desde"
        type="date"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
      />
      <Input
        label="Hasta"
        type="date"
        value={to}
        onChange={(e) => onTo(e.target.value)}
      />
    </>
  );
}

function useReport<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo cargar el reporte"));
    } finally {
      setLoading(false);
    }
  };
  return { data, loading, error, run, setError };
}

// --- Mantenimientos --------------------------------------------------------
function MaintenanceReportTab({ branchOptions }: { branchOptions: Opt[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState("");
  const [branch, setBranch] = useState("");
  const [downloading, setDownloading] = useState(false);

  const params = () => ({
    date_from: from || undefined,
    date_to: to || undefined,
    kind: kind || undefined,
    branch: branch ? Number(branch) : undefined,
  });

  const { data, loading, error, run } = useReport<MaintenanceReport>(() =>
    reportsService.maintenance(params()),
  );

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = async () => {
    setDownloading(true);
    try {
      await reportsService.downloadCsv("maintenance", {
        date_from: from || undefined,
        date_to: to || undefined,
        kind: kind || undefined,
        branch: branch || undefined,
      });
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo descargar"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Select
          label="Tipo"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={MAINT_KINDS}
        />
        <Select
          label="Sede"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          options={branchOptions}
        />
      </div>
      <div className="mb-4 flex gap-2">
        <Button variant="secondary" onClick={() => void run()}>
          Aplicar filtros
        </Button>
        <Button
          leftIcon={<Download size={16} />}
          loading={downloading}
          onClick={() => void download()}
        >
          Descargar CSV
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Mantenimientos" value={data.summary.total} />
            <Stat label="Equipos" value={data.summary.equipment_count} />
            <Stat label="Costo total" value={`$${data.summary.total_cost}`} />
            <Stat
              label="Costo promedio"
              value={`$${data.summary.average_cost}`}
            />
            <Stat
              label="Con certificado"
              value={data.summary.with_certificate}
            />
          </div>
          {data.summary.corrective_by_severity.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              <span className="text-app-muted">
                Correctivos por severidad de falla:
              </span>
              {data.summary.corrective_by_severity.map((s) => (
                <Badge key={s.severity} tone="neutral">
                  {s.severity}: {s.total} ({s.resolved} resueltas)
                </Badge>
              ))}
            </div>
          )}
        </>
      )}

      <ReportTable
        loading={loading}
        empty={!data?.results.length}
        columns={["Equipo", "Sede", "Tipo", "Fecha", "Responsable", "Costo"]}
        rows={(data?.results ?? []).map((r) => (
          <tr key={r.id} className="text-app [&>td]:py-2">
            <td>
              {r.equipment_name}{" "}
              <span className="font-mono text-xs text-app-muted">
                {r.equipment_asset_tag}
              </span>
            </td>
            <td className="text-app-muted">{r.branch_name}</td>
            <td>
              <Badge tone="info">{r.kind_display}</Badge>
            </td>
            <td className="text-app-muted">{r.date}</td>
            <td className="text-app-muted">{r.responsible ?? "—"}</td>
            <td className="text-app-muted">{r.cost ? `$${r.cost}` : "—"}</td>
          </tr>
        ))}
      />
    </Card>
  );
}

// --- Estado de equipos ---------------------------------------------------
function EquipmentStatusReportTab({ branchOptions }: { branchOptions: Opt[] }) {
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [downloading, setDownloading] = useState(false);

  const { data, loading, error, run } = useReport<EquipmentStatusReport>(() =>
    reportsService.equipmentStatus({
      status: status || undefined,
      branch: branch ? Number(branch) : undefined,
    }),
  );

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = async () => {
    setDownloading(true);
    try {
      await reportsService.downloadCsv("equipment-status", {
        status: status || undefined,
        branch: branch || undefined,
      });
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo descargar"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Estado"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={EQUIPMENT_STATUSES}
        />
        <Select
          label="Sede"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          options={branchOptions}
        />
      </div>
      <div className="mb-4 flex gap-2">
        <Button variant="secondary" onClick={() => void run()}>
          Aplicar filtros
        </Button>
        <Button
          leftIcon={<Download size={16} />}
          loading={downloading}
          onClick={() => void download()}
        >
          Descargar CSV
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {data && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Equipos" value={data.summary.total} />
          <Stat
            label="Disponibilidad operativa"
            value={`${data.summary.operational_availability}%`}
          />
          <Stat label="Operativos" value={data.summary.by_status.ACTIVE ?? 0} />
          <Stat
            label="MTBF prom. (h)"
            value={data.summary.avg_mtbf_hours ?? "—"}
          />
          <Stat
            label="MTTR prom. (h)"
            value={data.summary.avg_mttr_hours ?? "—"}
          />
        </div>
      )}

      <ReportTable
        loading={loading}
        empty={!data?.results.length}
        columns={[
          "Equipo",
          "Sede / Ubicación",
          "Estado",
          "Mantenimiento",
          "Fallas abiertas",
          "MTBF / MTTR",
        ]}
        rows={(data?.results ?? []).map((r) => (
          <tr key={r.id} className="text-app [&>td]:py-2">
            <td>
              {r.name}{" "}
              <span className="font-mono text-xs text-app-muted">
                {r.asset_tag}
              </span>
            </td>
            <td className="text-app-muted">
              {r.branch_name}
              {r.location ? ` · ${r.location}` : ""}
            </td>
            <td>{r.status_display}</td>
            <td>
              <Badge tone={SEMAPHORE_META[r.maintenance_semaphore].tone}>
                {SEMAPHORE_META[r.maintenance_semaphore].label}
              </Badge>
            </td>
            <td className="text-app-muted">{r.open_failures}</td>
            <td className="text-app-muted">
              {r.mtbf_hours ?? "—"} / {r.mttr_hours ?? "—"}
            </td>
          </tr>
        ))}
      />
    </Card>
  );
}

// --- Órdenes de trabajo -------------------------------------------------
function WorkOrderReportTab({ branchOptions }: { branchOptions: Opt[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branch, setBranch] = useState("");
  const [downloading, setDownloading] = useState(false);

  const { data, loading, error, run } = useReport<WorkOrderReport>(() =>
    reportsService.workOrders({
      date_from: from || undefined,
      date_to: to || undefined,
      branch: branch ? Number(branch) : undefined,
    }),
  );

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = async () => {
    setDownloading(true);
    try {
      await reportsService.downloadCsv("work-orders", {
        date_from: from || undefined,
        date_to: to || undefined,
        branch: branch || undefined,
      });
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo descargar"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Select
          label="Sede"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          options={branchOptions}
        />
      </div>
      <div className="mb-4 flex gap-2">
        <Button variant="secondary" onClick={() => void run()}>
          Aplicar filtros
        </Button>
        <Button
          leftIcon={<Download size={16} />}
          loading={downloading}
          onClick={() => void download()}
        >
          Descargar CSV
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {data && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Órdenes" value={data.summary.total} />
          <Stat label="Terminadas" value={data.summary.finished} />
          <Stat label="Abiertas" value={data.summary.open} />
          <Stat
            label="Cumplimiento preventivo"
            value={
              data.summary.preventive_compliance === null
                ? "—"
                : `${data.summary.preventive_compliance}%`
            }
          />
        </div>
      )}

      <ReportTable
        loading={loading}
        empty={!data?.results.length}
        columns={["Número", "Equipo", "Tipo", "Estado", "Cumplimiento", "Responsable"]}
        rows={(data?.results ?? []).map((r) => (
          <tr key={r.id} className="text-app [&>td]:py-2">
            <td className="font-medium">{r.number}</td>
            <td className="font-mono text-xs text-app-muted">
              {r.equipment_asset_tag}
            </td>
            <td>
              <Badge tone="info">{r.service_type_display}</Badge>
            </td>
            <td>{r.status_display}</td>
            <td>
              <Badge tone={SEMAPHORE_META[r.semaphore as SemaphoreCode].tone}>
                {SEMAPHORE_META[r.semaphore as SemaphoreCode].label}
              </Badge>
            </td>
            <td className="text-app-muted">{r.technician ?? "—"}</td>
          </tr>
        ))}
      />
    </Card>
  );
}

// --- Certificados (HU023) ---------------------------------------------
function CertificatesTab({ branchOptions }: { branchOptions: Opt[] }) {
  const [branch, setBranch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, loading, error, run } = useReport<{
    count: number;
    results: CertificateDoc[];
  }>(() =>
    reportsService.certificates({
      branch: branch ? Number(branch) : undefined,
      date_from: from || undefined,
      date_to: to || undefined,
    }),
  );

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Sede"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          options={branchOptions}
        />
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>
      <div className="mb-4">
        <Button variant="secondary" onClick={() => void run()}>
          Aplicar filtros
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <ReportTable
        loading={loading}
        empty={!data?.results.length}
        columns={["Documento", "Equipo", "Fecha", "Responsable", "Origen", ""]}
        rows={(data?.results ?? []).map((d) => (
          <tr
            key={`${d.source}-${d.id}`}
            className="text-app [&>td]:py-2"
          >
            <td className="flex items-center gap-2">
              <FileText size={14} className="text-app-muted" />
              {d.title}
            </td>
            <td className="font-mono text-xs text-app-muted">
              {d.equipment_asset_tag}
            </td>
            <td className="text-app-muted">{d.date}</td>
            <td className="text-app-muted">{d.responsible ?? "—"}</td>
            <td>
              <Badge tone="neutral">{d.source_label}</Badge>
            </td>
            <td className="text-right">
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <Download size={14} /> Ver PDF
                </a>
              ) : (
                <span className="text-xs text-app-muted">Sin archivo</span>
              )}
            </td>
          </tr>
        ))}
      />
    </Card>
  );
}

// --- Tabla genérica ---------------------------------------------------
function ReportTable({
  loading,
  empty,
  columns,
  rows,
}: {
  loading: boolean;
  empty: boolean;
  columns: string[];
  rows: ReactNode[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app text-left text-xs uppercase tracking-wider text-app-muted [&>th]:pb-2">
            {columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {loading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-8 text-center text-app-muted"
              >
                Cargando...
              </td>
            </tr>
          ) : empty ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-8 text-center text-app-muted"
              >
                Sin resultados para los filtros actuales.
              </td>
            </tr>
          ) : (
            rows
          )}
        </tbody>
      </table>
    </div>
  );
}
