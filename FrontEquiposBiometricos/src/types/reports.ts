import type { EquipmentStatus } from "@/types/equipment";
import type { MaintenanceKind } from "@/types/maintenance";
import type { SemaphoreCode } from "@/lib/semaphore";
import type { WorkOrderServiceType, WorkOrderStatus } from "@/types/workorders";

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  equipment?: number;
  branch?: number;
  search?: string;
}

// --- Reporte de mantenimientos (RF012) ---------------------------------------
export interface MaintenanceReportRow {
  id: number;
  equipment_id: number;
  equipment_name: string;
  equipment_asset_tag: string;
  branch_name: string;
  kind: MaintenanceKind;
  kind_display: string;
  date: string;
  description: string;
  responsible: string | null;
  cost: string | null;
  has_certificate: boolean;
}

export interface MaintenanceReport {
  summary: {
    total: number;
    by_kind: Record<string, number>;
    total_cost: string;
    average_cost: string;
    equipment_count: number;
    with_certificate: number;
    corrective_by_severity: {
      severity: string;
      total: number;
      resolved: number;
    }[];
  };
  results: MaintenanceReportRow[];
}

// --- Reporte de estado de equipos (HU022) -----------------------------------
export interface EquipmentStatusReportRow {
  id: number;
  name: string;
  asset_tag: string;
  branch_name: string;
  department: string | null;
  area: string | null;
  location: string | null;
  status: EquipmentStatus;
  status_display: string;
  risk_class: string | null;
  open_failures: number;
  mtbf_hours: string | null;
  mttr_hours: string | null;
  maintenance_semaphore: SemaphoreCode;
}

export interface EquipmentStatusReport {
  summary: {
    total: number;
    by_status: Record<string, number>;
    operational_availability: number;
    avg_mtbf_hours: string | null;
    avg_mttr_hours: string | null;
    by_branch: {
      branch_id: number;
      branch_name: string;
      total: number;
      active: number;
    }[];
  };
  results: EquipmentStatusReportRow[];
}

// --- Reporte de órdenes de trabajo (RF012) ---------------------------------
export interface WorkOrderReportRow {
  id: number;
  number: string;
  equipment_asset_tag: string;
  branch_name: string;
  service_type: WorkOrderServiceType;
  service_type_display: string;
  status: WorkOrderStatus;
  status_display: string;
  start_date: string;
  end_date: string | null;
  technician: string | null;
  semaphore: SemaphoreCode;
}

export interface WorkOrderReport {
  summary: {
    total: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    preventive_compliance: number | null;
    finished: number;
    open: number;
  };
  results: WorkOrderReportRow[];
}

// --- Certificados / reportes de mantenimiento (HU023) ---------------------
export type CertificateSource =
  | "EQUIPMENT_CERTIFICATE"
  | "MAINTENANCE_REPORT"
  | "WORK_ORDER_REPORT";

export interface CertificateDoc {
  source: CertificateSource;
  source_label: string;
  id: number;
  equipment_id: number;
  equipment_asset_tag: string;
  branch_name: string;
  title: string;
  date: string;
  responsible: string | null;
  url: string | null;
}

export interface CertificatesResponse {
  count: number;
  results: CertificateDoc[];
}
