import logging
from typing import Any, cast

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import RegexValidator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.users.models import User

logger = logging.getLogger(__name__)

#: Al menos 8 caracteres, con una mayúscula, un dígito y un símbolo.
PASSWORD_REGEX = r"^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#.\-_])[A-Za-z\d@$!%*?&#.\-_]{8,}$"

password_complexity_validator = RegexValidator(
    regex=PASSWORD_REGEX,
    message=_(
        "La contraseña debe tener al menos 8 caracteres, incluyendo una "
        "mayúscula, un número y un símbolo."
    ),
)



def _normalize_text(value: str) -> str:
    return " ".join(value.split()).strip()


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _normalize_username(value: str) -> str:
    return value.strip()


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "role_display",
            "phone",
            "is_active",
            "date_joined",
            "last_login",
        )
        read_only_fields = ("id", "role_display", "date_joined", "last_login")


class UserCreateSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    password = serializers.CharField(write_only=True, required=True, min_length=8)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "role_display",
            "phone",
            "is_active",
            "password",
            "date_joined",
            "last_login",
        )
        read_only_fields = ("id", "role_display", "date_joined", "last_login")

    def validate_username(self, value: str) -> str:
        normalized = _normalize_username(value)
        if not normalized:
            raise serializers.ValidationError(_("El nombre de usuario no puede estar vacío."))
        if User.objects.filter(username__iexact=normalized).exists():
            raise serializers.ValidationError(
                _("Ya existe un usuario con este nombre de usuario.")
            )
        return normalized

    def validate_email(self, value: str) -> str:
        normalized = _normalize_email(value)
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError(
                _("Ya existe un usuario con este correo electrónico.")
            )
        return normalized

    def validate_first_name(self, value: str) -> str:
        normalized = _normalize_text(value)
        if not normalized:
            raise serializers.ValidationError(_("Los nombres no pueden estar vacíos."))
        return normalized

    def validate_last_name(self, value: str) -> str:
        normalized = _normalize_text(value)
        if not normalized:
            raise serializers.ValidationError(_("Los apellidos no pueden estar vacíos."))
        return normalized

    def validate_role(self, value: str) -> str:
        request = self.context.get("request")
        caller = getattr(request, "user", None)
        if value == User.Role.ADMIN:
            if caller is None or caller.role != User.Role.ADMIN:
                raise serializers.ValidationError(
                    _("Solo un administrador del sistema puede asignar el rol de administrador.")
                )
        return value

    def validate_password(self, value: str) -> str:
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        is_active = validated_data.pop("is_active", True)
        user = User.objects.create_user(password=password, **validated_data)
        if not is_active:
            user.is_active = False
            user.save(update_fields=["is_active"])
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "role_display",
            "phone",
            "is_active",
            "date_joined",
            "last_login",
        )
        read_only_fields = ("id", "role_display", "date_joined", "last_login")

    def validate_username(self, value: str) -> str:
        normalized = _normalize_username(value)
        if not normalized:
            raise serializers.ValidationError(_("El nombre de usuario no puede estar vacío."))
        qs = User.objects.filter(username__iexact=normalized)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                _("Ya existe un usuario con este nombre de usuario.")
            )
        return normalized

    def validate_email(self, value: str) -> str:
        normalized = _normalize_email(value)
        qs = User.objects.filter(email__iexact=normalized)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                _("Ya existe un usuario con este correo electrónico.")
            )
        return normalized

    def validate_first_name(self, value: str) -> str:
        normalized = _normalize_text(value)
        if not normalized:
            raise serializers.ValidationError(_("Los nombres no pueden estar vacíos."))
        return normalized

    def validate_last_name(self, value: str) -> str:
        normalized = _normalize_text(value)
        if not normalized:
            raise serializers.ValidationError(_("Los apellidos no pueden estar vacíos."))
        return normalized

    def validate_role(self, value: str) -> str:
        request = self.context.get("request")
        caller = getattr(request, "user", None)
        target = self.instance
        is_admin_caller = caller is not None and caller.role == User.Role.ADMIN

        promoting_to_admin = value == User.Role.ADMIN
        demoting_existing_admin = (
            target is not None
            and target.role == User.Role.ADMIN
            and value != User.Role.ADMIN
        )

        if (promoting_to_admin or demoting_existing_admin) and not is_admin_caller:
            raise serializers.ValidationError(
                _("Solo un administrador del sistema puede asignar o quitar el rol de administrador.")
            )
        return value


def _send_password_changed_email(user: User) -> None:
    """Avisa al usuario de que su contraseña cambió. El fallo de envío no debe
    tumbar el cambio de contraseña (que ya se persistió), así que se registra
    en el log y se sigue."""
    if not user.email:
        return
    nombre = user.get_full_name() or user.username
    try:
        send_mail(
            subject=_("Tu contraseña fue actualizada"),
            message=(
                f"Hola {nombre},\n\n"
                "Tu contraseña se actualizó correctamente.\n"
                "Si no fuiste tú, contacta al soporte de inmediato."
            ),
            from_email=None,  # usa DEFAULT_FROM_EMAIL
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:  # noqa: BLE001 - el aviso es best-effort
        logger.warning("No se pudo enviar el correo de cambio de contraseña a %s", user.email)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(required=False, write_only=True)
    new_password = serializers.CharField(
        required=True,
        write_only=True,
        min_length=8,
        validators=[password_complexity_validator],
    )
    # Opcional: si el cliente lo envía, debe coincidir con `new_password`.
    # El frontend valida la confirmación del lado del cliente.
    confirm_new_password = serializers.CharField(required=False, write_only=True)

    def _get_target(self) -> User | None:
        target = self.context.get("target_user")
        if target is None:
            request = self.context.get("request")
            target = getattr(request, "user", None)
        return target

    def validate_new_password(self, value: str) -> str:
        target = self._get_target()
        try:
            validate_password(value, user=target)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        target = self._get_target()
        caller = getattr(request, "user", None)

        if target is None:
            raise serializers.ValidationError(_("Usuario no encontrado."))

        confirm = attrs.get("confirm_new_password")
        if confirm is not None and attrs["new_password"] != confirm:
            raise serializers.ValidationError(
                {"confirm_new_password": _("Las contraseñas no coinciden.")}
            )

        is_self = caller is not None and caller.pk == target.pk
        if is_self:
            current = attrs.get("current_password")
            if not current:
                raise serializers.ValidationError(
                    {"current_password": _("Este campo es requerido para cambiar tu propia contraseña.")}
                )
            if not target.check_password(current):
                raise serializers.ValidationError(
                    {"current_password": _("La contraseña actual es incorrecta.")}
                )

        return attrs

    def save(self, **kwargs) -> User:
        data = cast("dict[str, Any]", self.validated_data)
        user = cast(User, self._get_target())
        user.set_password(data["new_password"])
        user.save(update_fields=["password"])
        _send_password_changed_email(user)
        return user


# ---------------------------------------------------------------------------
# Recuperación de contraseña (flujo "olvidé mi contraseña", sin autenticar)
# ---------------------------------------------------------------------------
def _user_from_uidb64(uidb64: str) -> User | None:
    try:
        uid = urlsafe_base64_decode(uidb64).decode()
        return User.objects.get(pk=uid, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return None


def _send_password_reset_email(user: User) -> None:
    """Envía el enlace de restablecimiento. Best-effort: si el SMTP falla se
    registra en el log (la respuesta al cliente es genérica de todos modos)."""
    if not user.email:
        return
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    link = f"{base}/restablecer-password?uid={uidb64}&token={token}"
    nombre = user.get_full_name() or user.username
    try:
        send_mail(
            subject=_("Recuperación de contraseña"),
            message=(
                f"Hola {nombre},\n\n"
                "Recibimos una solicitud para restablecer tu contraseña. "
                "Abre el siguiente enlace para elegir una nueva:\n\n"
                f"{link}\n\n"
                "El enlace vence en unos días. Si no fuiste tú, ignora este correo."
            ),
            from_email=None,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:  # noqa: BLE001 - el envío es best-effort
        logger.warning("No se pudo enviar el correo de recuperación a %s", user.email)


class PasswordResetRequestSerializer(serializers.Serializer):
    """Paso 1: el usuario pide un enlace indicando su correo."""

    email = serializers.EmailField()

    def save(self, **kwargs) -> None:
        data = cast("dict[str, Any]", self.validated_data)
        email = _normalize_email(data["email"])
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        # Si no existe, no hacemos nada: la vista responde igual para no
        # revelar qué correos están registrados.
        if user is not None:
            _send_password_reset_email(user)


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Paso 2: el usuario llega desde el enlace y define la nueva contraseña."""

    uid = serializers.CharField(write_only=True)
    token = serializers.CharField(write_only=True)
    new_password = serializers.CharField(
        write_only=True,
        min_length=8,
        validators=[password_complexity_validator],
    )
    confirm_new_password = serializers.CharField(required=False, write_only=True)

    def validate(self, attrs):
        user = _user_from_uidb64(attrs["uid"])
        if user is None or not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError(
                _("El enlace de recuperación es inválido o expiró. Solicita uno nuevo.")
            )

        confirm = attrs.get("confirm_new_password")
        if confirm is not None and attrs["new_password"] != confirm:
            raise serializers.ValidationError(
                {"confirm_new_password": _("Las contraseñas no coinciden.")}
            )

        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)}) from exc

        attrs["user"] = user
        return attrs

    def save(self, **kwargs) -> User:
        data = cast("dict[str, Any]", self.validated_data)
        user: User = data["user"]
        user.set_password(data["new_password"])
        user.save(update_fields=["password"])
        _send_password_changed_email(user)
        return user
