import { api } from "@/lib/api";
import type { Paginated } from "@/types/api";
import type { AuditLog } from "@/types/audit";

export interface AuditListParams {
  action?: string;
  model_label?: string;
  actor?: number;
  object_id?: string;
  created_at_after?: string;
  created_at_before?: string;
  search?: string;
  page?: number;
  ordering?: string;
}

export const auditService = {
  async list(params: AuditListParams = {}) {
    const res = await api.get<Paginated<AuditLog>>("/audit/logs/", { params });
    return res.data;
  },
};
