from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.common.mixins import AuditLogMixin
from api.v1.common.permissions import RestrictDeleteToManagement
from apps.equipment.models import (
    Equipment,
    EquipmentAttachment,
    EquipmentCertificate,
    EquipmentInstruction,
    EquipmentWorkOrder,
    WorkOrderCost,
    WorkOrderEvidence,
    WorkOrderMeasurement,
    WorkOrderSignature,
    WorkOrderSparePart,
)
from apps.equipment.services import generate_qr_for_equipment

from .filters import EquipmentFilter
from .serializers import (
    EquipmentAttachmentSerializer,
    EquipmentCertificateSerializer,
    EquipmentInstructionSerializer,
    EquipmentSerializer,
    EquipmentWorkOrderSerializer,
    WorkOrderCostSerializer,
    WorkOrderEvidenceSerializer,
    WorkOrderMeasurementSerializer,
    WorkOrderSignatureSerializer,
    WorkOrderSparePartSerializer,
)


class EquipmentViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    CRUD de equipos biomédicos.

    Incluye:

    - CRUD
    - búsqueda por asset_tag
    - filtros
    - ordenamiento
    - regeneración de QR
    - historial de mantenimientos

    """

    queryset = Equipment.objects.select_related(
        "branch", "equipment_model", "equipment_model__brand"
    )
    serializer_class = EquipmentSerializer
    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)
    filterset_class = EquipmentFilter
    search_fields = (
        "name",
        "asset_tag",
        "equipment_model__name",
        "equipment_model__brand__name",
    )
    ordering_fields = ("name", "purchase_date", "created_at")
    ordering = ("name",)

    @action(
        detail=False,
        methods=["get"],
        url_path=r"by-asset-tag/(?P<tag>[^/.]+)",
        url_name="by-asset-tag",
    )
    def by_asset_tag(self, request, tag: str = ""):
        """ Consulta un equipo utilizando su código de inventario."""
        equipment = get_object_or_404(Equipment, asset_tag__iexact=tag.strip())
        serializer = self.get_serializer(equipment)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="regenerate-qr")
    def regenerate_qr(self, request, pk: int = None):
        """Regenera el código QR del equipo."""
        equipment = self.get_object()
        if equipment.qr_code:
            equipment.qr_code.delete(save=False)
        generate_qr_for_equipment(equipment)
        equipment.refresh_from_db()
        serializer = self.get_serializer(equipment)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk: int = None):
        """Historial paginado de mantenimientos del equipo."""
        # Imports locales para evitar cualquier riesgo de import circular:
        # apps.maintenance ya importa apps.equipment.models en su FK.
        from api.v1.maintenance.serializers import MaintenanceRecordSerializer
        from apps.maintenance.models import MaintenanceRecord

        equipment = self.get_object()
        queryset = MaintenanceRecord.objects.filter(equipment=equipment).order_by(
            "-date", "-created_at"
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = MaintenanceRecordSerializer(page, many=True, context={"request": request})
            return self.get_paginated_response(serializer.data)
        serializer = MaintenanceRecordSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

class EquipmentAttachmentViewSet(viewsets.ModelViewSet):

    """CRUD de archivos adjuntos de equipos."""

    queryset = EquipmentAttachment.objects.select_related(
        "equipment",
        "uploaded_by",
    )

    serializer_class = EquipmentAttachmentSerializer
    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)

    search_fields = ("title","equipment__name","equipment__asset_tag")

    ordering_fields = ("title","uploaded_at",)

    ordering = ("-uploaded_at",)

    def perform_create(self, serializer):
        # `uploaded_by` es read-only en el serializer justamente para que no
        # se pueda setear desde el request; se fija acá al usuario real.
        serializer.save(uploaded_by=self.request.user)

class EquipmentCertificateViewSet(viewsets.ModelViewSet):

    "CRUD de certificados de equipos"

    queryset = EquipmentCertificate.objects.select_related(
        "equipment",
    )

    serializer_class = EquipmentCertificateSerializer

    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)

    search_fields = (
        "certificate_number",
        "responsible",
        "equipment__name",
        "equipment__asset_tag",
    )

    ordering_fields = (
        "certificate_date",
        "created_at",
    )

    ordering = ("-certificate_date",)

class EquipmentInstructionViewSet(viewsets.ModelViewSet):

    "CRUD de instrucciones de equipos" 

    queryset = EquipmentInstruction.objects.select_related(
        "equipment",
    )

    serializer_class = EquipmentInstructionSerializer

    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)

    search_fields = (
        "activity",
        "equipment__name",
        "equipment__asset_tag",
    )

    ordering_fields = (
        "instruction_type",
        "sequence",
    )

    ordering = ("instruction_type","sequence",)

    
class EquipmentWorkOrderViewSet(AuditLogMixin, viewsets.ModelViewSet):

    "CRUD de órdenes de trabajo de equipos"

    queryset = EquipmentWorkOrder.objects.select_related(
        "equipment",
        "technician",
    )

    serializer_class = EquipmentWorkOrderSerializer
    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)

    search_fields = (
        "number",
        "description",
        "equipment__name",
        "equipment__asset_tag",
        "technician__username",
        "technician__first_name",
        "technician__last_name",
    )

    ordering_fields = ("number","start_date","end_date","status",)

    @action(detail=True,methods=["get"],url_path="details",)
    def details(self,request,pk:int=None):

        """ Devuelve una orden de trabajo junto a sus elementos relacionados"""

        work_order = self.get_object()

        serializer = self.get_serializer(work_order)

        return Response(serializer.data)

class WorkOrderSparePartViewSet(viewsets.ModelViewSet):

    """ CRUD de repuestos utilizados en una orden de trabajo."""

    queryset = WorkOrderSparePart.objects.select_related(
                "work_order",
                "work_order__equipment",
            )
    
    serializer_class = WorkOrderSparePartSerializer
    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)
    
    search_fields = ("name","reference","work_order__number")
    
    ordering_fields = ("name","quantity","unit_cost","total_cost")

    ordering = ("name",)
    

class WorkOrderMeasurementViewSet(viewsets.ModelViewSet):

    "CRUD de mediciones realizadas durante una orden de trabajo"

    queryset = WorkOrderMeasurement.objects.select_related(
        "work_order",
        "work_order__equipment",
    )

    serializer_class = WorkOrderMeasurementSerializer
    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)

    search_fields = (
        "parameter",
        "measured_value",
        "expected_value",
        "unit",
        "work_order__number",
    )

    ordering_fields = (
        "parameter",
        "passed",
    )

    ordering = ("parameter",)


class WorkOrderEvidenceViewSet(viewsets.ModelViewSet):

    """CRUD de evidencias de una orden de trabajo."""

    queryset = WorkOrderEvidence.objects.select_related(
        "work_order",
        "work_order__equipment",
    )

    serializer_class = WorkOrderEvidenceSerializer
    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)

    search_fields = (
        "description",
        "work_order__number",
    )

    ordering_fields = (
        "evidence_type",
    )


class WorkOrderSignatureViewSet(viewsets.ModelViewSet):

    """CRUD de firmas de una orden de trabajo."""

    queryset = WorkOrderSignature.objects.select_related(
        "work_order",
        "work_order__equipment",
    )

    serializer_class = WorkOrderSignatureSerializer
    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)

    search_fields = ("signed_by","role","work_order__number")
    ordering_fields = (
        "role",
        "signed_at",
    )

    ordering = ("-signed_at",)

class WorkOrderCostViewSet(viewsets.ModelViewSet):

    """ 
    
    CRUD de costos asociados a una orden de trabajo.
    
    Cada orden puede tener un único registro de costos.
    """

    queryset = WorkOrderCost.objects.select_related(
        "work_order",
        "work_order__equipment",
    )

    serializer_class = WorkOrderCostSerializer
    permission_classes = (IsAuthenticated, RestrictDeleteToManagement)

    search_fields = (
        "work_order__number",
        "work_order__equipment__name",
    )

    ordering_fields = (
        "labor_cost",
        "spare_parts_cost",
        "transport_cost",
        "other_cost",
    )

    ordering = ("work_order",)
