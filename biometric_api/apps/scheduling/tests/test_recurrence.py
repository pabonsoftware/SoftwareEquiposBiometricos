"""RF006 — recurrencia y próximas fechas de mantenimiento / calibración."""
from datetime import date

import pytest

from apps.equipment.tests.factories import EquipmentFactory
from apps.maintenance.models import MaintenanceKind, MaintenanceRecord
from apps.scheduling.models import MaintenanceSchedule, ScheduledMaintenanceKind
from apps.scheduling.services import (
    add_months,
    generate_annual_plan,
    next_due_date,
    refresh_equipment_next_dates,
    roll_schedule_forward,
)

from .factories import MaintenanceScheduleFactory

pytestmark = pytest.mark.django_db


class TestDateMath:
    def test_add_months_respects_end_of_month(self):
        assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
        assert add_months(date(2026, 1, 15), 6) == date(2026, 7, 15)

    def test_next_due_date_none_when_no_frequency(self):
        assert next_due_date(date(2026, 1, 1), None) is None
        assert next_due_date(date(2026, 1, 1), 0) is None
        assert next_due_date(date(2026, 1, 1), 4) == date(2026, 5, 1)


class TestRefreshEquipmentNextDates:
    def test_preventive_record_sets_next_preventive_date(self, branch):
        eq = EquipmentFactory(branch=branch, maintenance_frequency_months=3)
        MaintenanceRecord.objects.create(
            equipment=eq, kind=MaintenanceKind.PREVENTIVE,
            date=date(2026, 2, 10), description="ok",
        )
        eq.refresh_from_db()
        assert eq.next_preventive_date == date(2026, 5, 10)

    def test_calibration_uses_calibration_frequency(self, branch):
        eq = EquipmentFactory(branch=branch, calibration_frequency_months=12)
        MaintenanceRecord.objects.create(
            equipment=eq, kind=MaintenanceKind.CALIBRATION,
            date=date(2026, 1, 20), description="cal",
        )
        eq.refresh_from_db()
        assert eq.next_calibration_date == date(2027, 1, 20)

    def test_uses_latest_record(self, branch):
        eq = EquipmentFactory(branch=branch, maintenance_frequency_months=6)
        MaintenanceRecord.objects.create(
            equipment=eq, kind=MaintenanceKind.PREVENTIVE, date=date(2026, 1, 1), description="a"
        )
        MaintenanceRecord.objects.create(
            equipment=eq, kind=MaintenanceKind.PREVENTIVE, date=date(2026, 4, 1), description="b"
        )
        eq.refresh_from_db()
        assert eq.next_preventive_date == date(2026, 10, 1)

    def test_no_frequency_clears_projection(self, branch):
        eq = EquipmentFactory(branch=branch, maintenance_frequency_months=None)
        MaintenanceRecord.objects.create(
            equipment=eq, kind=MaintenanceKind.PREVENTIVE, date=date(2026, 1, 1), description="x"
        )
        refresh_equipment_next_dates(eq)
        eq.refresh_from_db()
        assert eq.next_preventive_date is None


class TestRollForward:
    def test_completing_recurring_schedule_creates_next(self, branch):
        eq = EquipmentFactory(branch=branch, maintenance_frequency_months=4)
        s = MaintenanceScheduleFactory(
            equipment=eq, kind=ScheduledMaintenanceKind.PREVENTIVE,
            scheduled_date=date(2026, 3, 1),
        )
        s.is_completed = True
        s.save(update_fields=["is_completed", "updated_at"])

        nxt = MaintenanceSchedule.objects.filter(equipment=eq, is_completed=False).get()
        assert nxt.scheduled_date == date(2026, 7, 1)
        assert nxt.auto_generated is True
        assert nxt.generated_from_id == s.id

    def test_no_rollover_without_frequency(self, branch):
        eq = EquipmentFactory(branch=branch, maintenance_frequency_months=None)
        s = MaintenanceScheduleFactory(equipment=eq)
        assert roll_schedule_forward(s) is None

    def test_no_duplicate_when_future_schedule_exists(self, branch):
        eq = EquipmentFactory(branch=branch, maintenance_frequency_months=3)
        MaintenanceScheduleFactory(equipment=eq, scheduled_date=date(2026, 12, 1))
        done = MaintenanceScheduleFactory(equipment=eq, scheduled_date=date(2026, 3, 1))
        assert roll_schedule_forward(done) is None


class TestAnnualPlan:
    def test_generates_schedules_for_the_year(self, branch):
        eq = EquipmentFactory(branch=branch, maintenance_frequency_months=3)
        created = generate_annual_plan(
            equipment=eq, year=2027, kind=ScheduledMaintenanceKind.PREVENTIVE
        )
        assert [s.scheduled_date for s in created] == [
            date(2027, 1, 1), date(2027, 4, 1), date(2027, 7, 1), date(2027, 10, 1)
        ]
        assert all(s.auto_generated for s in created)

    def test_is_idempotent(self, branch):
        eq = EquipmentFactory(branch=branch, maintenance_frequency_months=6)
        generate_annual_plan(equipment=eq, year=2027, kind=ScheduledMaintenanceKind.PREVENTIVE)
        second = generate_annual_plan(
            equipment=eq, year=2027, kind=ScheduledMaintenanceKind.PREVENTIVE
        )
        assert second == []
        assert MaintenanceSchedule.objects.filter(equipment=eq).count() == 2

    def test_raises_without_frequency(self, branch):
        eq = EquipmentFactory(branch=branch, maintenance_frequency_months=None)
        with pytest.raises(ValueError):
            generate_annual_plan(
                equipment=eq, year=2027, kind=ScheduledMaintenanceKind.PREVENTIVE
            )
