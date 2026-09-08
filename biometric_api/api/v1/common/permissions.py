"""Permisos por rol de la API v1.

Cada clase es una compuerta DRF (`BasePermission`) para uno de los roles del
catálogo `User.Role` (4.1. Roles del sistema): admin, coordinador, ingeniero,
usuario.

Modelo de uso:
- Se combinan con `IsAuthenticated` en `permission_classes` de cada viewset.
- Las clases `*Permission(s)` de rol dejan **leer** (métodos seguros: `GET`,
  `HEAD`, `OPTIONS`) a cualquier usuario autenticado y restringen la
  **escritura** (`POST`/`PUT`/`PATCH`/`DELETE`) al rol correspondiente.
- Cuando un recurso lo escribe más de un rol, se componen con `|`:
  `EngineerBiomedicalPermissions | CoordBiomedicalPermission`.
- `RestrictDeleteToManagement` (alias `HasRolePermission`) es el permiso
  transversal: cualquiera autenticado crea/edita y solo admin o coordinador
  elimina (`destroy`).
"""

from django.utils.translation import gettext_lazy as _
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.users.models import User

Role = User.Role

#: Roles con autoridad administrativa: los únicos que pueden eliminar recursos.
MANAGEMENT_ROLES = frozenset({Role.ADMIN, Role.COORDINADOR})


def _is_authenticated(request) -> bool:
    user = getattr(request, "user", None)
    return bool(user and user.is_authenticated)


class _RoleWritePermission(BasePermission):
    """Base de las compuertas por rol.

    - Lectura (`GET`/`HEAD`/`OPTIONS`): cualquier usuario autenticado.
    - Crear / editar (`POST`/`PUT`/`PATCH`): solo los roles de `roles`.
    - Eliminar (`DELETE`): solo `delete_roles` (por defecto, los roles con
      autoridad administrativa: admin, coordinador).
    """

    #: Roles autorizados a crear/editar. Lo define cada subclase.
    roles: frozenset = frozenset()
    #: Roles autorizados a eliminar. Por defecto, autoridad administrativa.
    delete_roles: frozenset = MANAGEMENT_ROLES

    def has_permission(self, request, view) -> bool:
        if not _is_authenticated(request):
            return False
        if request.method in SAFE_METHODS:
            return True
        role = request.user.role
        if request.method == "DELETE" or getattr(view, "action", None) == "destroy":
            return role in self.delete_roles
        return role in self.roles


class AdminPermissions(_RoleWritePermission):
    """Administrador del Sistema (4.1.1) — administración técnica del sistema y
    parametrización institucional: define el catálogo de roles y la matriz de
    permisos, crea/desactiva cuentas y asigna rol, vincula equipos a los
    usuarios operativos, administra sedes y ubicaciones, el catálogo de marcas
    y modelos y el alta administrativa de los equipos; ejecuta actualizaciones
    y respaldos y la configuración avanzada. No interviene en la gestión
    operativa ni en las decisiones o evidencias técnicas del mantenimiento;
    todo su acceso queda registrado en auditoría."""

    roles = frozenset({Role.ADMIN})
    message = _("Solo un administrador del sistema puede realizar esta acción.")


class CoordBiomedicalPermission(_RoleWritePermission):
    """Coordinador Biomédico (4.1.2) — aprueba los cronogramas y las solicitudes
    de mantenimiento, asigna responsables, prioriza los correctivos según
    criticidad, cierra formalmente las órdenes ejecutadas y consulta los
    indicadores de gestión."""

    roles = frozenset({Role.COORDINADOR})
    message = _("Solo un coordinador biomédico puede realizar esta acción.")


class EngineerBiomedicalPermissions(_RoleWritePermission):
    """Ingeniero Biomédico (4.1.3) — reúne la evaluación técnica y la ejecución
    del mantenimiento: emite la evaluación técnica de los reportes en falla
    (diagnóstico preliminar, recomendación y prioridad), mantiene la
    información técnica de las hojas de vida y las fichas OEM, genera los
    códigos QR y elabora el plan anual de mantenimiento preventivo; ejecuta las
    órdenes preventivas y correctivas asignadas y documenta la intervención
    (actividades, diagnóstico encontrado, repuestos, mediciones, estado final y
    evidencia fotográfica). No autoriza las órdenes ni aprueba/cierra
    formalmente sus propias intervenciones; eso corresponde al Coordinador."""

    roles = frozenset({Role.INGENIERO})
    message = _("Solo un ingeniero biomédico puede realizar esta acción.")


class UserOperative(_RoleWritePermission):
    """Usuario Operativo — personal asistencial que opera los equipos: consulta
    los equipos asignados, reporta las fallas detectadas durante el uso y
    consulta el estado de los reportes que ha generado. No emite diagnóstico
    técnico ni registra reparaciones o repuestos."""

    roles = frozenset({Role.USUARIO})
    message = _("Solo un usuario operativo puede realizar esta acción.")


class RestrictDeleteToManagement(BasePermission):
    """Cualquier usuario autenticado puede crear/editar; solo admin o
    coordinador pueden eliminar (acción `destroy`)."""

    message = _(
        "Solo un administrador del sistema o un coordinador puede eliminar este recurso."
    )

    def has_permission(self, request, view) -> bool:
        if getattr(view, "action", None) != "destroy":
            return True
        u = request.user
        return bool(u and u.is_authenticated and u.role in MANAGEMENT_ROLES)


#: Alias heredado — `api/v1/catalog/views.py` y `api/v1/scheduling/views.py`
#: importan este nombre; el comportamiento es el de `RestrictDeleteToManagement`.
HasRolePermission = RestrictDeleteToManagement
