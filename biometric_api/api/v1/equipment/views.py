from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.v1.common.mixins import AuditLogMixin
from api.v1.common.pagination import QrCodePagination, StandardResultsSetPagination
from api.v1.common.permissions import (
    MANAGEMENT_ROLES,
    AdminPermissions,
    EngineerBiomedicalPermissions,
    OperationalAccess,
)
from apps.equipment import workflow
from apps.equipment.models import (
    Equipment,
    EquipmentAttachment,
    EquipmentCertificate,
    EquipmentInstruction,
    EquipmentWorkOrder,
    WorkOrderActivity,
    WorkOrderCost,
    WorkOrderEvidence,
    WorkOrderMeasurement,
    WorkOrderSignature,
    WorkOrderSparePart,
    WorkOrderStatus,
)
from apps.equipment.services import generate_qr_for_equipment

from .filters import EquipmentFilter
from .serializers import (
    EquipmentAttachmentSerializer,
    EquipmentCertificateSerializer,
    EquipmentInstructionSerializer,
    EquipmentQrSerializer,
    EquipmentSerializer,
    EquipmentWorkOrderDetailSerializer,
    EquipmentWorkOrderSerializer,
    WorkOrderActivitySerializer,
    WorkOrderCostSerializer,
    WorkOrderEvidenceSerializer,
    WorkOrderMeasurementSerializer,
    WorkOrderSignatureSerializer,
    WorkOrderSparePartSerializer,
)


def _workflow_error_response(exc: DjangoValidationError) -> Response:
    """Traduce un WorkflowError a una respuesta 400 con forma de error de DRF."""
    detail = exc.message_dict if hasattr(exc, "error_dict") else {"detail": exc.messages}
    return Response(detail, status=status.HTTP_400_BAD_REQUEST)


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
    # Alta administrativa: Admin. Información técnica (hojas de vida, fichas
    # OEM) y códigos QR: Ingeniero.
    permission_classes = (
        IsAuthenticated,
        AdminPermissions | EngineerBiomedicalPermissions,
    )
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
    def regenerate_qr(self, request, pk: str | None = None):
        """Regenera el código QR del equipo."""
        equipment = self.get_object()
        if equipment.qr_code:
            equipment.qr_code.delete(save=False)
        generate_qr_for_equipment(equipment)
        equipment.refresh_from_db()
        serializer = self.get_serializer(equipment)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=False,
        methods=["get"],
        url_path="qr-codes",
        pagination_class=QrCodePagination,
        serializer_class=EquipmentQrSerializer,
    )
    def qr_codes(self, request):
        """Galería paginada de códigos QR.

        El tamaño de página lo fija el backend (`QrCodePagination`: máx. 20 y no
        configurable por el cliente). Respeta los filtros y la búsqueda del
        viewset (`?search=`, `?branch=`).
        """
        queryset = self.filter_queryset(self.get_queryset()).order_by("asset_tag")
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk: str | None = None):
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
    # Hojas de vida / fichas OEM: las escribe el Ingeniero.
    permission_classes = (
        IsAuthenticated,
        EngineerBiomedicalPermissions,
    )

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

    # Certificados: los escribe el Ingeniero.
    permission_classes = (
        IsAuthenticated,
        EngineerBiomedicalPermissions,
    )

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

    # Fichas técnicas / instrucciones: las escribe el Ingeniero.
    permission_classes = (
        IsAuthenticated,
        EngineerBiomedicalPermissions,
    )

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
        "maintenance_record",
        "maintenance_record__scheduled_maintenance",
    )

    serializer_class = EquipmentWorkOrderSerializer
    pagination_class = StandardResultsSetPagination
    # Órdenes de trabajo: Ingeniero (emite/ejecuta), Coordinador (aprueba/cierra).
    # El Usuario Operativo no accede a las órdenes (RF001).
    permission_classes = (IsAuthenticated, OperationalAccess)

    filterset_fields = ("status", "service_type", "equipment", "technician")

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

    def get_serializer_class(self):
        if self.action == "details":
            return EquipmentWorkOrderDetailSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "details":
            queryset = queryset.prefetch_related(
                "spare_parts",
                "workordermeasurement_set",
                "evidences",
                "signatures",
                "cost",
                "activities",
                "activities__performed_by",
            )
        return queryset

    _CLOSED_STATUSES = (WorkOrderStatus.FINISHED, WorkOrderStatus.CANCELLED)

    def _require_management_role(self):
        """Aprobar/cancelar son actos de autoridad: solo Coordinador o Admin.
        No basta con ocultar el botón en el frontend — el backend lo niega."""
        if getattr(self.request.user, "role", None) not in MANAGEMENT_ROLES:
            raise PermissionDenied(
                "Solo un coordinador biomédico o un administrador puede realizar esta acción."
            )

    def perform_update(self, serializer):
        # §9: una orden terminada o cancelada no admite edición ordinaria.
        if serializer.instance.status in self._CLOSED_STATUSES:
            raise DRFValidationError(
                {"detail": "Una orden terminada o cancelada no se puede editar."}
            )
        super().perform_update(serializer)  # audita el cambio (RFN009)

    @action(detail=True, methods=["get"], url_path="details")
    def details(self, request, pk: str | None = None):
        """Devuelve una orden de trabajo junto a sus elementos relacionados."""
        work_order = self.get_object()
        serializer = self.get_serializer(work_order)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk: str | None = None):
        """PENDIENTE → APROBADA. Convierte la solicitud en orden formal (RF008)."""
        self._require_management_role()
        work_order = self.get_object()
        try:
            workflow.approve(work_order, actor=request.user, request=request)
        except DjangoValidationError as exc:
            return _workflow_error_response(exc)
        return Response(self.get_serializer(work_order).data)

    @action(detail=True, methods=["post"], url_path="start")
    def start(self, request, pk: str | None = None):
        """APROBADA → EN_PROCESO. También ocurre solo al registrar la primera
        actividad técnica."""
        work_order = self.get_object()
        try:
            workflow.start(work_order, actor=request.user, request=request)
        except DjangoValidationError as exc:
            return _workflow_error_response(exc)
        return Response(self.get_serializer(work_order).data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk: str | None = None):
        """EN_PROCESO → TERMINADA (RF011). Exige actividades registradas y
        observaciones de cierre; deja el mantenimiento en la hoja de vida
        (vía signal) y registra responsable/fecha de cierre en auditoría."""
        work_order = self.get_object()
        # `observations` se mantiene por compatibilidad con el cliente anterior.
        closing_notes = request.data.get("closing_notes") or request.data.get("observations")
        try:
            workflow.complete(
                work_order,
                actor=request.user,
                closing_notes=closing_notes or "",
                request=request,
            )
        except DjangoValidationError as exc:
            return _workflow_error_response(exc)
        return Response(self.get_serializer(work_order).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk: str | None = None):
        """PENDIENTE|APROBADA → CANCELADA. Requiere motivo (RFN009)."""
        self._require_management_role()
        work_order = self.get_object()
        try:
            workflow.cancel(
                work_order,
                actor=request.user,
                reason=request.data.get("reason") or "",
                request=request,
            )
        except DjangoValidationError as exc:
            return _workflow_error_response(exc)
        return Response(self.get_serializer(work_order).data)

class WorkOrderSparePartViewSet(viewsets.ModelViewSet):

    """ CRUD de repuestos utilizados en una orden de trabajo."""

    queryset = WorkOrderSparePart.objects.select_related(
                "work_order",
                "work_order__equipment",
            )

    serializer_class = WorkOrderSparePartSerializer
    # Repuestos utilizados: los documenta el Ingeniero.
    permission_classes = (IsAuthenticated, OperationalAccess)

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
    # Mediciones tomadas: las documenta el Ingeniero.
    permission_classes = (IsAuthenticated, OperationalAccess)

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
    # Evidencia fotográfica de la intervención: la sube el Ingeniero.
    permission_classes = (IsAuthenticated, OperationalAccess)

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
    # Firmas de la orden: Ingeniero (ejecución) y Coordinador (cierre formal).
    permission_classes = (IsAuthenticated, OperationalAccess)

    search_fields = ("signed_by","role","work_order__number")
    ordering_fields = (
        "role",
        "signed_at",
    )

    ordering = ("-signed_at",)

class WorkOrderCostViewSet(viewsets.ModelViewSet):

    """CRUD de costos asociados a una orden de trabajo.

    Cada orden puede tener un único registro de costos.
    """

    queryset = WorkOrderCost.objects.select_related(
        "work_order",
        "work_order__equipment",
    )

    serializer_class = WorkOrderCostSerializer
    # Costos de la orden: Ingeniero (repuestos/insumos) y Coordinador (cierre).
    permission_classes = (IsAuthenticated, OperationalAccess)

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


class WorkOrderActivityViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """Actividades técnicas de una orden de trabajo (RF009).

    Registrar la primera actividad mueve la orden de APROBADA a EN_PROCESO. No
    se pueden registrar actividades en una orden PENDIENTE (sin aprobar),
    TERMINADA o CANCELADA.
    """

    queryset = WorkOrderActivity.objects.select_related(
        "work_order", "work_order__equipment", "performed_by"
    )
    serializer_class = WorkOrderActivitySerializer
    # Las actividades las documenta quien ejecuta: Ingeniero (o Coordinador).
    permission_classes = (IsAuthenticated, OperationalAccess)
    filterset_fields = ("work_order",)
    search_fields = ("description", "findings", "recommendations", "work_order__number")
    ordering_fields = ("performed_at", "created_at")
    ordering = ("performed_at",)

    _EDITABLE_STATUSES = (WorkOrderStatus.APPROVED, WorkOrderStatus.IN_PROGRESS)

    def perform_create(self, serializer):
        work_order = serializer.validated_data["work_order"]
        if work_order.status not in self._EDITABLE_STATUSES:
            raise DRFValidationError(
                {
                    "work_order": [
                        "La orden debe estar APROBADA o EN PROCESO para registrar actividades."
                    ]
                }
            )
        if not serializer.validated_data.get("performed_by"):
            serializer.validated_data["performed_by"] = self.request.user
        super().perform_create(serializer)  # guarda + audita (RFN009)
        # Al iniciar actividades, la orden pasa a EN_PROCESO (§9).
        workflow.start(work_order, actor=self.request.user, request=self.request)

    def perform_update(self, serializer):
        if serializer.instance.work_order.status not in self._EDITABLE_STATUSES:
            raise DRFValidationError(
                {"work_order": ["No se pueden editar actividades de una orden cerrada."]}
            )
        super().perform_update(serializer)
