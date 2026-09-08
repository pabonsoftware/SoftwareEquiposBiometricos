import pytest
from rest_framework.test import APIClient

from apps.branches.tests.factories import BranchFactory
from apps.equipment.tests.factories import EquipmentFactory
from apps.users.tests.factories import AdminFactory, IngenieroFactory, UsuarioFactory

from .factories import FailureRecordFactory


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return AdminFactory()


@pytest.fixture
def ingeniero(db):
    return IngenieroFactory()


@pytest.fixture
def usuario_operativo(db):
    return UsuarioFactory()


@pytest.fixture
def auth_client(api_client, ingeniero):
    """Cliente autenticado como Ingeniero Biomédico: emite la evaluación
    técnica de los reportes de falla (diagnóstico, recomendación, prioridad)
    y también puede registrarlos."""
    api_client.force_authenticate(user=ingeniero)
    return api_client


@pytest.fixture
def management_client(api_client, admin_user):
    """Cliente con autoridad administrativa (admin): puede eliminar reportes."""
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def branch(db):
    return BranchFactory()


@pytest.fixture
def equipment(db, branch):
    return EquipmentFactory(branch=branch)


@pytest.fixture
def failure(db, equipment):
    return FailureRecordFactory(equipment=equipment)
