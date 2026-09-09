from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from api.v1.helpers.semaforizacion import SemaphoreStatus, calculate_status
from apps.equipment.models import Equipment

from .managers import MaintenanceScheduleManager


class ScheduledMaintenanceKind(models.TextChoices):
    PREVENTIVE = "PREVENTIVE", _("Mantenimiento preventivo")
    CALIBRATION = "CALIBRATION", _("Calibración / aseguramiento metrológico")
    REPAIR = "REPAIR", _("Reparación programada")


#: Tipos de agendamiento que participan de la recurrencia automática (RF006).
#: Cada uno se calcula desde una frecuencia distinta del equipo.
RECURRING_KINDS = {
    ScheduledMaintenanceKind.PREVENTIVE: "maintenance_frequency_months",
    ScheduledMaintenanceKind.CALIBRATION: "calibration_frequency_months",
}


class MaintenanceSchedule(models.Model):
    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.PROTECT,
        related_name="schedules",
        verbose_name=_("Equipo"),
    )
    kind = models.CharField(
        _("Tipo"),
        max_length=20,
        choices=ScheduledMaintenanceKind.choices,
        db_index=True,
    )
    scheduled_date = models.DateField(_("Fecha programada"), db_index=True)
    notes = models.TextField(_("Notas"), blank=True)
    assigned_engineer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="engineering_schedules",
        limit_choices_to={"role": "ingeniero", "is_active": True},
        verbose_name=_("Ingeniero asignado"),
    )
    assigned_technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="technician_schedules",
        limit_choices_to={"role": "ingeniero", "is_active": True},
        verbose_name=_("Responsable de ejecución"),
    )
    notified_at = models.DateTimeField(_("Notificado el"), null=True, blank=True)
    is_completed = models.BooleanField(_("Completado"), default=False, db_index=True)
    # RF006: se marca cuando el agendamiento lo creó la recurrencia (al cumplir
    # el anterior) o el generador de cronograma anual, no una persona.
    auto_generated = models.BooleanField(_("Generado automáticamente"), default=False)
    generated_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rollovers",
        verbose_name=_("Generado a partir de"),
    )
    created_at = models.DateTimeField(_("Creado"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Actualizado"), auto_now=True)

    objects = MaintenanceScheduleManager()

    # Ventana de aviso del semáforo del agendamiento (RF010 / HU021).
    WARNING_DAYS = 7

    class Meta:
        verbose_name = _("Agendamiento de mantenimiento")
        verbose_name_plural = _("Agendamientos de mantenimiento")
        ordering = ["scheduled_date"]
        indexes = [
            models.Index(fields=["equipment", "scheduled_date"], name="sched_eq_date_idx"),
            models.Index(fields=["scheduled_date", "is_completed"], name="sched_date_comp_idx"),
            models.Index(fields=["assigned_engineer"], name="sched_engineer_idx"),
            models.Index(fields=["assigned_technician"], name="sched_technician_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} - {self.equipment.asset_tag} - {self.scheduled_date}"

    @property
    def semaphore(self) -> SemaphoreStatus:
        """Semáforo del agendamiento (RF010 / supervisión HU021).

        Completado → 🟢. Si no: fecha pasada → 🔴, próxima → 🟡, lejana → 🟢.
        Es la misma regla que usa el dashboard para 'vencidos' y 'próximos 7 días'.
        """
        return calculate_status(
            due_date=self.scheduled_date,
            today=timezone.localdate(),
            warning_days=self.WARNING_DAYS,
            completed=self.is_completed,
        )


class MaintenanceAlertType(models.TextChoices):
    DUE_SOON = "DUE_SOON", _("Próximo a vencer")
    OVERDUE = "OVERDUE", _("Vencido")


class MaintenanceAlert(models.Model):
    """Alerta automática de mantenimiento preventivo (HU011 / HU015).

    La genera la tarea periódica `scan_maintenance_alerts` a partir del semáforo
    del agendamiento. Persiste (a diferencia de los toasts): tiene panel,
    equipo, estado "atendida" e historial.
    """

    schedule = models.ForeignKey(
        MaintenanceSchedule,
        on_delete=models.CASCADE,
        related_name="alerts",
        verbose_name=_("Agendamiento"),
    )
    # Desnormalizado: permite filtrar/mostrar por equipo sin recorrer el schedule.
    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name="maintenance_alerts",
        verbose_name=_("Equipo"),
    )
    alert_type = models.CharField(
        _("Tipo de alerta"),
        max_length=20,
        choices=MaintenanceAlertType.choices,
        db_index=True,
    )
    due_date = models.DateField(_("Fecha de vencimiento"))
    message = models.TextField(_("Mensaje"), blank=True)
    created_at = models.DateTimeField(_("Generada el"), auto_now_add=True)
    acknowledged_at = models.DateTimeField(_("Atendida el"), null=True, blank=True)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acknowledged_alerts",
        verbose_name=_("Atendida por"),
    )
    acknowledgement_note = models.TextField(_("Nota de atención"), blank=True)

    class Meta:
        verbose_name = _("Alerta de mantenimiento")
        verbose_name_plural = _("Alertas de mantenimiento")
        ordering = ["-created_at"]
        constraints = [
            # A lo sumo una alerta ABIERTA por (agendamiento, tipo): la tarea de
            # escaneo no debe duplicar. Las ya atendidas quedan en el historial.
            models.UniqueConstraint(
                fields=["schedule", "alert_type"],
                condition=models.Q(acknowledged_at__isnull=True),
                name="uniq_open_alert_per_schedule_type",
            ),
        ]
        indexes = [
            models.Index(fields=["equipment", "-created_at"], name="alert_eq_created_idx"),
            models.Index(fields=["acknowledged_at"], name="alert_ack_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.get_alert_type_display()} · {self.equipment.asset_tag} · {self.due_date}"

    @property
    def is_open(self) -> bool:
        return self.acknowledged_at is None

    def acknowledge(self, user, note: str = "") -> None:
        self.acknowledged_at = timezone.now()
        self.acknowledged_by = user
        self.acknowledgement_note = (note or "").strip()
        self.save(
            update_fields=["acknowledged_at", "acknowledged_by", "acknowledgement_note"]
        )
