"""HU011 / HU015 — alertas automáticas de mantenimiento preventivo."""
from datetime import date, timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.scheduling.models import (
    MaintenanceAlert,
    MaintenanceAlertType,
)
from apps.scheduling.tasks import scan_maintenance_alerts
from apps.users.tests.factories import CoordinadorFactory

from .factories import MaintenanceScheduleFactory

pytestmark = pytest.mark.django_db

LIST_URL = reverse("v1:scheduling:maintenance-alert-list")


def ack_url(pk: int) -> str:
    return reverse("v1:scheduling:maintenance-alert-acknowledge", args=[pk])


def _today_plus(days: int) -> date:
    return timezone.localdate() + timedelta(days=days)


class TestScanTask:
    def test_creates_due_soon_and_overdue(self, equipment):
        MaintenanceScheduleFactory(equipment=equipment, scheduled_date=_today_plus(3))   # 🟡
        MaintenanceScheduleFactory(equipment=equipment, scheduled_date=_today_plus(-5))  # 🔴
        MaintenanceScheduleFactory(equipment=equipment, scheduled_date=_today_plus(90))  # 🟢

        result = scan_maintenance_alerts()

        assert result["created"] == 2
        types = set(MaintenanceAlert.objects.values_list("alert_type", flat=True))
        assert types == {MaintenanceAlertType.DUE_SOON, MaintenanceAlertType.OVERDUE}

    def test_is_idempotent(self, equipment):
        MaintenanceScheduleFactory(equipment=equipment, scheduled_date=_today_plus(-2))
        scan_maintenance_alerts()
        scan_maintenance_alerts()
        assert MaintenanceAlert.objects.count() == 1

    def test_escalates_due_soon_to_overdue(self, equipment):
        s = MaintenanceScheduleFactory(equipment=equipment, scheduled_date=_today_plus(2))
        scan_maintenance_alerts()
        s.scheduled_date = _today_plus(-1)
        s.save(update_fields=["scheduled_date"])
        scan_maintenance_alerts()
        assert s.alerts.count() == 2  # DUE_SOON abierta + OVERDUE nueva

    def test_ignores_completed_schedule(self, equipment):
        MaintenanceScheduleFactory(
            equipment=equipment, scheduled_date=_today_plus(-5), is_completed=True
        )
        assert scan_maintenance_alerts()["created"] == 0

    def test_completing_schedule_closes_open_alerts(self, equipment):
        s = MaintenanceScheduleFactory(equipment=equipment, scheduled_date=_today_plus(-3))
        scan_maintenance_alerts()
        alert = MaintenanceAlert.objects.get()
        assert alert.is_open

        s.is_completed = True
        s.save(update_fields=["is_completed", "updated_at"])

        alert.refresh_from_db()
        assert not alert.is_open


class TestAlertApi:
    def _seed(self, equipment):
        MaintenanceScheduleFactory(equipment=equipment, scheduled_date=_today_plus(-4))
        scan_maintenance_alerts()
        return MaintenanceAlert.objects.get()

    def test_list_requires_auth(self, api_client, equipment):
        self._seed(equipment)
        assert api_client.get(LIST_URL).status_code == 401

    def test_list_open_filter(self, auth_client, equipment):
        alert = self._seed(equipment)
        alert.acknowledge(user=None)

        MaintenanceScheduleFactory(equipment=equipment, scheduled_date=_today_plus(-9))
        scan_maintenance_alerts()

        open_ids = {
            r["id"] for r in auth_client.get(LIST_URL, {"open": "true"}).json()["results"]
        }
        assert alert.id not in open_ids
        assert len(open_ids) == 1

    def test_acknowledge_marks_attended(self, api_client, equipment):
        coord = CoordinadorFactory()
        client = APIClient()
        client.force_authenticate(user=coord)
        alert = self._seed(equipment)

        res = client.post(ack_url(alert.id), {"note": "Reprogramado con el proveedor"}, format="json")
        assert res.status_code == 200
        alert.refresh_from_db()
        assert alert.acknowledged_by_id == coord.id
        assert alert.acknowledgement_note == "Reprogramado con el proveedor"
        assert alert.acknowledged_at is not None

    def test_acknowledge_twice_returns_400(self, auth_client, equipment):
        alert = self._seed(equipment)
        assert auth_client.post(ack_url(alert.id)).status_code == 200
        assert auth_client.post(ack_url(alert.id)).status_code == 400

    def test_client_cannot_create_alert(self, auth_client, equipment):
        # ReadOnlyModelViewSet: no hay POST al list
        assert auth_client.post(LIST_URL, {}, format="json").status_code == 405
