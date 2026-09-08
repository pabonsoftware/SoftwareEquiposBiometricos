from datetime import datetime, time

from django.db import transaction
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from django.utils import timezone

from apps.equipment.models import EquipmentWorkOrder
from apps.maintenance.models import MaintenanceKind, MaintenanceRecord
from apps.users.models import User

_WO_SERVICE_TYPE: dict[str, str] = {
    MaintenanceKind.PREVENTIVE: "PREVENTIVE",
    MaintenanceKind.CORRECTIVE: "CORRECTIVE",
    MaintenanceKind.REPAIR: "CORRECTIVE",
    MaintenanceKind.CALIBRATION: "CALIBRATION",
    MaintenanceKind.INSPECTION: "INSPECTION",
}

_RECORD_KIND_FROM_WO = {
    "PREVENTIVE":MaintenanceKind.PREVENTIVE,
    "CORRECTIVE":MaintenanceKind.CORRECTIVE,
    "CALIBRATION":MaintenanceKind.CALIBRATION,
    "INSTALLATION":MaintenanceKind.CORRECTIVE,
    "INSPECTION":MaintenanceKind.INSPECTION
}

_OPEN_STATUSES = ("PENDING","IN_PROGRESS")

def _unique_wo_number(record:MaintenanceRecord) -> str:
    base = f"OT-{timezone.localdate():%Y%m%d}-M{record.pk}"
    number,i = base, 2
    while EquipmentWorkOrder.objects.filter(number=number).exists():
        number = f"{base}{i}"
        i += 1
    return number

@receiver(post_save,sender=MaintenanceRecord)
def sync_work_order_from_record(sender,instance:MaintenanceRecord, **kwargs) -> None:
    if getattr(instance, "scheduled_maintenance_id", None):
        return
    if instance._from_standalone_work_order:
        return

    assignee = instance.assigned_technician or instance.assigned_engineer
    if assignee is None:
        return

    existing = EquipmentWorkOrder.objects.filter(maintenance_record=instance).first()
    if existing is not None:
        if (
            getattr(existing, "technician_id", None) != assignee.id
            and existing.status in _OPEN_STATUSES
        ):
            existing.technician = assignee
            existing.save(update_fields=["technician"])
        return

    start = instance.date or timezone.localdate()
    EquipmentWorkOrder.objects.create(
        equipment=instance.equipment,
        number=_unique_wo_number(instance),
        service_type=_WO_SERVICE_TYPE.get(instance.kind,"CORRECTIVE"),
        start_date=timezone.make_aware(datetime.combine(start, time(8, 0))),
        description=instance.description,
        technician=assignee,
        status="PENDING",
        maintenance_record=instance
    )

@receiver(post_save,sender=EquipmentWorkOrder)
def create_record_for_standalone_work_order(
    sender,instance:EquipmentWorkOrder,**kwargs
):
    if instance.maintenance_record is not None:
        return
    if instance.status != "FINISHED":
        return

    tech = instance.technician
    is_eng = tech is not None and tech.role == User.Role.INGENIERO
    wo_cost = getattr(instance, "cost", None)
    cost = None
    if wo_cost is not None:
        cost = (
            wo_cost.labor_cost
            + wo_cost.spare_parts_cost
            + wo_cost.transport_cost
            + wo_cost.other_cost
        )

    record = MaintenanceRecord(
        equipment=instance.equipment,
        kind=_RECORD_KIND_FROM_WO.get(instance.service_type, MaintenanceKind.CORRECTIVE),
        date=timezone.localdate(),
        description=instance.description,
        assigned_engineer=tech if is_eng else None,
        assigned_technician=tech if (tech and not is_eng) else None,
        cost=cost
    )

    record._from_standalone_work_order = True
    record.save()

    instance.maintenance_record = record
    instance.save(update_fields=["maintenance_record"])

@receiver(post_save,sender=EquipmentWorkOrder)
def close_record_when_work_order_finished(
    sender,instance:EquipmentWorkOrder,**kwargs
):
    if instance.status != "FINISHED":
        return

    record = instance.maintenance_record
    if record is None:
        return

    fields = ["date","updated_at"]
    record.date = timezone.localdate()

    cost = getattr(instance,"cost",None)
    if cost is not None:
        record.cost = (
            cost.labor_cost
            + cost.spare_parts_cost
            + cost.transport_cost
            + cost.other_cost
        )
        fields.append("cost")

    record.save(update_fields=fields)

@receiver(pre_delete,sender=MaintenanceRecord)
def remove_pdf(sender,instance:MaintenanceRecord,**kwargs) -> None:
    if instance.pdf_file:
        pdf_file = instance.pdf_file
        transaction.on_commit(lambda: pdf_file.delete(save=False))

@receiver(pre_delete,sender=MaintenanceRecord)
def reopen_linked_schedule(sender,instance:MaintenanceRecord,**kwargs) -> None:
    schedule = instance.scheduled_maintenance
    if schedule is not None and schedule.is_completed:
        schedule.is_completed = False
        schedule.save(update_fields=["is_completed","updated_at"])
