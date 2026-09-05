from apps.audit.utils import AuditAction, log_audit_event


class AuditLogMixin:
    """Deja un AuditLog cada vez que se elimina un recurso vía la API."""

    def perform_destroy(self, instance):
        log_audit_event(self.request.user, AuditAction.DELETE, instance, request=self.request)
        super().perform_destroy(instance)
