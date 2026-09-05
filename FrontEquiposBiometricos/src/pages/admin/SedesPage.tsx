import { useEffect, useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import { branchesService } from "@/services/branches.service";
import { can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import type { Branch, BranchInput } from "@/types/branch";

const empty: BranchInput = {
  name: "",
  address: "",
  city: "",
  phone: "",
  email: "",
  is_active: true,
};

export function SedesPage() {
  const { usuario } = useAuth();
  const role = usuario?.role;

  const [items, setItems] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<BranchInput>(empty);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canCreate = can(role, "branches", "create");
  const canEdit = can(role, "branches", "edit");
  const canDelete = can(role, "branches", "delete");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await branchesService.list({
        ordering: "name",
        search: search || undefined,
      });
      setItems(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar las sedes"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setForm(empty);
    setCreating(true);
  };

  const openEdit = (b: Branch) => {
    setForm({
      name: b.name,
      address: b.address,
      city: b.city,
      phone: b.phone ?? "",
      email: b.email ?? "",
      is_active: b.is_active,
    });
    setEditing(b);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm(empty);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await branchesService.update(editing.id, form);
      } else {
        await branchesService.create(form);
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
      await branchesService.remove(toDelete.id);
      setToDelete(null);
      await load();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app sm:text-3xl">Sedes</h1>
          <p className="text-sm text-app-muted">
            Administra las sedes (centros) de la institución.
          </p>
        </div>
        {canCreate && (
          <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
            Nueva sede
          </Button>
        )}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            placeholder="Buscar por nombre, ciudad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
            className="max-w-sm"
          />
          <Button variant="secondary" onClick={() => void load()}>
            Buscar
          </Button>
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
                <th className="pb-2 font-medium">Sede</th>
                <th className="pb-2 font-medium">Ciudad</th>
                <th className="pb-2 font-medium">Contacto</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-app-muted">
                    Cargando...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-app-muted">
                    No hay sedes registradas.
                  </td>
                </tr>
              ) : (
                items.map((b) => (
                  <tr key={b.id} className="text-app">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                          <Building2 size={14} />
                        </span>
                        <div>
                          <p className="font-medium">{b.name}</p>
                          <p className="text-xs text-app-muted">{b.address}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-app-muted">{b.city}</td>
                    <td className="py-3 text-app-muted">
                      <p>{b.phone || "—"}</p>
                      <p className="text-xs">{b.email || ""}</p>
                    </td>
                    <td className="py-3">
                      <Badge tone={b.is_active ? "success" : "neutral"}>
                        {b.is_active ? "Activa" : "Inactiva"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Pencil size={14} />}
                            onClick={() => openEdit(b)}
                          >
                            Editar
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="danger"
                            leftIcon={<Trash2 size={14} />}
                            onClick={() => setToDelete(b)}
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={creating || !!editing}
        onClose={closeModal}
        title={editing ? "Editar sede" : "Nueva sede"}
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="sm:col-span-2"
          />
          <Input
            label="Dirección"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            required
            className="sm:col-span-2"
          />
          <Input
            label="Ciudad"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            required
          />
          <Input
            label="Teléfono"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Correo"
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="sm:col-span-2"
          />
          <label className="flex items-center gap-2 text-sm text-app sm:col-span-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Sede activa
          </label>
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
        open={!!toDelete}
        title="Eliminar sede"
        description={`¿Eliminar la sede "${toDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
