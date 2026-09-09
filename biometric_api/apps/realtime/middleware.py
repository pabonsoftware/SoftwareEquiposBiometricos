"""Autenticación de los WebSockets por la cookie httpOnly `access_token`.

El frontend web se autentica con JWT en cookies httpOnly (no sesión de Django),
así que el `AuthMiddlewareStack` estándar de Channels (que lee la sesión) no
sirve. Este middleware lee la misma cookie que `CookieJWTAuthentication` y
resuelve el usuario con simplejwt.
"""
from __future__ import annotations

from http.cookies import SimpleCookie

from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth.models import AnonymousUser


def _cookies_from_scope(scope) -> SimpleCookie:
    jar: SimpleCookie = SimpleCookie()
    for name, value in scope.get("headers", []):
        if name == b"cookie":
            jar.load(value.decode("latin-1"))
            break
    return jar


@database_sync_to_async
def _user_from_token(raw_token: str):
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    auth = JWTAuthentication()
    try:
        validated = auth.get_validated_token(raw_token.encode("utf-8"))
        return auth.get_user(validated)
    except (InvalidToken, TokenError, KeyError):
        return AnonymousUser()


class JWTCookieAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        cookies = _cookies_from_scope(scope)
        morsel = cookies.get(settings.AUTH_COOKIE_ACCESS_NAME)
        if morsel and morsel.value:
            scope["user"] = await _user_from_token(morsel.value)
        else:
            scope["user"] = AnonymousUser()
        return await self.app(scope, receive, send)
