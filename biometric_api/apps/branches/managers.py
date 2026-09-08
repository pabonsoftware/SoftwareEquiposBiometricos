from django.db import models

class BranchQuerySet(models.QuerySet):

    # Filtra sede si está activa
    def active(self) -> "BranchQuerySet":
        return self.filter(is_active=True)

    # Filtra sede si está inactiva
    def inactive(self) -> "BranchQuerySet":
        return self.filter(is_active=False)

    # Filtra sede por ciudad
    def by_city(self, city: str) -> "BranchQuerySet":
        return self.filter(city__iexact=city)

    # Filtra sede por nombre
    def by_name(self,name:str) -> "BranchQuerySet":
        return self.filter(name__iexact=name)

    # Filtra sede por dirección
    def by_address(self,address:str) -> "BranchQuerySet":
        return self.filter(address__iexact=address)

class BranchManager(models.Manager.from_queryset(BranchQuerySet)):
    def get_queryset(self) -> BranchQuerySet:
        return BranchQuerySet(self.model, using=self._db)

    def active(self) -> BranchQuerySet:
        return self.get_queryset().active()

    def inactive(self) -> BranchQuerySet:
        return self.get_queryset().inactive()

    def by_city(self, city: str) -> BranchQuerySet:
        return self.get_queryset().by_city(city)

    def by_name(self,name:str) -> "BranchQuerySet":
        return self.get_queryset().by_name(name)

    def by_address(self,address:str) -> "BranchQuerySet":
        return self.get_queryset().by_address(address)