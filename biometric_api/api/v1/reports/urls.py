from django.urls import path

from .views import (
    EquipmentStatusReportView,
    MaintenanceCertificatesView,
    MaintenanceReportView,
    WorkOrderReportView,
)

app_name = "reports"

urlpatterns = [
    path("maintenance/", MaintenanceReportView.as_view(), name="maintenance"),
    path("equipment-status/", EquipmentStatusReportView.as_view(), name="equipment-status"),
    path("work-orders/", WorkOrderReportView.as_view(), name="work-orders"),
    path("certificates/", MaintenanceCertificatesView.as_view(), name="certificates"),
]
