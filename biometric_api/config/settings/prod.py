"""
Settings de producción.

Endurece la seguridad y desactiva DEBUG. Las variables sensibles deben venir
exclusivamente de variables de entorno.
"""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import SECRET_KEY, env

DEBUG = False

# Validación del secret
if not SECRET_KEY or SECRET_KEY == "insecure-default-change-me":
    raise ImproperlyConfigured

# Seguridad
#
# Cada flag es override-able por variable de entorno. En el deploy real NO se
# setean, así que mantienen el default endurecido. Sirve para levantar la
# imagen de producción en local (detrás del proxy HTTP de Vite, sin TLS):
# poniendo DJANGO_SECURE_SSL_REDIRECT=False y DJANGO_SECURE_HSTS_SECONDS=0 el
# backend deja de redirigir a https y de mandar el header HSTS, que si no
# "envenena" el navegador (recuerda 127.0.0.1 = solo-HTTPS durante 30 días y
# rompe el dev server de Vite con ERR_SSL_PROTOCOL_ERROR).
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = env.bool("DJANGO_SESSION_COOKIE_SECURE", default=True)
CSRF_COOKIE_SECURE = env.bool("DJANGO_CSRF_COOKIE_SECURE", default=True)
AUTH_COOKIE_SECURE = env.bool("DJANGO_AUTH_COOKIE_SECURE", default=True)
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 30)  # 30 días
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", default=True)
SECURE_HSTS_PRELOAD = env.bool("DJANGO_SECURE_HSTS_PRELOAD", default=True)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
