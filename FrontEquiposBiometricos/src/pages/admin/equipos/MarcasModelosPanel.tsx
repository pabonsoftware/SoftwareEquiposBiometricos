import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Building,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { brandsService } from "@/services/brands.service";
import { modelsService } from "@/services/models.service";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Brand, BrandInput, EquipmentModel, ModelInput } from "@/types/brand";

interface Props {
  // Permite que el componente padre se entere de cambios y refresque sus
  // selects (por ejemplo el formulario de equipos).
  onChanged?: () => void;
}

export function MarcasModelosPanel({ onChanged }: Props) {
  const { usuario } = useAuth();
  const role = usuario?.role;

  const canCreate = can(role, "equipment", "create");
  const canEdit = can(role, "equipment", "edit");
  const canDelete = can(role, "equipment", "delete");

  // ---- Estado ----
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<EquipmentModel[]>([]);
  const [loadingB, setLoadingB] = useState(true);
  const [loadingM, setLoadingM] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brandSearch, setBrandSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);

  // Modales marca
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [brandForm, setBrandForm] = useState<BrandInput>({
    name: "",
    is_active: true,
  });
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);
  const [deletingBrand, setDeletingBrand] = useState(false);

  // Modales modelo
  const [creatingModel, setCreatingModel] = useState(false);
  const [editingModel, setEditingModel] = useState<EquipmentModel | null>(null);
  const [modelForm, setModelForm] = useState<ModelInput>({
    name: "",
    brand: 0,
    is_active: true,
  });
  const [savingModel, setSavingModel] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<EquipmentModel | null>(null);
  const [deletingModel, setDeletingModel] = useState(false);

  // ---- Carga ----
  const loadBrands = async () => {
    setLoadingB(true);
    setError(null);
    try {
      const data = await brandsService.list({
        ordering: "name",
        search: brandSearch || undefined,
      });
      setBrands(data);
      // Mantener selección si todavía existe; sino seleccionar la primera.
      if (selectedBrand && !data.some((b) => b.id === selectedBrand.id)) {
        setSelectedBrand(data[0] ?? null);
      } else if (!selectedBrand) {
        setSelectedBrand(data[0] ?? null);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar las marcas"));
    } finally {
      setLoadingB(false);
    }
  };

  const loadModels = async () => {
    if (!selectedBrand) {
      setModels([]);
      return;
    }
    setLoadingM(true);
    try {
      const data = await modelsService.list({
        ordering: "name",
        brand: selectedBrand.id,
        search: modelSearch || undefined,
      });
      setModels(data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar los modelos"));
    } finally {
      setLoadingM(false);
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => void loadBrands(), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandSearch]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadModels(), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrand?.id, modelSearch]);

  // ---- Marcas ----
  const openCreateBrand = () => {
    setBrandForm({ name: "", is_active: true });
    setCreatingBrand(true);
  };

  const openEditBrand = (b: Brand) => {
    setBrandForm({ name: b.name, is_active: b.is_active });
    setEditingBrand(b);
  };

  const closeBrandModal = () => {
    setCreatingBrand(false);
    setEditingBrand(null);
  };

  const submitBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBrand(true);
    try {
      if (editingBrand) {
        const updated = await brandsService.update(editingBrand.id, brandForm);
        if (selectedBrand?.id === updated.id) setSelectedBrand(updated);
      } else {
        await brandsService.create(brandForm);
      }
      closeBrandModal();
      await loadBrands();
      onChanged?.();
    } catch (err) {
      alert(getApiErrorMessage(err, "Error al guardar la marca"));
    } finally {
      setSavingBrand(false);
    }
  };

  const confirmDeleteBrand = async () => {
    if (!brandToDelete) return;
    setDeletingBrand(true);
    try {
      await brandsService.remove(brandToDelete.id);
      if (selectedBrand?.id === brandToDelete.id) setSelectedBrand(null);
      setBrandToDelete(null);
      await loadBrands();
      onChanged?.();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar la marca"));
    } finally {
      setDeletingBrand(false);
    }
  };

  // ---- Modelos ----
  const openCreateModel = () => {
    setModelForm({
      name: "",
      brand: selectedBrand?.id ?? brands[0]?.id ?? 0,
      is_active: true,
    });
    setCreatingModel(true);
  };

  const openEditModel = (m: EquipmentModel) => {
    setModelForm({ name: m.name, brand: m.brand, is_active: m.is_active });
    setEditingModel(m);
  };

  const closeModelModal = () => {
    setCreatingModel(false);
    setEditingModel(null);
  };

  const submitModel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingModel(true);
    try {
      if (editingModel) {
        await modelsService.update(editingModel.id, modelForm);
      } else {
        await modelsService.create(modelForm);
      }
      closeModelModal();
      await loadModels();
      onChanged?.();
    } catch (err) {
      alert(getApiErrorMessage(err, "Error al guardar el modelo"));
    } finally {
      setSavingModel(false);
    }
  };

  const confirmDeleteModel = async () => {
    if (!modelToDelete) return;
    setDeletingModel(true);
    try {
      await modelsService.remove(modelToDelete.id);
      setModelToDelete(null);
      await loadModels();
      onChanged?.();
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar el modelo"));
    } finally {
      setDeletingModel(false);
    }
  };

  const brandOptions = useMemo(
    () => brands.map((b) => ({ value: String(b.id), label: b.name })),
    [brands],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      {/* Columna marcas */}
      <Card padding="none" className="flex flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-app px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Building size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-app">Marcas</p>
              <p className="text-xs text-app-muted">
                {brands.length} registradas
              </p>
            </div>
          </div>
          {canCreate && (
            <Button
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={openCreateBrand}
            >
              Nueva
            </Button>
          )}
        </div>

        <div className="border-b border-app px-3 py-2">
          <Input
            placeholder="Buscar marca..."
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[60vh] flex-1 overflow-y-auto">
          {loadingB ? (
            <p className="py-8 text-center text-sm text-app-muted">Cargando...</p>
          ) : brands.length === 0 ? (
            <p className="py-8 text-center text-sm text-app-muted">
              Aún no hay marcas. Crea la primera para empezar.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {brands.map((b) => {
                const active = selectedBrand?.id === b.id;
                return (
                  <li
                    key={b.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-2.5 transition",
                      active
                        ? "bg-[var(--color-primary)]/10"
                        : "hover:bg-app-muted",
                    )}
                    onClick={() => setSelectedBrand(b)}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          active ? "text-[var(--color-primary)]" : "text-app",
                        )}
                      >
                        {b.name}
                      </p>
                      <p className="text-xs text-app-muted">
                        {b.models_count != null
                          ? `${b.models_count} modelos`
                          : ""}
                        {b.is_active ? "" : " · Inactiva"}
                      </p>
                    </div>
                    {!b.is_active && (
                      <Badge tone="neutral">Inactiva</Badge>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEditBrand(b);
                        }}
                        aria-label={`Editar ${b.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-app-muted hover:bg-app-muted hover:text-app"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setBrandToDelete(b);
                        }}
                        aria-label={`Eliminar ${b.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* Columna modelos */}
      <Card padding="none" className="flex flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-app px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Layers size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-app">
                Modelos {selectedBrand && `· ${selectedBrand.name}`}
              </p>
              <p className="text-xs text-app-muted">
                {selectedBrand
                  ? `${models.length} modelos`
                  : "Selecciona una marca para ver sus modelos"}
              </p>
            </div>
          </div>
          {canCreate && (
            <Button
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={openCreateModel}
              disabled={brands.length === 0}
            >
              Nuevo
            </Button>
          )}
        </div>

        <div className="border-b border-app px-3 py-2">
          <Input
            placeholder="Buscar modelo..."
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
            disabled={!selectedBrand}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="m-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="max-h-[60vh] flex-1 overflow-y-auto">
          {!selectedBrand ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-app-muted">
              <Boxes size={28} className="opacity-50" />
              <p>Elige una marca a la izquierda para ver sus modelos.</p>
            </div>
          ) : loadingM ? (
            <p className="py-8 text-center text-sm text-app-muted">Cargando...</p>
          ) : models.length === 0 ? (
            <p className="py-8 text-center text-sm text-app-muted">
              {selectedBrand.name} aún no tiene modelos. Agrega el primero.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {models.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-app">
                      {m.name}
                    </p>
                    <p className="text-xs text-app-muted">
                      {m.equipment_count != null
                        ? `${m.equipment_count} equipos asociados`
                        : ""}
                    </p>
                  </div>
                  {!m.is_active && <Badge tone="neutral">Inactivo</Badge>}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditModel(m)}
                      aria-label={`Editar ${m.name}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-app-muted hover:bg-app-muted hover:text-app"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setModelToDelete(m)}
                      aria-label={`Eliminar ${m.name}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Modal marca */}
      <Modal
        open={creatingBrand || !!editingBrand}
        onClose={closeBrandModal}
        title={editingBrand ? "Editar marca" : "Nueva marca"}
        size="sm"
      >
        <form onSubmit={submitBrand} className="flex flex-col gap-4">
          <Input
            label="Nombre"
            value={brandForm.name}
            onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
            required
          />
          <label className="flex items-center gap-2 text-sm text-app">
            <input
              type="checkbox"
              checked={brandForm.is_active}
              onChange={(e) =>
                setBrandForm({ ...brandForm, is_active: e.target.checked })
              }
            />
            Marca activa
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeBrandModal}>
              Cancelar
            </Button>
            <Button type="submit" loading={savingBrand}>
              {editingBrand ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal modelo */}
      <Modal
        open={creatingModel || !!editingModel}
        onClose={closeModelModal}
        title={editingModel ? "Editar modelo" : "Nuevo modelo"}
        size="sm"
      >
        <form onSubmit={submitModel} className="flex flex-col gap-4">
          <Select
            label="Marca"
            value={String(modelForm.brand)}
            onChange={(e) =>
              setModelForm({ ...modelForm, brand: Number(e.target.value) })
            }
            options={brandOptions}
            placeholder="Selecciona una marca"
            required
          />
          <Input
            label="Nombre del modelo"
            value={modelForm.name}
            onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
            required
          />
          <label className="flex items-center gap-2 text-sm text-app">
            <input
              type="checkbox"
              checked={modelForm.is_active}
              onChange={(e) =>
                setModelForm({ ...modelForm, is_active: e.target.checked })
              }
            />
            Modelo activo
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModelModal}>
              Cancelar
            </Button>
            <Button type="submit" loading={savingModel}>
              {editingModel ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmaciones */}
      <ConfirmDialog
        open={!!brandToDelete}
        title="Eliminar marca"
        description={`¿Eliminar la marca "${brandToDelete?.name}"? Si tiene modelos asociados el backend lo rechazará.`}
        confirmText="Eliminar"
        danger
        loading={deletingBrand}
        onConfirm={confirmDeleteBrand}
        onClose={() => setBrandToDelete(null)}
      />
      <ConfirmDialog
        open={!!modelToDelete}
        title="Eliminar modelo"
        description={`¿Eliminar el modelo "${modelToDelete?.name}"? Si tiene equipos asociados el backend lo rechazará.`}
        confirmText="Eliminar"
        danger
        loading={deletingModel}
        onConfirm={confirmDeleteModel}
        onClose={() => setModelToDelete(null)}
      />
    </div>
  );
}
