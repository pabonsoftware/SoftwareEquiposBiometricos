"""Consolidación 7 → 4 roles (4.1. Roles del sistema).

- `superadmin`  → `admin`  (conserva is_superuser / is_staff).
- `tecnico`     → se elimina la cuenta (el rol se fusionó en `ingeniero`;
                   todas las FK a User son SET_NULL, así que no rompe datos).
- `auditor`     → se elimina la cuenta (rol retirado).

Irreversible: al revertir no se recuperan las cuentas borradas ni el rol
original de los ex-superadmin.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(role="superadmin").update(role="admin")
    User.objects.filter(role__in=["tecnico", "auditor"]).delete()


def backwards(apps, schema_editor):
    # No se puede deshacer el borrado de cuentas; se deja como no-op para
    # permitir `migrate users 0003` sin error.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_alter_user_role"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
