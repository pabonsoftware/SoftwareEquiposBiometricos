from django_filters import rest_framework as filters
from rest_framework import viewsets
from rest_framework.permissions import BasePermission, IsAuthenticated

from apps.audit.models import AuditLog

from .serializers import AuditLogSerializer

# RFN009 §12: la consulta de logs se limita a roles autorizados.
_AUDIT_READER_ROLES = frozenset({"admin", "coordinador"})


class IsAuditReader(BasePermission):
    message = "No tienes permiso para consultar la auditoría."

    def has_permission(self, request, view) -> bool:
        u = getattr(request, "user", None)
        return bool(
            u and u.is_authenticated and getattr(u, "role", None) in _AUDIT_READER_ROLES
        )


class AuditLogFilter(filters.FilterSet):
    actor = filters.NumberFilter(field_name="actor_id")
    action = filters.CharFilter(field_name="action", lookup_expr="iexact")
    model_label = filters.CharFilter(field_name="model_label", lookup_expr="iexact")
    object_id = filters.CharFilter(field_name="object_id")
    created_at_after = filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_at_before = filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")

    class Meta:
        model = AuditLog
        fields = (
            "actor",
            "action",
            "model_label",
            "object_id",
            "created_at_after",
            "created_at_before",
        )


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Consulta del rastro de auditoría (RFN009). Solo lectura, solo Admin y
    Coordinador. Los `AuditLog` los crea `AuditLogMixin` / `log_audit_event`."""

    queryset = AuditLog.objects.select_related("actor")
    serializer_class = AuditLogSerializer
    permission_classes = (IsAuthenticated, IsAuditReader)
    filterset_class = AuditLogFilter
    search_fields = ("object_repr", "model_label", "actor__username")
    ordering_fields = ("created_at",)
    ordering = ("-created_at",)
