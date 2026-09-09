"""RFN009 — consulta de auditoría + auditoría centralizada de CRUD."""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.audit.models import AuditAction, AuditLog
from apps.branches.tests.factories import BranchFactory
from apps.equipment.tests.factories import EquipmentFactory
from apps.users.tests.factories import (
    AdminFactory,
    CoordinadorFactory,
    IngenieroFactory,
    UsuarioFactory,
)

pytestmark = pytest.mark.django_db

LIST_URL = reverse("v1:audit:log-list")
EQUIP_LIST = reverse("v1:equipment:equipment-list")


@pytest.fixture
def branch(db):
    return BranchFactory()


def _client(user) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def equip_detail(pk: int) -> str:
    return reverse("v1:equipment:equipment-detail", args=[pk])


class TestAuditReadAccess:
    def test_requires_auth(self):
        assert APIClient().get(LIST_URL).status_code == 401

    def test_admin_and_coordinator_can_read(self):
        assert _client(AdminFactory()).get(LIST_URL).status_code == 200
        assert _client(CoordinadorFactory()).get(LIST_URL).status_code == 200

    def test_engineer_and_operative_forbidden(self):
        assert _client(IngenieroFactory()).get(LIST_URL).status_code == 403
        assert _client(UsuarioFactory()).get(LIST_URL).status_code == 403

    def test_read_only(self):
        assert _client(AdminFactory()).post(LIST_URL, {}, format="json").status_code == 405


class TestCentralizedAudit:
    def _payload(self, branch):
        return {
            "name": "Bomba de infusión",
            "asset_tag": "EQ-AUD-1",
            "equipment_model": EquipmentFactory(branch=branch).equipment_model_id,
            "branch": branch.id,
            "location": "UCI",
        }

    def test_create_via_api_leaves_create_log(self, branch):
        client = _client(AdminFactory())
        res = client.post(EQUIP_LIST, self._payload(branch), format="json")
        assert res.status_code == 201, res.content
        assert AuditLog.objects.filter(
            action=AuditAction.CREATE,
            model_label="equipment.equipment",
            object_id=str(res.json()["id"]),
        ).exists()

    def test_update_logs_before_and_after(self, branch):
        eq = EquipmentFactory(branch=branch, location="Bodega")
        client = _client(AdminFactory())

        res = client.patch(equip_detail(eq.id), {"location": "Quirófano 2"}, format="json")
        assert res.status_code == 200

        log = AuditLog.objects.get(
            action=AuditAction.UPDATE, object_id=str(eq.id)
        )
        assert log.changes["fields"]["location"] == {
            "from": "Bodega",
            "to": "Quirófano 2",
        }

    def test_update_without_real_change_still_logs_but_empty(self, branch):
        eq = EquipmentFactory(branch=branch, location="UCI")
        client = _client(AdminFactory())
        client.patch(equip_detail(eq.id), {"location": "UCI"}, format="json")
        log = AuditLog.objects.get(action=AuditAction.UPDATE, object_id=str(eq.id))
        assert log.changes == {}

    def test_delete_logs(self, branch):
        eq = EquipmentFactory(branch=branch)
        _client(AdminFactory()).delete(equip_detail(eq.id))
        assert AuditLog.objects.filter(
            action=AuditAction.DELETE, object_id=str(eq.id)
        ).exists()

    def test_audit_endpoint_filters(self, branch):
        eq = EquipmentFactory(branch=branch)
        admin = AdminFactory()
        _client(admin).delete(equip_detail(eq.id))

        body = _client(admin).get(
            LIST_URL, {"action": "delete", "model_label": "equipment.equipment"}
        ).json()
        assert body["count"] >= 1
        assert all(r["action"] == "delete" for r in body["results"])
        assert body["results"][0]["actor_name"]


class TestAuditModelBranch:
    def test_branch_update_is_audited(self):
        branch = BranchFactory(name="Sede Norte")
        client = _client(AdminFactory())
        url = reverse("v1:branches:branch-detail", args=[branch.id])
        client.patch(url, {"name": "Sede Norte 2"}, format="json")
        assert AuditLog.objects.filter(
            action=AuditAction.UPDATE, model_label="branches.branch", object_id=str(branch.id)
        ).exists()
