from django.urls import re_path

from .consumers import NotificationConsumer

# `re_path` está tipado para vistas HTTP; con una app ASGI (channels) el
# runtime funciona igual pero pyright/pylance se queja del tipo → ignore local.
websocket_urlpatterns = [
    re_path(r"^ws/notifications/$", NotificationConsumer.as_asgi()),  # type: ignore[arg-type]
]
