from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from apps.maintenance.models import MaintenanceKind, MaintenanceRecord

from .models import MaintenanceSchedule
from .services import refresh_equipment_next_dates, roll_schedule_forward
from .tasks import send_schedule_notification

# Tipos de registro que mueven las "próximas fechas" del equipo (RF006).
_RECURRING_RECORD_KINDS = {MaintenanceKind.PREVENTIVE, MaintenanceKind.CALIBRATION}


@receiver(post_save, sender=MaintenanceSchedule)
def trigger_schedule_notification(sender, instance: MaintenanceSchedule, created: bool, **kwargs):
    if created and not instance.auto_generated:
        # celery no trae type hints completos: pyright infiere `.delay` como list[str].
        send_schedule_notification.delay(instance.pk)  # pyright: ignore[reportCallIssue]


@receiver(post_save, sender=MaintenanceSchedule)
def rollover_completed_schedule(sender, instance: MaintenanceSchedule, **kwargs):
    """Al cumplir un agendamiento recurrente: crea el siguiente (RF006) y cierra
    sus alertas abiertas (HU011/HU015). Idempotente."""
    if not instance.is_completed:
        return

    instance.alerts.filter(acknowledged_at__isnull=True).update(
        acknowledged_at=timezone.now(),
        acknowledgement_note="Cerrada automáticamente: el mantenimiento se cumplió.",
    )

    if not instance.rollovers.exists():
        roll_schedule_forward(instance)


@receiver(post_save, sender=MaintenanceRecord)
def refresh_next_dates_on_record(sender, instance: MaintenanceRecord, **kwargs):
    """Registrar un preventivo/calibración recalcula la próxima fecha del equipo
    (RF006), que es la que lee el semáforo RF010."""
    if instance.kind in _RECURRING_RECORD_KINDS:
        refresh_equipment_next_dates(instance.equipment)
