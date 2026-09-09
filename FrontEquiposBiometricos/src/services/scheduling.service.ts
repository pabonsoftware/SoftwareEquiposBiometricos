import { api } from "@/lib/api";
import type { Paginated } from "@/types/api";
import type {
  AnnualPlanResult,
  MaintenanceCalendar,
  ScheduleInput,
  ScheduleKind,
  ScheduledMaintenance,
} from "@/types/scheduling";

export interface ScheduleListParams {
  ordering?: string;
  equipment?: number;
  branch?: number;
  kind?: string;
  is_completed?: boolean;
  scheduled_date_after?: string;
  scheduled_date_before?: string;
  search?: string;
}

function unwrapList<T>(data: Paginated<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return data.results;
}

export const schedulingService = {
  async list(params: ScheduleListParams = {}) {
    const res = await api.get<Paginated<ScheduledMaintenance> | ScheduledMaintenance[]>(
      "/scheduling/maintenances/",
      { params },
    );
    return unwrapList(res.data);
  },
  async retrieve(id: number) {
    const res = await api.get<ScheduledMaintenance>(
      `/scheduling/maintenances/${id}/`,
    );
    return res.data;
  },
  async create(input: ScheduleInput) {
    const res = await api.post<ScheduledMaintenance>(
      "/scheduling/maintenances/",
      input,
    );
    return res.data;
  },
  async update(id: number, input: Partial<ScheduleInput> & { is_completed?: boolean }) {
    const res = await api.patch<ScheduledMaintenance>(
      `/scheduling/maintenances/${id}/`,
      input,
    );
    return res.data;
  },
  async remove(id: number) {
    await api.delete(`/scheduling/maintenances/${id}/`);
  },
  async complete(id: number) {
    const res = await api.post<ScheduledMaintenance>(
      `/scheduling/maintenances/${id}/complete/`,
    );
    return res.data;
  },
  async notify(id: number) {
    const res = await api.post<{ detail: string }>(
      `/scheduling/maintenances/${id}/notify/`,
    );
    return res.data;
  },
  /** RF006 — genera el cronograma anual del equipo por su frecuencia. */
  async generatePlan(input: {
    equipment: number;
    year: number;
    kind: ScheduleKind;
    start_date?: string;
  }) {
    const res = await api.post<AnnualPlanResult>(
      "/scheduling/maintenances/generate-plan/",
      input,
    );
    return res.data;
  },
  /** RF006 — cronograma anual agrupado por mes. */
  async calendar(params: { year: number } & Omit<ScheduleListParams, "ordering">) {
    const res = await api.get<MaintenanceCalendar>(
      "/scheduling/maintenances/calendar/",
      { params },
    );
    return res.data;
  },
};
