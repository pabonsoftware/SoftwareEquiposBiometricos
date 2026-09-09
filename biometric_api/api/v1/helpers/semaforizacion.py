"""Semaforización RF010 — única fuente de verdad de verde / amarillo / rojo.

Regla de negocio (clasificación), separada de la presentación (color/ícono).
Todo el backend importa `calculate_status` de aquí; nadie reimplementa la regla
en una vista, un serializer ni el dashboard. El frontend recibe el `code` ya
calculado y solo lo mapea a un color (`src/lib/semaphore.ts`).

Este módulo se mantiene *puro*: solo `datetime` y `django.db.models` (para
`TextChoices`). No importa DRF ni modelos de dominio, así que puede importarse
tan temprano como `apps.equipment.models` sin riesgo de import circular.
"""
from __future__ import annotations

from datetime import date, datetime

from django.db import models
from django.utils.translation import gettext_lazy as _


class SemaphoreStatus(models.TextChoices):
    """Los tres niveles del semáforo (RF010).

    El *valor* ("GREEN"/…) es el código que viaja por la API y que el frontend
    mapea a color. El *label* es el texto legible que usan admin, reportes y
    cualquier UI generada en el backend.
    """

    GREEN = "GREEN", _("Al día")
    YELLOW = "YELLOW", _("Próximo a vencer")
    RED = "RED", _("Vencido")


#: Orden de gravedad: RED gana a YELLOW gana a GREEN. Se usa para combinar
#: varios semáforos en uno solo (p. ej. el semáforo global de un equipo).
_SEVERITY = {
    SemaphoreStatus.GREEN: 0,
    SemaphoreStatus.YELLOW: 1,
    SemaphoreStatus.RED: 2,
}


def worst(*statuses: SemaphoreStatus) -> SemaphoreStatus:
    """Devuelve el semáforo más grave del grupo. `worst()` sin args → GREEN."""
    return max(statuses, key=_SEVERITY.__getitem__, default=SemaphoreStatus.GREEN)


def to_date(value: date | datetime | None) -> date | None:
    """Normaliza a `date`. Acepta `datetime` (le quita la hora) y `None`.

    Sin esto, restar un `datetime` con un `date` revienta, y comparar fechas
    con horas mete bugs sutiles cerca de medianoche.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def days_until(due_date: date | datetime | None, today: date) -> int | None:
    """Días que faltan para `due_date` (negativo si ya pasó). `None` si no hay fecha."""
    due = to_date(due_date)
    if due is None:
        return None
    return (due - today).days


def calculate_status(
    due_date: date | datetime | None,
    today: date,
    warning_days: int,
    *,
    completed: bool = False,
) -> SemaphoreStatus:
    """Clasifica un vencimiento en 🟢 / 🟡 / 🔴.

    Reglas (fijas para todo el sistema — RF010 §10):

    - `completed=True`             → GREEN  (ya se hizo / cerrado: no hay acción pendiente)
    - `due_date is None`           → GREEN  (no hay vencimiento pendiente; ver nota)
    - vencido (días restantes < 0) → RED
    - dentro de la ventana de aviso
      (0 ≤ días restantes ≤ warning_days) → YELLOW
    - más lejos                    → GREEN

    Nota sobre `due_date is None`: significa "no hay nada programado", no
    "faltan datos". Si necesitas resaltar equipos *sin* mantenimiento
    programado, eso es otra métrica distinta (no se mezcla con el semáforo).

    `today` se pasa como argumento (no `date.today()` interno) para que la
    función sea determinista y trivial de testear.
    """
    if completed:
        return SemaphoreStatus.GREEN

    remaining = days_until(due_date, today)
    if remaining is None:
        return SemaphoreStatus.GREEN

    if remaining < 0:
        return SemaphoreStatus.RED

    if remaining <= warning_days:
        return SemaphoreStatus.YELLOW

    return SemaphoreStatus.GREEN


def semaphore_payload(
    due_date: date | datetime | None,
    today: date,
    warning_days: int,
    *,
    completed: bool = False,
) -> dict:
    """Forma estándar del semáforo en las respuestas de la API.

    `code`   → para lógica/filtros/color en el cliente.
    `label`  → texto ya traducido (por si el cliente lo muestra tal cual).
    `days_left` → informativo para la UI ("vence en 5 días" / "vencido hace 3").
    """
    status = calculate_status(due_date, today, warning_days, completed=completed)
    return {
        "code": status.value,
        "label": str(status.label),
        "days_left": days_until(due_date, today),
    }
