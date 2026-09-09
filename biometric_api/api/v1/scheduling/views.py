from __future__ import annotations

from collections import defaultdict

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.common.mixins import AuditLogMixin
from api.v1.common.permissions import OperationalAccess
from apps.scheduling.models import MaintenanceAlert, MaintenanceSchedule
from apps.scheduling.services import generate_annual_plan
from apps.scheduling.tasks import send_schedule_notification

from .filters import MaintenanceAlertFilter, MaintenanceScheduleFilter
from .serializers import (
    AcknowledgeAlertSerializer,
    GenerateAnnualPlanSerializer,
    MaintenanceAlertSerializer,
    MaintenanceScheduleSerializer,
)


class MaintenanceScheduleViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """CRUD de agendamientos + acciones complete / notify / generate-plan / calendar."""

    queryset = MaintenanceSchedule.objects.all()
    serializer_class = MaintenanceScheduleSerializer
    # El Ingeniero elabora el plan anual de mantenimiento preventivo; el
    # Coordinador aprueba los cronogramas. El Usuario Operativo no accede (RF001).
    permission_classes = (IsAuthenticated, OperationalAccess)
    filterset_class = MaintenanceScheduleFilter
    search_fields = (
        "notes",
        "equipment__asset_tag",
        "equipment__name",
        "assigned_engineer__username",
        "assigned_engineer__first_name",
        "assigned_engineer__last_name",
        "assigned_technician__username",
        "assigned_technician__first_name",
        "assigned_technician__last_name",
    )
    ordering_fields = ("scheduled_date", "created_at")
    ordering = ("scheduled_date",)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        schedule = self.get_object()
        schedule.is_completed = True
        # El signal `rollover_completed_schedule` crea el siguiente (RF006) y
        # cierra las alertas abiertas.
        schedule.save(update_fields=["is_completed", "updated_at"])
        return Response(self.get_serializer(schedule).data)

    @action(detail=True, methods=["post"], url_path="notify")
    def notify(self, request, pk=None):
        schedule = self.get_object()
        send_schedule_notification.delay(schedule.pk)
        return Response({"detail": "notification_queued"}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="generate-plan")
    def generate_plan(self, request):
        """RF006 — genera el cronograma anual de un equipo según su frecuencia."""
        body = GenerateAnnualPlanSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        created = generate_annual_plan(
            equipment=body.validated_data["equipment"],
            year=body.validated_data["year"],
            kind=body.validated_data["kind"],
            start_date=body.validated_data.get("start_date"),
        )
        data = self.get_serializer(created, many=True).data
        return Response(
            {"created": len(created), "schedules": data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="calendar")
    def calendar(self, request):
        """RF006 — cronograma anual agrupado por mes. Respeta los filtros
        habituales (equipment, branch, kind…)."""
        try:
            year = int(request.query_params.get("year", timezone.localdate().year))
        except (TypeError, ValueError):
            return Response(
                {"year": "Debe ser un año válido."}, status=status.HTTP_400_BAD_REQUEST
            )

        qs = self.filter_queryset(self.get_queryset()).filter(
            scheduled_date__year=year
        )
        buckets: dict[int, list] = defaultdict(list)
        for schedule in qs:
            buckets[schedule.scheduled_date.month].append(schedule)

        months = [
            {
                "month": m,
                "items": self.get_serializer(buckets.get(m, []), many=True).data,
            }
            for m in range(1, 13)
        ]
        return Response({"year": year, "months": months})


class MaintenanceAlertViewSet(viewsets.ReadOnlyModelViewSet):
    """Panel de alertas de mantenimiento preventivo (HU011 / HU015).

    Solo lectura + acción `acknowledge`. Las alertas las genera la tarea
    periódica `scan_maintenance_alerts`, nunca el cliente.
    """

    queryset = MaintenanceAlert.objects.select_related(
        "schedule", "equipment", "equipment__branch", "acknowledged_by"
    )
    serializer_class = MaintenanceAlertSerializer
    permission_classes = (IsAuthenticated, OperationalAccess)
    filterset_class = MaintenanceAlertFilter
    search_fields = ("equipment__asset_tag", "equipment__name", "message")
    ordering_fields = ("created_at", "due_date")
    ordering = ("-created_at",)

    @action(detail=True, methods=["post"], url_path="acknowledge")
    def acknowledge(self, request, pk=None):
        alert = self.get_object()
        if not alert.is_open:
            return Response(
                {"detail": "La alerta ya fue atendida."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        body = AcknowledgeAlertSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        alert.acknowledge(request.user, note=body.validated_data.get("note", ""))
        return Response(self.get_serializer(alert).data)
