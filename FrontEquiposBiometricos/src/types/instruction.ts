export type InstructionType = "PREVENTIVE" | "CORRECTIVE" | "CALIBRATION";

/**
 * Instrucción de mantenimiento asociada a un equipo.
 * Refleja el modelo `EquipmentInstruction` del backend
 * (`apps/equipment/models.py`), serializado con `fields = "__all__"`.
 */
export interface MaintenanceInstruction {
  id: number;
  equipment: number;
  instruction_type: InstructionType;
  sequence: number;
  activity: string;
}
