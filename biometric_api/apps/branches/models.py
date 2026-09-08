from django.core.validators import EmailValidator, RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from .managers import BranchManager


# Valida si el telefóno tiene formato válido
phone_validator = RegexValidator(
    regex=r"^\+?[0-9\s\-()]{7,20}$",
    message=_("El teléfono no tiene un formato válido."),
)

# Valida si el correo es válido
email_validator = EmailValidator(
    message=_("El correo electrónico no es válido"),
    code="Correo electrónico inválido",
)

# Valida si la dirección es válida
address_validator = RegexValidator(
    regex=r'^[\w\s.,#-]{5,200}$',
    message=_("La dirección no es válida"),
)

class Branch(models.Model):
    name = models.CharField(
        _("Nombre"),
        max_length=120,
        unique=True,
        help_text=_("Nombre único de la sede."),
    )
    address = models.CharField(
        _("Dirección"),
        max_length=255,
        validators=[address_validator]
    )
    city = models.CharField(
        _("Ciudad"),
        max_length=80,
        db_index=True,
    )
    phone = models.CharField(
        _("Teléfono"),
        max_length=30,
        validators=[phone_validator],
    )
    email = models.EmailField(
        _("Correo electrónico"),
        unique=True,
        validators=[email_validator]
    )
    is_active = models.BooleanField(
        _("Activa"),
        default=True,
    )
    created_at = models.DateTimeField(
        _("Creada"),
        auto_now_add=True,
    )
    updated_at = models.DateTimeField(
        _("Actualizada"),
        auto_now=True,
    )

    objects = BranchManager()

    class Meta:
        verbose_name = _("Sede")
        verbose_name_plural = _("Sedes")
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"], name="branch_name_idx"),
            models.Index(fields=["city"], name="branch_city_idx"),
            models.Index(fields=["is_active"], name="branch_is_active_idx"),
        ]

    def __str__(self) -> str:
        return self.name
