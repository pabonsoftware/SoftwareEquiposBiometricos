"""RF012 / HU022 / HU023 — endpoints de reportes de gestión.

`APIView` (no `ModelViewSet`): son consultas agregadas de solo lectura, sin
recurso CRUD detrás. `?export=csv` descarga; sin él, JSON `{summary, results}`.
(No se usa `?format=` porque DRF lo reserva para negociación de contenido.)
"""
from __future__ import annotations

from datetime import date

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.common.permissions import ReportsAccess

from . import services
from .exporters import csv_response


def _date(params, key: str) -> date | None:
    raw = params.get(key)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _int(params, key: str) -> int | None:
    raw = params.get(key)
    try:
        return int(raw) if raw not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _str(params, key: str) -> str | None:
    raw = params.get(key)
    return raw.strip() or None if isinstance(raw, str) and raw.strip() else None


class _BaseReportView(APIView):
    permission_classes = (IsAuthenticated, ReportsAccess)


class MaintenanceReportView(_BaseReportView):
    def get(self, request):
        p = request.query_params
        report = services.maintenance_report(
            date_from=_date(p, "date_from"),
            date_to=_date(p, "date_to"),
            equipment=_int(p, "equipment"),
            kind=_str(p, "kind"),
            branch=_int(p, "branch"),
            search=_str(p, "search"),
        )
        # §11: correctivos por severidad de falla, en el mismo periodo.
        report["summary"]["corrective_by_severity"] = services.corrective_by_severity(
            date_from=_date(p, "date_from"), date_to=_date(p, "date_to")
        )
        if p.get("export") == "csv":
            return csv_response(
                "reporte_mantenimientos",
                ["Equipo", "Placa", "Sede", "Tipo", "Fecha", "Responsable", "Costo", "Descripción"],
                (
                    [
                        r["equipment_name"],
                        r["equipment_asset_tag"],
                        r["branch_name"],
                        r["kind_display"],
                        r["date"],
                        r["responsible"],
                        r["cost"],
                        r["description"],
                    ]
                    for r in report["results"]
                ),
            )
        return Response(report)


class EquipmentStatusReportView(_BaseReportView):
    def get(self, request):
        p = request.query_params
        report = services.equipment_status_report(
            status=_str(p, "status"),
            branch=_int(p, "branch"),
            department=_str(p, "department"),
            area=_str(p, "area"),
            risk_class=_str(p, "risk_class"),
        )
        if p.get("export") == "csv":
            return csv_response(
                "reporte_estado_equipos",
                [
                    "Equipo", "Placa", "Sede", "Departamento", "Área", "Ubicación",
                    "Estado", "Riesgo", "Fallas abiertas", "MTBF (h)", "MTTR (h)",
                ],
                (
                    [
                        r["name"], r["asset_tag"], r["branch_name"],
                        r["department"], r["area"], r["location"],
                        r["status_display"], r["risk_class"],
                        r["open_failures"], r["mtbf_hours"], r["mttr_hours"],
                    ]
                    for r in report["results"]
                ),
            )
        return Response(report)


class WorkOrderReportView(_BaseReportView):
    def get(self, request):
        p = request.query_params
        report = services.work_order_report(
            date_from=_date(p, "date_from"),
            date_to=_date(p, "date_to"),
            equipment=_int(p, "equipment"),
            status=_str(p, "status"),
            service_type=_str(p, "service_type"),
            branch=_int(p, "branch"),
        )
        if p.get("export") == "csv":
            return csv_response(
                "reporte_ordenes_trabajo",
                ["Número", "Placa", "Sede", "Tipo", "Estado", "Inicio", "Fin", "Responsable"],
                (
                    [
                        r["number"], r["equipment_asset_tag"], r["branch_name"],
                        r["service_type_display"], r["status_display"],
                        r["start_date"], r["end_date"], r["technician"],
                    ]
                    for r in report["results"]
                ),
            )
        return Response(report)


class MaintenanceCertificatesView(_BaseReportView):
    def get(self, request):
        p = request.query_params
        docs = services.maintenance_certificates(
            request=request,
            equipment=_int(p, "equipment"),
            branch=_int(p, "branch"),
            date_from=_date(p, "date_from"),
            date_to=_date(p, "date_to"),
        )
        return Response({"count": len(docs), "results": docs})
