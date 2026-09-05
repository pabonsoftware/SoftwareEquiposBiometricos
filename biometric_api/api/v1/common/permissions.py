from django.utils.translation import gettext_lazy as _
from rest_framework.permissions import BasePermission

from apps.users.models import User

MANAGEMENT_ROLES = {User.Role.SUPERADMIN, User.Role.ADMIN, User.Role.COORDINADOR}


class RestrictDeleteToManagement(BasePermission):
    """Cualquier usuario autenticado puede crear/editar; solo superadmin,
    admin o coordinador pueden eliminar (acción `destroy`)."""

    message = _(
        "Solo un superadministrador, administrador o coordinador puede eliminar este recurso."
    )

    def has_permission(self, request, view) -> bool:
        if getattr(view, "action", None) != "destroy":
            return True
        u = request.user
        return bool(u and u.is_authenticated and u.role in MANAGEMENT_ROLES)
