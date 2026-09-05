from django.db import transaction
from django.db.models.signals import pre_delete
from django.dispatch import receiver

from .models import MaintenanceRecord


@receiver(pre_delete, sender=MaintenanceRecord)
def remove_pdf_file(sender, instance: MaintenanceRecord, **kwargs) -> None:
    """Borra el PDF asociado del storage al eliminar el registro."""
    if instance.pdf_file:
        pdf_file = instance.pdf_file
        transaction.on_commit(lambda:pdf_file.delete(save=False))

@receiver(pre_delete,sender=MaintenanceRecord)
def reopen_linked_schedule(sender,instance:MaintenanceRecord,**kwargs) -> None:
    """Si el registro estaba vinculado a un agendamiento, lo reabre al borrarse."""
    schedule = instance.scheduled_maintenance
    if schedule is not None and schedule.is_completed:
        schedule.is_completed = False
        schedule.save(update_fields=["is_completed","updated_at"])
        return "Registro abierto correctamente"
