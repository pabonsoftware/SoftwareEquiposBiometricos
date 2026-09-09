from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.common.mixins import AuditLogMixin
from api.v1.common.permissions import (
    CoordBiomedicalPermission,
    EngineerBiomedicalPermissions,
    UserOperative,
)
from apps.audit.utils import AuditAction, log_audit_event
from apps.equipment.models import EquipmentWorkOrder, WorkOrderStatus, WorkOrderType
from apps.equipment.services import generate_work_order_number
from apps.failures.models import FailureRecord
from apps.users.models import User

from .filters import FailureRecordFilter
from .serializers import FailureRecordSerializer, ResolveFailureSerializer


class FailureRecordViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """CRUD de reportes de falla + acción `resolve` para marcarlos como resueltos."""

    queryset = FailureRecord.objects.select_related(
        "equipment", "equipment__branch", "corrective_work_order"
    )
    serializer_class = FailureRecordSerializer
    # Usuario Operativo reporta la falla; Ingeniero emite la evaluación
    # técnica (diagnóstico, recomendación) y Coordinador prioriza.
    permission_classes = (
        IsAuthenticated,
        UserOperative | EngineerBiomedicalPermissions | CoordBiomedicalPermission,
    )
    filterset_class = FailureRecordFilter
    search_fields = ("description", "resolution_notes", "equipment__asset_tag")
    ordering_fields = ("reported_at", "severity", "resolved_at")
    ordering = ("-reported_at",)

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, pk=None):
        failure = self.get_object()
        body = ResolveFailureSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        notes = body.validated_data.get("resolution_notes", "").strip()
        failure.mark_resolved(notes=notes)
        return Response(self.get_serializer(failure).data)

    @action(detail=True, methods=["post"], url_path="create-work-order")
    def create_work_order(self, request, pk=None):
        """RF007: genera la solicitud de mantenimiento correctivo a partir de la
        falla y conserva el vínculo Falla → Orden. La evaluación técnica la hace
        el Ingeniero; el Coordinador prioriza. El Usuario Operativo solo reporta."""
        if getattr(request.user, "role", None) not in (
            User.Role.INGENIERO,
            User.Role.COORDINADOR,
            User.Role.ADMIN,
        ):
            raise PermissionDenied(
                "Solo un ingeniero o un coordinador biomédico puede generar la orden correctiva."
            )

        failure = self.get_object()
        if failure.corrective_work_order_id is not None:
            return Response(
                {"detail": "La falla ya tiene una orden correctiva asociada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        equipment = failure.equipment
        extra = str(request.data.get("description") or "").strip()
        description = f"Correctivo por falla reportada el {failure.reported_at:%Y-%m-%d}: {failure.description}"
        if extra:
            description = f"{description}\n\n{extra}"

        work_order = EquipmentWorkOrder.objects.create(
            equipment=equipment,
            number=generate_work_order_number(equipment),
            service_type=WorkOrderType.CORRECTIVE,
            start_date=timezone.now(),
            description=description,
            status=WorkOrderStatus.PENDING,
        )
        failure.corrective_work_order = work_order
        failure.save(update_fields=["corrective_work_order", "updated_at"])

        log_audit_event(
            request.user,
            AuditAction.CREATE,
            work_order,
            request=request,
            changes={"source_failure": failure.pk, "service_type": WorkOrderType.CORRECTIVE},
        )
        return Response(self.get_serializer(failure).data, status=status.HTTP_201_CREATED)
