/**
 * Semaforización RF010 — espejo de presentación del helper del backend.
 *
 * El backend (api/v1/helpers/semaforizacion.py) es la ÚNICA fuente de verdad de
 * la REGLA (qué es verde/amarillo/rojo). Aquí solo mapeamos el `code` que ya
 * llega calculado a un color/etiqueta. No recalculamos fechas ni umbrales.
 */
export type SemaphoreCode = "GREEN" | "YELLOW" | "RED";

/** Forma con la que el backend expone cada semáforo. */
export interface SemaphorePayload {
  code: SemaphoreCode;
  label: string;
  /** Días para el vencimiento (negativo = vencido, null = sin fecha). Opcional. */
  days_left?: number | null;
}

export const SEMAPHORE_META: Record<
  SemaphoreCode,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  GREEN: { label: "Al día", tone: "success" },
  YELLOW: { label: "Próximo a vencer", tone: "warning" },
  RED: { label: "Vencido", tone: "danger" },
};

/** Texto corto para la UI a partir de `days_left`. */
export function semaphoreDaysText(payload?: SemaphorePayload | null): string {
  const d = payload?.days_left;
  if (d === undefined || d === null) return "";
  if (d < 0) return `Vencido hace ${Math.abs(d)} d`;
  if (d === 0) return "Vence hoy";
  return `Vence en ${d} d`;
}
