import type { AssignedUser } from "@/types/auth";
import type { SemaphorePayload } from "@/lib/semaphore";
import type { MaintenanceRecord } from "@/types/maintenance";

export type ScheduleKind = "PREVENTIVE" | "CALIBRATION" | "REPAIR";

/** Tipos que participan de la recurrencia automática (RF006). */
export type RecurringScheduleKind = "PREVENTIVE" | "CALIBRATION";

export interface ScheduledMaintenance {
  id: number;
  equipment: number;
  equipment_asset_tag?: string;
  equipment_name?: string;
  branch_name?: string;
  kind: ScheduleKind;
  scheduled_date: string;
  semaphore?: SemaphorePayload | null;
  notes?: string;
  assigned_engineer?: number | null;
  assigned_engineer_detail?: AssignedUser | null;
  assigned_technician?: number | null;
  assigned_technician_detail?: AssignedUser | null;
  is_completed: boolean;
  auto_generated?: boolean;
  generated_from?: number | null;
  notified_at?: string | null;
  maintenance_record?: number | null;
  maintenance_record_detail?: MaintenanceRecord | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleInput {
  equipment: number;
  kind: ScheduleKind;
  scheduled_date: string;
  notes?: string;
  assigned_technician?: number | null;
  assigned_engineer?: number | null;
}

export interface AnnualPlanResult {
  created: number;
  schedules: ScheduledMaintenance[];
}

export interface CalendarMonth {
  month: number;
  items: ScheduledMaintenance[];
}

export interface MaintenanceCalendar {
  year: number;
  months: CalendarMonth[];
}

// ---------------------------------------------------------------------------
// Alertas de mantenimiento preventivo (HU011 / HU015)
// ---------------------------------------------------------------------------

export type MaintenanceAlertType = "DUE_SOON" | "OVERDUE";

export interface MaintenanceAlert {
  id: number;
  schedule: number;
  scheduled_date: string;
  equipment: number;
  equipment_asset_tag: string;
  equipment_name: string;
  branch_name: string;
  alert_type: MaintenanceAlertType;
  alert_type_display: string;
  due_date: string;
  message: string;
  is_open: boolean;
  created_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: number | null;
  acknowledged_by_name?: string | null;
  acknowledgement_note?: string;
}
