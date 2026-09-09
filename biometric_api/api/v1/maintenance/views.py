from rest_framework import viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated

from api.v1.common.mixins import AuditLogMixin
from api.v1.common.permissions import OperationalAccess
from apps.maintenance.models import MaintenanceRecord

from .filters import MaintenanceRecordFilter
from .serializers import MaintenanceRecordSerializer


class MaintenanceRecordViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """CRUD de registros históricos de mantenimiento, con upload de PDF opcional."""

    queryset = MaintenanceRecord.objects.all()
    serializer_class = MaintenanceRecordSerializer
    # El Ingeniero ejecuta y documenta la intervención; el Coordinador autoriza
    # la orden, coordina la asignación y gestiona el cierre formal. El Usuario
    # Operativo no ve los registros de mantenimiento (RF001).
    permission_classes = (IsAuthenticated, OperationalAccess)
    parser_classes = (JSONParser, MultiPartParser, FormParser)
    filterset_class = MaintenanceRecordFilter
    search_fields = (
        "description",
        "technician",
        "equipment__asset_tag",
        "assigned_engineer__username",
        "assigned_engineer__first_name",
        "assigned_engineer__last_name",
        "assigned_technician__username",
        "assigned_technician__first_name",
        "assigned_technician__last_name",
    )
    ordering_fields = ("date", "created_at", "cost")
    ordering = ("-date",)
