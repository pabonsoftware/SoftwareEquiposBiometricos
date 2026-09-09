from __future__ import annotations

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from api.v1.helpers.semaforizacion import SemaphoreStatus


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_schedule_notification(self, schedule_id: int) -> str:
    from .models import MaintenanceSchedule

    try:
        schedule = (
            MaintenanceSchedule.objects.select_related(
                "equipment", "equipment__branch"
            ).get(pk=schedule_id)
        )
    except MaintenanceSchedule.DoesNotExist:
        return "schedule_not_found"

    equipment = schedule.equipment
    branch = equipment.branch

    recipients = list(getattr(settings, "MAINTENANCE_NOTIFICATION_EMAILS", []) or [])
    if branch.email:
        recipients.append(branch.email)
    recipients = list({r for r in recipients if r})
    if not recipients:
        return "no_recipients"

    context = {
        "schedule": schedule,
        "equipment": equipment,
        "branch": branch,
    }
    subject = (
        f"[Biometric] Mantenimiento programado: {equipment.asset_tag} "
        f"({schedule.scheduled_date.isoformat()})"
    )
    body_text = render_to_string("scheduling/email/schedule_notification.txt", context)
    body_html = render_to_string("scheduling/email/schedule_notification.html", context)

    message = EmailMultiAlternatives(
        subject=subject,
        body=body_text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=recipients,
    )
    message.attach_alternative(body_html, "text/html")

    try:
        message.send(fail_silently=False)
    except Exception as exc:
        raise self.retry(exc=exc) from exc

    schedule.notified_at = timezone.now()
    schedule.save(update_fields=["notified_at", "updated_at"])

    # Aviso en tiempo real (src/types/notifications.ts → ScheduleEmailSentEvent).
    from apps.realtime.events import broadcast_notification

    broadcast_notification(
        {
            "type": "schedule_email_sent",
            "schedule_id": schedule.id,
            "equipment_asset_tag": equipment.asset_tag,
            "scheduled_date": schedule.scheduled_date.isoformat(),
            "branch_name": branch.name,
            "subject": subject,
            "sent_at": schedule.notified_at.isoformat(),
        }
    )
    return "sent"


@shared_task
def scan_maintenance_alerts() -> dict:
    """HU011 / HU015 — genera alertas de los agendamientos preventivos que están
    🟡 (por vencer) o 🔴 (vencidos), reutilizando el semáforo RF010.

    Idempotente: la constraint parcial `uniq_open_alert_per_schedule_type` evita
    duplicar una alerta abierta. Un 🟡 que pasa a 🔴 genera además la de OVERDUE
    (escalamiento).
    """
    from .models import (
        MaintenanceAlert,
        MaintenanceAlertType,
        MaintenanceSchedule,
        ScheduledMaintenanceKind,
    )

    today = timezone.localdate()
    _TYPE_BY_STATUS = {
        SemaphoreStatus.YELLOW: MaintenanceAlertType.DUE_SOON,
        SemaphoreStatus.RED: MaintenanceAlertType.OVERDUE,
    }

    pending = (
        MaintenanceSchedule.objects.filter(
            is_completed=False,
            kind__in=[
                ScheduledMaintenanceKind.PREVENTIVE,
                ScheduledMaintenanceKind.CALIBRATION,
            ],
        )
        .select_related("equipment")
    )

    created = 0
    for schedule in pending:
        alert_type = _TYPE_BY_STATUS.get(schedule.semaphore)
        if alert_type is None:
            continue
        # Una sola alerta por (agendamiento, tipo) en toda su vida: si ya se
        # generó —aunque esté atendida— no se vuelve a avisar. El escalamiento
        # 🟡→🔴 sí genera una nueva porque es otro `alert_type`.
        if schedule.alerts.filter(alert_type=alert_type).exists():
            continue

        days = (schedule.scheduled_date - today).days
        message = (
            f"El {schedule.get_kind_display().lower()} de "
            f"{schedule.equipment.asset_tag} "
            + (
                f"vence en {days} día(s)."
                if days >= 0
                else f"está vencido hace {abs(days)} día(s)."
            )
        )
        MaintenanceAlert.objects.create(
            schedule=schedule,
            equipment=schedule.equipment,
            alert_type=alert_type,
            due_date=schedule.scheduled_date,
            message=message,
        )
        created += 1

    return {"scanned": len(pending), "created": created}
