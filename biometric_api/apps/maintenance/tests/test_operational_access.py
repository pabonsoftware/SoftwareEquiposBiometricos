"""RF001 / RFN001 — el Usuario Operativo no accede a los módulos operativos.

"Ocultar el enlace en el menú no es la única protección": el backend niega el
acceso directo al endpoint aunque venga un GET.
"""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.equipment.models import (
    EquipmentWorkOrder,
    WorkOrderStatus,
    WorkOrderType,
)
from apps.users.tests.factories import IngenieroFactory, UsuarioFactory

pytestmark = pytest.mark.django_db

OPERATIONAL_LIST_URLS = [
    reverse("v1:maintenance:record-list"),
    reverse("v1:equipment:equipment-work-order-list"),
    reverse("v1:equipment:work-order-activity-list"),
    reverse("v1:scheduling:maintenance-list"),
    reverse("v1:scheduling:maintenance-alert-list"),
]


def _client(user) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=user)
    return c


class TestOperativeUserBlocked:
    @pytest.mark.parametrize("url", OPERATIONAL_LIST_URLS)
    def test_operative_cannot_list(self, url):
        assert _client(UsuarioFactory()).get(url).status_code == 403

    @pytest.mark.parametrize("url", OPERATIONAL_LIST_URLS)
    def test_engineer_can_list(self, url):
        assert _client(IngenieroFactory()).get(url).status_code == 200

    def test_operative_cannot_read_work_order_detail(self, equipment):
        wo = EquipmentWorkOrder.objects.create(
            equipment=equipment, number="OT-SEC-1",
            service_type=WorkOrderType.PREVENTIVE,
            start_date="2026-01-01T08:00:00Z", description="x",
            status=WorkOrderStatus.PENDING,
        )
        url = reverse("v1:equipment:equipment-work-order-detail", args=[wo.id])
        assert _client(UsuarioFactory()).get(url).status_code == 403

    def test_operative_still_sees_equipment_and_failures(self, equipment):
        client = _client(UsuarioFactory())
        assert client.get(reverse("v1:equipment:equipment-list")).status_code == 200
        assert client.get(reverse("v1:failures:failure-list")).status_code == 200
