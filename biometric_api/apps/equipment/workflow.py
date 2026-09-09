"""Máquina de estados única de la orden de trabajo (RF008 · RF011 · §9).

Todas las transiciones de `EquipmentWorkOrder.status` pasan por aquí. El
serializer deja `status` como solo-lectura, así que la única forma de moverlo
es vía las acciones del ViewSet (`approve` / `start` / `complete` / `cancel`),
que delegan en las funciones de este módulo. Así no hay saltos arbitrarios y
cada cambio crítico queda auditado.

Flujo:  PENDING → APPROVED → IN_PROGRESS → FINISHED
                └──────────┴──────────────→ CANCELLED
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.audit.utils import AuditAction, log_audit_event

from .models import EquipmentWorkOrder, WorkOrderStatus

S = WorkOrderStatus

#: Transiciones permitidas. Un estado ausente o con conjunto vacío es terminal.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    S.PENDING: {S.APPROVED, S.CANCELLED},
    S.APPROVED: {S.IN_PROGRESS, S.CANCELLED},
    S.IN_PROGRESS: {S.FINISHED},
    S.FINISHED: set(),
    S.CANCELLED: set(),
}


class WorkflowError(ValidationError):
    """Transición inválida o requisito de negocio incumplido."""


def can_transition(current: str, target: str) -> bool:
    return target in ALLOWED_TRANSITIONS.get(current, set())


def _labels(*codes: str) -> list[str]:
    mapping = dict(WorkOrderStatus.choices)
    return [str(mapping.get(c, c)) for c in codes]


def _require_transition(work_order: EquipmentWorkOrder, target: str) -> None:
    if not can_transition(work_order.status, target):
        cur, nxt = _labels(work_order.status, target)
        raise WorkflowError(
            _("No se puede pasar la orden de «%(from)s» a «%(to)s».")
            % {"from": cur, "to": nxt}
        )


def _audit(work_order, actor, action, previous_status, *, request=None, extra=None):
    changes = {"status": {"from": previous_status, "to": work_order.status}}
    if extra:
        changes.update(extra)
    log_audit_event(actor, action, work_order, request=request, changes=changes)


@transaction.atomic
def approve(work_order: EquipmentWorkOrder, *, actor, request=None) -> EquipmentWorkOrder:
    """PENDING → APPROVED. Solo Coordinador/Admin (lo valida el ViewSet)."""
    previous = work_order.status
    _require_transition(work_order, S.APPROVED)
    work_order.status = S.APPROVED
    work_order.approved_by = actor
    work_order.approved_at = timezone.now()
    work_order.save(update_fields=["status", "approved_by", "approved_at"])
    _audit(work_order, actor, AuditAction.APPROVE, previous, request=request)
    return work_order


@transaction.atomic
def start(work_order: EquipmentWorkOrder, *, actor, request=None) -> EquipmentWorkOrder:
    """APPROVED → IN_PROGRESS. Idempotente si ya está en proceso."""
    if work_order.status == S.IN_PROGRESS:
        return work_order
    previous = work_order.status
    _require_transition(work_order, S.IN_PROGRESS)
    work_order.status = S.IN_PROGRESS
    if work_order.technician_id is None and actor is not None:
        work_order.technician = actor
        work_order.save(update_fields=["status", "technician"])
    else:
        work_order.save(update_fields=["status"])
    _audit(work_order, actor, AuditAction.UPDATE, previous, request=request)
    return work_order


@transaction.atomic
def complete(
    work_order: EquipmentWorkOrder,
    *,
    actor,
    closing_notes: str,
    request=None,
) -> EquipmentWorkOrder:
    """IN_PROGRESS → FINISHED. Exige (RF011):

    - la orden está EN_PROCESO,
    - al menos una actividad técnica registrada,
    - observaciones de cierre no vacías.
    """
    previous = work_order.status
    _require_transition(work_order, S.FINISHED)

    notes = (closing_notes or "").strip()
    errors: dict[str, list[str]] = {}
    if not notes:
        errors["closing_notes"] = [_("Las observaciones de cierre son obligatorias.")]
    if not work_order.activities.exists():
        errors["activities"] = [
            _("Debe registrar al menos una actividad técnica antes de cerrar la orden.")
        ]
    if errors:
        raise WorkflowError(errors)

    now = timezone.now()
    work_order.status = S.FINISHED
    work_order.closed_by = actor
    work_order.closed_at = now
    work_order.closing_notes = notes
    if work_order.end_date is None:
        work_order.end_date = now
    work_order.save(
        update_fields=["status", "closed_by", "closed_at", "closing_notes", "end_date"]
    )
    _audit(work_order, actor, AuditAction.CLOSE, previous, request=request)
    return work_order


@transaction.atomic
def cancel(
    work_order: EquipmentWorkOrder,
    *,
    actor,
    reason: str,
    request=None,
) -> EquipmentWorkOrder:
    """PENDING|APPROVED → CANCELLED. Solo Coordinador/Admin (lo valida el ViewSet)."""
    previous = work_order.status
    _require_transition(work_order, S.CANCELLED)

    motive = (reason or "").strip()
    if not motive:
        raise WorkflowError({"reason": [_("El motivo de cancelación es obligatorio.")]})

    work_order.status = S.CANCELLED
    work_order.cancelled_by = actor
    work_order.cancelled_at = timezone.now()
    work_order.cancel_reason = motive
    work_order.save(
        update_fields=["status", "cancelled_by", "cancelled_at", "cancel_reason"]
    )
    _audit(work_order, actor, AuditAction.CANCEL, previous, request=request)
    return work_order
