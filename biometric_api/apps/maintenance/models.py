from django.conf import settings
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.equipment.models import Equipment

from .managers import MaintenanceRecordManager


class MaintenanceKind(models.TextChoices):
    PREVENTIVE = "PREVENTIVE", _("Mantenimiento preventivo")
    CORRECTIVE = "CORRECTIVE", _("Mantenimiento correctivo")
    REPAIR = "REPAIR", _("Reparación mayor")
    CALIBRATION = "CALIBRATION",_("Calibración")
    INSPECTION = "INSPECTION",_("Inspection")


class MaintenanceScheduleType(models.TextChoices):
    PREVENTIVE = "PREVENTIVE", _("Preventivo")
    CALIBRATION = "CALIBRATION",_("Calibración")
    INSPECTION = "INSPECTION",_("INSPECTION")

class MaintenanceScheduleStatus(models.TextChoices):
    ACTIVE = "ACTIVE",_("Activa")
    INACTIVE = "iNACTIVE", _("Inactiva")

class MaintenanceRecord(models.Model):
    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.PROTECT,
        related_name="maintenance_records",
        verbose_name=_("Equipo"),
    )
    kind = models.CharField(
        _("Tipo"),
        max_length=20,
        choices=MaintenanceKind.choices,
        db_index=True,
    )
    date = models.DateField(_("Fecha"), db_index=True)
    description = models.TextField(_("Descripción"))
    technician = models.CharField(_("Técnico"), max_length=120, blank=True)
    assigned_engineer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="engineering_records",
        limit_choices_to={"role": "ingeniero", "is_active": True},
        verbose_name=_("Ingeniero asignado"),
    )
    assigned_technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="technician_records",
        limit_choices_to={"role": "tecnico", "is_active": True},
        verbose_name=_("Técnico asignado"),
    )
    cost = models.DecimalField(
        _("Costo"),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )
    pdf_file = models.FileField(
        _("Archivo PDF"),
        upload_to="maintenance/pdf/",
        blank=True,
        validators=[FileExtensionValidator(allowed_extensions=["pdf"])],
    )
    scheduled_maintenance = models.OneToOneField(
        "scheduling.MaintenanceSchedule",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="maintenance_record",
        verbose_name=_("Agendamiento cumplido"),
    )
    created_at = models.DateTimeField(_("Creado"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Actualizado"), auto_now=True)

    objects = MaintenanceRecordManager()

    class Meta:
        verbose_name = _("Registro de mantenimiento")
        verbose_name_plural = _("Registros de mantenimiento")
        ordering = ["-date", "-created_at"]
        indexes = [
            models.Index(fields=["equipment", "-date"], name="maint_eq_date_idx"),
            models.Index(fields=["kind"], name="maint_kind_idx"),
            models.Index(fields=["date"], name="maint_date_idx"),
            models.Index(fields=["assigned_engineer"], name="maint_engineer_idx"),
            models.Index(fields=["assigned_technician"], name="maint_technician_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} - {self.equipment.asset_tag} - {self.date}"


class EquipmentMaintenanceSchedule(models.Model):

    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name='maintenance_schedules',
        verbose_name=_("Equipo"),
    )

    schedule_type = models.CharField(
        _("Tipo de mantenimiento"),
        max_length=30,
        choices=MaintenanceScheduleType.choices,
    )

    frequency_months = models.PositiveIntegerField(
        _("Frecuencia (meses)"),
        validators=[MinValueValidator(1)],
    )

    last_execution_date = models.DateField(
        _("Última Ejecución"),
        null=True,
        blank=True,
    )

    next_execution_date = models.DateField(
        _("Próxima ejecución"),
        null=True,
        blank=True,
        db_index=True,
    )

    status = models.CharField(
        _("Estado"),
        max_length=20,
        choices=MaintenanceScheduleStatus.choices,
        default=MaintenanceScheduleStatus.ACTIVE,
    )

    observations = models.TextField(
        _("Observaciones"),
        blank=True,
    )

    created_at = models.DateTimeField(
        _("Creado"),
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        _("Actualizado"),
        auto_now=True
    )

    class Meta:
        ordering = ["next_execution_date"]

        constraints = [
            models.UniqueConstraint(
                fields=["equipment","schedule_type"],
                name="unique_equipment_schedule_type",
            )
        ]

    def __str__(self):

        return (
            f"{self.equipment.name}"
            f"{self.get_schedule_type_display()}"
        )