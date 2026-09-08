import re

import pytest
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from apps.users.models import User

from .factories import TecnicoFactory

pytestmark = pytest.mark.django_db

REQUEST_URL = reverse("v1:password-reset")
CONFIRM_URL = reverse("v1:password-reset-confirm")


def _link_parts(body: str) -> dict[str, str]:
    m = re.search(r"[?&]uid=([^&\s]+)&token=([^&\s]+)", body)
    assert m, f"no encontré uid/token en el correo:\n{body}"
    return {"uid": m.group(1), "token": m.group(2)}


class TestPasswordResetRequest:
    def test_existing_email_sends_link(self, api_client):
        user = TecnicoFactory(email="tecnico@clinic.test")

        response = api_client.post(REQUEST_URL, {"email": "Tecnico@Clinic.TEST"}, format="json")

        assert response.status_code == 200
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == [user.email]
        parts = _link_parts(mail.outbox[0].body)
        assert default_token_generator.check_token(user, parts["token"])

    def test_unknown_email_returns_200_without_email(self, api_client):
        response = api_client.post(REQUEST_URL, {"email": "nadie@clinic.test"}, format="json")

        assert response.status_code == 200
        assert len(mail.outbox) == 0

    def test_inactive_user_gets_no_email(self, api_client):
        TecnicoFactory(email="baja@clinic.test", is_active=False)

        response = api_client.post(REQUEST_URL, {"email": "baja@clinic.test"}, format="json")

        assert response.status_code == 200
        assert len(mail.outbox) == 0

    def test_invalid_email_format_returns_400(self, api_client):
        response = api_client.post(REQUEST_URL, {"email": "no-es-correo"}, format="json")
        assert response.status_code == 400


class TestPasswordResetConfirm:
    def _uid(self, user: User) -> str:
        return urlsafe_base64_encode(force_bytes(user.pk))

    def test_valid_token_changes_password(self, api_client):
        user = TecnicoFactory(email="reset@clinic.test")
        token = default_token_generator.make_token(user)

        response = api_client.post(
            CONFIRM_URL,
            {"uid": self._uid(user), "token": token, "new_password": "Nuevapass1!"},
            format="json",
        )

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.check_password("Nuevapass1!")

    def test_token_is_single_use(self, api_client):
        user = TecnicoFactory()
        token = default_token_generator.make_token(user)
        payload = {"uid": self._uid(user), "token": token, "new_password": "Nuevapass1!"}

        assert api_client.post(CONFIRM_URL, payload, format="json").status_code == 200
        # El token deja de ser válido tras cambiar la contraseña.
        second = api_client.post(
            CONFIRM_URL,
            {"uid": self._uid(user), "token": token, "new_password": "Otrapass2!"},
            format="json",
        )
        assert second.status_code == 400

    def test_bad_token_returns_400(self, api_client):
        user = TecnicoFactory()
        response = api_client.post(
            CONFIRM_URL,
            {"uid": self._uid(user), "token": "token-invalido", "new_password": "Nuevapass1!"},
            format="json",
        )
        assert response.status_code == 400

    def test_bad_uid_returns_400(self, api_client):
        user = TecnicoFactory()
        response = api_client.post(
            CONFIRM_URL,
            {"uid": "xxxx", "token": default_token_generator.make_token(user), "new_password": "Nuevapass1!"},
            format="json",
        )
        assert response.status_code == 400

    def test_weak_password_returns_400(self, api_client):
        user = TecnicoFactory()
        response = api_client.post(
            CONFIRM_URL,
            {
                "uid": self._uid(user),
                "token": default_token_generator.make_token(user),
                "new_password": "solominusculas",
            },
            format="json",
        )
        assert response.status_code == 400

    def test_confirm_mismatch_returns_400(self, api_client):
        user = TecnicoFactory()
        response = api_client.post(
            CONFIRM_URL,
            {
                "uid": self._uid(user),
                "token": default_token_generator.make_token(user),
                "new_password": "Nuevapass1!",
                "confirm_new_password": "Distinta9!",
            },
            format="json",
        )
        assert response.status_code == 400
        assert "confirm_new_password" in response.data
