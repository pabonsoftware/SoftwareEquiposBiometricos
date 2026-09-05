from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from .models import (
    EquipmentMaintenanceSchedule,
    MaintenanceScheduleType,
)

def calculate_next_execution_date(
        execution_date:date,
        frequency_months:int,
) -> date:

    """
    Calcula la próxima fecha de mantenimiento 
    según la frecuencia configurada.
    """

    return execution_date + relativedelta(
        months=frequency_months
    )

def create_equipment_schedules(equipment):

    """
    
    Crea automáticamente las programaciones
    correspondientes al equipo

    
    """

    schedules = []

    if equipment.maintenance_frequency_months:

        schedules.append(
            EquipmentMaintenanceSchedule(
                equipment=equipment,
                schedule_type=(
                    MaintenanceScheduleType.PREVENTIVE
                ),
                frequency_months=(
                    equipment.maintenance_frequency_months
                ),
            )
        )

    if equipment.calibration_frequency_months:

        schedules.append(
            EquipmentMaintenanceSchedule(
            equipment=equipment,
            schedule_type=(
                MaintenanceScheduleType.CALIBRATION
            ),
            frequency_months=(
                equipment.calibration_frequency_months
                ),
            )
        )

    if not schedules:
        return []

    return EquipmentMaintenanceSchedule.objects.bulk_create(
        schedules
    )

def update_schedule_after_execution(
        schedule,
        execution_date,
):

    """
    
    Actualiza la programación después de analizar un
    mantenimiento.

    
    """

    schedule.last_execution_date = execution_date

    schedule.next_execution_date = (
        calculate_next_execution_date(
            execution_date,
            schedule.frequency_months,
        )
    )

    schedule.save(
        update_fields=[
            "last_execution_date",
            "next_execution_date",
            "updated_at",
        ]
    )

    return schedule

def calculate_schedule_status(next_execution_date):

    if not next_execution_date:
        return "NOT_SCHEDULED"

    today = date.today()

    if next_execution_date < today:
        return "OVERDUE"

    if next_execution_date <= today + timedelta(days=30):
        return "DUE_SOON"

    return "ON_TIME"