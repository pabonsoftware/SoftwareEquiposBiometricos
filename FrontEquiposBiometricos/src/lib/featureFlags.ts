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
 *   Deshabilitado: el backend todavía NO expone ese endpoint — no hay
 *   django-channels, ni consumers, ni routing ASGI (config/asgi.py es una
 *   app WSGI plana). Con el flag en `true` el cliente intenta conectar y
 *   recibe 404 en bucle. Cambiar a `true` cuando el backend implemente
 *   Channels + un NotificationConsumer que emita los eventos.
 */
export const PUBLIC_REGISTRATION_ENABLED = false;

export const REALTIME_NOTIFICATIONS_ENABLED = false;
