"""Auditoría centralizada de la API (RFN009).

`AuditLogMixin` deja un `AuditLog` en **create / update / delete** de cualquier
ViewSet que lo herede. Para `update` guarda los valores *antes / después* de los
campos que cambiaron.

Las acciones de negocio no-CRUD (aprobar, cerrar, cancelar una orden) se auditan
aparte, con `log_audit_event`, desde donde ocurren (ver `apps/equipment/workflow.py`).

Los ViewSets que sobreescriben `perform_create` / `perform_update` deben llamar a
`super().perform_*()` para conservar la auditoría (o usar `self.audit_write`).
"""
from __future__ import annotations

from apps.audit.utils import AuditAction, log_audit_event


def _jsonify(value):
    """Valor apto para el JSONField del AuditLog."""
    if value is None or isinstance(value, str | int | bool | float):
        return value
    return str(value)


class AuditLogMixin:
    #: Poner en False en un ViewSet concreto para no auditarlo.
    audit_enabled = True

    def audit_write(self, action: str, instance, changes: dict | None = None) -> None:
        if self.audit_enabled:
            log_audit_event(
                getattr(self, "request", None) and self.request.user,
                action,
                instance,
                request=getattr(self, "request", None),
                changes=changes or {},
            )

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self.audit_write(AuditAction.CREATE, serializer.instance)

    def perform_update(self, serializer):
        # Campos que la petición realmente toca (los del validated_data que
        # existen en el modelo); ignora los write-only del serializer.
        tracked = [
            f
            for f in getattr(serializer, "validated_data", {})
            if hasattr(serializer.instance, f)
        ]
        before = {f: _jsonify(getattr(serializer.instance, f)) for f in tracked}

        super().perform_update(serializer)

        after = {f: _jsonify(getattr(serializer.instance, f)) for f in tracked}
        changed = {
            f: {"from": before[f], "to": after[f]}
            for f in tracked
            if before[f] != after[f]
        }
        self.audit_write(
            AuditAction.UPDATE,
            serializer.instance,
            {"fields": changed} if changed else {},
        )

    def perform_destroy(self, instance):
        self.audit_write(AuditAction.DELETE, instance)
        super().perform_destroy(instance)
