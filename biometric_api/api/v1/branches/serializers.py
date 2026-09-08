from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.branches.models import Branch

class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = (
            "id",
            "name",
            "address",
            "city",
            "phone",
            "email",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {
            # El mensaje de unicidad lo controla validate_name (en español).
            "name": {"validators": []},
        }

    # ==================================================================================
    # Valida si el nombre está vació, si está vacío lanza error "El nombre no puede es
    # estar vacío". Si no filtro sede por nombre y la retorna si existe ese nombre lanza
    # un error "Ya existe una sede con este nombre"
    # ==================================================================================
    def validate_name(self, value: str) -> str:
        normalized = " ".join(value.split()).strip()
        if not normalized:
            raise serializers.ValidationError(_("El nombre no puede estar vacío."))

        queryset = Branch.objects.by_name(normalized)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                _("Ya existe una sede con este nombre.")
            )
        return normalized

    # Valida si la ciudad está vacía
    def validate_city(self, value: str) -> str:
        return " ".join(value.split()).strip()

    # Valida si la dirección está vacía
    def validate_address(self, value: str) -> str:
        return value.strip()

    # =================================================================
    # Valida si el correo está vació, si esta vación lanza un error 
    # "El electrónico es obligatorio" si no lo retorna 
    # ==================================================================
    def validate_email(self,value:str) -> str:
        email_normalized = " ".join(value.split()).strip()

        if not email_normalized:
            raise serializers.ValidationError("El correo eleçtrónico")

        return value
