"""Ola 1 — máquina de estados de la orden de trabajo (RF008 · RF009 · RF011 · §9).

Cubre: aprobación por rol, transiciones válidas/ inválidas, cierre validado
(actividades + observaciones), autogeneración del número, y `status` de solo
lectura vía PATCH.
"""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.audit.models import AuditAction, AuditLog
from apps.equipment.models import (
    EquipmentWorkOrder,
    WorkOrderStatus,
    WorkOrderType,
)
from apps.users.tests.factories import CoordinadorFactory

pytestmark = pytest.mark.django_db

LIST_URL = reverse("v1:equipment:equipment-work-order-list")
ACT_URL = reverse("v1:equipment:work-order-activity-list")


def action_url(pk: int, name: str) -> str:
    return reverse(f"v1:equipment:equipment-work-order-{name}", args=[pk])


def _client_for(user) -> APIClient:
    # Instancia propia por rol: el `api_client` del conftest es compartido y
    # `force_authenticate` sobre él haría que dos "clientes" apunten al mismo user.
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def coordinador(db):
    return CoordinadorFactory()


@pytest.fixture
def coordinador_client(coordinador):
    return _client_for(coordinador)


@pytest.fixture
def ingeniero_client(ingeniero):
    return _client_for(ingeniero)


def _make_wo(equipment, **kw) -> EquipmentWorkOrder:
    defaults = dict(
        number=kw.pop("number", None) or f"OT-TEST-{equipment.pk}-{EquipmentWorkOrder.objects.count()}",
        service_type=WorkOrderType.PREVENTIVE,
        start_date="2026-01-01T08:00:00Z",
        description="Mantenimiento preventivo",
        status=WorkOrderStatus.PENDING,
    )
    defaults.update(kw)
    return EquipmentWorkOrder.objects.create(equipment=equipment, **defaults)


class TestApproval:
    def test_coordinador_approves_pending_order(self, coordinador_client, coordinador, equipment):
        wo = _make_wo(equipment)
        res = coordinador_client.post(action_url(wo.id, "approve"))
        assert res.status_code == 200, res.content
        wo.refresh_from_db()
        assert wo.status == WorkOrderStatus.APPROVED
        assert wo.approved_by_id == coordinador.id
        assert wo.approved_at is not None
        assert AuditLog.objects.filter(
            action=AuditAction.APPROVE, object_id=str(wo.id)
        ).exists()

    def test_engineer_cannot_approve(self, ingeniero_client, equipment):
        wo = _make_wo(equipment)
        res = ingeniero_client.post(action_url(wo.id, "approve"))
        assert res.status_code == 403
        wo.refresh_from_db()
        assert wo.status == WorkOrderStatus.PENDING

    def test_cannot_approve_twice(self, coordinador_client, equipment):
        wo = _make_wo(equipment, status=WorkOrderStatus.APPROVED)
        res = coordinador_client.post(action_url(wo.id, "approve"))
        assert res.status_code == 400


class TestTransitions:
    def test_cannot_start_without_approval(self, ingeniero_client, equipment):
        wo = _make_wo(equipment)
        res = ingeniero_client.post(action_url(wo.id, "start"))
        assert res.status_code == 400
        wo.refresh_from_db()
        assert wo.status == WorkOrderStatus.PENDING

    def test_cannot_complete_before_in_progress(self, ingeniero_client, equipment):
        wo = _make_wo(equipment, status=WorkOrderStatus.APPROVED)
        res = ingeniero_client.post(
            action_url(wo.id, "complete"), {"closing_notes": "ok"}, format="json"
        )
        assert res.status_code == 400

    def test_status_is_read_only_on_patch(self, ingeniero_client, equipment):
        wo = _make_wo(equipment)
        detail = reverse("v1:equipment:equipment-work-order-detail", args=[wo.id])
        res = ingeniero_client.patch(detail, {"status": "FINISHED"}, format="json")
        assert res.status_code == 200
        wo.refresh_from_db()
        assert wo.status == WorkOrderStatus.PENDING

    def test_closed_order_cannot_be_edited(self, ingeniero_client, equipment):
        wo = _make_wo(equipment, status=WorkOrderStatus.FINISHED)
        detail = reverse("v1:equipment:equipment-work-order-detail", args=[wo.id])
        res = ingeniero_client.patch(
            detail, {"description": "otra cosa"}, format="json"
        )
        assert res.status_code == 400


class TestActivitiesAndClose:
    def _approve(self, coordinador_client, wo):
        assert coordinador_client.post(action_url(wo.id, "approve")).status_code == 200

    def test_activity_rejected_on_unapproved_order(self, ingeniero_client, equipment):
        wo = _make_wo(equipment)
        res = ingeniero_client.post(
            ACT_URL, {"work_order": wo.id, "description": "Revisión general"}, format="json"
        )
        assert res.status_code == 400

    def test_first_activity_moves_order_to_in_progress(
        self, coordinador_client, ingeniero_client, equipment
    ):
        wo = _make_wo(equipment)
        self._approve(coordinador_client, wo)
        res = ingeniero_client.post(
            ACT_URL,
            {"work_order": wo.id, "description": "Limpieza y ajuste", "findings": "Filtro sucio"},
            format="json",
        )
        assert res.status_code == 201, res.content
        wo.refresh_from_db()
        assert wo.status == WorkOrderStatus.IN_PROGRESS

    def test_close_requires_activity_and_notes(
        self, coordinador_client, ingeniero_client, equipment
    ):
        wo = _make_wo(equipment)
        self._approve(coordinador_client, wo)
        assert ingeniero_client.post(action_url(wo.id, "start")).status_code == 200

        # sin actividades ni notas
        res = ingeniero_client.post(
            action_url(wo.id, "complete"), {"closing_notes": ""}, format="json"
        )
        assert res.status_code == 400
        body = res.json()
        assert "activities" in body and "closing_notes" in body

        # con actividad pero sin notas
        ingeniero_client.post(
            ACT_URL, {"work_order": wo.id, "description": "Cambio de fusible"}, format="json"
        )
        res = ingeniero_client.post(action_url(wo.id, "complete"), {}, format="json")
        assert res.status_code == 400
        assert "closing_notes" in res.json()

        # con actividad y notas -> cierra
        res = ingeniero_client.post(
            action_url(wo.id, "complete"),
            {"closing_notes": "Equipo operativo, se recomienda repuesto en 3 meses."},
            format="json",
        )
        assert res.status_code == 200, res.content
        wo.refresh_from_db()
        assert wo.status == WorkOrderStatus.FINISHED
        assert wo.closed_by is not None
        assert wo.closed_at is not None
        assert AuditLog.objects.filter(action=AuditAction.CLOSE, object_id=str(wo.id)).exists()

    def test_observations_alias_still_accepted(
        self, coordinador_client, ingeniero_client, equipment
    ):
        wo = _make_wo(equipment)
        self._approve(coordinador_client, wo)
        ingeniero_client.post(
            ACT_URL, {"work_order": wo.id, "description": "Inspección"}, format="json"
        )
        res = ingeniero_client.post(
            action_url(wo.id, "complete"), {"observations": "Todo correcto."}, format="json"
        )
        assert res.status_code == 200
        wo.refresh_from_db()
        assert wo.status == WorkOrderStatus.FINISHED
        assert wo.closing_notes == "Todo correcto."


class TestCancel:
    def test_engineer_cannot_cancel(self, ingeniero_client, equipment):
        wo = _make_wo(equipment)
        res = ingeniero_client.post(
            action_url(wo.id, "cancel"), {"reason": "duplicada"}, format="json"
        )
        assert res.status_code == 403

    def test_cancel_requires_reason(self, coordinador_client, equipment):
        wo = _make_wo(equipment)
        assert coordinador_client.post(action_url(wo.id, "cancel"), {}, format="json").status_code == 400

    def test_coordinador_cancels_with_reason(self, coordinador_client, equipment):
        wo = _make_wo(equipment)
        res = coordinador_client.post(
            action_url(wo.id, "cancel"), {"reason": "Orden duplicada"}, format="json"
        )
        assert res.status_code == 200
        wo.refresh_from_db()
        assert wo.status == WorkOrderStatus.CANCELLED
        assert wo.cancel_reason == "Orden duplicada"


class TestNumberAutogeneration:
    def test_number_autogenerated_when_omitted(self, ingeniero_client, equipment):
        res = ingeniero_client.post(
            LIST_URL,
            {
                "equipment": equipment.id,
                "service_type": WorkOrderType.PREVENTIVE,
                "start_date": "2026-02-01T08:00:00Z",
                "description": "Preventivo trimestral",
            },
            format="json",
        )
        assert res.status_code == 201, res.content
        assert res.json()["number"].startswith("OT-")
