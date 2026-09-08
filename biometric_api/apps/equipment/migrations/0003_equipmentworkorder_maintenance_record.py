import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0002_initial'),
        ('maintenance', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='equipmentworkorder',
            name='maintenance_record',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='work_order',
                to='maintenance.maintenancerecord',
            ),
        ),
    ]
