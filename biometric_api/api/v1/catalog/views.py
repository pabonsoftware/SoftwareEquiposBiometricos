from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.utils.translation import gettext_lazy as _
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.common.mixins import AuditAction, AuditLogMixin
from api.v1.common.permissions import AdminPermissions
from apps.catalog.models import Brand, EquipmentModel

from .filters import BrandFilter, EquipmentModelFilter
from .serializers import BrandSerializer, EquipmentModelSerializer


def _protected_destroy(view, request, message):
    instance = view.get_object()
    try:
        with transaction.atomic():
            view.audit_write(AuditAction.DELETE, instance)
            instance.delete()
    except ProtectedError:
        return Response({"detail": message}, status=status.HTTP_409_CONFLICT)
    return Response(status=status.HTTP_204_NO_CONTENT)


class BrandViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """CRUD de marcas. DELETE protegido si la marca tiene modelos asociados."""

    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    permission_classes = (IsAuthenticated, AdminPermissions)
    filterset_class = BrandFilter
    search_fields = ("name",)
    ordering_fields = ("name", "created_at")
    ordering = ("name",)

    def destroy(self, request, *args, **kwargs):
        return _protected_destroy(
            self,
            request,
            _("No se puede eliminar la marca porque tiene modelos asociados."),
        )


class EquipmentModelViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """CRUD de modelos de equipo. DELETE protegido si el modelo tiene equipos."""

    queryset = EquipmentModel.objects.select_related("brand")
    serializer_class = EquipmentModelSerializer
    permission_classes = (IsAuthenticated, AdminPermissions)
    filterset_class = EquipmentModelFilter
    search_fields = ("name", "description", "brand__name")
    ordering_fields = ("name", "brand__name", "created_at")
    ordering = ("brand__name", "name")

    def destroy(self, request, *args, **kwargs):
        return _protected_destroy(
            self,
            request,
            _("No se puede eliminar el modelo porque tiene equipos asociados."),
        )
