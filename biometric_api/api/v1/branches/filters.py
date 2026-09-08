from django_filters import rest_framework as filters

from apps.branches.models import Branch

class BranchFilter(filters.FilterSet):
    name = filters.CharFilter(field_name="name")
    address = filters.CharFilter(field_name="address")
    city = filters.CharFilter(field_name="city", lookup_expr="iexact")
    is_active = filters.BooleanFilter(field_name="is_active")

    class Meta:
        model = Branch
        fields = ("name","address","city", "is_active")
