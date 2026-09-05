import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABEL, can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import { dashboardService } from "@/services/dashboard.service";
import type {
  DashboardSummary,
  EquipmentStatusBucket,
  FailureSeverity,
  FailureSeverityBucket,
  MaintenanceMonthBucket,
} from "@/types/dashboard";
import type { EquipmentStatus } from "@/types/equipment";

const STATUS_LABEL: Record<EquipmentStatus, string> = {
  ACTIVE: "Operativo",
  IN_MAINTENANCE: "En mantenimiento",
  IN_REPAIR: "En reparación",
  INACTIVE: "Fuera de servicio",
};

const STATUS_COLOR: Record<EquipmentStatus, string> = {
  ACTIVE: "#10b981",
  IN_MAINTENANCE: "#f59e0b",
  IN_REPAIR: "#ef4444",
  INACTIVE: "#94a3b8",
};

const SEVERITY_LABEL: Record<FailureSeverity, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

const SEVERITY_COLOR: Record<FailureSeverity, string> = {
  LOW: "#0ea5e9",
  MEDIUM: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#dc2626",
};

const KIND_COLOR: Record<"PREVENTIVE" | "CORRECTIVE" | "REPAIR", string> = {
  PREVENTIVE: "#3b82f6",
  CORRECTIVE: "#f59e0b",
  REPAIR: "#ef4444",
};

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatCost(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return COP.format(n);
}

function formatHours(value: string | number | null | undefined): string {
  if (value == null || value === "") return "Sin datos";
  const hours = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(hours) || hours < 0) return "Sin datos";
  if (hours < 24) return `${hours.toFixed(1)} h`;
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours - days * 24);
  return rem > 0 ? `${days} d ${rem} h` : `${days} d`;
}

function MonthLabel({ month }: { month: string }): string {
  // "2026-05" → "May 26"
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const d = new Date(y, m - 1, 1);
  return d
    .toLocaleString("es-CO", { month: "short", year: "2-digit" })
    .replace(/\./g, "");
}

export function DashboardPage() {
  const { usuario } = useAuth();
  const role = usuario?.role;

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    dashboardService
      .summary()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(getApiErrorMessage(err, "No se pudo cargar el dashboard"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fullName = usuario
    ? [usuario.first_name, usuario.last_name].filter(Boolean).join(" ") ||
      usuario.username
    : "";

  const canViewEquipment = can(role, "equipment", "view");
  const canViewFailures = can(role, "failures", "view");
  const canViewScheduling = can(role, "scheduling", "view");
  const canViewMaintenance = can(role, "maintenance", "view");

  const myTasksCount =
    (data?.my_tasks.schedules.length ?? 0) +
    (data?.my_tasks.failures.length ?? 0);

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-app sm:text-3xl">
          Hola, {fullName} 👋
        </h1>
        <p className="text-sm text-app-muted">
          {usuario && (
            <>
              Tu perfil:{" "}
              <span className="font-medium text-app">
                {ROLE_LABEL[usuario.role]}
              </span>
              . Resumen general del estado de los equipos biomédicos.
            </>
          )}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {loading && !data ? (
        <p className="py-12 text-center text-app-muted">Cargando dashboard…</p>
      ) : data ? (
        <>
          {myTasksCount > 0 && (
            <MyTasksSection schedules={data.my_tasks.schedules} />
          )}

          <KpiRow
            data={data}
            canViewEquipment={canViewEquipment}
            canViewFailures={canViewFailures}
            canViewScheduling={canViewScheduling}
            canViewMaintenance={canViewMaintenance}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            {canViewEquipment && (
              <EquipmentStatusChart
                data={data.distributions.equipment_by_status}
              />
            )}
            {canViewFailures && (
              <FailuresSeverityChart
                data={data.distributions.failures_by_severity}
              />
            )}
          </div>

          {canViewMaintenance && (
            <MaintenanceTimeSeriesChart
              data={data.time_series.maintenance_by_month}
            />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {canViewScheduling && (
              <OverdueSchedulesList items={data.lists.overdue_schedules} />
            )}
            {canViewEquipment && (
              <WorstMtbfList items={data.lists.worst_mtbf} />
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MyTasksSection({
  schedules,
}: {
  schedules: DashboardSummary["my_tasks"]["schedules"];
}) {
  if (schedules.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Mis tareas próximas"
        subtitle="Agendamientos asignados a ti en los próximos 7 días"
      />
      <ul className="divide-y divide-[var(--border)]">
        {schedules.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 py-3 text-sm"
          >
            <div>
              <p className="font-medium text-app">{s.equipment_name}</p>
              <p className="text-xs text-app-muted">
                <span className="font-mono">{s.equipment_asset_tag}</span> ·{" "}
                {s.scheduled_date}
              </p>
            </div>
            <Badge tone={s.kind === "PREVENTIVE" ? "info" : "danger"}>
              {s.kind === "PREVENTIVE" ? "Preventivo" : "Reparación"}
            </Badge>
          </li>
        ))}
      </ul>
      <Link
        to="/admin/agendamientos"
        className="mt-3 inline-block text-sm text-[var(--color-primary)] hover:underline"
      >
        Ver todos →
      </Link>
    </Card>
  );
}

function KpiRow({
  data,
  canViewEquipment,
  canViewFailures,
  canViewScheduling,
  canViewMaintenance,
}: {
  data: DashboardSummary;
  canViewEquipment: boolean;
  canViewFailures: boolean;
  canViewScheduling: boolean;
  canViewMaintenance: boolean;
}) {
  const { equipment, failures, scheduling, maintenance } = data.kpis;
  const cards: Array<{
    label: string;
    value: string;
    delta: string;
    Icon: typeof ClipboardList;
    tone: string;
    show: boolean;
    alert?: boolean;
  }> = [
    {
      label: "Equipos operativos",
      value: String(equipment.active),
      delta: `${equipment.total} en total`,
      Icon: ClipboardList,
      tone: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
      show: canViewEquipment,
    },
    {
      label: "Fallas críticas abiertas",
      value: String(failures.critical_open),
      delta: `${failures.total_open} fallas pendientes en total`,
      Icon: AlertTriangle,
      tone:
        failures.critical_open > 0
          ? "text-red-600 bg-red-50 dark:bg-red-950/40"
          : "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
      show: canViewFailures,
      alert: failures.critical_open > 0,
    },
    {
      label: "Próximos 7 días",
      value: String(scheduling.next_7_days),
      delta:
        scheduling.overdue > 0
          ? `${scheduling.overdue} vencidos sin cumplir`
          : "Sin vencidos",
      Icon: CalendarClock,
      tone: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
      show: canViewScheduling,
    },
    {
      label: "Mantenimientos del mes",
      value: String(maintenance.this_month_count),
      delta: `Costo: ${formatCost(maintenance.this_month_cost)}`,
      Icon: Wrench,
      tone: "text-violet-600 bg-violet-50 dark:bg-violet-950/40",
      show: canViewMaintenance,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards
        .filter((c) => c.show)
        .map(({ label, value, delta, Icon, tone, alert }) => (
          <Card key={label} className={alert ? "ring-2 ring-red-200 dark:ring-red-900/60" : ""}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-app-muted">{label}</p>
                <p className="mt-1 text-3xl font-bold text-app">{value}</p>
                <p className="mt-1 text-xs text-app-muted">{delta}</p>
              </div>
              <div className={`rounded-lg p-2.5 ${tone}`}>
                <Icon size={20} />
              </div>
            </div>
          </Card>
        ))}
    </div>
  );
}

function EquipmentStatusChart({ data }: { data: EquipmentStatusBucket[] }) {
  const total = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);
  if (total === 0)
    return (
      <Card>
        <CardHeader
          title="Equipos por estado"
          subtitle="Distribución del inventario"
        />
        <p className="py-8 text-center text-sm text-app-muted">
          Sin equipos registrados.
        </p>
      </Card>
    );
  return (
    <Card>
      <CardHeader
        title="Equipos por estado"
        subtitle="Distribución del inventario"
      />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
            >
              {data.map((d) => (
                <Cell key={d.status} fill={STATUS_COLOR[d.status]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => {
                const status = (item?.payload?.status ?? "") as EquipmentStatus;
                return [String(value), STATUS_LABEL[status] ?? status];
              }}
            />
            <Legend
              formatter={(value) =>
                STATUS_LABEL[value as EquipmentStatus] ?? value
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function FailuresSeverityChart({ data }: { data: FailureSeverityBucket[] }) {
  const total = useMemo(
    () => data.reduce((s, d) => s + d.open + d.resolved, 0),
    [data],
  );
  if (total === 0)
    return (
      <Card>
        <CardHeader
          title="Fallas por severidad"
          subtitle="Abiertas vs resueltas"
        />
        <p className="py-8 text-center text-sm text-app-muted">
          Sin fallas reportadas.
        </p>
      </Card>
    );
  const chartData = data.map((d) => ({
    severity: SEVERITY_LABEL[d.severity],
    severityKey: d.severity,
    Abiertas: d.open,
    Resueltas: d.resolved,
  }));
  return (
    <Card>
      <CardHeader
        title="Fallas por severidad"
        subtitle="Abiertas vs resueltas"
      />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="severity" width={70} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Abiertas" stackId="a" fill="#ef4444">
              {chartData.map((d) => (
                <Cell key={d.severityKey} fill={SEVERITY_COLOR[d.severityKey]} />
              ))}
            </Bar>
            <Bar dataKey="Resueltas" stackId="a" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MaintenanceTimeSeriesChart({
  data,
}: {
  data: MaintenanceMonthBucket[];
}) {
  const chartData = data.map((d) => ({
    month: MonthLabel({ month: d.month }),
    Preventivo: d.PREVENTIVE,
    Correctivo: d.CORRECTIVE,
    Reparación: d.REPAIR,
    costo: Number(d.cost),
  }));
  return (
    <Card>
      <CardHeader
        title="Mantenimientos últimos 6 meses"
        subtitle="Cantidad por tipo y costo total mensual"
      />
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis
              yAxisId="count"
              allowDecimals={false}
              label={{
                value: "Cantidad",
                angle: -90,
                position: "insideLeft",
                fontSize: 12,
              }}
            />
            <YAxis
              yAxisId="cost"
              orientation="right"
              tickFormatter={(v: number) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000
                    ? `${(v / 1000).toFixed(0)}K`
                    : String(v)
              }
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === "costo")
                  return [formatCost(Number(value ?? 0)), "Costo"];
                return [String(value ?? 0), String(name ?? "")];
              }}
            />
            <Legend />
            <Bar
              yAxisId="count"
              dataKey="Preventivo"
              stackId="kind"
              fill={KIND_COLOR.PREVENTIVE}
            />
            <Bar
              yAxisId="count"
              dataKey="Correctivo"
              stackId="kind"
              fill={KIND_COLOR.CORRECTIVE}
            />
            <Bar
              yAxisId="count"
              dataKey="Reparación"
              stackId="kind"
              fill={KIND_COLOR.REPAIR}
            />
            <Line
              yAxisId="cost"
              type="monotone"
              dataKey="costo"
              stroke="#7c3aed"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function OverdueSchedulesList({
  items,
}: {
  items: DashboardSummary["lists"]["overdue_schedules"];
}) {
  return (
    <Card>
      <CardHeader
        title="Agendamientos vencidos"
        subtitle="Pendientes cuya fecha ya pasó"
        action={
          items.length > 0 ? (
            <Link
              to="/admin/agendamientos"
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              Ver todos →
            </Link>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-app-muted">
          <CheckCircle2
            size={24}
            className="mx-auto mb-2 text-emerald-500"
          />
          No hay agendamientos vencidos.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-app">{it.equipment_name}</p>
                <p className="text-xs text-app-muted">
                  <span className="font-mono">{it.equipment_asset_tag}</span> ·
                  Programado para {it.scheduled_date}
                </p>
              </div>
              <Badge tone="danger">{it.days_overdue} d</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WorstMtbfList({
  items,
}: {
  items: DashboardSummary["lists"]["worst_mtbf"];
}) {
  return (
    <Card>
      <CardHeader
        title="Equipos con peor confiabilidad"
        subtitle="Menor MTBF entre los que tienen 2+ fallas"
      />
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-app-muted">
          Aún no hay suficientes datos.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="flex items-center gap-1.5 font-medium text-app">
                  <Activity size={14} className="text-amber-500" />
                  {it.name}
                </p>
                <p className="text-xs text-app-muted">
                  <span className="font-mono">{it.asset_tag}</span> ·{" "}
                  {it.branch_name} · {it.failures_count} fallas
                </p>
              </div>
              <span className="text-sm font-semibold text-app">
                {formatHours(it.mtbf_hours)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
