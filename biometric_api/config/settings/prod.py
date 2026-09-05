"""
Settings de producción.

Endurece la seguridad y desactiva DEBUG. Las variables sensibles deben venir
exclusivamente de variables de entorno.
"""
from .base import *  # noqa: F401,F403

from django.core.exceptions import ImproperlyConfigured

DEBUG = False

# Validacion secret 
if not SECRET_KEY or SECRET_KEY == "insecure-default-change-me":
    raise ImproperlyConfigured

# Seguridad
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
AUTH_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30  # 30 días
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
