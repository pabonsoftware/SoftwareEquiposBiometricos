import type { Rol } from "@/types/auth";

export type Resource =
  | "users"
  | "branches"
  | "catalog"
  | "equipment"
  | "maintenance"
  | "work_orders"
  | "scheduling"
  | "failures";

export type Action = "view" | "create" | "edit" | "delete";

// 4.1. Roles del sistema — 4 roles.
export const ALL_ROLES: Rol[] = ["admin", "coordinador", "ingeniero", "usuario"];

type Matrix = Record<Rol, Partial<Record<Resource, Action[]>>>;

/**
 * Matriz de permisos por rol, alineada con «4.1. Roles del sistema» y con las
 * clases de permiso del backend (`api/v1/common/permissions.py`).
 *
 * El permiso `view` de cada recurso decide a la vez **qué aparece en el menú
 * lateral** (`Sidebar`) y **qué secciones se pintan en el Dashboard**: cada
 * rol solo ve los módulos que le competen según 4.1.
 */
const matrix: Matrix = {
  // 4.1.1 — Administración técnica del sistema y parametrización institucional:
  // cuentas y asignación de rol, sedes y ubicaciones, catálogo de marcas/
  // modelos y alta administrativa de equipos. NO interviene en la gestión
  // operativa (órdenes, solicitudes, fallas) ni en las evidencias técnicas.
  admin: {
    users: ["view", "create", "edit", "delete"],
    branches: ["view", "create", "edit", "delete"],
    catalog: ["view", "create", "edit", "delete"],
    equipment: ["view", "create", "edit", "delete"],
  },

  // 4.1.2 — Aprueba los cronogramas y las solicitudes de mantenimiento, asigna
  // responsables, prioriza los correctivos según criticidad, cierra
  // formalmente las órdenes ejecutadas y consulta los indicadores de gestión.
  // No gestiona cuentas ni sedes.
  coordinador: {
    equipment: ["view"],
    catalog: ["view"],
    maintenance: ["view", "create", "edit", "delete"],
    work_orders: ["view", "create", "edit", "delete"],
    scheduling: ["view", "create", "edit", "delete"],
    failures: ["view", "edit"],
  },

  // 4.1.3 — Reúne la evaluación técnica y la ejecución del mantenimiento: emite
  // la evaluación de los reportes en falla, mantiene hojas de vida y fichas
  // OEM, genera los códigos QR, elabora el plan anual de preventivo, y ejecuta
  // y documenta las órdenes asignadas. No autoriza ni cierra formalmente sus
  // propias intervenciones (eso es del Coordinador).
  ingeniero: {
    equipment: ["view", "edit"],
    catalog: ["view"],
    maintenance: ["view", "create", "edit"],
    work_orders: ["view", "create", "edit"],
    scheduling: ["view", "create", "edit"],
    failures: ["view", "edit"],
  },

  // Usuario Operativo — personal asistencial que opera los equipos: consulta
  // los equipos que tiene asignados y reporta/consulta las fallas que detecta
  // durante el uso. No emite diagnóstico técnico ni registra reparaciones.
  usuario: {
    equipment: ["view"],
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
 * ¿Puede `actorRole` crear/editar/eliminar una cuenta cuyo rol es `targetRole`
 * y asignarle ese rol?
 *
 * 4.1.1: solo el Administrador del Sistema gestiona cuentas, y puede asignar
 * cualquiera de los 4 roles del catálogo. Un valor fuera del catálogo (p. ej.
 * un rol heredado que ya no existe) no es asignable desde la UI.
 */
export function canAssignRole(actorRole: Rol | undefined, targetRole: Rol): boolean {
  if (actorRole !== "admin") return false;
  return ALL_ROLES.includes(targetRole);
}

export const ROLE_LABEL: Record<Rol, string> = {
  admin: "SuperAdministrador del Sistema",
  coordinador: "Coordinador Biomédico",
  ingeniero: "Ingeniero Biomédico",
  usuario: "Usuario Operativo",
};

/** Texto para el `title`/tooltip de un control deshabilitado por rol. */
export const NO_PERMISSION_HINT = "No disponible para tu rol";
