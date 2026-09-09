from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.equipment.models import Equipment, EquipmentStatus
from apps.maintenance.models import MaintenanceRecord
from apps.scheduling.models import (
    RECURRING_KINDS,
    MaintenanceAlert,
    MaintenanceSchedule,
)
from apps.users.models import User


class _AssignedUserSerializer(serializers.ModelSerializer):
    """Representación mínima del usuario asignado (read-only, anidada)."""

    full_name = serializers.SerializerMethodField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "full_name", "role", "role_display")

    def get_full_name(self, obj: User) -> str:
        return f"{obj.first_name} {obj.last_name}".strip()


class _MaintenanceRecordMiniSerializer(serializers.ModelSerializer):
    """Representación mínima del mantenimiento que cumplió un agendamiento."""

    class Meta:
        model = MaintenanceRecord
        fields = ("id", "kind", "date", "description", "cost")


class MaintenanceScheduleSerializer(serializers.ModelSerializer):
    equipment_asset_tag = serializers.CharField(source="equipment.asset_tag", read_only=True)
    branch_name = serializers.CharField(source="equipment.branch.name", read_only=True)
    # Queryset completo (sin el `limit_choices_to` del modelo) para que la
    # validación de rol/actividad la hagan `validate_assigned_*` con mensajes
    # en español en vez del "clave primaria inválida" genérico.
    assigned_engineer = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )
    assigned_technician = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )
    assigned_engineer_detail = _AssignedUserSerializer(
        source="assigned_engineer", read_only=True
    )
    assigned_technician_detail = _AssignedUserSerializer(
        source="assigned_technician", read_only=True
    )
    maintenance_record = serializers.SerializerMethodField()
    maintenance_record_detail = serializers.SerializerMethodField()
    # Semáforo del agendamiento (RF010 / supervisión HU021).
    semaphore = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceSchedule
        fields = (
            "id",
            "equipment",
            "equipment_asset_tag",
            "branch_name",
            "kind",
            "scheduled_date",
            "semaphore",
            "notes",
            "assigned_engineer",
            "assigned_engineer_detail",
            "assigned_technician",
            "assigned_technician_detail",
            "notified_at",
            "is_completed",
            "auto_generated",
            "generated_from",
            "maintenance_record",
            "maintenance_record_detail",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "equipment_asset_tag",
            "branch_name",
            "semaphore",
            "assigned_engineer_detail",
            "assigned_technician_detail",
            "notified_at",
            "auto_generated",
            "generated_from",
            "maintenance_record",
            "maintenance_record_detail",
            "created_at",
            "updated_at",
        )

    def get_semaphore(self, obj) -> dict:
        status = obj.semaphore
        return {"code": status.value, "label": str(status.label)}

    def _record(self, obj):
        # Acceso seguro al reverso OneToOne: si no hay vínculo, devuelve None
        # en lugar de levantar RelatedObjectDoesNotExist.
        return getattr(obj, "maintenance_record", None)

    def get_maintenance_record(self, obj):
        record = self._record(obj)
        return record.id if record is not None else None

    def get_maintenance_record_detail(self, obj):
        record = self._record(obj)
        if record is None:
            return None
        return _MaintenanceRecordMiniSerializer(record, context=self.context).data

    def validate_equipment(self, value):
        if value.status == EquipmentStatus.INACTIVE:
            raise serializers.ValidationError(
                _("El equipo no está disponible para programación.")
            )
        return value

    def validate_scheduled_date(self, value):
        if self.instance is None and value < timezone.localdate():
            raise serializers.ValidationError(
                _("La fecha programada no puede ser pasada.")
            )
        return value

    def validate_notes(self, value):
        return value.strip() if value else value

    def validate_assigned_engineer(self, value):
        if value is None:
            return value
        if not value.is_active:
            raise serializers.ValidationError(
                _("El usuario asignado no está activo.")
            )
        if value.role != User.Role.INGENIERO:
            raise serializers.ValidationError(
                _("El usuario asignado debe tener el rol de ingeniero biomédico.")
            )
        return value

    def validate_assigned_technician(self, value):
        if value is None:
            return value
        if not value.is_active:
            raise serializers.ValidationError(
                _("El usuario asignado no está activo.")
            )
        if value.role != User.Role.INGENIERO:
            raise serializers.ValidationError(
                _("El responsable de ejecución debe tener el rol de ingeniero biomédico.")
            )
        return value


class GenerateAnnualPlanSerializer(serializers.Serializer):
    """Body de POST /maintenances/generate-plan/ (RF006 — cronograma anual)."""

    equipment = serializers.PrimaryKeyRelatedField(queryset=Equipment.objects.all())
    year = serializers.IntegerField(min_value=2020, max_value=2100)
    kind = serializers.ChoiceField(choices=list(RECURRING_KINDS.keys()))
    start_date = serializers.DateField(required=False)

    def validate(self, attrs):
        equipment = attrs["equipment"]
        field = RECURRING_KINDS[attrs["kind"]]
        if not getattr(equipment, field, None):
            raise serializers.ValidationError(
                _("El equipo no tiene configurada la frecuencia para este tipo de mantenimiento.")
            )
        start = attrs.get("start_date")
        if start and start.year != attrs["year"]:
            raise serializers.ValidationError(
                {"start_date": _("La fecha de inicio debe estar dentro del año indicado.")}
            )
        return attrs


class MaintenanceAlertSerializer(serializers.ModelSerializer):
    equipment_asset_tag = serializers.CharField(
        source="equipment.asset_tag", read_only=True
    )
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
    branch_name = serializers.CharField(source="equipment.branch.name", read_only=True)
    alert_type_display = serializers.CharField(
        source="get_alert_type_display", read_only=True
    )
    scheduled_date = serializers.DateField(source="schedule.scheduled_date", read_only=True)
    acknowledged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceAlert
        fields = (
            "id",
            "schedule",
            "scheduled_date",
            "equipment",
            "equipment_asset_tag",
            "equipment_name",
            "branch_name",
            "alert_type",
            "alert_type_display",
            "due_date",
            "message",
            "is_open",
            "created_at",
            "acknowledged_at",
            "acknowledged_by",
            "acknowledged_by_name",
            "acknowledgement_note",
        )
        # Las alertas las crea la tarea de escaneo, no el cliente; solo el
        # ViewSet las marca como atendidas vía su acción `acknowledge`.
        read_only_fields = (
            "id",
            "schedule",
            "equipment",
            "alert_type",
            "due_date",
            "message",
            "created_at",
            "acknowledged_at",
            "acknowledged_by",
            "acknowledgement_note",
        )

    def get_acknowledged_by_name(self, obj):
        if not obj.acknowledged_by:
            return None
        return obj.acknowledged_by.get_full_name() or obj.acknowledged_by.username


class AcknowledgeAlertSerializer(serializers.Serializer):
    """Body de POST /maintenance-alerts/{id}/acknowledge/."""

    note = serializers.CharField(required=False, allow_blank=True)
