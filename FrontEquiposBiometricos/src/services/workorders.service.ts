import { api } from "@/lib/api";
import type { Paginated } from "@/types/api";
import type {
  WorkOrder,
  WorkOrderActivity,
  WorkOrderCost,
  WorkOrderDetail,
  WorkOrderEvidence,
  WorkOrderInput,
  WorkOrderMeasurement,
  WorkOrderSignature,
  WorkOrderSparePart,
} from "@/types/workorders";

export interface WorkOrderListParams {
  ordering?: string;
  equipment?: number;
  status?: string;
  service_type?: string;
  technician?: number;
  search?: string;
  page?: number;
  page_size?: number;
}

function unwrap<T>(data: Paginated<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

function toPaginated<T>(data: Paginated<T> | T[]): Paginated<T> {
  if (Array.isArray(data)) {
    return {
      count: data.length,
      next: null,
      previous: null,
      results: data,
    };
  }
  return data;
}

export const workOrdersService = {
  async list(params: WorkOrderListParams = {}) {
    const res = await api.get<Paginated<WorkOrder> | WorkOrder[]>(
      "/equipment/work-orders/",
      { params },
    );
    return unwrap(res.data);
  },

  async listPaginated(params: WorkOrderListParams = {}) {
    const res = await api.get<Paginated<WorkOrder> | WorkOrder[]>(
      "/equipment/work-orders/",
      { params },
    );
    return toPaginated(res.data);
  },

  async details(id: number) {
    const res = await api.get<WorkOrderDetail>(
      `/equipment/work-orders/${id}/details/`,
    );
    return res.data;
  },

  async create(input: WorkOrderInput) {
    const res = await api.post<WorkOrder>("/equipment/work-orders/", input);
    return res.data;
  },

  async update(id: number, input: Partial<WorkOrderInput>) {
    const res = await api.patch<WorkOrder>(
      `/equipment/work-orders/${id}/`,
      input,
    );
    return res.data;
  },

  // --- Máquina de estados (RF008/RF011/§9): el estado solo cambia por aquí ---
  async approve(id: number) {
    const res = await api.post<WorkOrder>(
      `/equipment/work-orders/${id}/approve/`,
    );
    return res.data;
  },

  async start(id: number) {
    const res = await api.post<WorkOrder>(`/equipment/work-orders/${id}/start/`);
    return res.data;
  },

  async complete(id: number, payload: { closing_notes: string }) {
    const res = await api.post<WorkOrder>(
      `/equipment/work-orders/${id}/complete/`,
      payload,
    );
    return res.data;
  },

  async cancel(id: number, payload: { reason: string }) {
    const res = await api.post<WorkOrder>(
      `/equipment/work-orders/${id}/cancel/`,
      payload,
    );
    return res.data;
  },

  async remove(id: number) {
    await api.delete(`/equipment/work-orders/${id}/`);
  },

  async activities(workOrderId: number) {
    const res = await api.get<Paginated<WorkOrderActivity> | WorkOrderActivity[]>(
      "/equipment/work-order-activities/",
      { params: { work_order: workOrderId, ordering: "performed_at" } },
    );
    return unwrap(res.data);
  },

  sparePart: crud<WorkOrderSparePart>("/equipment/work-order-spare-parts/"),
  measurement: crud<WorkOrderMeasurement>("/equipment/work-order-measurements/"),
  evidence: crud<WorkOrderEvidence>("/equipment/work-order-evidences/"),
  signature: crud<WorkOrderSignature>("/equipment/work-order-signatures/"),
  cost: crud<WorkOrderCost>("/equipment/work-order-costs/"),
  activity: crud<WorkOrderActivity>("/equipment/work-order-activities/"),
};

function crud<T extends { id: number }>(path: string) {
  return {
    async create(input: Record<string, unknown>) {
      const res = await api.post<T>(path, input);
      return res.data;
    },
    async update(id: number, input: Record<string, unknown>) {
      const res = await api.patch<T>(`${path}${id}/`, input);
      return res.data;
    },
    async remove(id: number) {
      await api.delete(`${path}${id}/`);
    },
  };
}
