"""Genera las alertas de mantenimiento preventivo (HU011 / HU015).

Envuelve la tarea Celery `scan_maintenance_alerts` para poder correrla a mano o
desde cron sin un worker:

    python manage.py scan_maintenance_alerts

En producción la corre Celery Beat a diario (ver CELERY_BEAT_SCHEDULE).
"""
from django.core.management.base import BaseCommand

from apps.scheduling.tasks import scan_maintenance_alerts


class Command(BaseCommand):
    help = "Escanea agendamientos por vencer/vencidos y crea alertas."

    def handle(self, *args, **options):
        result = scan_maintenance_alerts()
        self.stdout.write(
            self.style.SUCCESS(
                f"Escaneados: {result['scanned']} · alertas creadas: {result['created']}"
            )
        )
