from django.db.models.deletion import ProtectedError
from django.utils.translation import gettext_lazy as _
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.common.permissions import RestrictDeleteToManagement
from apps.branches.models import Branch

from .filters import BranchFilter
from .serializers import BranchSerializer


class BranchViewSet(viewsets.ModelViewSet):
    """CRUD endpoints for clinic branches."""

    queryset = Branch.objects.all()
    serializer_class = BranchSerializer
    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)
    filterset_class = BranchFilter
    search_fields = ("name", "address")
    ordering_fields = ("name", "city", "created_at")
    ordering = ("name",)

    def destroy(self,request,*args,**kwargs):
        instance = self.get_object()
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {"detail":_("No se puede eliminar la sede porque tiene equipos asociados.")},
                status=status.HTTP_409_CONFLICT
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
