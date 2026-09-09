export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "close"
  | "cancel";

export interface AuditFieldChange {
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

export interface AuditLog {
  id: number;
  actor: number | null;
  actor_name: string;
  action: AuditAction;
  action_display: string;
  model_label: string;
  object_id: string;
  object_repr: string;
  changes: {
    fields?: Record<string, AuditFieldChange>;
    [key: string]: unknown;
  };
  ip_address: string | null;
  created_at: string;
}
