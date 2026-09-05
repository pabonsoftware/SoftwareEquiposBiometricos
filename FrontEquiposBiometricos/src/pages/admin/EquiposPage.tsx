import { useEffect, useMemo, useState } from "react";
import {
  Building,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EquipoFicha } from "@/components/equipment/EquipoFicha";
import { MarcasModelosPanel } from "@/pages/admin/equipos/MarcasModelosPanel";
import { useAuth } from "@/context/AuthContext";
import { equipmentService } from "@/services/equipment.service";
import { branchesService } from "@/services/branches.service";
import { brandsService } from "@/services/brands.service";
import { modelsService } from "@/services/models.service";
import { can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import type { Branch } from "@/types/branch";
import type { Brand, EquipmentModel } from "@/types/brand";
import type {
  Equipment,
  EquipmentInput,
  EquipmentStatus,
  RiskClass,
} from "@/types/equipment";

const STATUS_LABEL: Record<EquipmentStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  IN_MAINTENANCE: "En mantenimiento",
  IN_REPAIR: "En reparación",
};

const STATUS_TONE: Record<EquipmentStatus, "success" | "neutral" | "warning" | "danger"> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  IN_MAINTENANCE: "warning",
  IN_REPAIR: "danger",
};

const RISK_LABEL: Record<RiskClass, string> = {
  I: "Clase I · Riesgo bajo",
  IIA: "Clase IIA · Riesgo moderado",
  IIB: "Clase IIB · Riesgo moderado-alto",
  III: "Clase III · Riesgo alto",
};

const RISK_TONE: Record<RiskClass, "success" | "info" | "warning" | "danger"> = {
  I: "success",
  IIA: "info",
  IIB: "warning",
  III: "danger",
};

const PAGE_SIZE = 10;

interface FormState {
  name: string;
  asset_tag: string;
  internal_code:string;
  serial:string;
  software_identifier:string;

  // brand sólo se usa en el form para filtrar los modelos disponibles. NO
  // se envía al backend (la marca es derivada del modelo).
  brand: number;
  equipment_model: number;

  branch: number;
  branch_text: string;
  department:string;
  city:string;
  area:string;
  location: string;
  
  technology_type:string;
  biomedical_classification:string;
  risk_class:RiskClass;

  manufacturer: string;
  owner:string;
  client_name:string;

  purchase_date:string;
  manufacture_date:string;
  supplier_acquisition: string;
  start_use_date:string;
  equipment_cost: string;

  warranty_start_date: string;
  warranty_end_date: string;

  maintenance_provider:string;
  maintenance_frequency_months:string;
  last_preventive: string;
  next_preventive:string;

  calibration_date: string;
  calibration_frequency_months: string;
  last_calibration: string;
  next_calibration:string;

  electrical_safety_class: string;
  electrical_safety_type:string;

  invima_registration: string;
  ecri: string;

  life_use_years: string;
  
  status: EquipmentStatus;

  observations:string;
}

const empty: FormState = {
  name: "",
  asset_tag: "",
  internal_code: "",
  serial: "",
  software_identifier:"",

  brand: 0,
  equipment_model: 0,

  branch: 0,
  branch_text:"",
  department:"",
  city:"",
  area:"",
  location: "",

  technology_type:"",
  biomedical_classification:"",
  risk_class:"I",

  manufacturer:"",
  owner:"",
  client_name:"",

  purchase_date: "",
  manufacture_date:"",
  supplier_acquisition:"",
  start_use_date:"",
  equipment_cost:"",

  warranty_start_date:"",
  warranty_end_date:"",

  maintenance_provider:"",
  maintenance_frequency_months:"",
  last_preventive:"",
  next_preventive:"",

  calibration_date:"",
  calibration_frequency_months:"",
  last_calibration:"",
  next_calibration:"",

  electrical_safety_class:"",
  electrical_safety_type:"",

  invima_registration:"",
  ecri:"",

  life_use_years:"",

  status: "ACTIVE",

  observations:"",
};

type Tab = "equipos" | "catalogo";

export function EquiposPage() {
  const { usuario } = useAuth();
  const role = usuario?.role;

  const [tab, setTab] = useState<Tab>("equipos");

  const [items, setItems] = useState<Equipment[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<EquipmentModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [riskFilter, setRiskFilter] = useState<string>("");

  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);

  const [editing, setEditing] = useState<Equipment | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState<Equipment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [fichaTarget, setFichaTarget] = useState<Equipment | null>(null);

  const canCreate = can(role, "equipment", "create");
  const canEdit = can(role, "equipment", "edit");
  const canDelete = can(role, "equipment", "delete");

  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: String(b.id), label: b.name })),
    [branches],
  );

  const brandOptions = useMemo(
    () =>
      brands
        .filter((b) => b.is_active || b.id === form.brand)
        .map((b) => ({ value: String(b.id), label: b.name })),
    [brands, form.brand],
  );

  // Modelos disponibles para la marca seleccionada en el formulario.
  const modelsForForm = useMemo(
    () => models.filter((m) => m.brand === form.brand),
    [models, form.brand],
  );

  const modelOptionsForm = useMemo(
    () =>
      modelsForForm
        .filter((m) => m.is_active || m.id === form.equipment_model)
        .map((m) => ({ value: String(m.id), label: m.name })),
    [modelsForForm, form.equipment_model],
  );

  const branchName = (id: number) =>
    branches.find((b) => b.id === id)?.name ?? `Sede #${id}`;

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // Buscar la marca del modelo (a partir de equipment_model).
  const resolveBrandIdOfModel = (modelId: number): number => {
    const m = models.find((x) => x.id === modelId);
    return m?.brand ?? 0;
  };

  // ---- Carga datos auxiliares ----
  const loadCatalog = async () => {
    try {
      const [bs, ms] = await Promise.all([
        brandsService.list({ ordering: "name" }),
        modelsService.list({ ordering: "name" }),
      ]);
      setBrands(bs);
      setModels(ms);
    } catch {
      // No es crítico — el resto de la página sigue funcionando.
    }
  };

  useEffect(() => {
    branchesService
      .list({ ordering: "name" })
      .then(setBranches)
      .catch(() => null);
    void loadCatalog();
  }, []);

  // ---- Carga equipos paginados ----
  const load = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const data = await equipmentService.listPaginated({
        ordering: "name",
        search: search || undefined,
        status: statusFilter || undefined,
        branch: branchFilter ? Number(branchFilter) : undefined,
        brand: brandFilter ? Number(brandFilter) : undefined,
        risk_class: riskFilter || undefined,
        page: targetPage,
        page_size: PAGE_SIZE,
      });
      setItems(data.results);
      setCount(data.count);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar los equipos"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, branchFilter, brandFilter, riskFilter]);

  useEffect(() => {
    if (tab !== "equipos") return;
    const id = window.setTimeout(() => {
      void load(page);
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, branchFilter, brandFilter, riskFilter, page, tab]);

  // ---- CRUD equipo ----
  const openCreate = () => {
    setForm({
      ...empty,
      branch: branches[0]?.id ?? 0,
      brand: brands.find((b) => b.is_active)?.id ?? brands[0]?.id ?? 0,
    });
    setCreating(true);
  };

  const openEdit = (e: Equipment) => {
    const inferredBrand =
      e.brand ?? resolveBrandIdOfModel(e.equipment_model) ?? 0;
    setForm({
      name: e.name ?? "",
      asset_tag: e.asset_tag ?? "",
      internal_code: e.internal_code ?? "",
      serial:e.serial ?? "",
      software_identifier: e.software_identifier ?? "",

      brand: inferredBrand,
      equipment_model: e.equipment_model,
      branch: e.branch,
      branch_text:e.branch_text ?? "",
      department:e.department ?? "",
      city: e.city ?? "",
      area:e.area ?? "",
      location: e.location ?? "",

      technology_type:e.technology_type ?? "",
      biomedical_classification:e.biomedical_classification ?? "",
      risk_class: e.risk_class,

      manufacturer: e.manufacturer ?? "",
      owner: e.owner ?? "",
      client_name: e.client_name ?? "",

      purchase_date: e.purchase_date,
      manufacture_date:e.manufacture_date ?? "",
      supplier_acquisition: e.supplier_acquisiton ?? "",
      start_use_date:e.start_use_date ?? "",
      equipment_cost:
        e.equipment_cost !== null && e.equipment_cost !== undefined
          ? String(e.equipment_cost)
          : "",
      
      warranty_start_date: e.warranty_end_date ?? "",
      warranty_end_date: e.warranty_end_date ?? "",

      maintenance_provider: e.maintenance_provider ?? "",
      maintenance_frequency_months:
        e.maintenance_frequency_months !== null && 
        e.maintenance_frequency_months !== undefined
          ? String(e.maintenance_frequency_months)
          : "",
        last_preventive: e.last_preventive ?? "",
        next_preventive:e.next_preventive ?? "",

        calibration_date: e.calibration_date ?? "",
        calibration_frequency_months: 
          e.calibration_frequenty_months !== null &&
          e.calibration_frequenty_months !== undefined 
            ? String(e.calibration_frequenty_months !== undefined)
            : "",
          
      
      last_calibration: e.last_calibration ?? "",
      next_calibration: e.next_calibration ?? "",

      electrical_safety_class:e.electrical_safety_class ?? "",
      electrical_safety_type: e.electrical_safety_type ?? "",

      invima_registration: e.invima_registration ?? "",
      ecri: e.ecri ?? "",

      life_use_years: 
        e.life_use_years !== null && e.life_use_years !== undefined
          ? String(e.life_use_years)
          : "",
        
      status: e.status,

      observations: e.observations ?? "",
    });
    setEditing(e);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm(empty);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.brand) return alert("Selecciona una marca.");
    if (!form.equipment_model) return alert("Selecciona un modelo.");
    setSaving(true);

    // El campo brand del form es sólo UI; el backend deriva la marca del
    // modelo. Se excluye del payload.
    const payload: EquipmentInput = {
      name: form.name,
      asset_tag: form.asset_tag,
      internal_code:form.internal_code,
      serial: form.serial,
      software_identifier: form.software_identifier,

      equipment_model: form.equipment_model,
      
      branch: form.branch,
      branch_text: form.branch_text,
      department: form.department,
      city: form.city,
      area: form.area,
      location: form.location,

      technology_type: form.technology_type,
      biomedical_classification:form.biomedical_classification,
      risk_class:form.risk_class,

      manufacturer: form.manufacturer,
      owner: form.owner,
      client_name: form.client_name,
  
      purchase_date: form.purchase_date,
      supplier_acquisition: form.supplier_acquisition,
      equipment_cost:form.equipment_cost,
      manufacture_date:form.manufacture_date || undefined,
      start_use_date: form.start_use_date || undefined,

      warranty_start_date:form.warranty_start_date || undefined,
      warranty_end_date: form.warranty_end_date || undefined,

      maintenance_provider: form.maintenance_provider,
      maintenance_frequency_months: form.maintenance_frequency_months
        ? Number(form.maintenance_frequency_months)
        : undefined,
      last_preventive: form.last_preventive,
      next_preventive: form.next_preventive,

      calibration_date: form.calibration_date,
      calibration_frequency_months: form.calibration_frequency_months
        ? Number(form.calibration_frequency_months)
        : undefined,
      last_calibration: form.last_calibration,
      next_calibration:form.next_calibration,

      electrical_safety_class: form.electrical_safety_class,
      electrical_safety_type: form.electrical_safety_type,

      invima_registration: form.invima_registration,
      ecri:form.ecri,

      life_use_years:form.life_use_years
        ? Number(form.life_use_years)
        : undefined,

      status: form.status,

      observations:form.observations,
    };

    try {
      if (editing) {
        await equipmentService.update(editing.id, payload);
      } else {
        await equipmentService.create(payload);
      }
      closeModal();
      await load(page);
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
      await equipmentService.remove(toDelete.id);
      setToDelete(null);
      setFichaTarget(null);
      await load(page);
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  const changeStatus = async (eq: Equipment, status: EquipmentStatus) => {
    if (status === eq.status) return;
    const previous = eq.status;
    // Update optimista
    setItems((prev) =>
      prev.map((it) => (it.id === eq.id ? { ...it, status } : it)),
    );
    setStatusUpdatingId(eq.id);
    try {
      const updated = await equipmentService.update(eq.id, { status });
      setItems((prev) =>
        prev.map((it) => (it.id === eq.id ? { ...it, ...updated } : it)),
      );
    } catch (err) {
      // Revertir
      setItems((prev) =>
        prev.map((it) => (it.id === eq.id ? { ...it, status: previous } : it)),
      );
      alert(getApiErrorMessage(err, "No se pudo actualizar el estado"));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const start = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, count);

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app sm:text-3xl">Equipos</h1>
          <p className="text-sm text-app-muted">
            Inventario, catálogo de marcas y modelos.
          </p>
        </div>
        {tab === "equipos" && canCreate && (
          <Button leftIcon={<Plus size={16} />} onClick={openCreate}>
            Nuevo equipo
          </Button>
        )}
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          {
            value: "equipos",
            label: "Equipos",
            icon: <ClipboardList size={14} />,
          },
          {
            value: "catalogo",
            label: "Marcas y modelos",
            icon: <Building size={14} />,
          },
        ]}
      />

      {tab === "catalogo" && (
        <MarcasModelosPanel
          onChanged={() => {
            void loadCatalog();
          }}
        />
      )}

      {tab === "equipos" && (
        <>
          <Card>
            <div className="grid gap-2 sm:grid-cols-5">
              <Input
                placeholder="Buscar nombre o tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select
                placeholder="Todas las sedes"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                options={branchOptions}
              />
              <Select
                placeholder="Todas las marcas"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                options={brands.map((b) => ({
                  value: String(b.id),
                  label: b.name,
                }))}
              />
              <Select
                placeholder="Todos los estados"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={Object.entries(STATUS_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <Select
                placeholder="Todas las clases"
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                options={Object.entries(RISK_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </div>
          </Card>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app text-left text-xs uppercase tracking-wider text-app-muted">
                    <th className="px-4 py-3 font-medium">Equipo</th>
                    <th className="px-4 py-3 font-medium">Asset tag</th>
                    <th className="px-4 py-3 font-medium">Sede / Ubicación</th>
                    <th className="px-4 py-3 font-medium">Riesgo</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-app-muted">
                        Cargando...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-app-muted">
                        No se encontraron equipos con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    items.map((eq) => {
                      const brandText =
                        eq.brand_name ??
                        brands.find((b) => b.id === eq.brand)?.name ??
                        brands.find(
                          (b) =>
                            b.id ===
                            models.find((m) => m.id === eq.equipment_model)?.brand,
                        )?.name ??
                        "—";
                      const modelText =
                        eq.equipment_model_name ??
                        models.find((m) => m.id === eq.equipment_model)?.name ??
                        `#${eq.equipment_model}`;
                      return (
                        <tr
                          key={eq.id}
                          onClick={() => setFichaTarget(eq)}
                          className="cursor-pointer text-app transition hover:bg-app-muted/50"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                                <ClipboardList size={16} />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-medium">{eq.name}</p>
                                <p className="truncate text-xs text-app-muted">
                                  {brandText} · {modelText}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-app-muted">
                            {eq.asset_tag}
                          </td>
                          <td className="px-4 py-3 text-app-muted">
                            <p>{eq.branch_name ?? branchName(eq.branch)}</p>
                            <p className="text-xs">{eq.location}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={RISK_TONE[eq.risk_class]}>
                              {eq.risk_class}
                            </Badge>
                          </td>
                          <td
                            className="px-4 py-3"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            {canEdit ? (
                              <StatusSelect
                                value={eq.status}
                                disabled={statusUpdatingId === eq.id}
                                onChange={(s) => void changeStatus(eq, s)}
                              />
                            ) : (
                              <Badge tone={STATUS_TONE[eq.status]}>
                                {STATUS_LABEL[eq.status]}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app px-4 py-3 text-xs text-app-muted">
              <p>
                {count === 0
                  ? "Sin resultados"
                  : `Mostrando ${start}–${end} de ${count}`}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<ChevronLeft size={14} />}
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span className="px-2 text-app">
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  rightIcon={<ChevronRight size={14} />}
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      <Modal
        open={creating || !!editing}
        onClose={closeModal}
        title={editing ? "Editar equipo" : "Nuevo equipo"}
        size="lg"
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="text-sm font-semibold text-app">
            <h3 className="text-sm font-semibold text-app">
              Identificación del equipo
            </h3>
            <p className="text-xs text-app-muted">
              Información básica para identificar el equipo biomédico
            </p>
          </div>
          <Input
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="sm:col-span-2"
          />
          <Input
            label="Asset tag"
            value={form.asset_tag}
            onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
            required
            hint="Código único del equipo (ej. EQ-0001)"
          />
          <Input 
          label="Código N.T."
          value={form.internal_code}
          onChange={(e) => 
            setForm({...form, internal_code:e.target.value})
          }
          hint="Código interno o número técnico."
          />
          <Input
          label="Serie"
          value={form.serial}
          onChange={(e) => 
            setForm({...form,serial:e.target.value})
          }
          />
          <Input
          label="Identificador Software"
          value={form.software_identifier}
          onChange={(e) =>
            setForm({
              ...form,
              software_identifier: e.target.value,
            })
          }
          />
          <div className="sm:col-span-2 mt-2">
            <h3 className="text-sm font-semibold text-app">
              Clasificación y catálogo
            </h3>
            <p className="text-xs text-app-muted">
              Catálogo, tecnología y clasificación biomédica
            </p>
          </div>
          <Select
            label="Sede"
            value={String(form.branch)}
            onChange={(e) =>
              setForm({ ...form, branch: Number(e.target.value) })
            }
            options={branchOptions}
            placeholder="Selecciona una sede"
            required
          />
          <Select
            label="Marca"
            value={String(form.brand)}
            onChange={(e) =>
              setForm({
                ...form,
                brand: Number(e.target.value),
                equipment_model: 0,
              })
            }
            options={brandOptions}
            placeholder="Selecciona una marca"
            required
            hint={
              brandOptions.length === 0
                ? "Crea una marca primero en la pestaña Marcas y modelos."
                : undefined
            }
          />
          <Select
            label="Modelo"
            value={String(form.equipment_model)}
            onChange={(e) =>
              setForm({ ...form, equipment_model: Number(e.target.value) })
            }
            options={modelOptionsForm}
            placeholder={
              !form.brand
                ? "Selecciona una marca primero"
                : modelOptionsForm.length === 0
                  ? "No hay modelos para esta marca"
                  : "Selecciona un modelo"
            }
            disabled={!form.brand || modelOptionsForm.length === 0}
            required
          />
          <Select
          label="Tipo de tecnología"
          value={form.technology_type}
          onChange={(e) =>
            setForm({
              ...form,
              technology_type:e.target.value,
            })
          }
          options={[
            {value:"ELECTRONIC",label:"Electrónico"},
            {value:"ELECTROMEDICAL",label:"Electromédico"},
            {value:"MECHANICAL",label:"Mecánico"},
            {value:"MIXED",label:"Mixto"},
            {value:"OTHER",label:"Otro"},
          ]}
          placeholder="Seleccione el tipo"
          />
          <Input
          label="Clasificación biomédica"
          value={form.biomedical_classification}
          onChange={(e) =>
            setForm({
              ...form,
              biomedical_classification: e.target.value,
            })
          }
          hint="Clasificación utilizada para el equipo."
          />
          <Select
            label="Clase de riesgo"
            value={form.risk_class}
            onChange={(e) =>
              setForm({ ...form, risk_class: e.target.value as RiskClass })
            }
            options={Object.entries(RISK_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
            required
            hint="Clasificación INVIMA / FDA del dispositivo médico."
          />

          <div className="sm:col-psan-2 mt-2">
            <h3 className="text-sm font-semibold text-app">
              Información y ubicación
            </h3>
            <p className="text-xs-text-app-muted">
              Datos generales y ubicación física del equipo.
            </p>
          </div>
          <Input
          label="Propietario"
          value={form.owner}
          onChange={(e) =>
            setForm({
              ...form,
              owner:e.target.value
            })
          }
          />
          <Input
          label="Código de calibración"
          value={form.calibration_date}
          onChange={(e) =>
          setForm({
            ...form,
            calibration_date:e.target.value
            })
          }
          />
          <Input
          label="Fabricante"
          value={form.manufacturer}
          onChange={(e) =>
            setForm({
              ...form,
              manufacturer:e.target.value,
            })
          }
          />
          <Input
          label="Cliente"
          value={form.client_name}
          onChange={(e) =>
            setForm({
              ...form,
              client_name:e.target.value
            })
          }
          />
          <Input
          label="Marca/texto"
          value={form.branch_text}
          onChange={(e) => 
            setForm({
              ...form,
              branch_text:e.target.value,
            })
          }
          hint="Texto adicional asociado a la marca."
          />
          <Input
          label="Departamento"
          value={form.department}
          onChange={(e) =>
            setForm({
              ...form,
              department:e.target.value
            })
          }
          />
          <Input
          label="Ciudad"
          value={form.city}
          onChange={(e) =>
            setForm({
              ...form,
              city:e.target.value,
            })
          }
          />
          <Input
          label="Área"
          value={form.area}
          onChange={(e) => 
            setForm({
              ...form,
              area:e.target.value
            })
          }
          />
           <Input
            label="Ubicación"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            required
            className="sm:col-span-2"
          />
          <div className="sm:col-span-2 mt-2">
            <h3 className="text-sm font-semibold text-app">
              Adquisición
            </h3>
            <p className="text-xs text-app-muted">
              Información relacionada con la adquisición y puesta en funcionamiento.
            </p>
          </div>
           <Input
            label="Fecha de compra"
            type="date"
            value={form.purchase_date}
            onChange={(e) =>
              setForm({ ...form, purchase_date: e.target.value })
            }
            required
            className="sm:col-span-2"
          />
          <Input
          label="Fecha de fabricación"
          type="date"
          value={form.manufacture_date}
          onChange={(e) =>
            setForm({
              ...form,
              manufacture_date:e.target.value,
            })
          }
          />
        <Input
        label="Fecha inicio funcionamiento"
        type="date"
        value={form.start_use_date}
        onChange={(e) =>
          setForm({
            ...form,
            start_use_date: e.target.value,
          })
        }
        />
        <Input
        label="Proveedor de adquisición"
        value={form.supplier_acquisition}
        onChange={(e) =>
          setForm({
            ...form,
            supplier_acquisition:e.target.value,
          })
        }
        />
        <Input
        label="Costo del equipo"
        type="number"
        min="0"
        step="0.01"
        value={form.equipment_cost}
        onChange={(e) =>
          setForm({
            ...form,
            equipment_cost:e.target.value,
          })
        }
        />

        <div className="sm:col-span-2 mt-2">
          <h3 className="text-sm font-semibold text-app">
            Garantía
          </h3>
        </div>

        <Input
        label="Inicio de garantía"
        type="date"
        value={form.warranty_start_date}
        onChange={(e) => 
          setForm({
            ...form,
            warranty_start_date: e.target.value,
          })
        }
        />
        <Input
        label="Finalización de garantía"
        type="date"
        value={form.warranty_end_date}
        onChange={(e) =>
          setForm({
            ...form,
            warranty_end_date: e.target.value,
          })
        }
        />

        <div className="sm:col-span-2 mt-2">
          <h3 className="text-sm font-semibold text-app">
            Mantenimiento
          </h3>
          <p className="text-xs text-app-muted">
            Configuración y seguimiento del mantenimiento
          </p>
        </div>
        <Input
        label="Proveedor de mantenimiento"
        value={form.maintenance_provider}
        onChange={(e) =>
          setForm({
            ...form,
            maintenance_provider:e.target.value
          })
        }
        />
        <Input
        label="Frecuencia de mantenimiento (meses)"
        type="number"
        min="0"
        value={form.maintenance_frequency_months}
        onChange={(e) =>
          setForm({
            ...form,
            maintenance_frequency_months:e.target.value
          })
        }
        />
        <Input
        label="Último preventivo"
        value={form.last_preventive}
        onChange={(e) =>
            setForm({
              ...form,
              last_preventive:e.target.value
            })
        }
        />
        <Input
        label="Próximo preventivo"
        value={form.next_preventive}
        onChange={(e) =>
          setForm({
            ...form,
            next_preventive:e.target.value,
          })
        }
        />
        <div className="sm:col-span-2.mt-2">
          <h3 className="text-sm font-semibold text-app">
            Calibración
          </h3>
        </div>
        <Input
        label="Frecuencia de calibración (meses)"
        type="number"
        min="0"
        value={form.calibration_frequency_months}
        onChange={(e) =>
          setForm({
            ...form,
            calibration_frequency_months:e.target.value
          })
        }
        />
        <Input
        label="Última calibración"
        value={form.last_calibration}
        onChange={(e) => 
          setForm({
            ...form,
            last_calibration:e.target.value,
          })
        }
        />
        <Input
        label="Próxima Calibración"
        value={form.next_calibration}
        onChange={(e) =>
          setForm({
            ...form,
            next_calibration: e.target.value
          })
        }
        />
        <div className="sm:col-span-2 mt-2">
          <h3 className="text-sm font-semibold text-app">
            Seguridad eléctrica
          </h3>
        </div>
        <Input
        label="Clase de seguridad eléctrica"
        value={form.electrical_safety_class}
        onChange={(e) =>
          setForm({
            ...form,
            electrical_safety_class:e.target.value,
          })
        }
        />
        <Input
        label="Tipo de seguridad eléctrica"
        value={form.electrical_safety_type}
        onChange={(e) =>
          setForm({
            ...form,
            electrical_safety_type:e.target.value,
          })
        }
        />
        <div className="sm:col-span-2.mt-2">
          <h3 className="text-sm font-semiboold text-app">
            Información regulatoria
          </h3>
        </div>
        <Input
        label="Registro INVIMA"
        value={form.invima_registration}
        onChange={(e) =>
          setForm({
            ...form,
            invima_registration:e.target.value,
          })
        }
        />
        <Input
        label="ECRI"
        value={form.ecri}
        onChange={(e) =>
          setForm({
            ...form,
            ecri:e.target.value,
          })
        }
        />
        <div className="sm:col-span-2 mt-2">
          <h3 className="text-sm font-semibold text-app">
            Vida útil
          </h3>
        </div>

        <Input
        label="Vida útil (años)"
        type="number"
        min="0"
        value={form.life_use_years}
        onChange={(e) =>
          setForm({
            ...form,
            life_use_years:e.target.value,
          })
        }
        />
        <Select
            label="Estado"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as EquipmentStatus })
            }
            options={Object.entries(STATUS_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
          />

          <div className="sm:col-span-2.mt-2">
            <h3 className="text-sm font-semibold text-app">
              Observaciones
            </h3>
          </div>
         
          <div className="sm:col-span-2">
            <textarea value={form.observations} onChange={(e) =>
              setForm({
                ...form,
                observations:e.target.value
              })
            }
            rows={4}
            placeholder="Observaciones adicionales del equipo..."
            className="w-full rounded-lg border-app bg-app px-3 py-3 text-sm text-app outline-none transition placeholder:text-app-muted focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20 "
            />
          </div>
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

      <EquipoFicha
        open={!!fichaTarget && !editing && !creating}
        equipment={fichaTarget}
        onClose={() => setFichaTarget(null)}
        branchName={branchName}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={(eq) => {
          setFichaTarget(null);
          openEdit(eq);
        }}
        onDelete={(eq) => setToDelete(eq)}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar equipo"
        description={`¿Eliminar el equipo "${toDelete?.name}"? Esta acción borrará también el QR.`}
        confirmText="Eliminar"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

const STATUS_BADGE_CLASS: Record<EquipmentStatus, string> = {
  ACTIVE:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
  INACTIVE:
    "border-app bg-app-muted text-app-muted hover:bg-app-muted/70 dark:hover:bg-white/10 dark:hover:text-app",
  IN_MAINTENANCE:
    "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40",
  IN_REPAIR:
    "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40",
};

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: EquipmentStatus;
  disabled?: boolean;
  onChange: (s: EquipmentStatus) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as EquipmentStatus)}
      title="Cambiar estado"
      className={`appearance-none rounded-full border px-2.5 py-1 pr-6 text-xs font-medium outline-none transition focus:ring-2 focus:ring-[var(--color-primary)]/30 disabled:cursor-not-allowed disabled:opacity-60 ${STATUS_BADGE_CLASS[value]}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 20 20' fill='currentColor'><path d='M5.5 7.5l4.5 4.5 4.5-4.5z'/></svg>\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 6px center",
      }}
    >
      {(Object.keys(STATUS_LABEL) as EquipmentStatus[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}