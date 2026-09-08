""" BRANCH TESTS """

import pytest
from rest_framework.test import APIClient

from apps.users.tests.factories import AdminFactory

from .factories import BranchFactory, UserFactory


@pytest.fixture
def user(db):
    return UserFactory()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(api_client, db):
    """Cliente autenticado como Administrador del Sistema: es el rol que
    administra las sedes (crear/editar/eliminar)."""
    api_client.force_authenticate(user=AdminFactory())
    return api_client


@pytest.fixture
def admin_client(auth_client):
    return auth_client


@pytest.fixture
def tecnico_client(api_client, user):
    """Cliente autenticado como Técnico (rol operativo, sin permisos sobre
    sedes)."""
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def branch(db):
    return BranchFactory()
