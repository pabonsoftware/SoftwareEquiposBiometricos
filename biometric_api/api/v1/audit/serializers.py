from rest_framework import serializers

from apps.audit.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor",
            "actor_name",
            "action",
            "action_display",
            "model_label",
            "object_id",
            "object_repr",
            "changes",
            "ip_address",
            "created_at",
        )

    def get_actor_name(self, obj) -> str:
        if obj.actor is None:
            return "Sistema"
        return obj.actor.get_full_name() or obj.actor.username
