"""
URLs de la API v1.

A medida que se creen las apps de dominio, se irán incluyendo aquí, por ejemplo:
    path("sites/", include("apps.sites.api.v1.urls")),
    path("equipment/", include("apps.equipment.api.v1.urls")),
"""
from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

app_name = "v1"

urlpatterns = [
    # JWT auth endpoints
    path("auth/token/", TokenObtainPairView.as_view(), name="token-obtain"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/token/verify/", TokenVerifyView.as_view(), name="token-verify"),
    # Las rutas de dominio se incluyen incrementalmente:
    # path("sites/", include("apps.sites.api.v1.urls")),
]
