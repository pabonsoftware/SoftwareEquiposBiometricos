import { api } from "@/lib/api";
import type { Paginated } from "@/types/api";
import type { MaintenanceAlert, MaintenanceAlertType } from "@/types/scheduling";

export interface AlertListParams {
  /** true → sin atender; false → historial de atendidas. */
  open?: boolean;
  equipment?: number;
  branch?: number;
  alert_type?: MaintenanceAlertType;
  ordering?: string;
  search?: string;
}

function unwrap<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

export const alertsService = {
  async list(params: AlertListParams = {}) {
    const res = await api.get<Paginated<MaintenanceAlert> | MaintenanceAlert[]>(
      "/scheduling/maintenance-alerts/",
      { params },
    );
    return unwrap(res.data);
  },
  /** HU011 / HU015 — marca la alerta como atendida. */
  async acknowledge(id: number, note?: string) {
    const res = await api.post<MaintenanceAlert>(
      `/scheduling/maintenance-alerts/${id}/acknowledge/`,
      note ? { note } : {},
    );
    return res.data;
  },
};
