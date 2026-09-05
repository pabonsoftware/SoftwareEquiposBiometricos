import { equipmentService } from "@/services/equipment.service";
import type { Equipment, EquipmentStatus, RiskClass } from "@/types/equipment";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Building, ClipboardList, MapPin, Shield } from "lucide-react";
import { Badge } from "@/components/ui/Badge";


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

export default function EquiposQrPages() {
    const {id} = useParams();
    const navigate = useNavigate();

    const [equipment,setEquipment] = useState<Equipment | null>(null);
    const [loading,setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;

        setLoading(true);

        equipmentService
            .retrieve(Number(id))
            .then(setEquipment)
            .catch(() => navigate("/404"))
            .finally(() => setLoading(false));
    },[id,navigate])

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-app">
                <p className="text-sm text-app-muted">
                    Cargando equipo...
                </p>
            </div>
        )
    }

    if (!equipment) return null;

    return (
        <div className="min-h-screen bg-app px-4 py-8">
            <div className="mx-auto flex max-w-5xl flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-[var(--color-primary)]">
                        BioSoft
                    </p>
                    <h1 className="text-3xl font-bold text-app">
                        Información del EquipoFicha
                    </h1>
                    <p className="text-sm text-app-muted">
                        Consulta principal mediante código QR
                    </p>
                </div>
                <Card>
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                                <ClipboardList size={28} />
                            </div>
                            <div>
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <h2 className="text-2xl font-bold text-app">
                                        {equipment.name}
                                    </h2>
                                    <Badge tone={STATUS_TONE[equipment.status]}>
                                        {STATUS_LABEL[equipment.status]}
                                    </Badge>
                                </div>
                                <p className="text-sm text-app-muted">
                                     {equipment.brand_name} ·{" "}
                                     {equipment.equipment_model_name}
                                </p>
                                <p className="mt-2 font-mono text-xs text-app-muted">
                                    {equipment.asset_tag}
                                </p>
                            </div>
                        </div>
                    </div>
                </Card>
                <Card>
                    <div className="mb-5">
                        <h5 className="text-lg font-semibold text-app">
                            Información general
                        </h5>
                        <p className="text-sm app-muted">
                            Datos técnicos y operativos del equipo.
                        </p>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-app">
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-[var(--border)]">
                                <tr>
                                    <td className="w-[260px] bg-app-muted/30 px-4 py-3 font-medium text-app">
                                        <div className="flex items-center gap-2">
                                            <Building size={16} />
                                        </div>
                                    </td>
                                    
                                    <td className="px-4 py-3 text-muted">
                                        {equipment.brand_name ?? "No disponible"}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="bg-app-muted/30 px-4 py-3 font-medium text-app">
                                        Modelo
                                    </td>
                                    <td className="px-4 py-3 text-app-muted">
                                        {equipment.equipment_model_name ?? "No disponible"}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="bg-app-muted/30 px-4 py-3 font-medium text-app">
                                        Código del equipo
                                    </td>

                                    <td className="px-4 py-3 font-mono text-app-muted">
                                        {equipment.asset_tag}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="bg-app-muted/30 px-4 py-3 font-medium text-app">
                                        Serial
                                    </td>

                                    <td className="px-4 py-3 font-mono text-app-muted">
                                        BM-{equipment.id}-2026
                                    </td>
                                </tr>
                                <tr>
                                    <td className="bg-app-muted/30 px-4 py-3 font-medium text-app">
                                        <div className="flex items-center gap-2">
                                            <MapPin size={16} />
                                            Ubicación
                                        </div>
                                    </td>

                                    <td className="px-4 py-3 font-mono text-app-muted">
                                        {equipment.location}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="bg-app-muted/30 px-4 py-3 font-medium text-app">
                                        Sede
                                    </td>

                                    <td className="px-4 py-3 font-mono text-app-muted">
                                        {equipment.branch_name ?? "No disponible"}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="bg-app-muted/30 px-4 py-3 font-medium text-app">
                                        Fecha de Compra
                                    </td>

                                    <td className="px-4 py-3 font-mono text-app-muted">
                                        {equipment.purchase_date}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="bg-app-muted/30 px-4 py-3 font-medium text-app">
                                        <div className="flex items-center gap-2">
                                            <Shield size={16} />
                                            Clase de riesgo
                                        </div>
                                    </td>

                                    <td className="px-4 py-3 font-mono text-app-muted">
                                        <Badge tone="info">
                                            {RISK_LABEL[equipment.risk_class]}
                                        </Badge>
                                    </td>
                                </tr>
                                <tr>
                                    <td className="bg-app-muted/30 px-4 py-3 font-medium text-app">
                                        Estado operativo
                                    </td>

                                    <td className="px-4 py-3 font-mono text-app-muted">
                                        <Badge tone={STATUS_TONE[equipment.status]}>
                                            {STATUS_LABEL[equipment.status]}
                                        </Badge>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>
                <Card>
                    <div className="mb-5">
                        <h3 className="text-lg font-semibold text-app">
                            Historial de mantenimiento
                        </h3>
                        <p className="text-sm text-app-muted">
                            Información resumida de mantenimientos realizados
                        </p>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-app">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-app bg-app-muted/30 text-left text-xs uppercase tracking-wider text-app-muted">
                                    <th className="px-4 py-3 font-medium">
                                        Fecha
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                        Tipo
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                        Estado
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                <tr>
                                    <td className="px-4 py-3 text-app-muted">
                                        2026-04-20
                                    </td>
                                    <td className="px-4 py-3 txt-app-muted">
                                        Preventivo
                                    </td>
                                    <td className="px-4 py-3 txt-app-muted">
                                        Correctivo
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge tone="success">
                                            Completado
                                        </Badge>
                                    </td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 text-app-muted">
                                        2026-01-15
                                    </td>

                                    <td className="px-4 py-3 txt-app-muted">
                                        Correctivo
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge tone="success">
                                            Completado
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge tone={RISK_TONE[equipment.risk_class]}>
                                            {equipment.risk_class}
                                        </Badge>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    )
}