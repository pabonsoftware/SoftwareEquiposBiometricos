"""WebSocket de notificaciones (`/ws/notifications/`)."""
import pytest
from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from rest_framework_simplejwt.tokens import AccessToken

from apps.realtime.consumers import AUTH_CLOSE_CODE, NOTIFICATION_GROUP
from apps.realtime.events import broadcast_notification, notify_user
from apps.realtime.middleware import JWTCookieAuthMiddleware
from apps.realtime.routing import websocket_urlpatterns
from apps.users.tests.factories import IngenieroFactory

# El app ASGI real (con auth por cookie JWT), sin el OriginValidator para no
# pelear con los Host headers en el test.
ws_app = JWTCookieAuthMiddleware(URLRouter(websocket_urlpatterns))


def _cookie_header(user) -> list[tuple[bytes, bytes]]:
    token = str(AccessToken.for_user(user))
    return [(b"cookie", f"access_token={token}".encode())]


@database_sync_to_async
def _make_user():
    return IngenieroFactory()


@database_sync_to_async
def _broadcast(payload):
    broadcast_notification(payload)


@database_sync_to_async
def _notify_user(uid, payload):
    notify_user(uid, payload)


async def test_anonymous_is_rejected_with_auth_code():
    comm = WebsocketCommunicator(ws_app, "/ws/notifications/")
    connected, _ = await comm.connect()
    assert connected  # se acepta y luego se cierra
    msg = await comm.receive_output()
    assert msg["type"] == "websocket.close"
    assert msg["code"] == AUTH_CLOSE_CODE
    await comm.disconnect()


# `transaction=True`: los tests async tocan la BD desde otro hilo/conexión;
# con la transacción normal de pytest-django el usuario creado no sería visible
# y además quedaría sin rollback contaminando los conteos de otros tests.
@pytest.mark.django_db(transaction=True)
class TestAuthenticatedConsumer:
    async def test_connects_and_receives_broadcast(self):
        user = await _make_user()
        comm = WebsocketCommunicator(
            ws_app, "/ws/notifications/", headers=_cookie_header(user)
        )
        connected, _ = await comm.connect()
        assert connected

        await _broadcast({"type": "schedule_email_sent", "schedule_id": 7})
        assert await comm.receive_json_from() == {
            "type": "schedule_email_sent",
            "schedule_id": 7,
        }
        await comm.disconnect()

    async def test_user_scoped_notification(self):
        user = await _make_user()
        comm = WebsocketCommunicator(
            ws_app, "/ws/notifications/", headers=_cookie_header(user)
        )
        assert (await comm.connect())[0]

        await _notify_user(user.id, {"type": "x", "n": 1})
        assert await comm.receive_json_from() == {"type": "x", "n": 1}
        await comm.disconnect()


def test_broadcast_notification_reaches_subscribed_channel():
    layer = get_channel_layer()
    assert layer is not None
    name = async_to_sync(layer.new_channel)()
    async_to_sync(layer.group_add)(NOTIFICATION_GROUP, name)

    broadcast_notification({"type": "ping", "v": 2})

    got = async_to_sync(layer.receive)(name)
    assert got["type"] == "notification.message"
    assert got["payload"] == {"type": "ping", "v": 2}
