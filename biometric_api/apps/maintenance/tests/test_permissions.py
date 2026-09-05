import pytest
from django.urls import reverse
from rest_framework import status

from apps.audit.models import AuditLog

pytestmark = pytest.mark.django_db


def detail_url(record_id: int) -> str:
    return reverse("v1:maintenance:record-detail", args=[record_id])


class TestMaintenanceRecordDeletePermissions:
    def test_tecnico_cannot_delete(self, api_client, maintenance_record, tecnico):
        api_client.force_authenticate(user=tecnico)

        response = api_client.delete(detail_url(maintenance_record.id))

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_delete_leaves_audit_log(self, auth_client, maintenance_record, admin_user):
        record_id = maintenance_record.id

        response = auth_client.delete(detail_url(record_id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        log = AuditLog.objects.get(
            model_label="maintenance.maintenancerecord", object_id=str(record_id)
        )
        assert log.action == "delete"
        assert log.actor_id == admin_user.id
