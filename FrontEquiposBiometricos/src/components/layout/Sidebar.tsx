import { NavLink } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  User,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/context/AuthContext";
import { can, type Resource } from "@/lib/permissions";
import type { Rol } from "@/types/auth";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface LinkDef {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  end?: boolean;
  resource?: Resource;
}

const allLinks: LinkDef[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/sedes", label: "Sedes", icon: Building2, resource: "branches" },
  { to: "/admin/equipos", label: "Equipos", icon: ClipboardList, resource: "equipment" },
  { to: "/admin/mantenimientos", label: "Mantenimientos", icon: Wrench, resource: "maintenance" },
  { to: "/admin/agendamientos", label: "Agendamientos", icon: CalendarClock, resource: "scheduling" },
  { to: "/admin/fallas", label: "Reportes de falla", icon: AlertTriangle, resource: "failures" },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users, resource: "users" },
  { to: "/admin/perfil", label: "Mi perfil", icon: User },
];

function visibleLinks(role: Rol | undefined): LinkDef[] {
  return allLinks.filter((l) => !l.resource || can(role, l.resource, "view"));
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { usuario } = useAuth();
  const links = visibleLinks(usuario?.role);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-app bg-surface transition-transform duration-200 ease-out lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-app px-4 lg:hidden">
          <span className="text-sm font-semibold text-app">Menú</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-app hover:bg-app-muted"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                    : "text-app hover:bg-app-muted",
                )
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
