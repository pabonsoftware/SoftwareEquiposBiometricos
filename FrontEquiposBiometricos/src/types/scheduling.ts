import type { AssignedUser } from "@/types/auth";
import type { MaintenanceRecord } from "@/types/maintenance";

export type ScheduleKind = "PREVENTIVE" | "REPAIR";

export interface ScheduledMaintenance {
  id: number;
  equipment: number;
  equipment_asset_tag?: string;
  equipment_name?: string;
  branch_name?: string;
  kind: ScheduleKind;
  scheduled_date: string;
  notes?: string;
  assigned_engineer?: number | null;
  assigned_engineer_detail?: AssignedUser | null;
  assigned_technician?: number | null;
  assigned_technician_detail?: AssignedUser | null;
  is_completed: boolean;
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
