"""RF012 / HU022 / HU023 — construcción de los reportes de gestión.

Cada función devuelve `{"summary": {...}, "results": [...]}` a partir de filtros
ya parseados. La regla del semáforo (RF010) se reutiliza vía `calculate_status`;
las métricas MTBF/MTTR se leen de `Equipment` (ya calculadas por señales).
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.equipment.models import (
    Equipment,
    EquipmentCertificate,
    EquipmentWorkOrder,
    WorkOrderStatus,
    WorkOrderType,
)
from apps.failures.models import FailureRecord
from apps.maintenance.models import MaintenanceKind, MaintenanceRecord


def _name(user) -> str | None:
    if user is None:
        return None
    return user.get_full_name() or user.username


# ---------------------------------------------------------------------------
# RF012 — Reporte de mantenimientos (preventivo / correctivo / …)
# ---------------------------------------------------------------------------
def maintenance_report(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    equipment: int | None = None,
    kind: str | None = None,
    branch: int | None = None,
    search: str | None = None,
) -> dict:
    qs = MaintenanceRecord.objects.select_related(
        "equipment", "equipment__branch", "assigned_engineer", "assigned_technician"
    )
    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    if equipment:
        qs = qs.filter(equipment_id=equipment)
    if kind:
        qs = qs.filter(kind=kind)
    if branch:
        qs = qs.filter(equipment__branch_id=branch)
    if search:
        qs = qs.filter(
            Q(description__icontains=search)
            | Q(technician__icontains=search)
            | Q(equipment__asset_tag__icontains=search)
            | Q(equipment__name__icontains=search)
        )
    qs = qs.order_by("-date", "-created_at")

    agg = qs.aggregate(
        total_cost=Coalesce(Sum("cost"), Decimal("0")),
        average_cost=Coalesce(Avg("cost"), Decimal("0")),
    )
    by_kind = {
        row["kind"]: row["count"]
        # `.order_by()` limpia el ORDER BY del queryset: si no, Django lo mete en
        # el GROUP BY y los conteos salen partidos.
        for row in qs.order_by().values("kind").annotate(count=Count("id"))
    }
    summary = {
        "total": qs.count(),
        "by_kind": {k: by_kind.get(k, 0) for k in MaintenanceKind.values},
        "total_cost": str(agg["total_cost"]),
        "average_cost": str(agg["average_cost"].quantize(Decimal("0.01"))),
        "equipment_count": qs.values("equipment_id").distinct().count(),
        "with_certificate": qs.exclude(pdf_file="").count(),
    }

    results = [
        {
            "id": r.id,
            "equipment_id": r.equipment_id,
            "equipment_name": r.equipment.name,
            "equipment_asset_tag": r.equipment.asset_tag,
            "branch_name": r.equipment.branch.name,
            "kind": r.kind,
            "kind_display": r.get_kind_display(),
            "date": r.date.isoformat(),
            "description": r.description,
            "responsible": _name(r.assigned_engineer)
            or _name(r.assigned_technician)
            or r.technician
            or None,
            "cost": str(r.cost) if r.cost is not None else None,
            "has_certificate": bool(r.pdf_file),
        }
        for r in qs
    ]
    return {"summary": summary, "results": results}


# ---------------------------------------------------------------------------
# HU022 — Reporte de estado de equipos
# ---------------------------------------------------------------------------
def equipment_status_report(
    *,
    status: str | None = None,
    branch: int | None = None,
    department: str | None = None,
    area: str | None = None,
    risk_class: str | None = None,
) -> dict:
    qs = Equipment.objects.select_related("branch").annotate(
        open_failures=Count("failures", filter=Q(failures__resolved=False))
    )
    if status:
        qs = qs.filter(status=status)
    if branch:
        qs = qs.filter(branch_id=branch)
    if department:
        qs = qs.filter(department__iexact=department)
    if area:
        qs = qs.filter(area__iexact=area)
    if risk_class:
        qs = qs.filter(risk_class=risk_class)
    qs = qs.order_by("branch__name", "name")

    total = qs.count()
    by_status = {
        row["status"]: row["count"]
        for row in qs.order_by().values("status").annotate(count=Count("id"))
    }
    active = by_status.get("ACTIVE", 0)
    metrics = qs.aggregate(mtbf=Avg("mtbf_hours"), mttr=Avg("mttr_hours"))

    by_branch = [
        {
            "branch_id": row["branch_id"],
            "branch_name": row["branch__name"],
            "total": row["count"],
            "active": row["active"],
        }
        for row in qs.order_by()
        .values("branch_id", "branch__name")
        .annotate(
            count=Count("id"),
            active=Count("id", filter=Q(status="ACTIVE")),
        )
    ]

    summary = {
        "total": total,
        "by_status": by_status,
        "operational_availability": (
            round(active / total * 100, 1) if total else 0.0
        ),
        "avg_mtbf_hours": (
            str(metrics["mtbf"].quantize(Decimal("0.01"))) if metrics["mtbf"] else None
        ),
        "avg_mttr_hours": (
            str(metrics["mttr"].quantize(Decimal("0.01"))) if metrics["mttr"] else None
        ),
        "by_branch": by_branch,
    }

    results = [
        {
            "id": e.id,
            "name": e.name,
            "asset_tag": e.asset_tag,
            "branch_name": e.branch.name,
            "department": e.department or None,
            "area": e.area or None,
            "location": e.location or None,
            "status": e.status,
            "status_display": e.get_status_display(),
            "risk_class": e.risk_class,
            "open_failures": e.open_failures,
            "mtbf_hours": str(e.mtbf_hours) if e.mtbf_hours is not None else None,
            "mttr_hours": str(e.mttr_hours) if e.mttr_hours is not None else None,
            "maintenance_semaphore": e.maintenance_semaphore.value,
        }
        for e in qs
    ]
    return {"summary": summary, "results": results}


# ---------------------------------------------------------------------------
# RF012 — Reporte de órdenes de trabajo (por estado y tipo + cumplimiento)
# ---------------------------------------------------------------------------
def work_order_report(
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    equipment: int | None = None,
    status: str | None = None,
    service_type: str | None = None,
    branch: int | None = None,
) -> dict:
    qs = EquipmentWorkOrder.objects.select_related(
        "equipment", "equipment__branch", "technician"
    )
    if date_from:
        qs = qs.filter(start_date__date__gte=date_from)
    if date_to:
        qs = qs.filter(start_date__date__lte=date_to)
    if equipment:
        qs = qs.filter(equipment_id=equipment)
    if status:
        qs = qs.filter(status=status)
    if service_type:
        qs = qs.filter(service_type=service_type)
    if branch:
        qs = qs.filter(equipment__branch_id=branch)
    qs = qs.order_by("-start_date")

    by_status = {
        row["status"]: row["count"]
        for row in qs.order_by().values("status").annotate(count=Count("id"))
    }
    by_type = {
        row["service_type"]: row["count"]
        for row in qs.order_by().values("service_type").annotate(count=Count("id"))
    }

    preventive_total = qs.filter(service_type=WorkOrderType.PREVENTIVE).count()
    preventive_done = qs.filter(
        service_type=WorkOrderType.PREVENTIVE, status=WorkOrderStatus.FINISHED
    ).count()

    summary = {
        "total": qs.count(),
        "by_status": {s: by_status.get(s, 0) for s in WorkOrderStatus.values},
        "by_type": {t: by_type.get(t, 0) for t in WorkOrderType.values},
        "preventive_compliance": (
            round(preventive_done / preventive_total * 100, 1)
            if preventive_total
            else None
        ),
        "finished": by_status.get(WorkOrderStatus.FINISHED, 0),
        "open": sum(
            by_status.get(s, 0)
            for s in (
                WorkOrderStatus.PENDING,
                WorkOrderStatus.APPROVED,
                WorkOrderStatus.IN_PROGRESS,
            )
        ),
    }

    results = [
        {
            "id": w.id,
            "number": w.number,
            "equipment_asset_tag": w.equipment.asset_tag,
            "branch_name": w.equipment.branch.name,
            "service_type": w.service_type,
            "service_type_display": w.get_service_type_display(),
            "status": w.status,
            "status_display": w.get_status_display(),
            "start_date": w.start_date.isoformat(),
            "end_date": w.end_date.isoformat() if w.end_date else None,
            "technician": _name(w.technician),
            "semaphore": w.schedule_semaphore.value,
        }
        for w in qs
    ]
    return {"summary": summary, "results": results}


# ---------------------------------------------------------------------------
# HU023 — Historial de reportes / certificados de mantenimiento
# ---------------------------------------------------------------------------
def _file_url(field, request) -> str | None:
    if not field:
        return None
    url = field.url
    return request.build_absolute_uri(url) if request is not None else url


def maintenance_certificates(
    *,
    request,
    equipment: int | None = None,
    branch: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    """Unifica los documentos PDF de mantenimiento de las 3 fuentes existentes
    (no se crea modelo nuevo): certificados del equipo, registros de
    mantenimiento y reportes de orden de trabajo."""
    docs: list[dict] = []

    certs = EquipmentCertificate.objects.select_related(
        "equipment", "equipment__branch"
    ).exclude(file="")
    records = (
        MaintenanceRecord.objects.select_related("equipment", "equipment__branch")
        .exclude(pdf_file="")
    )
    orders = (
        EquipmentWorkOrder.objects.select_related("equipment", "equipment__branch")
        .exclude(report="")
    )

    if equipment:
        certs = certs.filter(equipment_id=equipment)
        records = records.filter(equipment_id=equipment)
        orders = orders.filter(equipment_id=equipment)
    if branch:
        certs = certs.filter(equipment__branch_id=branch)
        records = records.filter(equipment__branch_id=branch)
        orders = orders.filter(equipment__branch_id=branch)
    if date_from:
        certs = certs.filter(certificate_date__gte=date_from)
        records = records.filter(date__gte=date_from)
        orders = orders.filter(start_date__date__gte=date_from)
    if date_to:
        certs = certs.filter(certificate_date__lte=date_to)
        records = records.filter(date__lte=date_to)
        orders = orders.filter(start_date__date__lte=date_to)

    for c in certs:
        docs.append(
            {
                "source": "EQUIPMENT_CERTIFICATE",
                "source_label": "Certificado del equipo",
                "id": c.id,
                "equipment_id": c.equipment_id,
                "equipment_asset_tag": c.equipment.asset_tag,
                "branch_name": c.equipment.branch.name,
                "title": c.certificate_number,
                "date": c.certificate_date.isoformat(),
                "responsible": c.responsible or None,
                "url": _file_url(c.file, request),
            }
        )
    for r in records:
        docs.append(
            {
                "source": "MAINTENANCE_REPORT",
                "source_label": "Reporte de mantenimiento",
                "id": r.id,
                "equipment_id": r.equipment_id,
                "equipment_asset_tag": r.equipment.asset_tag,
                "branch_name": r.equipment.branch.name,
                "title": f"{r.get_kind_display()} · {r.date.isoformat()}",
                "date": r.date.isoformat(),
                "responsible": r.technician or None,
                "url": _file_url(r.pdf_file, request),
            }
        )
    for w in orders:
        docs.append(
            {
                "source": "WORK_ORDER_REPORT",
                "source_label": "Reporte de orden de trabajo",
                "id": w.id,
                "equipment_id": w.equipment_id,
                "equipment_asset_tag": w.equipment.asset_tag,
                "branch_name": w.equipment.branch.name,
                "title": f"OT {w.number}",
                "date": w.start_date.date().isoformat(),
                "responsible": _name(w.technician),
                "url": _file_url(w.report, request),
            }
        )

    docs.sort(key=lambda d: d["date"], reverse=True)
    return docs


# ---------------------------------------------------------------------------
# Correctivos por severidad de falla (checklist §11)
# ---------------------------------------------------------------------------
def corrective_by_severity(
    *, date_from: date | None = None, date_to: date | None = None
) -> list[dict]:
    qs = FailureRecord.objects.all()
    if date_from:
        qs = qs.filter(reported_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(reported_at__date__lte=date_to)
    return [
        {
            "severity": row["severity"],
            "total": row["count"],
            "resolved": row["resolved_count"],
        }
        for row in qs.order_by().values("severity").annotate(
            count=Count("id"),
            resolved_count=Count("id", filter=Q(resolved=True)),
        )
    ]


def today() -> date:
    return timezone.localdate()
