"""
URLs de la API v1.

A medida que se creen las apps de dominio, se irán incluyendo aquí, por ejemplo:
    path("equipment/", include("apps.equipment.api.v1.urls")),
"""
from django.urls import include, path
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenRefreshView,
    TokenVerifyView,
)

from api.v1.common.views import (
    CookieTokenLogoutView,
    CookieTokenObtainPairView,
    CookieTokenRefreshView,
    ThrottledTokenObtainPairView,
)

app_name = "v1"

urlpatterns = [
    # JWT auth "clásico": tokens en el body. Para clientes sin cookies del
    # navegador (app móvil, Postman, scripts).
    path("auth/token/", ThrottledTokenObtainPairView.as_view(), name="token-obtain"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/token/verify/", TokenVerifyView.as_view(), name="token-verify"),
    path("auth/token/blacklist/", TokenBlacklistView.as_view(), name="token-blacklist"),
    # JWT vía cookies httpOnly + CSRF. Solo para el frontend web — ver
    # api/v1/common/views.py para el porqué de la separación de endpoints.
    path(
        "auth/token/cookie/",
        CookieTokenObtainPairView.as_view(),
        name="token-obtain-cookie",
    ),
    path(
        "auth/token/cookie/refresh/",
        CookieTokenRefreshView.as_view(),
        name="token-refresh-cookie",
    ),
    path(
        "auth/token/cookie/logout/",
        CookieTokenLogoutView.as_view(),
        name="token-logout-cookie",
    ),
    # Domain routes
    path("users/", include(("api.v1.users.urls", "users"), namespace="users")),
    path("branches/", include(("api.v1.branches.urls", "branches"), namespace="branches")),
    path("catalog/", include(("api.v1.catalog.urls", "catalog"), namespace="catalog")),
    path("equipment/", include(("api.v1.equipment.urls", "equipment"), namespace="equipment")),
    path(
        "maintenance/",
        include(("api.v1.maintenance.urls", "maintenance"), namespace="maintenance"),
    ),
    path(
        "scheduling/",
        include(("api.v1.scheduling.urls", "scheduling"), namespace="scheduling"),
    ),
    path(
        "failures/",
        include(("api.v1.failures.urls", "failures"), namespace="failures"),
    ),
    path(
        "dashboard/",
        include(("api.v1.dashboard.urls", "dashboard"), namespace="dashboard"),
    ),
]
