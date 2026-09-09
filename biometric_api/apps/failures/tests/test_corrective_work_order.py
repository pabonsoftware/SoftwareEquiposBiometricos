"""RF007 — una falla origina la solicitud de mantenimiento correctivo y se
conserva el vínculo Falla → Orden."""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.audit.models import AuditAction, AuditLog
from apps.equipment.models import EquipmentWorkOrder, WorkOrderStatus, WorkOrderType

pytestmark = pytest.mark.django_db


def create_wo_url(pk: int) -> str:
    return reverse("v1:failures:failure-create-work-order", args=[pk])


def _client_for(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class TestCreateCorrectiveWorkOrder:
    def test_engineer_creates_linked_corrective_order(self, ingeniero, failure):
        client = _client_for(ingeniero)
        res = client.post(create_wo_url(failure.id), {}, format="json")
        assert res.status_code == 201, res.content

        failure.refresh_from_db()
        assert failure.corrective_work_order is not None
        wo = failure.corrective_work_order
        assert wo.service_type == WorkOrderType.CORRECTIVE
        assert wo.status == WorkOrderStatus.PENDING
        assert wo.equipment_id == failure.equipment_id
        assert failure.description in wo.description
        # el vínculo inverso también resuelve
        assert failure in wo.source_failures.all()
        assert AuditLog.objects.filter(
            action=AuditAction.CREATE, object_id=str(wo.id)
        ).exists()

    def test_body_description_is_appended(self, ingeniero, failure):
        client = _client_for(ingeniero)
        res = client.post(
            create_wo_url(failure.id),
            {"description": "Requiere repuesto importado"},
            format="json",
        )
        assert res.status_code == 201
        failure.refresh_from_db()
        assert "Requiere repuesto importado" in failure.corrective_work_order.description

    def test_cannot_create_twice(self, ingeniero, failure):
        client = _client_for(ingeniero)
        assert client.post(create_wo_url(failure.id), {}, format="json").status_code == 201
        res = client.post(create_wo_url(failure.id), {}, format="json")
        assert res.status_code == 400
        assert EquipmentWorkOrder.objects.count() == 1

    def test_operative_user_cannot_create_order(self, usuario_operativo, failure):
        client = _client_for(usuario_operativo)
        res = client.post(create_wo_url(failure.id), {}, format="json")
        assert res.status_code == 403
        failure.refresh_from_db()
        assert failure.corrective_work_order is None

    def test_requires_authentication(self, failure):
        res = APIClient().post(create_wo_url(failure.id), {}, format="json")
        assert res.status_code == 401
