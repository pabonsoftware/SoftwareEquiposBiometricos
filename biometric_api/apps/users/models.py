from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from .managers import UserManager


phone_validator = RegexValidator(
    regex=r"^\+?[0-9\s\-()]{7,20}$",
    message=_("El teléfono no tiene un formato válido."),
)


class User(AbstractUser):
    class Role(models.TextChoices):
        # 4.1.1 — administración técnica del sistema + parametrización institucional.
        ADMIN = "admin", _("SuperAdministrador del Sistema")
        # 4.1.2 — aprueba, prioriza, asigna responsables y cierra formalmente.
        COORDINADOR = "coordinador", _("Coordinador Biomédico")
        # 4.1.3 — evaluación técnica + ejecución del mantenimiento.
        INGENIERO = "ingeniero", _("Ingeniero Biomédico")
        # Personal asistencial: consulta sus equipos y reporta fallas.
        USUARIO = "usuario", _("Usuario Operativo")

    email = models.EmailField(_("Correo electrónico"), unique=True)
    first_name = models.CharField(_("Nombres"), max_length=150)
    last_name = models.CharField(_("Apellidos"), max_length=150)
    role = models.CharField(
        _("Rol"),
        max_length=20,
        choices=Role.choices,
        default=Role.USUARIO,
    )
    phone = models.CharField(
        _("Teléfono"),
        max_length=30,
        blank=True,
        validators=[phone_validator],
    )

    REQUIRED_FIELDS = ["email", "first_name", "last_name", "role"]

    objects: UserManager = UserManager()

    class Meta:
        verbose_name = _("Usuario")
        verbose_name_plural = _("Usuarios")
        ordering = ["username"]
        indexes = [
            models.Index(fields=["role"], name="user_role_idx"),
            models.Index(fields=["is_active"], name="user_is_active_idx"),
            models.Index(fields=["email"], name="user_email_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.username} ({self.get_role_display()})"

    @property
    def is_admin_role(self) -> bool:
        return self.role == self.Role.ADMIN
