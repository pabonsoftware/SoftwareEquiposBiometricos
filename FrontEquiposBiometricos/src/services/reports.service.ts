import { api } from "@/lib/api";
import type {
  CertificatesResponse,
  EquipmentStatusReport,
  MaintenanceReport,
  ReportFilters,
  WorkOrderReport,
} from "@/types/reports";

export type ReportKind =
  | "maintenance"
  | "equipment-status"
  | "work-orders";

const PATHS: Record<ReportKind, string> = {
  maintenance: "/reports/maintenance/",
  "equipment-status": "/reports/equipment-status/",
  "work-orders": "/reports/work-orders/",
};

type AnyParams = Record<string, string | number | undefined>;

/** Dispara la descarga de un blob en el navegador (el sandbox del SPA sí lo permite). */
function triggerDownload(blob: Blob, fallbackName: string, disposition?: string) {
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const reportsService = {
  async maintenance(params: ReportFilters & { kind?: string } = {}) {
    const res = await api.get<MaintenanceReport>(PATHS.maintenance, { params });
    return res.data;
  },
  async equipmentStatus(
    params: {
      status?: string;
      branch?: number;
      department?: string;
      area?: string;
      risk_class?: string;
    } = {},
  ) {
    const res = await api.get<EquipmentStatusReport>(PATHS["equipment-status"], {
      params,
    });
    return res.data;
  },
  async workOrders(
    params: ReportFilters & { status?: string; service_type?: string } = {},
  ) {
    const res = await api.get<WorkOrderReport>(PATHS["work-orders"], { params });
    return res.data;
  },
  async certificates(params: ReportFilters = {}) {
    const res = await api.get<CertificatesResponse>("/reports/certificates/", {
      params,
    });
    return res.data;
  },
  /** RF012 / RFN010 — descarga el reporte como CSV. */
  async downloadCsv(kind: ReportKind, params: AnyParams = {}) {
    const res = await api.get(PATHS[kind], {
      params: { ...params, export: "csv" },
      responseType: "blob",
    });
    triggerDownload(
      res.data as Blob,
      `reporte_${kind}.csv`,
      res.headers?.["content-disposition"],
    );
  },
};
