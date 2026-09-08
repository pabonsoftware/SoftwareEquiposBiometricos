import factory
from factory.django import DjangoModelFactory

from apps.users.models import User


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User
        django_get_or_create = ("username",)
        skip_postgeneration_save = True

    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.LazyAttribute(lambda obj: f"{obj.username}@example.com")
    first_name = "Nombre"
    last_name = "Apellido"
    role = User.Role.USUARIO
    phone = ""
    is_active = True

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        # `skip_postgeneration_save=True` no vuelve a guardar el modelo tras los
        # post-generation hooks, así que hay que persistir el hash explícitamente
        # o el usuario queda con password vacío en la BD (aunque no en memoria).
        self.set_password(extracted or "testpass123")
        if create:
            self.save(update_fields=["password"])


class AdminFactory(UserFactory):
    role = User.Role.ADMIN
    is_staff = True
    is_superuser = True


class CoordinadorFactory(UserFactory):
    role = User.Role.COORDINADOR


class IngenieroFactory(UserFactory):
    role = User.Role.INGENIERO


class UsuarioFactory(UserFactory):
    role = User.Role.USUARIO


# Aliases de compatibilidad tras la consolidación 7 → 4 roles:
# superadmin → admin, tecnico → ingeniero, auditor → usuario.
SuperadminFactory = AdminFactory
TecnicoFactory = IngenieroFactory
AuditorFactory = UsuarioFactory
