import pytest
from rest_framework.test import APIClient

from apps.branches.tests.factories import BranchFactory
from apps.catalog.tests.factories import EquipmentModelFactory
from apps.users.tests.factories import (
    AdminFactory,
    IngenieroFactory,
    TecnicoFactory,
)

from .factories import EquipmentFactory


@pytest.fixture(autouse=True)
def media_storage(tmp_path, settings):
    """Aísla el storage de archivos por test usando tmp_path como MEDIA_ROOT."""
    settings.MEDIA_ROOT = tmp_path
    settings.STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }
    yield tmp_path


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return AdminFactory()


@pytest.fixture
def auth_client(api_client, admin_user):
    """Administrador del Sistema: alta administrativa de equipos en el inventario."""
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def ingeniero(db):
    return IngenieroFactory()


@pytest.fixture
def tecnico(db):
    return TecnicoFactory()


@pytest.fixture
def ingeniero_client(api_client, ingeniero):
    """Ingeniero Biomédico: mantiene hojas de vida, fichas OEM, certificados,
    instrucciones y emite las órdenes de trabajo."""
    api_client.force_authenticate(user=ingeniero)
    return api_client


@pytest.fixture
def tecnico_client(api_client, tecnico):
    """Técnico Biomédico: ejecuta las órdenes y documenta la intervención
    (repuestos, mediciones, evidencia)."""
    api_client.force_authenticate(user=tecnico)
    return api_client


@pytest.fixture
def branch(db):
    return BranchFactory()


@pytest.fixture
def equipment_model(db):
    return EquipmentModelFactory()


@pytest.fixture
def equipment(db, branch):
    return EquipmentFactory(branch=branch)
