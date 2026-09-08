from django.db import models


class BrandQuerySet(models.QuerySet):

    # Filtra marca si está activa
    def active(self) -> "BrandQuerySet":
        return self.filter(is_active=True)

    # Filtra marca si está inactiva
    def inactive(self) -> "BrandQuerySet":
        return self.filter(is_active=False)


class BrandManager(models.Manager.from_queryset(BrandQuerySet)):
    def get_queryset(self) -> BrandQuerySet:
        return BrandQuerySet(self.model, using=self._db)

    def active(self) -> BrandQuerySet:
        return self.get_queryset().active()

    def inactive(self) -> BrandQuerySet:
        return self.get_queryset().inactive()


class EquipmentModelQuerySet(models.QuerySet):

    # Filtra modelo si esta activó
    def active(self) -> "EquipmentModelQuerySet":
        return self.filter(is_active=True)

    # Filtra modelo si está inactivo
    def inactive(self) -> "EquipmentModelQuerySet":
        return self.filter(is_active=False)

    # Filtra modelo por marca
    def for_brand(self, brand_id: int) -> "EquipmentModelQuerySet":
        return self.filter(brand_id=brand_id)

    # Filtra modelo con marca activa
    def with_active_brand(self) -> "EquipmentModelQuerySet":
        return self.filter(brand__is_active=True)


class EquipmentModelManager(models.Manager.from_queryset(EquipmentModelQuerySet)):
    def get_queryset(self) -> EquipmentModelQuerySet:
        return EquipmentModelQuerySet(self.model, using=self._db).select_related("brand")

    def active(self) -> EquipmentModelQuerySet:
        return self.get_queryset().active()

    def inactive(self) -> EquipmentModelQuerySet:
        return self.get_queryset().inactive()

    def for_brand(self, brand_id: int) -> EquipmentModelQuerySet:
        return self.get_queryset().for_brand(brand_id)
