"""RF010 — la semaforización llega igual desde el modelo y desde la API.

Verifica que la MISMA regla (`calculate_status`) se ve en:
- las @property del modelo (Equipment, EquipmentWorkOrder),
- el serializer de equipos (`preventive_status`, `maintenance_semaphore`),
- el serializer de órdenes de trabajo (`semaphore`).
"""
from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.equipment.models import (
    EquipmentWorkOrder,
    SemaphoreStatus,
    WorkOrderStatus,
    WorkOrderType,
)

pytestmark = pytest.mark.django_db


class TestEquipmentModelSemaphore:
    def test_sin_fecha_es_verde(self, equipment):
        equipment.next_preventive_date = None
        assert equipment.preventive_status == SemaphoreStatus.GREEN

    def test_preventivo_vencido_es_rojo(self, equipment):
        equipment.next_preventive_date = timezone.localdate() - timedelta(days=1)
        assert equipment.preventive_status == SemaphoreStatus.RED

    def test_preventivo_proximo_es_amarillo(self, equipment):
        equipment.next_preventive_date = timezone.localdate() + timedelta(days=10)
        assert equipment.preventive_status == SemaphoreStatus.YELLOW

    def test_semaforo_global_toma_el_peor(self, equipment):
        equipment.next_preventive_date = timezone.localdate() + timedelta(days=200)  # verde
        equipment.next_calibration_date = timezone.localdate() - timedelta(days=5)   # rojo
        assert equipment.maintenance_semaphore == SemaphoreStatus.RED


class TestEquipmentApiSemaphore:
    def test_lista_expone_el_semaforo(self, auth_client, equipment):
        equipment.next_preventive_date = timezone.localdate() + timedelta(days=5)
        equipment.save(update_fields=["next_preventive_date"])

        res = auth_client.get(reverse("v1:equipment:equipment-list"))
        assert res.status_code == 200
        row = next(r for r in res.json()["results"] if r["id"] == equipment.id)
        assert row["preventive_status"]["code"] == "YELLOW"
        assert row["preventive_status"]["days_left"] == 5
        assert row["maintenance_semaphore"]["code"] == "YELLOW"


class TestWorkOrderSemaphore:
    def _wo(self, equipment, **kw):
        defaults = dict(
            number=f"OT-SEM-{equipment.pk}-{EquipmentWorkOrder.objects.count()}",
            service_type=WorkOrderType.PREVENTIVE,
            start_date=timezone.now(),
            description="x",
            status=WorkOrderStatus.PENDING,
        )
        defaults.update(kw)
        return EquipmentWorkOrder.objects.create(equipment=equipment, **defaults)

    def test_orden_terminada_es_verde_aunque_la_fecha_pase(self, equipment):
        wo = self._wo(
            equipment,
            status=WorkOrderStatus.FINISHED,
            end_date=timezone.now() - timedelta(days=30),
        )
        assert wo.schedule_semaphore == SemaphoreStatus.GREEN

    def test_orden_abierta_vencida_es_roja(self, equipment):
        wo = self._wo(equipment, end_date=timezone.now() - timedelta(days=2))
        assert wo.schedule_semaphore == SemaphoreStatus.RED

    def test_api_details_expone_semaforo(self, ingeniero_client, equipment):
        wo = self._wo(equipment, end_date=timezone.now() - timedelta(days=2))
        url = reverse("v1:equipment:equipment-work-order-detail", args=[wo.id])
        res = ingeniero_client.get(url)
        assert res.status_code == 200
        assert res.json()["semaphore"]["code"] == "RED"
