"""Crea un superusuario (rol admin) si todavía no hay ninguno.

Idempotente: pensado para el arranque de Docker en desarrollo. Lee las
variables de entorno estándar de Django:

    DJANGO_SUPERUSER_USERNAME  (por defecto: admin)
    DJANGO_SUPERUSER_EMAIL     (por defecto: admin@localhost)
    DJANGO_SUPERUSER_PASSWORD  (por defecto: admin)

A diferencia de `createsuperuser --noinput`, no exige `first_name`, `last_name`
ni `role` por env: los rellena con valores razonables.
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Crea un superusuario admin si no existe ninguno."

    def handle(self, *args, **options):
        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write("Ya existe al menos un superusuario. Nada que hacer.")
            return

        username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "admin")
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "admin@localhost")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "admin")

        User.objects.create_superuser(
            username=username,
            email=email,
            password=password,
            first_name="Admin",
            last_name="Sistema",
        )
        self.stdout.write(
            self.style.SUCCESS(f"Superusuario '{username}' creado ({email}).")
        )
