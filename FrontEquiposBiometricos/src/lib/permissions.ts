import type { Rol } from "@/types/auth";

export type Resource =
  | "users"
  | "branches"
  | "equipment"
  | "maintenance"
  | "scheduling"
  | "failures";

export type Action = "view" | "create" | "edit" | "delete";

type Matrix = Record<Rol, Partial<Record<Resource, Action[]>>>;

const matrix: Matrix = {
  superadmin: {
    users: ["view", "create", "edit", "delete"],
    branches: ["view", "create", "edit", "delete"],
    equipment: ["view", "create", "edit", "delete"],
    maintenance: ["view", "create", "edit", "delete"],
    scheduling: ["view", "create", "edit", "delete"],
    failures: ["view", "create", "edit", "delete"],
  },
  admin: {
    users: ["view", "create", "edit", "delete"],
    branches: ["view", "create", "edit", "delete"],
    equipment: ["view", "create", "edit", "delete"],
    maintenance: ["view", "create", "edit", "delete"],
    scheduling: ["view", "create", "edit", "delete"],
    failures: ["view", "create", "edit", "delete"],
  },
  coordinador: {
    branches: ["view"],
    equipment: ["view", "create", "edit"],
    maintenance: ["view", "create", "edit", "delete"],
    scheduling: ["view", "create", "edit", "delete"],
    failures: ["view", "create", "edit"],
  },
  ingeniero: {
    branches: ["view"],
    equipment: ["view"],
    maintenance: ["view", "create", "edit"],
    scheduling: ["view", "create", "edit"],
    failures: ["view", "create", "edit"],
  },
  tecnico: {
    equipment: ["view"],
    maintenance: ["view", "create"],
    scheduling: ["view"],
    failures: ["view", "create"],
  },
};

export function can(
  role: Rol | undefined,
  resource: Resource,
  action: Action,
): boolean {
  if (!role) return false;
  const actions = matrix[role]?.[resource];
  return Array.isArray(actions) && actions.includes(action);
}

/**
 * Solo el superadmin puede crear o editar a otro superadmin/admin.
 * El admin puede crear coordinador/ingeniero/tecnico.
 */
export function canAssignRole(actorRole: Rol | undefined, targetRole: Rol): boolean {
  if (!actorRole) return false;
  if (actorRole === "superadmin") return true;
  if (actorRole === "admin") {
    return targetRole !== "superadmin" && targetRole !== "admin";
  }
  return false;
}

export const ROLE_LABEL: Record<Rol, string> = {
  superadmin: "Super administrador",
  admin: "Administrador",
  coordinador: "Coordinador",
  ingeniero: "Ingeniero biomédico",
  tecnico: "Técnico",
};
