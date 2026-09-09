"""RF006 — recurrencia y próximas fechas de mantenimiento / calibración.

La regla de "cuándo toca el próximo" vive aquí, una sola vez, y la usan:
- el signal que corre al registrar un mantenimiento ejecutado,
- la acción que completa un agendamiento,
- el generador de cronograma anual.
"""
from __future__ import annotations

from datetime import date

from dateutil.relativedelta import relativedelta
from django.db import transaction

from apps.equipment.models import Equipment
from apps.maintenance.models import MaintenanceKind, MaintenanceRecord

from .models import (
    RECURRING_KINDS,
    MaintenanceSchedule,
    ScheduledMaintenanceKind,
)

#: Tipo de agendamiento ⇄ tipo de registro de mantenimiento que lo cumple.
_RECORD_KIND = {
    ScheduledMaintenanceKind.PREVENTIVE: MaintenanceKind.PREVENTIVE,
    ScheduledMaintenanceKind.CALIBRATION: MaintenanceKind.CALIBRATION,
}
#: … y el campo de `Equipment` donde se guarda la "próxima fecha" calculada.
_EQUIPMENT_DATE_FIELD = {
    ScheduledMaintenanceKind.PREVENTIVE: "next_preventive_date",
    ScheduledMaintenanceKind.CALIBRATION: "next_calibration_date",
}


def add_months(start: date, months: int) -> date:
    """`start` + `months`, respetando fin de mes (31-ene + 1 mes = 28/29-feb)."""
    return start + relativedelta(months=months)


def next_due_date(from_date: date, frequency_months: int | None) -> date | None:
    """Próxima fecha a partir de una fecha base y una periodicidad en meses.
    `None` si no hay periodicidad configurada (no se puede proyectar)."""
    if not frequency_months or frequency_months <= 0:
        return None
    return add_months(from_date, frequency_months)


def _frequency_for(equipment: Equipment, kind: str) -> int | None:
    return getattr(equipment, RECURRING_KINDS[kind], None)


@transaction.atomic
def refresh_equipment_next_dates(equipment: Equipment) -> None:
    """Recalcula `next_preventive_date` / `next_calibration_date` del equipo a
    partir del ÚLTIMO mantenimiento de cada tipo + su frecuencia (RF006).

    Determinista: siempre parte del registro más reciente, así una corrección
    de fechas o un mantenimiento fuera de agenda quedan reflejados.
    """
    updated: list[str] = []
    for sched_kind, field in _EQUIPMENT_DATE_FIELD.items():
        frequency = _frequency_for(equipment, sched_kind)
        last_record = (
            MaintenanceRecord.objects.filter(
                equipment=equipment, kind=_RECORD_KIND[sched_kind]
            )
            .order_by("-date", "-created_at")
            .first()
        )
        new_value = (
            next_due_date(last_record.date, frequency) if last_record else None
        )
        if getattr(equipment, field) != new_value:
            setattr(equipment, field, new_value)
            updated.append(field)

    if updated:
        equipment.save(update_fields=updated)


@transaction.atomic
def roll_schedule_forward(schedule: MaintenanceSchedule) -> MaintenanceSchedule | None:
    """Al cumplir un agendamiento recurrente, crea el siguiente (RF006).

    No duplica: si ya existe otro agendamiento no cumplido del mismo tipo para
    el equipo, no hace nada. Devuelve el nuevo agendamiento o `None`.
    """
    if schedule.kind not in RECURRING_KINDS:
        return None
    frequency = _frequency_for(schedule.equipment, schedule.kind)
    if not frequency:
        return None

    already_planned = (
        MaintenanceSchedule.objects.filter(
            equipment=schedule.equipment, kind=schedule.kind, is_completed=False
        )
        .exclude(pk=schedule.pk)
        .exists()
    )
    if already_planned:
        return None

    return MaintenanceSchedule.objects.create(
        equipment=schedule.equipment,
        kind=schedule.kind,
        scheduled_date=add_months(schedule.scheduled_date, frequency),
        notes=f"Recurrencia automática de {schedule}",
        assigned_engineer=schedule.assigned_engineer,
        assigned_technician=schedule.assigned_technician,
        auto_generated=True,
        generated_from=schedule,
    )


@transaction.atomic
def generate_annual_plan(
    *,
    equipment: Equipment,
    year: int,
    kind: str,
    start_date: date | None = None,
) -> list[MaintenanceSchedule]:
    """Cronograma anual por periodicidad (RF006 — "cronograma anual por meses").

    Crea agendamientos espaciados por la frecuencia del equipo, dentro de `year`.
    Salta meses que ya tienen un agendamiento del mismo tipo. Idempotente.
    """
    frequency = _frequency_for(equipment, kind) if kind in RECURRING_KINDS else None
    if not frequency:
        raise ValueError(
            "El equipo no tiene una frecuencia configurada para este tipo de mantenimiento."
        )

    cursor = start_date or date(year, 1, 1)
    existing_months = set(
        MaintenanceSchedule.objects.filter(
            equipment=equipment, kind=kind, scheduled_date__year=year
        ).values_list("scheduled_date__month", flat=True)
    )

    created: list[MaintenanceSchedule] = []
    while cursor.year == year:
        if cursor.month not in existing_months:
            created.append(
                MaintenanceSchedule(
                    equipment=equipment,
                    kind=kind,
                    scheduled_date=cursor,
                    notes=f"Cronograma anual {year}",
                    auto_generated=True,
                )
            )
            existing_months.add(cursor.month)
        cursor = add_months(cursor, frequency)

    if created:
        MaintenanceSchedule.objects.bulk_create(created)
    return created
