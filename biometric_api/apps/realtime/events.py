"""Emisión de notificaciones en tiempo real hacia los clientes WebSocket.

Se llama desde código síncrono (tareas Celery, señales, vistas). `payload` es
el objeto tal cual lo recibe el frontend (ver src/types/notifications.ts): debe
llevar un campo `type` que el consumidor use como discriminador.
"""
from __future__ import annotations

from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .consumers import NOTIFICATION_GROUP, _user_group


def _send(group: str, payload: dict[str, Any]) -> None:
    layer = get_channel_layer()
    if layer is None:  # sin CHANNEL_LAYERS configurado (p. ej. algún test)
        return
    async_to_sync(layer.group_send)(
        group,
        {"type": "notification.message", "payload": payload},
    )


def broadcast_notification(payload: dict[str, Any]) -> None:
    """Empuja `payload` a todos los clientes conectados."""
    _send(NOTIFICATION_GROUP, payload)


def notify_user(user_id: int, payload: dict[str, Any]) -> None:
    """Empuja `payload` solo a las conexiones de un usuario."""
    _send(_user_group(user_id), payload)
