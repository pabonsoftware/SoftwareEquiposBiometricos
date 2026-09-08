from datetime import timedelta

import factory
from django.utils import timezone
from factory.django import DjangoModelFactory

from apps.equipment.tests.factories import EquipmentFactory
from apps.failures.models import FailureRecord, FailureSeverity


class FailureRecordFactory(DjangoModelFactory):
    class Meta:
        model = FailureRecord

    equipment = factory.SubFactory(EquipmentFactory)
    # Unos segundos en el pasado: así un test que resuelve la falla con
    # `resolved_at=timezone.now()` no viola el check
    # `failure_resolved_at_after_reported_at` por una diferencia de microsegundos
    # entre ese `now()` y el `default=timezone.now` del modelo.
    reported_at = factory.LazyFunction(lambda: timezone.now() - timedelta(seconds=5))
    description = factory.Faker("sentence", nb_words=10)
    severity = FailureSeverity.MEDIUM
    resolved = False
    resolved_at = None
    resolution_notes = ""
