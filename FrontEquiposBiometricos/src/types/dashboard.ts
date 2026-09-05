import type { EquipmentStatus } from "@/types/equipment";
import type { MaintenanceKind } from "@/types/maintenance";
import type { ScheduleKind } from "@/types/scheduling";

export type FailureSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DashboardKpis {
  equipment: {
    active: number;
    in_maintenance: number;
    in_repair: number;
    inactive: number;
    total: number;
  };
  failures: {
    critical_open: number;
    total_open: number;
  };
  scheduling: {
    next_7_days: number;
    overdue: number;
  };
  maintenance: {
    this_month_count: number;
    /** Decimal serializado como string. */
    this_month_cost: string;
  };
}

export interface EquipmentStatusBucket {
  status: EquipmentStatus;
  count: number;
}

export interface FailureSeverityBucket {
  severity: FailureSeverity;
  open: number;
  resolved: number;
}

export interface MaintenanceMonthBucket {
  /** Formato YYYY-MM. */
  month: string;
  PREVENTIVE: number;
  CORRECTIVE: number;
  REPAIR: number;
  /** Decimal como string. */
  cost: string;
}

export interface OverdueSchedule {
  id: number;
  equipment_id: number;
  equipment_name: string;
  equipment_asset_tag: string;
  scheduled_date: string;
  days_overdue: number;
  kind: ScheduleKind;
}

export interface WorstMtbfEquipment {
  id: number;
  name: string;
  asset_tag: string;
  branch_name: string;
  mtbf_hours: string;
  failures_count: number;
}

export interface MyScheduleTask {
  id: number;
  equipment_id: number;
  equipment_name: string;
  equipment_asset_tag: string;
  scheduled_date: string;
  kind: ScheduleKind;
}

export interface MyFailureTask {
  id: number;
  equipment_id: number;
  equipment_name: string;
  severity: FailureSeverity;
  reported_at: string;
}

export interface DashboardSummary {
  kpis: DashboardKpis;
  distributions: {
    equipment_by_status: EquipmentStatusBucket[];
    failures_by_severity: FailureSeverityBucket[];
  };
  time_series: {
    maintenance_by_month: MaintenanceMonthBucket[];
  };
  lists: {
    overdue_schedules: OverdueSchedule[];
    worst_mtbf: WorstMtbfEquipment[];
  };
  my_tasks: {
    schedules: MyScheduleTask[];
    failures: MyFailureTask[];
  };
}

export type { MaintenanceKind };
