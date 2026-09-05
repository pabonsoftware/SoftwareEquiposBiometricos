import { useEffect, useMemo, useState } from "react";
import { Key, Pencil, Plus, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import { usersService } from "@/services/users.service";
import { ROLE_LABEL, can, canAssignRole } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import type { Rol, Usuario } from "@/types/auth";
import type { CreateUserInput } from "@/types/user";

const ALL_ROLES: Rol[] = ["superadmin", "admin", "coordinador", "ingeniero", "tecnico"];

interface FormState {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Rol;
  phone: string;
  password: string;
  is_active: boolean;
}

const empty: FormState = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  role: "tecnico",
  phone: "",
  password: "",
  is_active: true,
};

export function UsuariosPage() {
  const { usuario } = useAuth();
  const role = usuario?.role;

  const [items, setItems] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");

  const [editing, setEditing] = useState<Usuario | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<Usuario | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [pwdTarget, setPwdTarget] = useState<Usuario | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [toToggle, setToToggle] = useState<Usuario | null>(null);

  const applyToggle = async (u: Usuario) => {
    setTogglingId(u.id);
    // Optimistic update — revertimos si falla.
    const next = !u.is_active;
    setItems((prev) =>
      prev.map((it) => (it.id === u.id ? { ...it, is_active: next } : it)),
    );
    try {
      const updated = await usersService.update(u.id, { is_active: next });
      setItems((prev) => prev.map((it) => (it.id === u.id ? updated : it)));
    } catch (err) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === u.id ? { ...it, is_active: u.is_active } : it,
        ),
      );
      alert(getApiErrorMessage(err, "No se pudo cambiar el estado"));
    } finally {
      setTogglingId(null);
      setToToggle(null);
    }
  };

  const requestToggle = (u: Usuario) => {
    if (u.is_active) {
      // Desactivar: pedir confirmación.
      setToToggle(u);
    } else {
      void applyToggle(u);
    }
  };

  const canCreate = can(role, "users", "create");
  const canEdit = can(role, "users", "edit");
  const canDelete = can(role, "users", "delete");

  const assignableRoles = useMemo<Rol[]>(
    () => ALL_ROLES.filter((r) => canAssignRole(role, r)),
    [role],
  );

  const roleOptions = useMemo(
    () => assignableRoles.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
    [assignableRoles],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await usersService.list({
        ordering: "username",
        search: search || undefined,
        role: roleFilter || undefined,
      });
      setItems(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar los usuarios"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter]);

  const openCreate = () => {
    setForm({
      ...empty,
      role: assignableRoles[0] ?? "tecnico",
    });
    setCreating(true);
  };

  const openEdit = (u: Usuario) => {
    setForm({
      username: u.username,
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
      role: u.role,
      phone: u.phone ?? "",
      password: "",
      is_active: u.is_active,
    });
    setEditing(u);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm(empty);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!canAssignRole(role, form.role)) {
      alert("No tienes permiso para asignar ese rol.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await usersService.update(editing.id, {
          username: form.username,
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          phone: form.phone || undefined,
          is_active: form.is_active,
        });
      } else {
        const payload: CreateUserInput = {
          username: form.username,
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          phone: form.phone || undefined,
          password: form.password,
        };
        await usersService.create(payload);
      }
      closeModal();
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "Error al guardar"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await usersService.remove(toDelete.id);
      setToDelete(null);
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  const submitPassword = async () => {
    if (!pwdTarget) return;
    if (newPassword.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setPwdSaving(true);
    try {
      await usersService.setPassword(pwdTarget.id, { new_password: newPassword });
      setPwdTarget(null);
      setNewPassword("");
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo cambiar la contraseña"));
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app sm:text-3xl">Usuarios</h1>
          <p className="text-sm text-app-muted">
            Administra los usuarios del sistema y sus roles.
          </p>
        </div>
        {canCreate && assignableRoles.length > 0 && (
          <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
            Nuevo usuario
          </Button>
        )}
      </div>

      <Card>
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Buscar usuario, correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            placeholder="Todos los roles"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            options={ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-left text-xs uppercase tracking-wider text-app-muted">
                <th className="pb-2 font-medium">Usuario</th>
                <th className="pb-2 font-medium">Rol</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-app-muted">
                    Cargando...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-app-muted">
                    Sin usuarios.
                  </td>
                </tr>
              ) : (
                items.map((u) => {
                  const editable = canEdit && canAssignRole(role, u.role);
                  const deletable =
                    canDelete && canAssignRole(role, u.role) && u.id !== usuario?.id;
                  const canToggle = editable && u.id !== usuario?.id;
                  const isToggling = togglingId === u.id;
                  return (
                    <tr key={u.id} className="text-app">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                            <UserCog size={14} />
                          </span>
                          <div>
                            <p className="font-medium">
                              {[u.first_name, u.last_name].filter(Boolean).join(" ") ||
                                u.username}
                            </p>
                            <p className="text-xs text-app-muted">
                              @{u.username} · {u.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge tone="primary">{ROLE_LABEL[u.role]}</Badge>
                      </td>
                      <td className="py-3">
                        {canToggle ? (
                          <button
                            type="button"
                            disabled={isToggling}
                            onClick={() => requestToggle(u)}
                            aria-pressed={u.is_active}
                            aria-label={u.is_active ? "Desactivar usuario" : "Activar usuario"}
                            title={u.is_active ? "Click para desactivar" : "Click para activar"}
                            className={`group inline-flex items-center gap-2 rounded-full border px-1 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              u.is_active
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40 dark:hover:border-emerald-800"
                                : "border-app bg-app-muted text-app-muted hover:bg-app-muted/70 dark:hover:bg-white/10 dark:hover:text-app dark:hover:border-white/20"
                            }`}
                          >
                            <span
                              className={`relative inline-flex h-4 w-7 items-center rounded-full transition ${
                                u.is_active ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                              }`}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${
                                  u.is_active ? "translate-x-3.5" : "translate-x-0.5"
                                }`}
                              />
                            </span>
                            <span className="pr-2">
                              {isToggling
                                ? "..."
                                : u.is_active
                                  ? "Activo"
                                  : "Inactivo"}
                            </span>
                          </button>
                        ) : (
                          <Badge tone={u.is_active ? "success" : "neutral"}>
                            {u.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          {editable && (
                            <Button
                              size="sm"
                              variant="secondary"
                              leftIcon={<Key size={14} />}
                              onClick={() => {
                                setPwdTarget(u);
                                setNewPassword("");
                              }}
                            >
                              Contraseña
                            </Button>
                          )}
                          {editable && (
                            <Button
                              size="sm"
                              variant="secondary"
                              leftIcon={<Pencil size={14} />}
                              onClick={() => openEdit(u)}
                            >
                              Editar
                            </Button>
                          )}
                          {deletable && (
                            <Button
                              size="sm"
                              variant="danger"
                              leftIcon={<Trash2 size={14} />}
                              onClick={() => setToDelete(u)}
                            >
                              Eliminar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={creating || !!editing}
        onClose={closeModal}
        title={editing ? "Editar usuario" : "Nuevo usuario"}
        size="lg"
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Usuario (username)"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
          <Input
            label="Correo"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Nombre"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            required
          />
          <Input
            label="Apellido"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            required
          />
          <Select
            label="Rol"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Rol })}
            options={roleOptions}
            required
            hint={
              role === "admin"
                ? "Como admin no puedes asignar rol superadmin/admin."
                : undefined
            }
          />
          <Input
            label="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          {!editing && (
            <Input
              label="Contraseña inicial"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              hint="Mínimo 8 caracteres. El superadmin/admin la define."
              className="sm:col-span-2"
            />
          )}
          {editing && (
            <label className="flex items-center gap-2 text-sm text-app sm:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              Usuario activo
            </label>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={closeModal} type="button">
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toToggle}
        title="Desactivar usuario"
        description={`¿Desactivar a "${toToggle?.username}"? No podrá iniciar sesión hasta que vuelvas a activarlo.`}
        confirmText="Desactivar"
        danger
        loading={togglingId === toToggle?.id}
        onConfirm={() => toToggle && void applyToggle(toToggle)}
        onClose={() => setToToggle(null)}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar usuario"
        description={`¿Eliminar a "${toDelete?.username}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />

      <Modal
        open={!!pwdTarget}
        onClose={() => setPwdTarget(null)}
        title={`Cambiar contraseña — ${pwdTarget?.username ?? ""}`}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-app-muted">
            Como administrador puedes definir una nueva contraseña sin necesidad
            de la actual. El usuario podrá cambiarla luego desde su perfil.
          </p>
          <Input
            label="Nueva contraseña"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="Mínimo 8 caracteres."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPwdTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={submitPassword} loading={pwdSaving}>
              Cambiar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
