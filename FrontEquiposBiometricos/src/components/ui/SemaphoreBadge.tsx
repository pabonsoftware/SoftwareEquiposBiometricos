import { Badge } from "@/components/ui/Badge";
import {
  SEMAPHORE_META,
  semaphoreDaysText,
  type SemaphorePayload,
} from "@/lib/semaphore";

/**
 * Pinta el semáforo RF010 que llega calculado del backend.
 * No decide colores por su cuenta: solo mapea `payload.code`.
 */
export function SemaphoreBadge({
  payload,
  showDays = false,
  className,
}: {
  payload?: SemaphorePayload | null;
  showDays?: boolean;
  className?: string;
}) {
  if (!payload) return null;
  const meta = SEMAPHORE_META[payload.code];
  const days = showDays ? semaphoreDaysText(payload) : "";
  return (
    <Badge tone={meta.tone} className={className}>
      {payload.label || meta.label}
      {days ? ` · ${days}` : ""}
    </Badge>
  );
}
