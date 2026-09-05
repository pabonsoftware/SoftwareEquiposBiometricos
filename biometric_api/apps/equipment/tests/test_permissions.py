import pytest
from django.urls import reverse
from rest_framework import status

from apps.audit.models import AuditLog
from apps.users.tests.factories import CoordinadorFactory, TecnicoFactory

pytestmark = pytest.mark.django_db


def detail_url(equipment_id: int) -> str:
    return reverse("v1:equipment:equipment-detail", args=[equipment_id])


class TestEquipmentDeletePermissions:
    def test_tecnico_cannot_delete(self, api_client, equipment):
        api_client.force_authenticate(user=TecnicoFactory())

        response = api_client.delete(detail_url(equipment.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_coordinador_can_delete(self, api_client, equipment):
        api_client.force_authenticate(user=CoordinadorFactory())

        response = api_client.delete(detail_url(equipment.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_admin_delete_leaves_audit_log(self, auth_client, equipment, admin_user):
        equipment_id = equipment.id

        response = auth_client.delete(detail_url(equipment_id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        log = AuditLog.objects.get(
            model_label="equipment.equipment", object_id=str(equipment_id)
        )
        assert log.action == "delete"
        assert log.actor_id == admin_user.id
