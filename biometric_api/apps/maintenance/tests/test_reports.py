"""RF012 / HU022 / HU023 — reportes de gestión."""
from datetime import date

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone

from apps.equipment.models import (
    EquipmentCertificate,
    EquipmentStatus,
    EquipmentWorkOrder,
    WorkOrderStatus,
    WorkOrderType,
)
from apps.equipment.tests.factories import EquipmentFactory
from apps.failures.tests.factories import FailureRecordFactory
from apps.maintenance.models import MaintenanceKind, MaintenanceRecord
from apps.users.tests.factories import CoordinadorFactory, UsuarioFactory

from .factories import MaintenanceRecordFactory

pytestmark = pytest.mark.django_db

MAINT_URL = reverse("v1:reports:maintenance")
STATUS_URL = reverse("v1:reports:equipment-status")
WO_URL = reverse("v1:reports:work-orders")
CERT_URL = reverse("v1:reports:certificates")


def _pdf(name="c.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 x", content_type="application/pdf")


class TestAccess:
    def test_operative_user_forbidden(self, api_client, equipment):
        api_client.force_authenticate(user=UsuarioFactory())
        assert api_client.get(MAINT_URL).status_code == 403

    def test_requires_auth(self, api_client):
        assert api_client.get(MAINT_URL).status_code == 401

    def test_coordinator_allowed(self, api_client):
        api_client.force_authenticate(user=CoordinadorFactory())
        assert api_client.get(STATUS_URL).status_code == 200


class TestMaintenanceReport:
    def test_summary_totals_and_filters(self, auth_client, equipment):
        MaintenanceRecordFactory(
            equipment=equipment, kind=MaintenanceKind.PREVENTIVE,
            date=date(2026, 3, 1), cost=100,
        )
        MaintenanceRecordFactory(
            equipment=equipment, kind=MaintenanceKind.CORRECTIVE,
            date=date(2026, 3, 5), cost=300,
        )
        MaintenanceRecordFactory(
            equipment=equipment, kind=MaintenanceKind.PREVENTIVE,
            date=date(2026, 1, 1), cost=50,
        )

        body = auth_client.get(
            MAINT_URL, {"date_from": "2026-02-01", "date_to": "2026-03-31"}
        ).json()
        assert body["summary"]["total"] == 2
        assert body["summary"]["by_kind"]["PREVENTIVE"] == 1
        assert body["summary"]["total_cost"] == "400.00"
        assert len(body["results"]) == 2

    def test_filter_by_kind(self, auth_client, equipment):
        MaintenanceRecordFactory(equipment=equipment, kind=MaintenanceKind.PREVENTIVE)
        MaintenanceRecordFactory(equipment=equipment, kind=MaintenanceKind.CORRECTIVE)
        body = auth_client.get(MAINT_URL, {"kind": "CORRECTIVE"}).json()
        assert body["summary"]["total"] == 1

    def test_corrective_by_severity_in_summary(self, auth_client, equipment):
        FailureRecordFactory(equipment=equipment, severity="HIGH", resolved=False)
        FailureRecordFactory(
            equipment=equipment, severity="HIGH", resolved=True,
            resolved_at=timezone.now(),
        )
        body = auth_client.get(MAINT_URL).json()
        rows = {r["severity"]: r for r in body["summary"]["corrective_by_severity"]}
        assert rows["HIGH"]["total"] == 2
        assert rows["HIGH"]["resolved"] == 1

    def test_csv_export(self, auth_client, equipment):
        MaintenanceRecordFactory(equipment=equipment, kind=MaintenanceKind.PREVENTIVE)
        res = auth_client.get(MAINT_URL, {"export": "csv"})
        assert res.status_code == 200
        assert res["Content-Type"].startswith("text/csv")
        assert "attachment" in res["Content-Disposition"]
        assert equipment.asset_tag in res.content.decode("utf-8")


class TestEquipmentStatusReport:
    def test_availability_and_by_branch(self, auth_client, branch):
        EquipmentFactory(branch=branch, status=EquipmentStatus.ACTIVE)
        EquipmentFactory(branch=branch, status=EquipmentStatus.ACTIVE)
        EquipmentFactory(branch=branch, status=EquipmentStatus.IN_REPAIR)

        body = auth_client.get(STATUS_URL).json()
        assert body["summary"]["total"] == 3
        assert body["summary"]["by_status"]["ACTIVE"] == 2
        assert body["summary"]["operational_availability"] == 66.7
        assert body["summary"]["by_branch"][0]["active"] == 2

    def test_filter_by_status(self, auth_client, branch):
        EquipmentFactory(branch=branch, status=EquipmentStatus.ACTIVE)
        EquipmentFactory(branch=branch, status=EquipmentStatus.INACTIVE)
        body = auth_client.get(STATUS_URL, {"status": "INACTIVE"}).json()
        assert body["summary"]["total"] == 1


class TestWorkOrderReport:
    def _wo(self, equipment, **kw):
        return EquipmentWorkOrder.objects.create(
            equipment=equipment,
            number=f"OT-R-{EquipmentWorkOrder.objects.count()}",
            service_type=kw.get("service_type", WorkOrderType.PREVENTIVE),
            start_date=timezone.now(),
            description="x",
            status=kw.get("status", WorkOrderStatus.PENDING),
        )

    def test_compliance_and_by_status(self, auth_client, equipment):
        self._wo(equipment, status=WorkOrderStatus.FINISHED)
        self._wo(equipment, status=WorkOrderStatus.PENDING)
        self._wo(equipment, service_type=WorkOrderType.CORRECTIVE)

        body = auth_client.get(WO_URL).json()
        assert body["summary"]["total"] == 3
        assert body["summary"]["by_type"]["PREVENTIVE"] == 2
        assert body["summary"]["preventive_compliance"] == 50.0


class TestCertificates:
    def test_aggregates_three_sources(self, auth_client, equipment):
        EquipmentCertificate.objects.create(
            equipment=equipment, certificate_number="CERT-1",
            certificate_date=date(2026, 2, 1), responsible="Metrología SAS",
            file=_pdf("cert1.pdf"),
        )
        MaintenanceRecord.objects.create(
            equipment=equipment, kind=MaintenanceKind.PREVENTIVE,
            date=date(2026, 3, 1), description="ok", pdf_file=_pdf("rec.pdf"),
        )
        EquipmentWorkOrder.objects.create(
            equipment=equipment, number="OT-CERT",
            service_type=WorkOrderType.PREVENTIVE, start_date=timezone.now(),
            description="x", report=_pdf("wo.pdf"),
        )

        body = auth_client.get(CERT_URL, {"equipment": equipment.id}).json()
        assert body["count"] == 3
        sources = {d["source"] for d in body["results"]}
        assert sources == {
            "EQUIPMENT_CERTIFICATE", "MAINTENANCE_REPORT", "WORK_ORDER_REPORT"
        }
        assert all(d["url"] for d in body["results"])
        # ordenado por fecha desc
        dates = [d["date"] for d in body["results"]]
        assert dates == sorted(dates, reverse=True)

    def test_excludes_records_without_file(self, auth_client, equipment):
        MaintenanceRecordFactory(equipment=equipment)  # sin pdf
        body = auth_client.get(CERT_URL, {"equipment": equipment.id}).json()
        assert body["count"] == 0
