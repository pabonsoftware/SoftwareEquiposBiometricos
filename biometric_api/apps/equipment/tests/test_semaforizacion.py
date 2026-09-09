"""RF010 — tests del helper de semaforización (única fuente de verdad).

Función pura: no necesita `@pytest.mark.django_db` ni fixtures. `today` se pasa
como argumento, así que cada caso es determinista.
"""
from datetime import date, datetime

import pytest

from api.v1.helpers.semaforizacion import (
    SemaphoreStatus,
    calculate_status,
    days_until,
    semaphore_payload,
    to_date,
    worst,
)

HOY = date(2026, 3, 1)
G, Y, R = SemaphoreStatus.GREEN, SemaphoreStatus.YELLOW, SemaphoreStatus.RED


class TestCalculateStatus:
    @pytest.mark.parametrize(
        ("due", "expected"),
        [
            (date(2026, 2, 15), R),   # venció hace 14 días
            (date(2026, 2, 28), R),   # venció ayer
            (date(2026, 3, 1), Y),    # vence hoy
            (date(2026, 3, 15), Y),   # dentro de la ventana (14 días)
            (date(2026, 3, 31), Y),   # último día de la ventana (30)
            (date(2026, 4, 1), G),    # día 31: fuera
            (None, G),                # sin fecha
        ],
    )
    def test_ventana_de_30_dias(self, due, expected):
        assert calculate_status(due, HOY, 30) == expected

    def test_completed_siempre_verde_aunque_este_vencido(self):
        assert calculate_status(date(2020, 1, 1), HOY, 30, completed=True) == G

    def test_ventana_mas_corta(self):
        assert calculate_status(date(2026, 3, 10), HOY, grace := 5) == G  # 9 > 5
        assert calculate_status(date(2026, 3, 5), HOY, grace) == Y        # 4 <= 5

    def test_grace_cero_solo_hoy_es_amarillo(self):
        assert calculate_status(date(2026, 3, 1), HOY, 0) == Y
        assert calculate_status(date(2026, 3, 2), HOY, 0) == G
        assert calculate_status(date(2026, 2, 28), HOY, 0) == R

    def test_acepta_datetime(self):
        assert calculate_status(datetime(2026, 2, 15, 23, 59), HOY, 30) == R

    def test_devuelve_miembro_del_enum(self):
        assert isinstance(calculate_status(None, HOY, 30), SemaphoreStatus)


class TestHelpersAuxiliares:
    def test_to_date(self):
        assert to_date(datetime(2026, 3, 1, 10, 0)) == date(2026, 3, 1)
        assert to_date(date(2026, 3, 1)) == date(2026, 3, 1)
        assert to_date(None) is None

    def test_days_until(self):
        assert days_until(date(2026, 3, 6), HOY) == 5
        assert days_until(date(2026, 2, 25), HOY) == -4
        assert days_until(None, HOY) is None

    def test_worst(self):
        assert worst(G, Y, R) == R
        assert worst(G, Y) == Y
        assert worst(G, G) == G
        assert worst() == G

    def test_semaphore_payload(self):
        payload = semaphore_payload(date(2026, 3, 6), HOY, 30)
        assert payload == {"code": "YELLOW", "label": "Próximo a vencer", "days_left": 5}
