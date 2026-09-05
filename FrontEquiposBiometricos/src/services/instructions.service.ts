import { api } from "@/lib/api";
import type { MaintenanceInstruction } from "@/types/instruction";

interface InstructionListParams {
  equipment_model?: number;
  is_active?: boolean;
}

export const instructionService = {
  async list(params: InstructionListParams = {}) {
    const res = await api.get<MaintenanceInstruction[]>(
      "/maintenance-instructions/",
      { params }
    );
    return res.data;
  },
  async retrieve(id: number) {
    const res = await api.get<MaintenanceInstruction>(
      `/maintenance-instructions/${id}/`
    );
    return res.data;
  },
};
