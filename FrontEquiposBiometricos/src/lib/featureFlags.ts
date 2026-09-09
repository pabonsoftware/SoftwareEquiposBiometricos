/**
 * Banderas de funcionalidad de la aplicación.
 *
 * PUBLIC_REGISTRATION_ENABLED
 *   Registro público de usuarios (formulario /registro). Deshabilitado por el
 *   momento: las cuentas las crea un administrador desde Admin → Usuarios.
 *   Cambiar a `true` para volver a exponer el formulario de auto-registro.
 *
 * REALTIME_NOTIFICATIONS_ENABLED
 *   Canal WebSocket `/ws/notifications/` para toasts en tiempo real
 *   (ver src/lib/websocket.ts y src/context/NotificationContext.tsx).
 *   Habilitado: el backend lo expone vía django-channels
 *   (apps/realtime/: NotificationConsumer + routing + JWTCookieAuthMiddleware,
 *   config/asgi.py con ProtocolTypeRouter). La auth viaja por la cookie
 *   httpOnly `access_token` en el handshake. Requiere Redis para
 *   CHANNEL_LAYERS (docker compose ya lo trae).
 */
export const PUBLIC_REGISTRATION_ENABLED = false;

export const REALTIME_NOTIFICATIONS_ENABLED = true;
