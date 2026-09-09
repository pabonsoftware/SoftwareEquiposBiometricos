from channels.generic.websocket import AsyncJsonWebsocketConsumer

#: Grupo al que se suscriben todos los clientes conectados.
NOTIFICATION_GROUP = "notifications"

#: Código de cierre para "sesión inválida / expirada". El frontend lo reconoce
#: (src/lib/websocket.ts) y NO reintenta la conexión.
AUTH_CLOSE_CODE = 4401


def _user_group(user_id: int) -> str:
    """Grupo por usuario, para notificaciones dirigidas a una sola persona."""
    return f"{NOTIFICATION_GROUP}.user.{user_id}"


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """Canal solo servidor→cliente para `/ws/notifications/`.

    El cliente no envía nada útil; el servidor empuja eventos ya calculados
    (ver `apps/realtime/events.py`).
    """

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            # Aceptar + cerrar con código propio: así el cliente distingue
            # "no autenticado" (no reintentar) de "servidor caído" (reintentar).
            await self.accept()
            await self.close(code=AUTH_CLOSE_CODE)
            return

        await self.channel_layer.group_add(NOTIFICATION_GROUP, self.channel_name)
        await self.channel_layer.group_add(_user_group(user.id), self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if self.channel_layer is None:
            return
        await self.channel_layer.group_discard(NOTIFICATION_GROUP, self.channel_name)
        user = self.scope.get("user")
        if user is not None and getattr(user, "is_authenticated", False):
            await self.channel_layer.group_discard(
                _user_group(user.id), self.channel_name
            )

    async def receive_json(self, content, **kwargs):
        # El canal es de una sola vía; se ignora lo que mande el cliente.
        pass

    async def notification_message(self, event):
        """Handler del `type: "notification.message"` que emite events.py."""
        await self.send_json(event["payload"])
