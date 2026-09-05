import type { AssignedUser, Usuario } from "@/types/auth";

export function fullNameOf(u: Usuario): string {
  const n = `${u.first_name} ${u.last_name}`.trim();
  return n || u.username;
}

/**
 * Nombre mostrable de un usuario asignado anidado (`*_detail`) que devuelve
 * el backend. Cae al `username` si no hay nombre completo.
 */
export function assignedUserName(u?: AssignedUser | null): string | null {
  if (!u) return null;
  return u.full_name?.trim() || u.username;
}

/**
 * Solo el primer nombre del usuario asignado (ej. "David Pérez" → "David").
 * Útil en listados compactos. Cae al `username` si no hay nombre.
 */
export function assignedFirstName(u?: AssignedUser | null): string | null {
  const name = assignedUserName(u);
  return name ? name.split(/\s+/)[0] : null;
}

/**
 * El backend separa la asignación en dos FK distintas según el rol:
 * `assigned_technician` (rol técnico) y `assigned_engineer` (rol ingeniero),
 * y valida el rol estrictamente. Dado el usuario elegido en el
 * `TechnicianSelect` (que lista técnicos e ingenieros), enruta el id al
 * campo correcto y deja el otro en null.
 */
export function assignmentPayload(user?: Usuario | null): {
  assigned_technician: number | null;
  assigned_engineer: number | null;
} {
  if (!user) return { assigned_technician: null, assigned_engineer: null };
  if (user.role === "ingeniero")
    return { assigned_technician: null, assigned_engineer: user.id };
  return { assigned_technician: user.id, assigned_engineer: null };
}
