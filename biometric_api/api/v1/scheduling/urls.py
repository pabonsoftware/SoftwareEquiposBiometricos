from rest_framework.routers import DefaultRouter

from .views import MaintenanceAlertViewSet, MaintenanceScheduleViewSet

app_name = "scheduling"

router = DefaultRouter()
router.register(r"maintenances", MaintenanceScheduleViewSet, basename="maintenance")
router.register(r"maintenance-alerts", MaintenanceAlertViewSet, basename="maintenance-alert")

urlpatterns = router.urls
