import { api } from "@/lib/api";
import type { Paginated } from "@/types/api";
import type { Equipment, EquipmentInput } from "@/types/equipment";

export interface EquipmentListParams {
  ordering?: string;
  branch?: number;
  status?: string;
  brand?: number;
  equipment_model?: number;
  risk_class?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

function unwrapList<T>(data: Paginated<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return data.results;
}

export const equipmentService = {
  async list(params: EquipmentListParams = {}) {
    const res = await api.get<Paginated<Equipment> | Equipment[]>(
      "/equipment/",
      { params },
    );
    return unwrapList(res.data);
  },
  async listPaginated(params: EquipmentListParams = {}) {
    const res = await api.get<Paginated<Equipment> | Equipment[]>(
      "/equipment/",
      { params },
    );
    if (Array.isArray(res.data)) {
      // Backend sin paginación: simulamos un único bloque.
      return {
        count: res.data.length,
        next: null as string | null,
        previous: null as string | null,
        results: res.data,
      };
    }
    return res.data;
  },
  async retrieve(id: number) {
    const res = await api.get<Equipment>(`/equipment/${id}/`);
    return res.data;
  },
  async byAssetTag(tag: string) {
    const res = await api.get<Equipment>(
      `/equipment/by-asset-tag/${encodeURIComponent(tag)}/`,
    );
    return res.data;
  },
  async create(input: EquipmentInput) {
    const res = await api.post<Equipment>("/equipment/", input);
    return res.data;
  },
  async update(id: number, input: Partial<EquipmentInput>) {
    const res = await api.patch<Equipment>(`/equipment/${id}/`, input);
    return res.data;
  },
  async remove(id: number) {
    await api.delete(`/equipment/${id}/`);
  },
  async regenerateQr(id: number) {
    const res = await api.post<Equipment>(`/equipment/${id}/regenerate-qr/`);
    return res.data;
  },
};
